"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReportActionsContext } from "@/components/sections/report-context";
import { siteFontClass } from "@/components/sections/site-fonts";
import { modalThemeStyle } from "@/components/sections/theme";
import type { PageTheme } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ReportForm } from "./ReportForm";

/**
 * Owns the "Report this site" popup of the landing page and exposes `open()` to the footer link of every template through
 * context. `preview` is the builder preview: the popup opens and looks the same, but nothing can be sent.
 */
export function ReportProvider({ slug, theme, preview = false, children }: { slug: string; theme: PageTheme; preview?: boolean; children: ReactNode }) {
  const t = useTranslations("site.report");
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const value = useMemo(() => ({ open: () => { setSent(false); setOpen(true); } }), []);

  return (
    <ReportActionsContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          style={modalThemeStyle(theme)}
          className={cn("max-h-[92dvh] gap-4 overflow-y-auto p-5 sm:max-w-lg", siteFontClass(theme.font))}
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">{sent ? t("thanksTitle") : t("title")}</DialogTitle>
            <DialogDescription className="text-[var(--site-muted)]">{sent ? t("thanksText") : t("intro")}</DialogDescription>
          </DialogHeader>
          {/* Mounted only while open, so the form starts empty every time. */}
          {open ? <ReportForm variant="dialog" slug={slug} preview={preview} onSent={() => setSent(true)} onClose={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </ReportActionsContext.Provider>
  );
}
