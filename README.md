# Appointment Resolution Console

Prototype automation for an **agentic AI customer-appointment resolution** case study (missed technician appointments and rescheduling).
Plain JavaScript with no dependencies. Runs in any browser and in Node.js. **All data is synthetic.**

**Live demo:** open `index.html` (or enable GitHub Pages on this repo). A single-file copy is in `dist/appointment-console.html`.

## What it does
| Module | What it automates | Where |
|---|---|---|
| Contact-reason classifier | Labels each customer message with one of 6 appointment intents, a confidence score and the evidence used; low-confidence messages go to human review | `classify()` in `src/engine.js` |
| Repeat-failure detector | Finds customers who fail digitally more than once in 7 days, the failure → failure patterns, and an outreach list | `detectRepeatFailures()` |
| Performance report | KPIs, weekly trend, channel and intent breakdowns, failure Pareto, auto-written findings, opportunity sizing | `buildReport()` + `cli/run-report.js` |
| Validation | Accuracy, precision/recall/F1, confusion matrix, plus unit and reconciliation checks that gate CI | `validate()` + `tests/validate.js` |

## Run it
```bash
node tests/validate.js                 # 14 quality gates; exits 1 on failure (used by GitHub Actions)
node cli/run-report.js                 # writes reports/performance_report.md, flagged_customers.csv, classified_contacts.csv
node cli/run-report.js my_export.csv   # run on your own export (same columns)
node scripts/build.js                  # rebuild data/data.js and dist/appointment-console.html after edits
node scripts/generate-data.js          # regenerate the synthetic dataset (seeded, deterministic)
```
In the browser, the **Performance report** tab accepts your own CSV upload.

## Data schema (`data/appointment_interactions.csv`, 5,000 rows, Jul–Sep 2026)
`interaction_id, timestamp, customer_id, region, service_type, entry_channel, customer_utterance, true_contact_reason, self_service_outcome, failure_reason, agent_resolved, self_service_sec, agent_handle_sec, csat`

## How AI-assisted development was used
1. **Spec → code:** an LLM (Claude) drafted the engine from a written spec of the intents, metrics and edge cases.
2. **Synthetic data:** the LLM wrote a seeded generator with realistic failure modes (unsupported missed-appointment intent, a week-long slot-API incident, IVR auth friction, repeat contacts).
3. **Error-driven iteration:** v1 scored 97.7% on the dataset holdout but only **52.5% on new phrasings**; it had overfit to the dataset's wording. The LLM proposed broader patterns from the misses on a 60-message challenge set (v2).
4. **Honest scoring:** a 40-message **blind set** was written after v2 and never used for tuning. v2 scores **62.5% overall, 100% precision on the 55% it automates**, and sends 45% to review.
5. **Decision:** keep rules as the high-precision fast path and add an LLM fallback tier for the review queue (`prompts/llm_fallback_classifier.md`).

## Validation results
| Test set | n | Accuracy | Precision when automated | Sent to review |
|---|---:|---:|---:|---:|
| Dataset holdout (30%) | 1,501 | 97.7% | 100% | 2.3% |
| Blind set (new phrasings) | 40 | 62.5% | 100% | 45.0% |
| Challenge set (tuning input) | 60 | 100% | 100% | 5.0% |

Reconciliation checks confirm every report total ties back to the raw rows.

## Repo layout
```
index.html                     browser app (GitHub Pages entry)
app/page.html                  app source (build wraps it)
src/engine.js                  classifier, repeat-failure detector, report, validation
cli/run-report.js              automated reporting from the command line
tests/validate.js              quality gates + unit tests (CI)
data/                          synthetic dataset, blind and challenge sets, data.js bundle
prompts/                       LLM fallback-tier prompt
scripts/                       data generator, build, v1 baseline engine
dist/appointment-console.html  single-file app
.github/workflows/validate.yml CI
```
