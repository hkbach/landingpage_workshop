"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Pencil, Power, PowerOff } from "lucide-react";
import { canEditWorkshop, type WorkshopStatus } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { WorkshopEditDialog, type WorkshopEditData } from "./workshop-edit-dialog";

/**
 * Buttons of one row of the workshop list: Activate / Deactivate and Edit. A workshop is only deactivated once every one of its sessions is
 * Closed (the button is read-only with a tooltip until then, and the server checks it again), and only a deactivated (draft) workshop can be edited.
 * An archived workshop has no Activate / Deactivate button.
 */
export function WorkshopRowActions({ id, status, openSessions, edit }: { id: string; status: WorkshopStatus; openSessions: number; edit: WorkshopEditData }) {
  const t = useTranslations("catalog");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  async function switchTo(to: "ACTIVE" | "DRAFT") {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/workshops/${encodeURIComponent(id)}/status`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: to }),
      });
      if (res.ok) {
        setMessage({ text: t(to === "ACTIVE" ? "list.activated" : "list.deactivated"), tone: "ok" });
        router.refresh();
      } else {
        const body = (await res.json().catch(() => null)) as { error?: { code?: string; details?: { open?: number } } } | null;
        setMessage({ text: body?.error?.code === "SESSIONS_OPEN" ? t("list.deactivateBlocked", { count: body.error.details?.open ?? 0 }) : t("list.statusFailed"), tone: "error" });
      }
    } catch {
      setMessage({ text: t("list.statusFailed"), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const blocked = t("list.deactivateBlocked", { count: openSessions });
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap gap-1.5">
        {status === "DRAFT" ? (
          <Button size="sm" variant="outline" disabled={busy} data-testid="activate-button" onClick={() => void switchTo("ACTIVE")}>
            <Power aria-hidden="true" />{t("list.activate")}
          </Button>
        ) : null}
        {status === "ACTIVE" ? (
          openSessions > 0 ? (
            // Read-only until every session is closed: the span carries the tooltip (a disabled button does not).
            <span title={blocked} data-testid="deactivate-blocked" className="inline-flex cursor-not-allowed">
              <Button size="sm" variant="outline" disabled aria-disabled="true" aria-label={`${t("list.deactivate")}: ${blocked}`}>
                <PowerOff aria-hidden="true" />{t("list.deactivate")}
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="outline" disabled={busy} data-testid="deactivate-button" onClick={() => void switchTo("DRAFT")}>
              <PowerOff aria-hidden="true" />{t("list.deactivate")}
            </Button>
          )
        ) : null}
        {canEditWorkshop(status) ? (
          <Button size="sm" variant="outline" data-testid="edit-workshop" onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" />{t("list.edit")}
          </Button>
        ) : (
          <span title={t("list.editLocked")} data-testid="edit-locked" className="inline-flex cursor-not-allowed">
            <Button size="sm" variant="outline" disabled aria-disabled="true" aria-label={`${t("list.edit")}: ${t("list.editLocked")}`}>
              <Pencil aria-hidden="true" />{t("list.edit")}
            </Button>
          </span>
        )}
      </div>
      <WorkshopEditDialog data={edit} open={editing} onOpenChange={setEditing} />
      {message ? <p role="status" className={message.tone === "error" ? "text-xs font-medium text-destructive" : "text-xs font-medium text-emerald-800"}>{message.text}</p> : null}
    </div>
  );
}
