"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CircleCheck, Eye, LoaderCircle, Rocket, Send, TriangleAlert } from "lucide-react";
import type { OrgStatus } from "@workshop/shared";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SaveState } from "./save-state";
import type { PublishAction } from "./publish-state";

/**
 * Sticky bar of the builder: it stays in view (just below the dashboard top bar, which is 3.5rem high) while the page
 * scrolls, so the shop always sees the autosave state and can preview or publish without scrolling back up.
 * On phones it collapses to a single row: the autosave state and Preview show only their icons.
 */
export function BuilderHeader({ saveState, status, action, message, onPublish, onSubmit }: {
  saveState: SaveState;
  status: OrgStatus;
  action: PublishAction;
  message: "published" | "submitted" | null;
  onPublish: () => void;
  onSubmit: () => void;
}) {
  const t = useTranslations("builder");
  const disabledHint =
    action.kind === "submit" || action.kind === "publish"
      ? action.reason === "saving" ? t("publish.savingHint") : action.reason === "checklist" ? t("publish.submitDisabled") : action.reason === "errors" ? t("publish.blockedHint") : undefined
      : undefined;
  // The confirmation disappears as soon as the shop edits again (autosave pending).
  const confirmation = saveState === "pending" ? null : message === "published" ? t("publish.publishedShort") : message === "submitted" ? t("publish.submittedShort") : null;

  const save =
    saveState === "pending" ? { icon: <LoaderCircle className="size-4 animate-spin" aria-hidden />, text: t("autosave.saving") }
    : saveState === "saved" ? { icon: <CircleCheck className="size-4 text-green-700" aria-hidden />, text: t("autosave.saved") }
    : saveState === "quota" || saveState === "unavailable" ? { icon: <TriangleAlert className="size-4 text-amber-800" aria-hidden />, text: t(`autosave.${saveState}`) }
    : { icon: null, text: t("autosave.idle") };

  return (
    <div className="sticky top-14 z-10 -mx-4 -mt-4 border-b bg-background px-4 py-2 shadow-sm sm:-mx-6 sm:-mt-6 sm:px-6 sm:py-2.5">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight sm:text-2xl">{t("title")}</h1>
          <p className="hidden text-sm text-muted-foreground sm:block">{t("subtitle")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <p role="status" aria-live="polite" title={save.text} className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {save.icon}
            <span className={cn("sr-only sm:not-sr-only", saveState === "idle" && "hidden sm:inline")}>{save.text}</span>
          </p>
          <Badge variant="secondary" className="hidden sm:inline-flex">{t(`publish.status.${status}`)}</Badge>
          <Link href="/shopowner/site/preview" className={cn(buttonVariants({ variant: "outline" }), "px-2.5 sm:px-3")} title={t("preview")}>
            <Eye /><span className="sr-only sm:not-sr-only">{t("preview")}</span>
          </Link>
          {action.kind === "publish" || action.kind === "submit" ? (
            <Button
              type="button" disabled={action.disabled} title={action.disabled ? disabledHint : undefined}
              aria-describedby={action.disabled && disabledHint ? "builder-publish-hint" : undefined}
              onClick={action.kind === "publish" ? onPublish : onSubmit}
            >
              {action.reason === "saving" ? <LoaderCircle className="animate-spin" aria-hidden /> : action.kind === "publish" ? <Rocket /> : <Send />}
              {action.kind === "publish" ? t("publish.publish") : t("publish.submit")}
            </Button>
          ) : (
            <Button type="button" variant="outline" disabled>
              {action.kind === "pending" ? t("publish.status.PENDING_REVIEW") : t("publish.status.SUSPENDED")}
            </Button>
          )}
          {disabledHint ? <span id="builder-publish-hint" className="sr-only">{disabledHint}</span> : null}
          {confirmation ? <p role="status" className="hidden text-sm text-green-800 sm:block">{confirmation}</p> : null}
        </div>
      </div>
      {/* Phones: the confirmation gets its own line (visual only; the desktop element above carries the live region). */}
      {confirmation ? <p aria-hidden className="mt-1 text-sm text-green-800 sm:hidden">{confirmation}</p> : null}
    </div>
  );
}
