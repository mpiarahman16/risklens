#!/usr/bin/env node
// Automated performance report from the command line.
// Usage: node cli/run-report.js [path/to/interactions.csv] [--out reports/]
// Writes: performance_report.md, flagged_customers.csv, classified_contacts.csv
const fs = require('fs'), path = require('path');
const E = require('../src/engine.js');
const args = process.argv.slice(2);
const input = args.find(a => !a.startsWith('--')) || path.join(__dirname, '..', 'data', 'appointment_interactions.csv');
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(__dirname, '..', 'reports');
fs.mkdirSync(outDir, { recursive: true });
const rows = E.parseCSV(fs.readFileSync(input, 'utf8'));
const R = E.buildReport(rows);
const P = v => (v * 100).toFixed(1) + '%';
const k = R.kpis, o = R.opportunity;
const md = [
  '# Appointment Resolution — Automated Performance Report', '',
  `Source: \`${path.basename(input)}\` · ${rows.length.toLocaleString('en-US')} interactions · generated ${new Date().toISOString().slice(0, 10)}`, '',
  '## KPIs', '| Metric | Value |', '|---|---:|',
  `| Digital containment | ${P(k.containment)} |`, `| Transfer to agent | ${P(k.transferRate)} |`, `| Abandon | ${P(k.abandonRate)} |`,
  `| Agent hours | ${k.agentHours.toFixed(0)} |`, `| Avg agent handle time (min) | ${k.avgAgentHandleMin.toFixed(1)} |`,
  `| CSAT digital / agent / abandoned | ${k.csatDigital.toFixed(2)} / ${k.csatAssisted.toFixed(2)} / ${k.csatAbandoned.toFixed(2)} |`,
  `| 7-day repeat rate after success / failure | ${P(k.repeatRateAfterSuccess)} / ${P(k.repeatRateAfterFailure)} |`, '',
  '## Findings', ...R.insights.map(i => '- ' + i), '',
  '## Failure reasons', '| Reason | Count | Share | Fix rate (hyp.) | Annual value |', '|---|---:|---:|---:|---:|',
  ...R.failuresByReason.map(f => `| ${f.reason} | ${f.count} | ${P(f.shareOfFailures)} | ${(f.addressableShare * 100).toFixed(0)}% | $${Math.round(f.annualSavings).toLocaleString('en-US')} |`), '',
  '## Contact reasons', '| Reason | Contacts | Containment | CSAT |', '|---|---:|---:|---:|',
  ...R.byIntent.map(g => `| ${E.INTENT_LABELS[g.key]} | ${g.total} | ${P(g.containment)} | ${g.csat ? g.csat.toFixed(2) : '-'} |`), '',
  '## Channels', '| Channel | Contacts | Containment |', '|---|---:|---:|',
  ...R.byChannel.map(g => `| ${g.key} | ${g.total} | ${P(g.containment)} |`), '',
  '## Weekly containment', '| Week of | Contacts | Containment |', '|---|---:|---:|',
  ...R.byWeek.map(g => `| ${g.key} | ${g.total} | ${P(g.containment)} |`), '',
  '## Top repeat-failure patterns (7 days)', '| Pattern | Count |', '|---|---:|',
  ...R.repeat.patterns.slice(0, 10).map(p => `| ${p.pattern} | ${p.count} |`), '',
  `Opportunity (illustrative assumptions): containment ${P(k.containment)} → ${P(o.projectedContainment)}; ~${Math.round(o.avoidedTransfersAnnual).toLocaleString('en-US')} transfers avoided and ~$${(o.annualSavings / 1e6).toFixed(2)}M net per year.`
].join('\n');
fs.writeFileSync(path.join(outDir, 'performance_report.md'), md + '\n');
const q = s => `"${String(s).replace(/"/g, '""')}"`;
fs.writeFileSync(path.join(outDir, 'flagged_customers.csv'), ['customer_id,contacts,digital_failures,reasons,intent,last_contact,still_unresolved', ...R.repeat.chains.map(c => [c.customer_id, c.contacts, c.digital_failures, q(c.reasons), c.intent, c.last_contact, c.still_unresolved].join(','))].join('\n') + '\n');
fs.writeFileSync(path.join(outDir, 'classified_contacts.csv'), ['interaction_id,customer_utterance,predicted_reason,confidence', ...rows.map(r => { const p = E.classify(r.customer_utterance); return [r.interaction_id, q(r.customer_utterance), p.intent, p.confidence].join(','); })].join('\n') + '\n');
console.log(md.split('\n').slice(0, 14).join('\n'));
console.log(`\nWrote ${outDir}/performance_report.md, flagged_customers.csv, classified_contacts.csv`);
