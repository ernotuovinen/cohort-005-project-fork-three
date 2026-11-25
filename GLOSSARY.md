# Cadence

A course platform where learners buy courses, work through lessons, and can ask for their money back inside a short window after buying.

## Language

### Access

**Purchase**:
A learner paying for one course. One purchase gives one learner access to one course.
_Avoid_: Order, transaction, sale

**Enrollment**:
The record that grants a learner access to a course's content. It is created by a purchase or by claiming a team seat. A later purchase creates a new enrollment.
_Avoid_: Access record, subscription

**Ended Enrollment**:
An enrollment that no longer grants access because the refund request on its purchase was approved. It is kept, not removed.
_Avoid_: Deleted enrollment, revoked access, suspended enrollment

**Team Seat**:
A course purchase claimed through a coupon bought by a team. A claimed team seat cannot be refunded.
_Avoid_: Redeemed coupon, team licence

**Admin**:
A Cadence staff user with the admin role. Admins decide refund requests; instructors and learners do not.
_Avoid_: The team, team member, staff, support

### Refunds

**Refund Request**:
A learner asking for a refund on one purchase, with a reason in their own words. It is Open until an Admin makes a Decision on it. A purchase can have several refund requests over time, but only one Open one at a time.
_Avoid_: Cancellation, reversal, chargeback, dispute, cancel my purchase

**Open Refund Request**:
A refund request no Admin has decided yet.
_Avoid_: Pending, Requested, Awaiting review, Unresolved

**Decision**:
What an Admin does to an Open Refund Request. There are two outcomes, Approve and Decline, and a decision is final.
_Avoid_: Resolution, review, verdict, outcome

**Approved Refund Request**:
A refund request an Admin has approved. Approving ends the learner's enrollment and leads to a Refund.

**Declined Refund Request**:
A refund request an Admin has declined, with a reason the learner can read. The learner may raise a new refund request.

**Refund**:
Money sent back to the learner after a refund request is approved. It is always the full amount paid.
_Avoid_: Reversal, chargeback, money back

**Refund Window**:
The period after a purchase during which a learner may still make a refund request. Eligibility is judged when the learner asks, not when an Admin decides.
_Avoid_: Cancellation window, cooling-off period
