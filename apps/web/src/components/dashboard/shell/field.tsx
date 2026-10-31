import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** aria-describedby value for a control rendered inside <Field htmlFor={id}>. */
export function describedBy(id: string, opts: { error?: boolean; hint?: boolean }): string | undefined {
  const ids = [opts.hint ? `${id}-hint` : null, opts.error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

/** Labelled form row with optional hint and error text (error is already translated). */
export function Field({
  htmlFor, label, error, hint, className, children,
}: {
  htmlFor: string; label: ReactNode; error?: string; hint?: ReactNode; className?: string; children: ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p id={`${htmlFor}-hint`} className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p id={`${htmlFor}-error`} role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
