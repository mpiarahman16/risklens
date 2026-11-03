# Appointment Resolution — Automated Performance Report

Source: `appointment_interactions.csv` · 5,000 interactions · generated 2026-10-26

## KPIs
| Metric | Value |
|---|---:|
| Digital containment | 37.8% |
| Transfer to agent | 44.6% |
| Abandon | 17.6% |
| Agent hours | 321 |
| Avg agent handle time (min) | 8.6 |
| CSAT digital / agent / abandoned | 4.28 / 3.01 / 2.02 |
| 7-day repeat rate after success / failure | 8.6% / 31.2% |

## Findings
- Digital self-service resolved 37.8% of 5,000 appointment contacts; 44.6% transferred to an agent and 17.6% abandoned.
- Lowest containment: Missed appt - technician no-show at 7.7% (949 contacts).
- Top failure reasons: Unsupported intent (no missed-appt flow) (24.3%), Bot misunderstood request (18.1%), Authentication failure (12.9%).
- Weakest channel: IVR at 29.3% containment.
- Worst week: 2026-08-17 at 23.5% containment.
- Customers whose digital attempt failed came back within 7 days 3.6x as often as those who succeeded (31.2% vs 8.6%).
- Agentic AI could lift containment from 37.8% to 68.2%, avoiding ~434,980 agent transfers and ~$3.96M per year (illustrative assumptions).

## Failure reasons
| Reason | Count | Share | Fix rate (hyp.) | Annual value |
|---|---:|---:|---:|---:|
| Unsupported intent (no missed-appt flow) | 756 | 24.3% | 60% | $1,316,732 |
| Bot misunderstood request | 562 | 18.1% | 50% | $727,606 |
| Authentication failure | 400 | 12.9% | 30% | $334,109 |
| No available slots shown | 366 | 11.8% | 45% | $375,503 |
| Tech location unavailable | 312 | 10.0% | 60% | $464,968 |
| Slot API timeout | 237 | 7.6% | 40% | $227,810 |
| Same-day change locked (<24h rule) | 212 | 6.8% | 35% | $171,858 |
| Free-text notes not supported | 175 | 5.6% | 70% | $292,498 |
| Order-linked appt (cancel blocked) | 88 | 2.8% | 25% | $47,351 |

## Contact reasons
| Reason | Contacts | Containment | CSAT |
|---|---:|---:|---:|
| Reschedule appointment | 1832 | 50.5% | 3.58 |
| Technician ETA / appointment status | 1050 | 48.3% | 3.57 |
| Missed appt - technician no-show | 949 | 7.7% | 2.43 |
| Missed appt - customer not home | 471 | 24.2% | 3.23 |
| Cancel appointment | 376 | 58.0% | 3.81 |
| Update access / contact details | 322 | 17.1% | 3.09 |

## Channels
| Channel | Contacts | Containment |
|---|---:|---:|
| App | 1709 | 46.1% |
| IVR | 1305 | 29.3% |
| Web | 1058 | 38.8% |
| Chat | 609 | 34.5% |
| SMS | 319 | 31.7% |

## Weekly containment
| Week of | Contacts | Containment |
|---|---:|---:|
| 2026-06-29 | 268 | 40.3% |
| 2026-07-06 | 381 | 33.1% |
| 2026-07-13 | 376 | 39.9% |
| 2026-07-20 | 357 | 37.3% |
| 2026-07-27 | 374 | 43.0% |
| 2026-08-03 | 355 | 38.9% |
| 2026-08-10 | 384 | 37.5% |
| 2026-08-17 | 395 | 23.5% |
| 2026-08-24 | 370 | 43.2% |
| 2026-08-31 | 400 | 40.5% |
| 2026-09-07 | 378 | 39.9% |
| 2026-09-14 | 399 | 40.4% |
| 2026-09-21 | 364 | 39.3% |
| 2026-09-28 | 199 | 31.2% |

## Top repeat-failure patterns (7 days)
| Pattern | Count |
|---|---:|
| Unsupported intent (no missed-appt flow) → Unsupported intent (no missed-appt flow) | 124 |
| Bot misunderstood request → Unsupported intent (no missed-appt flow) | 40 |
| Tech location unavailable → Tech location unavailable | 39 |
| Unsupported intent (no missed-appt flow) → Bot misunderstood request | 37 |
| Bot misunderstood request → Bot misunderstood request | 32 |
| Unsupported intent (no missed-appt flow) → Authentication failure | 32 |
| Authentication failure → Unsupported intent (no missed-appt flow) | 28 |
| No available slots shown → No available slots shown | 24 |
| Authentication failure → Bot misunderstood request | 21 |
| Tech location unavailable → Bot misunderstood request | 20 |

Opportunity (illustrative assumptions): containment 37.8% → 68.2%; ~434,980 transfers avoided and ~$3.96M net per year.
