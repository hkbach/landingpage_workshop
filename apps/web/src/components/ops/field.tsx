import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Label + control + hint/error wiring. `children` receives the ids to put on the control. */
export function Field({
  id, label, hint, error, required, className, children,
}: {
  id: string; label: string; hint?: string; error?: string; required?: boolean; className?: string;
  children: (a: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean; "aria-required"?: boolean }) => ReactNode;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true" className="text-destructive">*</span> : null}
      </Label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, "aria-required": required || undefined })}
      {hint ? <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p id={`${id}-err`} role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
