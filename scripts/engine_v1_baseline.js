/*
 * Appointment Resolution Insights Engine
 * --------------------------------------
 * Plain JavaScript (no dependencies). Runs in the browser (window.ApptEngine) and in Node (require).
 * Built with AI-assisted development (LLM pair-programming), then validated against a labeled holdout set.
 *
 * Modules:
 *   parseCSV()            CSV -> array of objects
 *   classify()            contact-reason classifier (weighted intent rules + confidence + human-review fallback)
 *   detectRepeatFailures  repeat-contact and repeat-failure pattern detection (7-day window)
 *   buildReport()         KPI / performance report + opportunity sizing
 *   validate()            accuracy, precision/recall/F1, confusion matrix against labeled data
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ApptEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- CSV ----------
  function parseCSV(text) {
    const rows = []; let row = []; let field = ''; let q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') q = false;
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    const head = rows.shift().map(h => h.trim());
    return rows.map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
  }

  // ---------- Contact-reason classifier ----------
  // Each intent has weighted patterns. Strong cues score higher; negative cues subtract.
  const INTENT_LABELS = {
    RESCHEDULE: 'Reschedule appointment',
    MISSED_TECH_NOSHOW: 'Missed appt - technician no-show',
    MISSED_CUSTOMER_NOT_HOME: 'Missed appt - customer not home',
    ETA_STATUS: 'Technician ETA / appointment status',
    CANCEL: 'Cancel appointment',
    ACCESS_UPDATE: 'Update access / contact details',
    NEEDS_REVIEW: 'Low confidence - route to human review'
  };

  const RULES = {
    RESCHEDULE: [
      [/\bresch\w*/, 3], [/\b(move|change|swap|push)\b.*\b(appt|appoint\w*|install|visit|date|time|window|day|when)\b/, 3],
      [/\b(another|different|new|earlier|later)\b.*\b(day|time|slot|window|date)\b/, 2.5],
      [/\binstead\b/, 1.5], [/\b(won'?t|can'?t|not) be home\b/, 2], [/\b(next week|tomorrow|saturday|sunday|afternoon|morning)\b/, 1],
      [/\bpick\b.*\btime\b/, 2]
    ],
    MISSED_TECH_NOSHOW: [
      [/\bnever (showed|arrived|came)\b/, 4], [/\bno[- ]?(one|body)\b.*\b(came|showed|show)/, 4], [/\bno[- ]show\b/, 4],
      [/\b(didn'?t|did not|never) (come|show|arrive)/, 3.5], [/\bnobody came\b/, 4], [/\bwaited\b/, 2],
      [/\b(you|your guy|you guys|technician) missed\b/, 3.5], [/\bwindow (passed|ended)\b/, 3], [/\bno tech\b/, 3],
      [/\bstill waiting\b/, 2], [/\btook the day off\b/, 2]
    ],
    MISSED_CUSTOMER_NOT_HOME: [
      [/\bi missed\b/, 4], [/\b(wasn'?t|was not|not) home\b.*\b(came|when)\b/, 3], [/\bwhile i was (out|away)\b/, 4],
      [/\bdoor (hanger|tag|note)|note on (my )?door\b/, 4], [/\bi was late\b/, 3.5], [/\bdidn'?t pick up\b/, 3],
      [/\b(tech|technician|he) left\b/, 2], [/\bmissed my appointment\b/, 3], [/\bmissed (the )?visit\b/, 2]
    ],
    ETA_STATUS: [
      [/\bwhere is\b/, 4], [/\beta\b/, 4], [/\bwhat time\b.*\b(arrive|come|tech)/, 3.5], [/\bhow far\b/, 4],
      [/\bon the way\b/, 3.5], [/\bstill (on|coming)\b/, 3], [/\bstatus\b/, 3], [/\bconfirm\b.*\b(appointment|time)\b/, 3],
      [/\bwhen is\b.*\b(tech|technician)\b.*\bcoming\b/, 3.5], [/\bis (someone|the tech)\b/, 1.5]
    ],
    CANCEL: [
      [/\bcancel\w*/, 5], [/\bno longer need\b/, 4], [/\b(don'?t|do not) need\b.*\b(tech|appointment|visit|anymore)/, 4],
      [/\b(working|fixed) (now|itself)\b/, 2], [/\bchanged my mind\b/, 2]
    ],
    ACCESS_UPDATE: [
      [/\bgate code\b/, 5], [/\b(call|text) me when\b/, 4], [/\bcontact (number|info)\b/, 4], [/\bphone number\b/, 4],
      [/\bparking\b/, 4], [/\b(dog|pet)s?\b/, 3], [/\bbuzzer|intercom|door code\b/, 4], [/\binstructions?\b/, 2],
      [/\bcall me when\b/, 2], [/\bupdate\b/, 1], [/\btext me\b/, 2]
    ]
  };
  const NEG = [ // context that reduces an intent's score
    ['RESCHEDULE', /\b(never|nobody|no one|no[- ]show)\b/, -3],
    ['RESCHEDULE', /\bi missed|i was late|wasn'?t home when\b/, -2.5],
    ['MISSED_CUSTOMER_NOT_HOME', /\b(you|your guy|you guys) missed\b/, -4],
    ['ETA_STATUS', /\bcancel\w*/, -3]
  ];

  function classify(text, opts) {
    const threshold = (opts && opts.threshold) || 0.45;
    const t = ' ' + String(text || '').toLowerCase().replace(/[’]/g, "'") + ' ';
    const scores = {};
    for (const [intent, rules] of Object.entries(RULES)) {
      let s = 0; const hits = [];
      for (const [re, w] of rules) if (re.test(t)) { s += w; hits.push(re.source); }
      scores[intent] = { score: s, hits };
    }
    for (const [intent, re, w] of NEG) if (re.test(t)) scores[intent].score += w;
    const ranked = Object.entries(scores).map(([k, v]) => [k, Math.max(0, v.score), v.hits]).sort((a, b) => b[1] - a[1]);
    const total = ranked.reduce((a, r) => a + r[1], 0);
    const [topIntent, topScore, hits] = ranked[0];
    const confidence = total === 0 ? 0 : +(topScore / total * Math.min(1, topScore / 4)).toFixed(3);
    const intent = confidence >= threshold ? topIntent : 'NEEDS_REVIEW';
    return { intent, label: INTENT_LABELS[intent], confidence, candidate: topIntent, evidence: hits.slice(0, 3) };
  }

  // ---------- Repeat-contact & repeat-failure detection ----------
  const isDigitalSuccess = r => r.self_service_outcome === 'Resolved - digital';
  const isUnresolved = r => !isDigitalSuccess(r) && r.agent_resolved !== 'Y';
  const tsOf = r => Date.parse(r.timestamp.replace(' ', 'T') + ':00Z');

  function detectRepeatFailures(rows, windowDays) {
    const W = (windowDays || 7) * 864e5;
    const byCust = new Map();
    for (const r of rows) { if (!byCust.has(r.customer_id)) byCust.set(r.customer_id, []); byCust.get(r.customer_id).push(r); }
    const repeats = []; const chains = [];
    const pairCounts = new Map(); const afterSuccess = { base: 0, repeat: 0 }; const afterFail = { base: 0, repeat: 0 };
    for (const [cust, list] of byCust) {
      list.sort((a, b) => tsOf(a) - tsOf(b));
      for (let i = 0; i < list.length; i++) {
        const cur = list[i], next = list[i + 1];
        const isRepeat = next && tsOf(next) - tsOf(cur) <= W;
        const bucket = isDigitalSuccess(cur) ? afterSuccess : afterFail;
        bucket.base++; if (isRepeat) bucket.repeat++;
        if (isRepeat) {
          repeats.push({ customer_id: cust, first: cur.interaction_id, second: next.interaction_id });
          if (!isDigitalSuccess(cur) && !isDigitalSuccess(next)) {
            const key = `${cur.failure_reason || 'Agent-handled'} → ${next.failure_reason || 'Agent-handled'}`;
            pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
          }
        }
      }
      // chain = 2+ digital failures inside the window for the same customer
      const fails = list.filter(r => !isDigitalSuccess(r));
      if (fails.length >= 2 && tsOf(fails.at(-1)) - tsOf(fails[0]) <= W * 2) {
        chains.push({
          customer_id: cust, contacts: list.length, digital_failures: fails.length,
          reasons: [...new Set(fails.map(f => f.failure_reason))].join(' | '),
          intent: fails[0].true_contact_reason || '', last_contact: fails.at(-1).timestamp,
          still_unresolved: isUnresolved(list.at(-1)) ? 'Y' : 'N'
        });
      }
    }
    chains.sort((a, b) => b.digital_failures - a.digital_failures || b.last_contact.localeCompare(a.last_contact));
    const patterns = [...pairCounts.entries()].map(([pattern, count]) => ({ pattern, count })).sort((a, b) => b.count - a.count);
    return {
      repeatContacts: repeats.length,
      repeatRateAfterSuccess: afterSuccess.base ? afterSuccess.repeat / afterSuccess.base : 0,
      repeatRateAfterFailure: afterFail.base ? afterFail.repeat / afterFail.base : 0,
      patterns, chains
    };
  }

  // ---------- Performance report & opportunity sizing ----------
  // Assumptions are explicit and editable (illustrative values for the exercise).
  const DEFAULT_ASSUMPTIONS = {
    agentCostPerMin: 1.10,          // fully loaded agent cost, $/min (illustrative)
    digitalCostPerContact: 0.35,    // AI/self-service cost per contact, $ (illustrative)
    sampleToQuarterMultiplier: 100, // sample = 1% of quarterly appointment contacts (illustrative)
    // share of each failure type an agentic AI flow is expected to resolve (product hypothesis, to be tested in pilot)
    addressable: {
      'Unsupported intent (no missed-appt flow)': 0.75, 'No available slots shown': 0.60, 'Slot API timeout': 0.50,
      'Same-day change locked (<24h rule)': 0.55, 'Authentication failure': 0.40, 'Bot misunderstood request': 0.65,
      'Tech location unavailable': 0.70, 'Order-linked appt (cancel blocked)': 0.40, 'Free-text notes not supported': 0.85
    }
  };

  const weekOf = ts => { const d = new Date(Date.parse(ts.slice(0, 10) + 'T00:00:00Z')); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10); };
  const pct = (a, b) => (b ? a / b : 0);

  function groupStats(rows, keyFn) {
    const m = new Map();
    for (const r of rows) {
      const k = keyFn(r); if (!m.has(k)) m.set(k, { key: k, total: 0, digital: 0, transferred: 0, abandoned: 0, agentSec: 0, csatSum: 0, csatN: 0 });
      const g = m.get(k); g.total++;
      if (isDigitalSuccess(r)) g.digital++; else if (r.self_service_outcome === 'Transferred to agent') g.transferred++; else g.abandoned++;
      g.agentSec += +r.agent_handle_sec || 0;
      if (r.csat) { g.csatSum += +r.csat; g.csatN++; }
    }
    return [...m.values()].map(g => ({ ...g, containment: pct(g.digital, g.total), transferRate: pct(g.transferred, g.total), abandonRate: pct(g.abandoned, g.total), csat: g.csatN ? g.csatSum / g.csatN : null }));
  }

  function buildReport(rows, assumptionsIn) {
    const A = Object.assign({}, DEFAULT_ASSUMPTIONS, assumptionsIn || {});
    const total = rows.length;
    const digital = rows.filter(isDigitalSuccess).length;
    const transferred = rows.filter(r => r.self_service_outcome === 'Transferred to agent').length;
    const abandoned = rows.filter(r => r.self_service_outcome === 'Abandoned').length;
    const agentMin = rows.reduce((a, r) => a + (+r.agent_handle_sec || 0), 0) / 60;
    const csatRows = rows.filter(r => r.csat);
    const reasonOf = r => r.true_contact_reason || classify(r.customer_utterance).intent;

    const byIntent = groupStats(rows, reasonOf).sort((a, b) => b.total - a.total);
    const byChannel = groupStats(rows, r => r.entry_channel).sort((a, b) => b.total - a.total);
    const byWeek = groupStats(rows, r => weekOf(r.timestamp)).sort((a, b) => a.key.localeCompare(b.key));

    const failures = rows.filter(r => !isDigitalSuccess(r));
    const failMap = new Map();
    for (const r of failures) {
      const k = r.failure_reason || 'Unknown';
      if (!failMap.has(k)) failMap.set(k, { reason: k, count: 0, transferred: 0, abandoned: 0, agentSec: 0 });
      const f = failMap.get(k); f.count++; f.agentSec += +r.agent_handle_sec || 0;
      if (r.self_service_outcome === 'Transferred to agent') f.transferred++; else f.abandoned++;
    }
    const avgAgentSec = transferred ? rows.reduce((a, r) => a + (+r.agent_handle_sec || 0), 0) / transferred : 0;
    const failuresByReason = [...failMap.values()].sort((a, b) => b.count - a.count).map(f => {
      const share = A.addressable[f.reason] || 0;
      const recoveredContacts = f.count * share;
      const avoidedAgentMin = f.transferred * share * (f.transferred ? f.agentSec / f.transferred : avgAgentSec) / 60;
      const quarterlySavings = (avoidedAgentMin * A.agentCostPerMin - recoveredContacts * A.digitalCostPerContact) * A.sampleToQuarterMultiplier;
      return { ...f, shareOfFailures: pct(f.count, failures.length), addressableShare: share, recoveredContacts, avoidedAgentMin, annualSavings: quarterlySavings * 4 };
    });

    const repeat = detectRepeatFailures(rows, 7);
    const recovered = failuresByReason.reduce((a, f) => a + f.recoveredContacts, 0);
    const avoidedTransfers = failuresByReason.reduce((a, f) => a + f.transferred * f.addressableShare, 0);
    const annualSavings = failuresByReason.reduce((a, f) => a + f.annualSavings, 0);
    const projectedContainment = pct(digital + recovered, total);

    const kpis = {
      total, digital, transferred, abandoned,
      containment: pct(digital, total), transferRate: pct(transferred, total), abandonRate: pct(abandoned, total),
      agentHours: agentMin / 60, avgAgentHandleMin: avgAgentSec / 60,
      csatDigital: avg(csatRows.filter(isDigitalSuccess).map(r => +r.csat)),
      csatAssisted: avg(csatRows.filter(r => r.self_service_outcome === 'Transferred to agent').map(r => +r.csat)),
      csatAbandoned: avg(csatRows.filter(r => r.self_service_outcome === 'Abandoned').map(r => +r.csat)),
      repeatRateAfterSuccess: repeat.repeatRateAfterSuccess, repeatRateAfterFailure: repeat.repeatRateAfterFailure
    };
    const opportunity = {
      recoveredContactsSample: recovered, avoidedTransfersSample: avoidedTransfers,
      projectedContainment, containmentLift: projectedContainment - kpis.containment,
      avoidedTransfersAnnual: avoidedTransfers * A.sampleToQuarterMultiplier * 4,
      annualSavings, assumptions: A
    };
    return { kpis, byIntent, byChannel, byWeek, failuresByReason, repeat, opportunity, insights: narrate(kpis, byIntent, byChannel, byWeek, failuresByReason, repeat, opportunity) };
  }
  function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }

  // Auto-generated plain-English findings (rule-based narrative over the computed metrics)
  function narrate(k, byIntent, byChannel, byWeek, fails, repeat, opp) {
    const P = v => (v * 100).toFixed(1) + '%';
    const out = [];
    out.push(`Digital self-service resolved ${P(k.containment)} of ${k.total.toLocaleString('en-US')} appointment contacts; ${P(k.transferRate)} transferred to an agent and ${P(k.abandonRate)} abandoned.`);
    const worst = [...byIntent].sort((a, b) => a.containment - b.containment)[0];
    out.push(`Lowest containment: ${INTENT_LABELS[worst.key] || worst.key} at ${P(worst.containment)} (${worst.total} contacts).`);
    const top = fails.slice(0, 3).map(f => `${f.reason} (${P(f.shareOfFailures)})`).join(', ');
    out.push(`Top failure reasons: ${top}.`);
    const lowCh = [...byChannel].sort((a, b) => a.containment - b.containment)[0];
    out.push(`Weakest channel: ${lowCh.key} at ${P(lowCh.containment)} containment.`);
    const dip = [...byWeek].sort((a, b) => a.containment - b.containment)[0];
    out.push(`Worst week: ${dip.key} at ${P(dip.containment)} containment.`);
    out.push(`Customers whose digital attempt failed came back within 7 days ${(repeat.repeatRateAfterFailure / Math.max(1e-9, repeat.repeatRateAfterSuccess)).toFixed(1)}x as often as those who succeeded (${P(repeat.repeatRateAfterFailure)} vs ${P(repeat.repeatRateAfterSuccess)}).`);
    out.push(`Agentic AI could lift containment from ${P(k.containment)} to ${P(opp.projectedContainment)}, avoiding ~${Math.round(opp.avoidedTransfersAnnual).toLocaleString('en-US')} agent transfers and ~$${(opp.annualSavings / 1e6).toFixed(2)}M per year (illustrative assumptions).`);
    return out;
  }

  // ---------- Validation ----------
  function validate(rows, opts) {
    const labels = Object.keys(RULES);
    const cm = {}; labels.concat('NEEDS_REVIEW').forEach(a => { cm[a] = {}; labels.concat('NEEDS_REVIEW').forEach(b => (cm[a][b] = 0)); });
    let correct = 0, reviewed = 0; const errors = [];
    for (const r of rows) {
      const truth = r.true_contact_reason; if (!truth) continue;
      const p = classify(r.customer_utterance, opts);
      cm[truth][p.intent]++;
      if (p.intent === 'NEEDS_REVIEW') reviewed++;
      if (p.intent === truth) correct++;
      else if (p.intent !== 'NEEDS_REVIEW' && errors.length < 25) errors.push({ id: r.interaction_id, text: r.customer_utterance, truth, predicted: p.intent, confidence: p.confidence });
    }
    const n = rows.filter(r => r.true_contact_reason).length;
    const auto = n - reviewed;
    const perClass = labels.map(l => {
      const tp = cm[l][l];
      const fp = labels.reduce((a, o) => a + (o !== l ? cm[o][l] : 0), 0);
      const fn = labels.concat('NEEDS_REVIEW').reduce((a, o) => a + (o !== l ? cm[l][o] : 0), 0);
      const precision = tp + fp ? tp / (tp + fp) : 0, recall = tp + fn ? tp / (tp + fn) : 0;
      return { intent: l, support: labels.concat('NEEDS_REVIEW').reduce((a, o) => a + cm[l][o], 0), precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0 };
    });
    return {
      n, accuracy: correct / n,                    // overall, review counted as not-correct
      autoRate: auto / n,                          // share classified automatically
      accuracyOnAuto: auto ? correct / auto : 0,   // precision of automated decisions
      reviewRate: reviewed / n, perClass, confusion: cm, labels, errors
    };
  }

  // Deterministic train/holdout split by interaction id
  function split(rows) {
    const h = s => { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x % 10; };
    return { dev: rows.filter(r => h(r.interaction_id) < 7), holdout: rows.filter(r => h(r.interaction_id) >= 7) };
  }

  return { parseCSV, classify, detectRepeatFailures, buildReport, validate, split, INTENT_LABELS, DEFAULT_ASSUMPTIONS };
});
