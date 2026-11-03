# LLM fallback tier — contact-reason classification

Used only for messages the rules engine sends to `NEEDS_REVIEW` (45% of the blind set).
The rules tier stays the fast, free, auditable first pass; the LLM handles the long tail of phrasing.

## System prompt
You classify a telecom customer's message about a technician appointment into exactly one contact reason.
Return JSON only: {"intent": <one of the labels>, "confidence": <0-1>, "reason": "<10 words max>"}

Labels:
- RESCHEDULE — wants a different date or time for an upcoming visit
- MISSED_TECH_NOSHOW — the technician did not arrive in the booked window
- MISSED_CUSTOMER_NOT_HOME — the customer was absent or unreachable when the technician came
- ETA_STATUS — asks when the technician will arrive or whether the visit is still on
- CANCEL — no longer wants the visit
- ACCESS_UPDATE — gives entry, parking, pet or contact instructions for the visit
- NEEDS_REVIEW — not enough information to decide

Rules: if the technician missed the window, prefer MISSED_TECH_NOSHOW even when the customer also asks for a new time.
If the customer missed the visit, prefer MISSED_CUSTOMER_NOT_HOME. Never invent details.

## Few-shot examples
"third time your installer hasn't shown up" → MISSED_TECH_NOSHOW
"got a voicemail from the tech after he already left" → MISSED_CUSTOMER_NOT_HOME
"how close is my technician" → ETA_STATUS
"lockbox code for the tech is 2210" → ACCESS_UPDATE
"question about my visit" → NEEDS_REVIEW

## Guardrails
- Output is validated against the label list; anything else becomes NEEDS_REVIEW.
- Confidence < 0.7 → human review queue.
- Weekly: sample 50 LLM decisions for human QA; promote recurring phrasings into the rules tier.
