import { describe, it, expect } from "vitest";
import {
  evaluateRefundEligibility,
  lastDayOfRefundWindow,
  REFUND_WATCH_LIMIT_SECONDS,
  type RefundFacts,
} from "./refunds.server";

const purchasedAt = new Date(2026, 0, 10, 23, 30); // 10 Jan 2026, late evening

function facts(overrides: Partial<RefundFacts> = {}): RefundFacts {
  return {
    purchase: {
      id: 1,
      createdAt: purchasedAt.toISOString(),
      amountPaid: 7900,
      country: "US",
    },
    coursePrice: 7900,
    hasOpenRequest: false,
    isClaimedTeamSeat: false,
    lessonCount: 10,
    completedLessonCount: 0,
    watchedSeconds: 0,
    today: new Date(2026, 0, 12),
    ...overrides,
  };
}

describe("evaluateRefundEligibility", () => {
  it("offers a refund inside the window with little progress", () => {
    const result = evaluateRefundEligibility(facts());
    expect(result).toEqual({
      eligible: true,
      purchaseId: 1,
      offer: { amount: 7900, lastDayInWindow: "2026-01-24" },
    });
  });

  it("refuses when there is no purchase", () => {
    expect(evaluateRefundEligibility(facts({ purchase: undefined }))).toEqual({
      eligible: false,
      reason: "no-purchase",
    });
  });

  it("refuses when a refund request is already open", () => {
    expect(
      evaluateRefundEligibility(facts({ hasOpenRequest: true }))
    ).toEqual({ eligible: false, reason: "request-already-open" });
  });

  it("refuses a claimed team seat", () => {
    expect(
      evaluateRefundEligibility(facts({ isClaimedTeamSeat: true }))
    ).toEqual({ eligible: false, reason: "claimed-team-seat" });
  });

  it("counts the window in whole calendar days", () => {
    const lastDay = new Date(2026, 0, 24, 23, 59);
    const dayAfter = new Date(2026, 0, 25, 0, 1);

    expect(evaluateRefundEligibility(facts({ today: lastDay })).eligible).toBe(
      true
    );
    expect(evaluateRefundEligibility(facts({ today: dayAfter }))).toEqual({
      eligible: false,
      reason: "window-closed",
    });
  });

  it("refuses when half the lessons are completed", () => {
    expect(
      evaluateRefundEligibility(facts({ completedLessonCount: 5 }))
    ).toEqual({ eligible: false, reason: "too-much-completed" });
    expect(
      evaluateRefundEligibility(facts({ completedLessonCount: 4 })).eligible
    ).toBe(true);
  });

  it("ignores the completion rule for a course with no lessons", () => {
    expect(
      evaluateRefundEligibility(
        facts({ lessonCount: 0, completedLessonCount: 0 })
      ).eligible
    ).toBe(true);
  });

  it("refuses when two hours have been watched", () => {
    expect(
      evaluateRefundEligibility(
        facts({ watchedSeconds: REFUND_WATCH_LIMIT_SECONDS })
      )
    ).toEqual({ eligible: false, reason: "too-much-watched" });
  });

  it("refunds the purchasing-power price rather than the list price", () => {
    const result = evaluateRefundEligibility(
      facts({
        purchase: {
          id: 2,
          createdAt: purchasedAt.toISOString(),
          amountPaid: 2370,
          country: "IN",
        },
      })
    );
    expect(result.eligible && result.offer.amount).toBe(2370);
  });
});

describe("lastDayOfRefundWindow", () => {
  it("is fourteen days after the purchase day", () => {
    expect(lastDayOfRefundWindow(purchasedAt.toISOString())).toBe(
      "2026-01-24"
    );
  });
});
