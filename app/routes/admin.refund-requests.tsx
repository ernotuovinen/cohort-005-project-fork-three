import { useEffect, useState } from "react";
import {
  data,
  isRouteErrorResponse,
  Link,
  useFetcher,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  AlertTriangle,
  CheckCircle2,
  History,
  ReceiptText,
} from "lucide-react";
import type { Route } from "./+types/admin.refund-requests";
import { db } from "~/db";
import { RefundStatus, UserRole, users } from "~/db/schema";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import { cn, formatPrice } from "~/lib/utils";
import {
  applyRefundDecision,
  DECLINE_REASON_MAX_LENGTH,
  getDecidedRefundRequests,
  getOpenRefundRequests,
  type Decision,
} from "~/lib/refunds.server";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";

const refundRequestActionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("approve"),
    refundRequestId: z.coerce.number().int(),
  }),
  z.object({
    intent: z.literal("decline"),
    refundRequestId: z.coerce.number().int(),
    // The Decision rule checks the reason; it is not repeated here.
    reason: z.string(),
  }),
]);

/** Only an Admin may see or decide Refund Requests; owning Instructors may not. */
async function requireAdmin(request: Request, signedOutMessage: string) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data(signedOutMessage, { status: 401 });
  }

  const currentUser = db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!currentUser || currentUser.role !== UserRole.Admin) {
    throw data("Only Admins can decide Refund Requests.", { status: 403 });
  }

  return currentUser;
}

export function meta() {
  return [
    { title: "Refund Requests — Cadence" },
    {
      name: "description",
      content: "Decide Open Refund Requests and see every Decision made",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(
    request,
    "Select a user from the DevUI panel to decide Refund Requests."
  );

  return {
    openRequests: getOpenRefundRequests(),
    // Revalidated after every Decision, so a decided row shows up here at once.
    decidedRequests: getDecidedRefundRequests(),
    declineReasonMaxLength: DECLINE_REASON_MAX_LENGTH,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const admin = await requireAdmin(request, "You must be logged in.");

  const formData = await request.formData();
  const parsed = parseFormData(formData, refundRequestActionSchema);

  if (!parsed.success) {
    return data(
      { error: Object.values(parsed.errors)[0] ?? "Invalid input." },
      { status: 400 }
    );
  }

  const decision: Decision =
    parsed.data.intent === "decline"
      ? {
          outcome: "decline",
          decidedByUserId: admin.id,
          reason: parsed.data.reason,
        }
      : { outcome: "approve", decidedByUserId: admin.id };

  const result = applyRefundDecision(parsed.data.refundRequestId, decision);

  if (!result.ok) {
    if (result.reason === "not-found") {
      return data({ error: "Refund Request not found." }, { status: 404 });
    }
    if (result.reason === "decline-reason-missing") {
      return data(
        {
          error: "Give a reason for the Decline. The learner will read it.",
          field: "reason" as const,
        },
        { status: 400 }
      );
    }
    if (result.reason === "decline-reason-too-long") {
      return data(
        {
          error: `Keep the reason for the Decline to ${DECLINE_REASON_MAX_LENGTH} characters or fewer.`,
          field: "reason" as const,
        },
        { status: 400 }
      );
    }
    return data(
      {
        error:
          "This Refund Request was already decided by another Admin. Its Decision is final.",
      },
      { status: 409 }
    );
  }

  return { success: true as const, outcome: decision.outcome };
}

// A refused Decision answers 409, and React Router skips revalidation after
// an error status by default. Reload anyway, so the decided row leaves the list.
export function shouldRevalidate({
  actionStatus,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (actionStatus === 409) return true;
  return defaultShouldRevalidate;
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function OpenRefundRequestRow({
  refundRequest,
  declineReasonMaxLength,
}: {
  declineReasonMaxLength: number;
  refundRequest: {
    id: number;
    learnerName: string;
    courseTitle: string;
    amountPaid: number;
    reason: string;
    requestedAt: string;
  };
}) {
  const fetcher = useFetcher<typeof action>();
  const isSubmitting = fetcher.state !== "idle";
  const submittingIntent = fetcher.formData?.get("intent");
  const [isDeclining, setIsDeclining] = useState(false);

  // A refused reason is shown next to the field, so it is not toasted.
  const reasonError =
    fetcher.data && "error" in fetcher.data && "field" in fetcher.data
      ? fetcher.data.error
      : null;

  // Toast as soon as the action answers. Waiting for "idle" is too late: the
  // revalidation that follows removes this row, decided or not.
  useEffect(() => {
    if (!fetcher.data) return;
    if ("success" in fetcher.data) {
      toast.success(
        fetcher.data.outcome === "decline"
          ? `Refund Request declined for ${refundRequest.learnerName}.`
          : `Refund Request approved for ${refundRequest.learnerName}.`
      );
    } else if ("error" in fetcher.data && !("field" in fetcher.data)) {
      toast.error(fetcher.data.error);
    }
  }, [fetcher.data, refundRequest.learnerName]);

  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="px-4 py-3 text-sm font-medium">
        {refundRequest.learnerName}
      </td>
      <td className="px-4 py-3 text-sm">{refundRequest.courseTitle}</td>
      <td className="px-4 py-3 text-sm tabular-nums">
        {formatPrice(refundRequest.amountPaid)}
      </td>
      <td className="max-w-md px-4 py-3 text-sm text-muted-foreground">
        {refundRequest.reason}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
        {formatDay(refundRequest.requestedAt)}
      </td>
      <td className="px-4 py-3">
        {isDeclining ? (
          <fetcher.Form method="post" className="w-72 space-y-2">
            <input type="hidden" name="intent" value="decline" />
            <input
              type="hidden"
              name="refundRequestId"
              value={refundRequest.id}
            />
            <label
              htmlFor={`decline-reason-${refundRequest.id}`}
              className="text-xs font-medium"
            >
              Reason for the Decline
            </label>
            <Textarea
              id={`decline-reason-${refundRequest.id}`}
              name="reason"
              rows={3}
              maxLength={declineReasonMaxLength}
              autoFocus
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={
                reasonError ? `decline-error-${refundRequest.id}` : undefined
              }
              placeholder="The learner will read this."
              className="text-sm"
            />
            {reasonError && (
              <p
                id={`decline-error-${refundRequest.id}`}
                role="alert"
                className="text-xs text-destructive"
              >
                {reasonError}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                variant="destructive"
                className="h-8 text-xs"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Declining…" : "Decline Refund Request"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                disabled={isSubmitting}
                onClick={() => setIsDeclining(false)}
              >
                Cancel
              </Button>
            </div>
          </fetcher.Form>
        ) : (
          <div className="flex gap-2">
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="approve" />
              <input
                type="hidden"
                name="refundRequestId"
                value={refundRequest.id}
              />
              <Button
                type="submit"
                size="sm"
                className="h-8 text-xs"
                disabled={isSubmitting}
              >
                {isSubmitting && submittingIntent === "approve"
                  ? "Approving…"
                  : "Approve"}
              </Button>
            </fetcher.Form>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={isSubmitting}
              onClick={() => setIsDeclining(true)}
            >
              Decline
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}

function DecisionBadge({ status }: { status: RefundStatus }) {
  const approved = status === RefundStatus.Approved;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        approved
          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
      )}
    >
      {approved ? "Approved" : "Declined"}
    </span>
  );
}

function DecidedRefundRequestRow({
  refundRequest,
}: {
  refundRequest: {
    status: RefundStatus;
    decidedAt: string | null;
    decidedByName: string | null;
    declineReason: string | null;
    learnerName: string;
    courseTitle: string;
    amountPaid: number;
  };
}) {
  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="px-4 py-3">
        <DecisionBadge status={refundRequest.status} />
      </td>
      <td className="px-4 py-3 text-sm">
        {refundRequest.decidedByName ?? "Unknown Admin"}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
        {refundRequest.decidedAt ? formatDay(refundRequest.decidedAt) : "—"}
      </td>
      <td className="px-4 py-3 text-sm font-medium">
        {refundRequest.learnerName}
      </td>
      <td className="px-4 py-3 text-sm">{refundRequest.courseTitle}</td>
      <td className="px-4 py-3 text-sm tabular-nums">
        {formatPrice(refundRequest.amountPaid)}
      </td>
      <td className="max-w-md px-4 py-3 text-sm text-muted-foreground">
        {refundRequest.declineReason ?? ""}
      </td>
    </tr>
  );
}

const headerCell =
  "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";

export default function AdminRefundRequests({
  loaderData,
}: Route.ComponentProps) {
  const { openRequests, decidedRequests, declineReasonMaxLength } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Refund Requests</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Refund Requests</h1>
        <p className="mt-1 text-muted-foreground">
          Make a Decision on each Open Refund Request. A Decision is final.
        </p>
      </div>

      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <ReceiptText className="size-4" />
        <span>
          {openRequests.length} Open{" "}
          {openRequests.length === 1 ? "Refund Request" : "Refund Requests"}
        </span>
      </div>

      {openRequests.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="font-medium">No Open Refund Requests.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Every Refund Request has a Decision. There is nothing to decide.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className={headerCell}>Learner</th>
                    <th className={headerCell}>Course</th>
                    <th className={headerCell}>Amount paid</th>
                    <th className={headerCell}>Reason</th>
                    <th className={headerCell}>Raised</th>
                    <th className={headerCell}>Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {openRequests.map((refundRequest) => (
                    <OpenRefundRequestRow
                      key={refundRequest.id}
                      refundRequest={refundRequest}
                      declineReasonMaxLength={declineReasonMaxLength}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <section className="mt-12" aria-labelledby="decided-refund-requests">
        <h2 id="decided-refund-requests" className="text-xl font-semibold">
          Decided Refund Requests
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Every Decision an Admin has made, newest first. A Decision is final.
        </p>

        {decidedRequests.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <History className="mx-auto mb-3 size-8 text-muted-foreground/50" />
              <p className="font-medium">No Decided Refund Requests yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Refund Requests an Admin has Approved or Declined show up here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className={headerCell}>Decision</th>
                      <th className={headerCell}>Decided by</th>
                      <th className={headerCell}>Decided</th>
                      <th className={headerCell}>Learner</th>
                      <th className={headerCell}>Course</th>
                      <th className={headerCell}>Amount paid</th>
                      <th className={headerCell}>Reason for the Decline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decidedRequests.map((refundRequest) => (
                      <DecidedRefundRequestRow
                        key={refundRequest.id}
                        refundRequest={refundRequest}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading Refund Requests.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message =
        typeof error.data === "string"
          ? error.data
          : "Only Admins can decide Refund Requests.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
