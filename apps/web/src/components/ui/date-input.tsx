"use client";

import { useRef, useState, type ComponentProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
import { dayInBounds, formatDay, parseDay } from "@/lib/date-input";
import { cn } from "@/lib/utils";
import { Input } from "./input";

type Props = Omit<ComponentProps<"input">, "type" | "value" | "onChange" | "min" | "max" | "defaultValue" | "placeholder"> & {
  /** "YYYY-MM-DD", or "" when no day is set. */
  value: string;
  /** Called with "YYYY-MM-DD", or "" when the box is empty, unfinished, not a real day or outside `min` / `max`. */
  onChange: (day: string) => void;
  /** Limits ("YYYY-MM-DD"): the days outside are greyed out in the calendar, and a typed day outside is not accepted. */
  min?: string;
  max?: string;
  /** Only grey out the days in the calendar: a typed day outside `min` / `max` is still passed on (the form says why it is refused). */
  lenient?: boolean;
};

/**
 * A day box that writes and reads the date the way the language of the page does (11/03/2026, 03/11/2026, 2026. 11. 03., 2026/11/03), whatever the
 * browser or the computer uses. A person can type it or pick it in the calendar of the browser (the button), where `min` / `max` grey out the
 * days that cannot be chosen. The value the page keeps is always "YYYY-MM-DD".
 */
export function DateInput({ value, onChange, min, max, lenient = false, className, disabled, onBlur, ...rest }: Props) {
  const locale = useLocale();
  const t = useTranslations("common.dateInput");
  const picker = useRef<HTMLInputElement>(null);
  // What is in the box. It follows `value` when the page changes it (a reset, another record, the picker), and keeps what is being typed otherwise.
  const [state, setState] = useState({ text: formatDay(value, locale), value });
  if (state.value !== value && parseDay(state.text, locale) !== value) setState({ text: formatDay(value, locale), value });

  const typed = state.text.trim() !== "";
  const parsed = parseDay(state.text, locale);
  const inside = (day: string) => lenient || dayInBounds(day, min, max);
  const invalid = typed && (parsed === null || !inside(parsed));

  function edit(text: string) {
    const day = parseDay(text, locale);
    const ok = day !== null && inside(day);
    setState({ text, value: ok ? day : "" });
    onChange(ok ? day : "");
  }
  function pick(day: string) {
    setState({ text: formatDay(day, locale), value: day });
    onChange(day);
  }
  function openCalendar() {
    const el = picker.current;
    if (!el || disabled) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  }

  return (
    <div className="relative w-full min-w-0">
      <Input
        {...rest}
        type="text" inputMode="numeric" autoComplete="off" disabled={disabled} placeholder={t("placeholder")} value={state.text}
        aria-invalid={invalid ? true : rest["aria-invalid"]}
        className={cn("pr-9", className)}
        onChange={(e) => edit(e.target.value)}
        onBlur={(e) => {
          // A finished day is written in full ("3/11/2026" becomes "03/11/2026").
          if (parsed !== null && !invalid) setState({ text: formatDay(parsed, locale), value: parsed });
          onBlur?.(e);
        }}
      />
      <button
        type="button" disabled={disabled} onClick={openCalendar} aria-label={t("openCalendar")}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
      >
        <CalendarDays className="size-4" aria-hidden="true" />
      </button>
      {/* The calendar of the browser: it only shows the picker, the text above is what the person sees. */}
      <input
        ref={picker} type="date" tabIndex={-1} aria-hidden="true" min={min} max={max} value={parsed ?? ""} disabled={disabled}
        onChange={(e) => { if (e.target.value) pick(e.target.value); }}
        className="pointer-events-none absolute bottom-0 right-0 size-0 opacity-0"
      />
    </div>
  );
}
