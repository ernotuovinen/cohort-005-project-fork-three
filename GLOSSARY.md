# Cadence

A course platform where learners buy courses, work through lessons, and can ask for their money back inside a short window after buying.

## Language

### People

**Admin**:
A Cadence staff user with the admin role. Admins decide refund requests; instructors and learners do not.
_Avoid_: The team, team member, staff, support, Platform Admin

**Team Admin**:
A learner who bought a Team Licence and hands out its seats. A Team Admin has no say over refund requests.
_Avoid_: Admin (on its own)

**Instructor**:
A user who builds and edits their own courses and sees the learners enrolled on them. An Instructor speaks for their own courses only.
_Avoid_: Teacher, Author, Creator

### Access

**Purchase**:
A learner paying for one course. One purchase gives one learner access to one course, unless it is a Team Licence.
_Avoid_: Order, transaction, sale, Individual Purchase

**Team Licence**:
A purchase a Team Admin makes for others. It grants Team Seats, not the course itself.
_Avoid_: Team purchase, bulk purchase

**Team Seat**:
One place on a Team Licence. It is unclaimed until a learner claims it with its code, and then it belongs to that learner. A claimed team seat cannot be refunded.
_Avoid_: Coupon, code, voucher, redeemed coupon

**Enrollment**:
The record that grants a learner access to a course's content. It is created by a purchase or by claiming a team seat. A later purchase creates a new enrollment.
_Avoid_: Access record, subscription

**Ended Enrollment**:
An enrollment that no longer grants access because the refund request on its purchase was approved. It is kept, not removed.
_Avoid_: Deleted enrollment, revoked access, suspended enrollment, lapsed

### Refunds

**Refund Request**:
A learner asking for a refund on one purchase, with a reason in their own words. It is Open until an Admin makes a Decision on it. A purchase can have several refund requests over time, but only one Open one at a time.
_Avoid_: Cancellation, reversal, chargeback, dispute, cancel my purchase

**Open Refund Request**:
A refund request no Admin has decided yet. The learner keeps the course while it is open.
_Avoid_: Pending, Requested, Awaiting review, Unresolved

**Decision**:
What an Admin does to an Open Refund Request. There are two outcomes, Approve and Decline, and a decision is final.
_Avoid_: Resolution, review, verdict

**Approved Refund Request**:
A refund request an Admin has approved. Approving ends the learner's enrollment and leads to a Refund.

**Declined Refund Request**:
A refund request an Admin has declined, with a reason the learner can read. Nothing the purchase granted is lost, and the learner may raise a new refund request.

**Refund**:
Money sent back to the learner after a refund request is approved. It is always the full amount paid. A declined refund request has no refund.
_Avoid_: Reversal, chargeback, money back, Pending Refund, Issued Refund, Failed Refund

**Refund Window**:
The period after a purchase during which a learner may still make a refund request. Eligibility is judged when the learner asks, not when an Admin decides.
_Avoid_: Cancellation window, cooling-off period

**Watch Limit**:
A refund is only offered on a course with under two hours watched. Watched means video actually played, the furthest point reached in each lesson added up, not lessons opened. Past the limit the refund form turns the learner away.
_Avoid_: Watch cap, viewing threshold, viewed, progress

**Completion Limit**:
A refund is only offered on a course with under half its lessons completed. Past the limit the refund form turns the learner away.
_Avoid_: Progress cap, completion threshold
