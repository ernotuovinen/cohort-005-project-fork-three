---
status: accepted
date: 2026-11-25
---

# An approved Refund Request ends the Enrollment rather than deleting it

When an Admin approves a Refund Request, the learner's Enrollment is marked as ended with a date, and every "is this learner enrolled" check treats an Ended Enrollment as no enrollment. The row stays. This reverses the decision recorded on issue #3 on 2026-11-15 to delete the row.

## Considered options

- **Delete the Enrollment row.** Simplest: no access code changes, and re-purchase just creates a new row. Rejected because it erases the only record of why a learner lost access. A support question like "why can't Liam open this course any more" would have nothing to point at except the refund request, inferred by date.
- **A suspended state with reactivation.** Rejected on #3 already: a reactivation path couples the old purchase to the new one for no benefit.
- **Ended Enrollment (chosen).** Keeps the audit trail, still lets a later purchase create a fresh Enrollment, and needs only that enrolled checks ignore ended rows.

## Consequences

- Every enrolled check must ignore ended rows, including the purchase route's own check, or a refunded learner can never buy again. There is more than one such check today, so the change has to be made in each.
- Lesson progress, quiz attempts, ratings and comments are keyed to the learner and lesson, not the Enrollment, and stay untouched. A returning learner continues where they left off, as decided on #3.
- An Ended Enrollment must never be reopened. A later purchase makes a new one.
