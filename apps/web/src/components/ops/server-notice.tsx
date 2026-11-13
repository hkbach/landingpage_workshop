"use client";

import { useTranslations } from "next-intl";

/** Shown when the server did not accept a change the screen had shown: the screen then holds what the server has. */
export function ServerRefusedNotice({ show }: { show: boolean }) {
  const t = useTranslations("ops");
  return show ? <p role="alert" data-testid="server-refused" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{t("serverRefused")}</p> : null;
}
