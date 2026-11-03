#!/usr/bin/env node
// Validation suite. Exits non-zero if any quality gate fails, so it can run in CI (GitHub Actions).
// Usage: node tests/validate.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const E = require('../src/engine.js');
const load = f => E.parseCSV(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));
const P = v => (v * 100).toFixed(1) + '%';
let failed = 0;
const gate = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail || ''}`); if (!ok) failed++; };

// 1. Classifier quality gates
const rows = load('appointment_interactions.csv');
const { holdout } = E.split(rows);
const vh = E.validate(holdout), vb = E.validate(load('blind_set.csv')), vc = E.validate(load('challenge_set.csv'));
console.log(`Holdout  n=${vh.n} accuracy=${P(vh.accuracy)} auto-precision=${P(vh.accuracyOnAuto)} review=${P(vh.reviewRate)}`);
console.log(`Blind    n=${vb.n} accuracy=${P(vb.accuracy)} auto-precision=${P(vb.accuracyOnAuto)} review=${P(vb.reviewRate)}`);
console.log(`Challenge n=${vc.n} accuracy=${P(vc.accuracy)} (used for v2 error analysis, not an unbiased score)`);
gate('Holdout accuracy >= 95%', vh.accuracy >= 0.95, P(vh.accuracy));
gate('Auto-route precision >= 95% on blind set (never mis-route confidently)', vb.accuracyOnAuto >= 0.95, P(vb.accuracyOnAuto));
gate('Blind-set review rate <= 50% (coverage floor)', vb.reviewRate <= 0.5, P(vb.reviewRate));

// 2. Unit tests: classifier edge cases
const c = t => E.classify(t).intent;
gate('No-show beats reschedule wording', c("tech didn't show and now I need to reschedule") === 'MISSED_TECH_NOSHOW');
gate('Customer-missed beats reschedule wording', c('i missed the tech and need a new time this week') === 'MISSED_CUSTOMER_NOT_HOME');
gate('Vague text goes to review', c('appointment problem') === 'NEEDS_REVIEW');
gate('Empty text goes to review', c('') === 'NEEDS_REVIEW');

// 3. Unit tests: repeat-failure detection on a hand-built fixture
const fx = [
  { interaction_id: 'A1', customer_id: 'X', timestamp: '2026-08-01 09:00', self_service_outcome: 'Transferred to agent', failure_reason: 'Slot API timeout', agent_resolved: 'N', true_contact_reason: 'RESCHEDULE' },
  { interaction_id: 'A2', customer_id: 'X', timestamp: '2026-08-03 09:00', self_service_outcome: 'Abandoned', failure_reason: 'Slot API timeout', agent_resolved: '', true_contact_reason: 'RESCHEDULE' },
  { interaction_id: 'B1', customer_id: 'Y', timestamp: '2026-08-01 09:00', self_service_outcome: 'Resolved - digital', failure_reason: '', agent_resolved: '', true_contact_reason: 'ETA_STATUS' },
  { interaction_id: 'B2', customer_id: 'Y', timestamp: '2026-08-20 09:00', self_service_outcome: 'Resolved - digital', failure_reason: '', agent_resolved: '', true_contact_reason: 'ETA_STATUS' }
];
const rf = E.detectRepeatFailures(fx, 7);
gate('Detects 1 repeat contact inside 7 days (and ignores the 19-day gap)', rf.repeatContacts === 1, `got ${rf.repeatContacts}`);
gate('Flags customer X as a repeat-failure chain, still unresolved', rf.chains.length === 1 && rf.chains[0].customer_id === 'X' && rf.chains[0].still_unresolved === 'Y');
gate('Pattern string is "Slot API timeout → Slot API timeout"', rf.patterns[0] && rf.patterns[0].pattern === 'Slot API timeout → Slot API timeout');

// 4. Report reconciliation: computed totals tie out to the raw data
const R = E.buildReport(rows);
gate('Outcome counts sum to total', R.kpis.digital + R.kpis.transferred + R.kpis.abandoned === rows.length);
gate('Intent totals sum to total', R.byIntent.reduce((a, g) => a + g.total, 0) === rows.length);
gate('Failure-reason counts sum to non-contained contacts', R.failuresByReason.reduce((a, f) => a + f.count, 0) === rows.length - R.kpis.digital);
const manual = rows.filter(r => r.self_service_outcome === 'Resolved - digital').length / rows.length;
gate('Containment matches an independent recount', Math.abs(manual - R.kpis.containment) < 1e-12, P(manual));

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
