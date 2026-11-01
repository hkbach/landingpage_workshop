"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ReasonMode = "required" | "optional" | "none";

export interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  reason: ReasonMode;
  destructive?: boolean;
  onConfirm: (reason: string) => void;
}

/** Confirmation dialog with an optional or required free-text reason. */
export function ReasonDialog({ open, onOpenChange, ...rest }: ReasonDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Inner form is mounted only while open, so its state resets on every open. */}
        <ReasonForm {...rest} />
      </DialogContent>
    </Dialog>
  );
}

function ReasonForm({
  title, description, confirmLabel, reason: mode, destructive, onConfirm,
}: Omit<ReasonDialogProps, "open" | "onOpenChange">) {
  const t = useTranslations("admin.common");
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (mode === "required" && trimmed.length === 0) {
      setError(true);
      return;
    }
    onConfirm(trimmed);
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      {mode !== "none" && (
        <div className="grid content-start gap-1.5">
          <Label htmlFor={id}>{mode === "required" ? t("reasonLabel") : t("noteLabel")}</Label>
          <Textarea
            id={id}
            value={value}
            maxLength={500}
            rows={4}
            required={mode === "required"}
            placeholder={t("reasonPlaceholder")}
            aria-invalid={error}
            aria-describedby={error ? `${id}-err` : undefined}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(false);
            }}
          />
          {error && (
            <p id={`${id}-err`} role="alert" className="text-sm text-destructive">
              {t("reasonRequired")}
            </p>
          )}
        </div>
      )}

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{t("cancel")}</DialogClose>
        <Button type="submit" variant={destructive ? "destructive" : "default"}>
          {confirmLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
