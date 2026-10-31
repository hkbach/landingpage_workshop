"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { BOOK_BUTTON_DEFAULT, isBookButtonShown, supportsBookButton } from "@/components/sections/registry";
import type { SectionInstance } from "@/lib/types";

/**
 * "Show Book button" switch of a section. The value is stored as `showBook`; it is dropped when it equals the type's
 * default so untouched sections keep following the template/default.
 */
export function BookButtonToggle({ section, onChange }: {
  section: SectionInstance; onChange: (showBook: boolean | undefined) => void;
}) {
  const t = useTranslations("builder");
  if (!supportsBookButton(section.type)) return null;
  const shown = isBookButtonShown(section);
  const id = `book-${section.id}`;
  const hintKey = section.type === "hero" ? "hero" : section.type === "workshops" ? "workshops" : "generic";

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <Checkbox
        id={id} checked={shown} aria-describedby={`${id}-hint`}
        onCheckedChange={(v) => {
          const next = v === true;
          onChange(next === BOOK_BUTTON_DEFAULT[section.type] ? undefined : next);
        }}
      />
      <div className="space-y-0.5">
        <Label htmlFor={id}>{t("bookButton.label")}</Label>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">{t(`bookButton.hint.${hintKey}`)}</p>
      </div>
    </div>
  );
}
