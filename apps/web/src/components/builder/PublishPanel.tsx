"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CircleCheck, Circle } from "lucide-react";
import type { OrgStatus } from "@workshop/shared";
import { Button } from "@/components/ui/button";

export interface Prerequisite { key: "identity" | "hero" | "contact" | "workshop"; met: boolean }

interface Props {
  status: OrgStatus;
  prerequisites: Prerequisite[];
  invalidSections: number;
  /** Theme colours fail the 4.5:1 contrast rule. */
  invalidTheme: boolean;
  onSubmitForReview: () => void;
  onPublish: () => void;
}

/** FR-SITE-04: first time "Submit for review" (with prerequisites), afterwards "Publish". Mock only: nothing is sent. */
export function PublishPanel({ status, prerequisites, invalidSections, invalidTheme, onSubmitForReview, onPublish }: Props) {
  const t = useTranslations("builder");
  const [message, setMessage] = useState<"submitted" | "published" | null>(null);
  const allMet = prerequisites.every((p) => p.met);
  const blocked = invalidSections > 0 || invalidTheme;
  const issues = (
    <>
      {invalidSections > 0 ? <p className="text-xs text-amber-800">{t("publish.fixErrors", { count: invalidSections })}</p> : null}
      {invalidTheme ? <p className="text-xs text-amber-800">{t("publish.fixTheme")}</p> : null}
    </>
  );

  if (status === "SUSPENDED") {
    return <p role="status" className="text-sm text-destructive">{t("publish.suspended")}</p>;
  }
  if (status === "PENDING_REVIEW") {
    return <p role="status" className="text-sm text-muted-foreground">{t("publish.pending")}</p>;
  }

  if (status === "ACTIVE") {
    return (
      <div className="space-y-2">
        <Button type="button" disabled={blocked} onClick={() => { onPublish(); setMessage("published"); }}>
          {t("publish.publish")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("publish.publishHint")}</p>
        {issues}
        {message === "published" ? <p role="status" className="text-sm text-green-800">{t("publish.publishedMock")}</p> : null}
      </div>
    );
  }

  // DRAFT: first submission with the prerequisites checklist.
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">{t("publish.checklistTitle")}</h3>
        <ul className="mt-2 space-y-1.5">
          {prerequisites.map((p) => (
            <li key={p.key} className="flex items-start gap-2 text-sm">
              {p.met ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-green-700" aria-hidden /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
              <span>
                {t(`publish.prereq.${p.key}`)}
                <span className="sr-only"> — {p.met ? t("publish.done") : t("publish.missing")}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Button type="button" disabled={!allMet || blocked || message === "submitted"} onClick={() => { onSubmitForReview(); setMessage("submitted"); }}>
        {t("publish.submit")}
      </Button>
      {!allMet ? <p className="text-xs text-muted-foreground">{t("publish.submitDisabled")}</p> : null}
      {issues}
      {message === "submitted" ? <p role="status" className="text-sm text-green-800">{t("publish.submittedMock")}</p> : null}
    </div>
  );
}
