import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export interface SelectOption { value: string; label: string; disabled?: boolean }

/** Native <select> styled like <Input>: best keyboard/mobile behaviour for simple pickers. */
export function NativeSelect({
  options, className, ...props
}: { options: SelectOption[] } & Omit<ComponentProps<"select">, "children">) {
  return (
    <select
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm",
        className,
      )}
      {...props}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
      ))}
    </select>
  );
}
