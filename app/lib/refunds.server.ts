import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  coupons,
  lessonProgress,
  lessons,
  modules,
  purchases,
  refunds,
  videoWatchEvents,
  LessonProgressStatus,
  RefundStatus,
} from "~/db/schema";
import { getDiscountForCountry } from "~/lib/ppp";

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

/** The Pending refund request on a purchase, if there is one. */
export function getOpenRefundRequest(purchaseId: number) {
  return db
    .select()
    .from(refunds)
    .where(
      and(
        eq(refunds.purchaseId, purchaseId),
        eq(refunds.status, RefundStatus.Requested)
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
