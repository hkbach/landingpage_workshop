"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { OrgStatus } from "@workshop/shared";
import { Button } from "@/components/ui/button";

/** Mock "Submit for review" action (FR-SITE-04). No API call. */
export function SubmitForReview({ ready, status }: { ready: boolean; status: OrgStatus }) {
  const t = useTranslations("dashboard.overview.checklist");
  const [state, setState] = useState<"idle" | "loading" | "done">(status === "PENDING_REVIEW" ? "done" : "idle");

  async function submit() {
    setState("loading");
    await new Promise((r) => setTimeout(r, 700));
    setState("done");
  }

  return (
    <div className="grid gap-2">
      <div>
        <Button onClick={submit} disabled={!ready || state !== "idle"} aria-describedby="submit-review-note">
          {state === "loading" ? t("submitting") : t("submit")}
        </Button>
      </div>
      <p id="submit-review-note" role="status" className="text-xs text-muted-foreground">
        {state === "done" ? t("submitted") : ready ? t("readyNote") : t("notReadyNote")}
      </p>
    </div>
  );
}
