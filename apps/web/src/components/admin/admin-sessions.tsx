"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Lock, LockOpen } from "lucide-react";
import { canAdminClose, canAdminReopen, closeCount, closedForGood, type SessionStatus } from "@workshop/shared";
import type { Session } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReasonDialog } from "./reason-dialog";
import { fmt } from "./utils";

const STATUS_STYLE: Record<SessionStatus, string> = {
  OPEN: "bg-sky-100 text-sky-900", PAUSED: "bg-slate-100 text-slate-900", RUNNING: "bg-emerald-100 text-emerald-900", CLOSED: "bg-amber-100 text-amber-950", COMPLETED: "bg-teal-100 text-teal-900",
};

/**
 * The sessions of a shop for the system administrator, who can close and open any session that has not ended, without the limits of the shop
 * owner (3 re-schedules, 4 closes, the 4th for good). The changes are kept by the mock backend and show in the shop owner's pages.
 */
export function AdminSessions() {
  const t = useTranslations("admin.sessions");
  const locale = useLocale();
  const [items, setItems] = useState<Session[] | null>(null);
  const [closing, setClosing] = useState<Session | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [now] = useState(() => new Date());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/sessions", { cache: "no-store" });
      setItems(res.ok ? ((await res.json()) as { items: Session[] }).items : []);
    } catch {
      setItems([]);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function change(s: Session, action: "close" | "reopen", reason = "") {
    const res = await fetch(`/api/v1/admin/sessions/${encodeURIComponent(s.id)}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...(reason ? { reason } : {}) }),
    }).catch(() => null);
    setClosing(null);
    if (res?.ok) setMessage({ text: t(action === "close" ? "closed" : "reopened", { code: s.code }), tone: "ok" });
    else setMessage({ text: t("failed"), tone: "error" });
    await load();
  }

  const upcoming = (items ?? []).filter((s) => new Date(s.endsAt) > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <Card data-testid="admin-sessions">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("intro")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {message ? <p role="status" data-testid="admin-sessions-message" className={message.tone === "error" ? "text-sm font-medium text-destructive" : "text-sm font-medium text-emerald-800"}>{message.text}</p> : null}
        {items === null ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("code")}</TableHead>
                <TableHead>{t("start")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("ownerCloses")}</TableHead>
                <TableHead><span className="sr-only">{t("actions")}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {upcoming.map((s) => (
                <TableRow key={s.id} data-testid="admin-session-row">
                  <TableCell className="font-mono">{s.code}</TableCell>
                  <TableCell className="whitespace-nowrap">{fmt(s.startsAt, locale)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`border-transparent ${STATUS_STYLE[s.status]}`}>{t(`statuses.${s.status}`)}</Badge>
                    {closedForGood(s) ? <span className="ml-2 text-xs text-muted-foreground" data-testid="for-good">{t("forGood")}</span> : null}
                  </TableCell>
                  <TableCell className="tabular-nums">{closeCount(s.notes)} / 4</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {canAdminClose(s) ? (
                      <Button size="sm" variant="destructive" onClick={() => setClosing(s)}><Lock aria-hidden />{t("close")}<span className="sr-only"> {s.code}</span></Button>
                    ) : null}
                    {canAdminReopen(s, now) ? (
                      <Button size="sm" variant="outline" onClick={() => void change(s, "reopen")}><LockOpen aria-hidden />{t("reopen")}<span className="sr-only"> {s.code}</span></Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <ReasonDialog
        open={closing !== null} onOpenChange={(o) => !o && setClosing(null)}
        title={t("closeTitle", { code: closing?.code ?? "" })} description={t("closeBody")} confirmLabel={t("close")} reason="required" destructive
        onConfirm={(why) => closing && void change(closing, "close", why)}
      />
    </Card>
  );
}
