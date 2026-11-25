---
status: accepted
date: 2026-11-25
---

# A Decision on a Refund Request is separate from the Refund

An Admin's Decision on a Refund Request is recorded on the request itself, as Approved or Declined with who and when, and nothing else happens to money. No Refund record exists, nothing is paid, and the glossary's Refund remains a described concept with no table behind it. Eligibility is judged only when the learner asks; an Admin deciding later does not re-run the rules.

## Why

Cadence has no payment provider, and this exercise is about the language and the decisions rather than a working refunds system. Modelling Pending, Issued and Failed Refund states now would mean inventing a money flow nobody can run, and an unused state machine is worse than none. Keeping the Decision on the request means a Refund can be added later as its own thing, created from an Approved Refund Request, without reshaping the request.

## Considered options

- **One row that is both request and refund,** with a status running from Open through Approved to Issued. Rejected: it fuses two decisions by two different actors, the Admin's judgement and the payment system's outcome, into one column, and the glossary already separates them.
- **Re-check eligibility at Decision time.** Rejected: it would penalise a learner for the Admin's delay. A learner who kept watching while waiting was eligible when they asked, and that is the moment that counts.
- **Decision on the request, no Refund yet (chosen).**

## Consequences

- The existing amount-refunded column on refund requests stays unused and is a candidate for removal when a Refund is modelled.
- The approval email says the full refund is on its way with no date, which is the plain-words version of a Pending Refund.
- An Admin can decide their own Refund Request. Accepted as a known gap for now.
