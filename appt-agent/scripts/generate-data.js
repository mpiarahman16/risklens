// Generates a SYNTHETIC dataset of customer appointment interactions (Q3 2026).
// All data is fake and produced for a case-study exercise. Deterministic (seeded).
// Usage: node scripts/generate-data.js  -> writes data/appointment_interactions.csv
const fs = require('fs');
const path = require('path');

let seed = 20261026;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const wpick = obj => { const r = rnd() * Object.values(obj).reduce((a, b) => a + b, 0); let acc = 0; for (const [k, w] of Object.entries(obj)) { acc += w; if (r <= acc) return k; } return Object.keys(obj).at(-1); };
const norm = (mu, sd) => mu + sd * Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

const N = 5000;
const START = Date.parse('2026-07-01T00:00:00Z');
const DAYS = 92; // Jul 1 - Sep 30

const INTENTS = { RESCHEDULE: 38, MISSED_TECH_NOSHOW: 17, MISSED_CUSTOMER_NOT_HOME: 9, ETA_STATUS: 21, CANCEL: 8, ACCESS_UPDATE: 7 };
const CHANNELS = { App: 34, Web: 22, IVR: 26, Chat: 12, SMS: 6 };
const SERVICE = { Repair: 46, Install: 34, Upgrade: 20 };
const REGIONS = { 'CT-Stamford': 22, 'NY-Hudson Valley': 20, 'OH-Columbus': 18, 'TX-Dallas': 24, 'NC-Charlotte': 16 };

// Customer utterances (first free-text message / IVR transcript). Varied, with typos and ambiguity.
const UTT = {
  RESCHEDULE: [
    'I need to reschedule my appointment', 'can I move my install to next week', 'need a different day for the technician',
    "won't be home thursday can we change the time", 'change my appointment date please', 'reschedule tech visit to saturday',
    'is there an earlier slot for my repair', 'pls move my appt to the afternoon', 'something came up, need a new time for the tech',
    'can the technician come tomorrow instead', 'push my upgrade appointment back a few days', 'resched my appointmnt',
    'i want to pick another time window', 'need to change when the tech comes', 'swap my 8-10 window for later in the day'
  ],
  MISSED_TECH_NOSHOW: [
    'technician never showed up', 'waited all day and nobody came', 'tech was supposed to come 8-10 and no one showed',
    'my appointment was missed by your guy', 'no show from the technician again', 'nobody came for my repair yesterday',
    'tech didnt come and didnt call', 'i took the day off and the technician never arrived', 'the window passed and no tech',
    'you guys missed my install appointment', 'still waiting, appointment window ended an hour ago', 'technician no-show, need someone today'
  ],
  MISSED_CUSTOMER_NOT_HOME: [
    'i missed the technician', 'tech came while i was out', 'got a note on my door that i missed the visit',
    'sorry i wasnt home when the tech came', 'missed my appointment can i get another', 'i was late and the tech left',
    'the technician called but i didnt pick up and he left', 'door hanger says missed appointment'
  ],
  ETA_STATUS: [
    'where is my technician', 'what time will the tech arrive', 'is my appointment still on for today',
    'eta for the technician?', 'how far away is the tech', 'confirm my appointment time', 'when is my tech coming',
    'is someone still coming today', 'status of my service appointment', 'can you tell me if the tech is on the way'
  ],
  CANCEL: [
    'cancel my appointment', "don't need the tech anymore, internet is working now", 'please cancel the technician visit',
    'cancel the install i changed my mind', 'no longer need the repair appointment', 'cancel appt its fixed itself'
  ],
  ACCESS_UPDATE: [
    'update the gate code for the technician', 'tech needs to call me when he arrives', 'change the contact number for my appointment',
    'add parking instructions for the tech', 'please note we have a dog', 'buzzer is broken tell the tech to text me',
    'update my phone number on the service visit'
  ]
};

// Failure reasons by intent, used only when digital self-service fails.
const FAIL = {
  RESCHEDULE: { 'No available slots shown': 34, 'Slot API timeout': 22, 'Same-day change locked (<24h rule)': 26, 'Authentication failure': 10, 'Bot misunderstood request': 8 },
  MISSED_TECH_NOSHOW: { 'Unsupported intent (no missed-appt flow)': 70, 'Bot misunderstood request': 18, 'Authentication failure': 12 },
  MISSED_CUSTOMER_NOT_HOME: { 'Unsupported intent (no missed-appt flow)': 45, 'No available slots shown': 25, 'Bot misunderstood request': 20, 'Authentication failure': 10 },
  ETA_STATUS: { 'Tech location unavailable': 60, 'Bot misunderstood request': 25, 'Authentication failure': 15 },
  CANCEL: { 'Order-linked appt (cancel blocked)': 55, 'Bot misunderstood request': 25, 'Authentication failure': 20 },
  ACCESS_UPDATE: { 'Free-text notes not supported': 65, 'Bot misunderstood request': 20, 'Authentication failure': 15 }
};

// Base digital containment (resolved without agent) by intent
const CONTAIN = { RESCHEDULE: 0.56, MISSED_TECH_NOSHOW: 0.10, MISSED_CUSTOMER_NOT_HOME: 0.30, ETA_STATUS: 0.52, CANCEL: 0.62, ACCESS_UPDATE: 0.22 };
const CHANNEL_ADJ = { App: 0.08, Web: 0.04, IVR: -0.12, Chat: 0.0, SMS: -0.06 };

const rows = [];
const customers = Array.from({ length: 3400 }, (_, i) => `C${String(100000 + i)}`);
const custState = new Map(); // track recent failures to generate repeat contacts

for (let i = 0; i < N; i++) {
  let day = Math.floor(rnd() * DAYS);
  let cust = pick(customers);
  let intent = wpick(INTENTS);
  // repeat-contact behaviour: customers who failed recently come back (~38%)
  const prev = custState.get(cust);
  if (prev && prev.failed && rnd() < 0.55) { intent = prev.intent; day = Math.min(DAYS - 1, prev.day + 1 + Math.floor(rnd() * 5)); }
  const ts = new Date(START + day * 864e5 + Math.floor((7 + rnd() * 13) * 3600e3));
  const channel = wpick(CHANNELS);
  const service = wpick(SERVICE);
  const region = wpick(REGIONS);
  // Aug 17-23 slot-service incident: reschedule success drops sharply
  const incident = day >= 47 && day <= 53;
  let p = CONTAIN[intent] + CHANNEL_ADJ[channel];
  if (incident && (intent === 'RESCHEDULE' || intent === 'MISSED_CUSTOMER_NOT_HOME')) p -= 0.30;
  if (prev && prev.failed) p -= 0.08;
  const resolvedDigital = rnd() < Math.max(0.02, p);
  let outcome, failure = '';
  if (resolvedDigital) outcome = 'Resolved - digital';
  else {
    failure = incident && intent === 'RESCHEDULE' && rnd() < 0.7 ? 'Slot API timeout' : wpick(FAIL[intent]);
    outcome = rnd() < 0.71 ? 'Transferred to agent' : 'Abandoned';
  }
  let agentResolved = '';
  if (outcome === 'Transferred to agent') agentResolved = rnd() < 0.86 ? 'Y' : 'N';
  const selfServiceSec = Math.max(30, Math.round(norm(resolvedDigital ? 150 : 260, 70)));
  const agentSec = outcome === 'Transferred to agent' ? Math.max(120, Math.round(norm(intent === 'MISSED_TECH_NOSHOW' ? 640 : 470, 120))) : 0;
  const csat = resolvedDigital ? Math.min(5, Math.max(1, Math.round(norm(4.3, 0.7)))) : outcome === 'Abandoned' ? Math.min(5, Math.max(1, Math.round(norm(1.9, 0.8)))) : Math.min(5, Math.max(1, Math.round(norm(intent === 'MISSED_TECH_NOSHOW' ? 2.4 : 3.3, 0.9))));
  const hasCsat = rnd() < 0.31;
  let utt = pick(UTT[intent]);
  if (rnd() < 0.06) utt = utt.replace(/e/g, () => (rnd() < 0.2 ? '' : 'e')); // typos
  const failed = outcome !== 'Resolved - digital' && agentResolved !== 'Y';
  custState.set(cust, { day, intent, failed: outcome !== 'Resolved - digital' });
  rows.push({
    interaction_id: `INT-${String(i + 1).padStart(5, '0')}`,
    timestamp: ts.toISOString().slice(0, 16).replace('T', ' '),
    customer_id: cust, region, service_type: service, entry_channel: channel,
    customer_utterance: utt, true_contact_reason: intent,
    self_service_outcome: outcome, failure_reason: failure,
    agent_resolved: agentResolved, self_service_sec: selfServiceSec, agent_handle_sec: agentSec,
    csat: hasCsat ? csat : ''
  });
}
rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
rows.forEach((r, i) => (r.interaction_id = `INT-${String(i + 1).padStart(5, '0')}`));

const cols = Object.keys(rows[0]);
const esc = v => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
const out = path.join(__dirname, '..', 'data', 'appointment_interactions.csv');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, csv + '\n');
console.log(`Wrote ${rows.length} rows to ${out}`);
