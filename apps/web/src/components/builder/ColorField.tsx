"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { isHexColor, normalizeHex } from "@workshop/shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ContrastCheck } from "@/components/sections/theme";
import { cn } from "@/lib/utils";

/**
 * Native colour picker + hex text field. Only valid hex values (#RGB / #RRGGBB) are ever emitted, normalised to
 * #rrggbb. When `optional`, clearing the text emits undefined ("use the template colour").
 */
export function ColorField({ id, label, value, fallback, optional, onChange }: {
  id: string; label: string; value: string | undefined;
  /** Colour shown by the picker when no value is set. */
  fallback: string;
  optional?: boolean; onChange: (hex: string | undefined) => void;
}) {
  const t = useTranslations("builder");
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? value ?? "";
  const invalid = shown !== "" && !isHexColor(shown);
  const pickerValue = normalizeHex(value) ?? normalizeHex(fallback) ?? "#000000";

  function onText(v: string) {
    const text = v.trim();
    setTyped(text);
    const hex = normalizeHex(text);
    if (hex) onChange(hex);
    else if (text === "" && optional) onChange(undefined);
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color" aria-label={t("colors.picker", { name: label })} value={pickerValue}
          onChange={(e) => { setTyped(null); onChange(e.target.value); }}
          className="size-8 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
        />
        <Input
          id={id} value={shown} maxLength={7} className="font-mono" aria-invalid={invalid}
          placeholder={optional ? t("colors.auto") : "#000000"} aria-describedby={invalid ? `${id}-err` : undefined}
          onChange={(e) => onText(e.target.value)} onBlur={() => setTyped(null)}
        />
      </div>
      {invalid ? <p id={`${id}-err`} className="text-xs text-destructive">{t("colors.hexInvalid")}</p> : null}
    </div>
  );
}

/** Live contrast results. Failing checks are shown with a warning icon and text (never colour alone). */
export function ContrastBadges({ checks }: { checks: ContrastCheck[] }) {
  const t = useTranslations("builder");
  const failing = checks.filter((c) => !c.ok);
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-1.5" aria-label={t("colors.contrastTitle")}>
        {checks.map((c) => (
          <li
            key={c.id}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs",
              c.ok ? "border-green-300 bg-green-50 text-green-900" : "border-amber-400 bg-amber-50 text-amber-900",
            )}
          >
            {c.ok ? <CircleCheck className="size-3.5" aria-hidden /> : <TriangleAlert className="size-3.5" aria-hidden />}
            <span>{t(`colors.checks.${c.id}`)}: {c.ratio.toFixed(2)}:1</span>
            <span className="sr-only"> {c.ok ? t("colors.pass") : t("colors.fail")}</span>
          </li>
        ))}
      </ul>
      {failing.length > 0 ? (
        <p role="status" className="flex items-start gap-1.5 text-xs text-amber-900">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />{t("colors.warning", { min: 4.5 })}
        </p>
      ) : null}
    </div>
  );
}
