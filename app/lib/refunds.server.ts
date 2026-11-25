import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  coupons,
  courses,
  lessonProgress,
  lessons,
  modules,
  purchases,
  refunds,
  users,
  videoWatchEvents,
  LessonProgressStatus,
  RefundStatus,
} from "~/db/schema";
import { getDiscountForCountry } from "~/lib/ppp";
import { formatPrice } from "~/lib/utils";

// The rules for a Refund Request (see GLOSSARY.md). Both the course page, which
// decides whether to offer a refund, and the refund action, which accepts the
// request, go through `getRefundEligibility` so they can never disagree.

/** The Refund Window: how many days after a purchase a learner may ask for a refund. */
export const REFUND_WINDOW_DAYS = 14;

/** Once this much of the course has been watched, no refund is offered. */
export const REFUND_WATCH_LIMIT_SECONDS = 2 * 60 * 60;

/** Once this share of the lessons is completed, no refund is offered. */
export const REFUND_COMPLETION_LIMIT = 0.5;

export type RefundIneligibilityReason =
  | "no-purchase"
  | "request-already-open"
  | "claimed-team-seat"
  | "window-closed"
  | "too-much-completed"
  | "too-much-watched";

export type RefundOffer = {
  /** What the learner would get back, in cents. */
  amount: number;
  /** The last calendar day on which the request can still be made. */
  lastDayInWindow: string;
};

export type RefundEligibility =
  | { eligible: true; purchaseId: number; offer: RefundOffer }
  | { eligible: false; reason: RefundIneligibilityReason };

export type RefundFacts = {
  purchase:
    | {
        id: number;
        createdAt: string;
        amountPaid: number;
        country: string | null;
      }
    | undefined;
  coursePrice: number;
  hasOpenRequest: boolean;
  isClaimedTeamSeat: boolean;
  lessonCount: number;
  completedLessonCount: number;
  watchedSeconds: number;
  today?: Date;
};

// The window is counted in whole days, not hours. Someone who buys at 23:00
// should still get the whole of their fourteenth day.
export function calendarDay(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

export function lastDayOfRefundWindow(purchasedAtIso: string): string {
  const deadline = new Date(purchasedAtIso);
  deadline.setDate(deadline.getDate() + REFUND_WINDOW_DAYS);
  return calendarDay(deadline);
}

/**
 * Applies the refund rules to facts already loaded from the database. Pure,
 * so the rules can be unit tested without a database.
 */
export function evaluateRefundEligibility(facts: RefundFacts): RefundEligibility {
  const { purchase } = facts;

  if (!purchase) return { eligible: false, reason: "no-purchase" };
  if (facts.hasOpenRequest) {
    return { eligible: false, reason: "request-already-open" };
  }

  // A seat that came out of a team licence, and has been claimed, belongs to
  // the team. The learner cannot hand it back on their own.
  if (facts.isClaimedTeamSeat) {
    return { eligible: false, reason: "claimed-team-seat" };
  }

  const today = calendarDay(facts.today ?? new Date());
  const purchasedDay = calendarDay(new Date(purchase.createdAt));
  const lastDayInWindow = lastDayOfRefundWindow(purchase.createdAt);

  if (today < purchasedDay || today > lastDayInWindow) {
    return { eligible: false, reason: "window-closed" };
  }

  if (
    facts.lessonCount > 0 &&
    facts.completedLessonCount / facts.lessonCount >= REFUND_COMPLETION_LIMIT
  ) {
    return { eligible: false, reason: "too-much-completed" };
  }

  if (facts.watchedSeconds >= REFUND_WATCH_LIMIT_SECONDS) {
    return { eligible: false, reason: "too-much-watched" };
  }

  // A purchase made at a purchasing-power price is given back at that price,
  // not at the list price of the course.
  const pppDiscount = getDiscountForCountry(purchase.country);
  const amount = pppDiscount > 0 ? purchase.amountPaid : facts.coursePrice;

  return {
    eligible: true,
    purchaseId: purchase.id,
    offer: { amount, lastDayInWindow },
  };
}

/**
 * An Admin's Decision on an Open Refund Request (see GLOSSARY.md). Each
 * outcome is its own variant, so a Decline carrying its reason can sit next
 * to Approve without changing it.
 */
export type Decision = { outcome: "approve"; decidedByUserId: number };

export type DecisionRefusalReason = "already-decided";

/** What a Decision writes onto the Refund Request. */
export type DecisionFields = {
  status: RefundStatus;
  decidedAt: string;
  decidedByUserId: number;
  declineReason: string | null;
};

export type DecisionResult =
  | { ok: true; fields: DecisionFields }
  | { ok: false; reason: DecisionRefusalReason };

/**
 * Applies a Decision to a Refund Request's current state. Pure: it receives
 * the clock, and returns the fields to write or why the Decision is refused.
 * Eligibility is not judged again here; it belongs to the moment the learner
 * asked (docs/adr/0002).
 */
export function decideRefundRequest(
  request: { status: RefundStatus },
  decision: Decision,
  now: Date
): DecisionResult {
  // A Decision is final: only an Open Refund Request can be decided.
  if (request.status !== RefundStatus.Open) {
    return { ok: false, reason: "already-decided" };
  }

  return {
    ok: true,
    fields: {
      status: RefundStatus.Approved,
      decidedAt: now.toISOString(),
      decidedByUserId: decision.decidedByUserId,
      declineReason: null,
    },
  };
}

/**
 * Records an Admin's Decision on a Refund Request. Loads the request, applies
 * `decideRefundRequest`, and writes the result only while the request is
 * still Open, so two Admins deciding at once cannot both win. Then logs the
 * email to the learner.
 */
export function applyRefundDecision(
  refundRequestId: number,
  decision: Decision,
  now: Date = new Date()
): DecisionResult | { ok: false; reason: "not-found" } {
  const request = db
    .select({
      status: refunds.status,
      learnerName: users.name,
      learnerEmail: users.email,
      courseTitle: courses.title,
      amountPaid: purchases.amountPaid,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(refunds.id, refundRequestId))
    .get();

  if (!request) return { ok: false, reason: "not-found" };

  const result = decideRefundRequest(request, decision, now);
  if (!result.ok) return result;

  const written = db
    .update(refunds)
    .set(result.fields)
    .where(
      and(eq(refunds.id, refundRequestId), eq(refunds.status, RefundStatus.Open))
    )
    .returning({ id: refunds.id })
    .all();

  if (written.length === 0) return { ok: false, reason: "already-decided" };

  const email = buildRefundApprovedEmail(request);
  console.log(`[email] to=${email.to} subject=${email.subject}\n${email.body}`);

  return result;
}

/**
 * The email a learner gets when their Refund Request is approved. There is
 * no mail transport yet, so it goes to the server log. No date is promised:
 * the Refund itself is not modelled (docs/adr/0002).
 */
function buildRefundApprovedEmail(input: {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  amountPaid: number;
}) {
  return {
    to: input.learnerEmail,
    subject: `Refund request approved — ${input.courseTitle}`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `An Admin has approved your refund request for "${input.courseTitle}".`,
      `The refund of the full amount you paid, ${formatPrice(input.amountPaid)}, is on its way.`,
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

/** Every Open Refund Request, oldest first, with what an Admin needs to decide it. */
export function getOpenRefundRequests() {
  return db
    .select({
      id: refunds.id,
      reason: refunds.reason,
      requestedAt: refunds.requestedAt,
      learnerName: users.name,
      courseTitle: courses.title,
      amountPaid: purchases.amountPaid,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(refunds.status, RefundStatus.Open))
    .orderBy(refunds.requestedAt)
    .all();
}

/**
 * Loads the facts for one learner and course and applies the refund rules.
 */
export function getRefundEligibility(
  userId: number,
  course: { id: number; price: number },
  today: Date = new Date()
): RefundEligibility {
  const purchase = getLatestPurchase(userId, course.id);

  if (!purchase) return { eligible: false, reason: "no-purchase" };

  const lessonIds = getLessonIdsForCourse(course.id);

  return evaluateRefundEligibility({
    purchase,
    coursePrice: course.price,
    hasOpenRequest: Boolean(getOpenRefundRequest(purchase.id)),
    isClaimedTeamSeat: isClaimedTeamSeat(purchase.id),
    lessonCount: lessonIds.length,
    completedLessonCount: getCompletedLessonCount(userId, lessonIds),
    watchedSeconds: getSecondsWatched(userId, lessonIds),
    today,
  });
}

export function getLatestPurchase(userId: number, courseId: number) {
  return db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .orderBy(sql`${purchases.createdAt} desc`)
    .get();
}

/** The Open Refund Request on a purchase, if there is one. */
export function getOpenRefundRequest(purchaseId: number) {
  return db
    .select()
    .from(refunds)
    .where(
      and(
        eq(refunds.purchaseId, purchaseId),
        eq(refunds.status, RefundStatus.Open)
      )
    )
    .get();
}

function isClaimedTeamSeat(purchaseId: number): boolean {
  const claimed = db
    .select({ id: coupons.id })
    .from(coupons)
    .where(and(eq(coupons.purchaseId, purchaseId), isNotNull(coupons.redeemedAt)))
    .get();

  return Boolean(claimed);
}

function getLessonIdsForCourse(courseId: number): number[] {
  const rows = db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all();

  return rows.map((row) => row.id);
}

function getCompletedLessonCount(userId: number, lessonIds: number[]): number {
  if (lessonIds.length === 0) return 0;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();

  return result?.count ?? 0;
}

function getSecondsWatched(userId: number, lessonIds: number[]): number {
  if (lessonIds.length === 0) return 0;

  const furthestPerLesson = db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all();

  return furthestPerLesson.reduce((total, row) => total + row.furthest, 0);
}
