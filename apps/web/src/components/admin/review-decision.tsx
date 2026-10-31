"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReasonDialog } from "./reason-dialog";

/** Approve / Reject buttons with confirmation dialogs. Reject requires a reason. */
export function ReviewDecision({
  shopName, onApprove, onReject, size = "default",
}: {
  shopName: string;
  onApprove: () => void;
  onReject: (reason: string) => void;
  size?: "default" | "sm";
}) {
  const t = useTranslations("admin.reviews");
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);

  return (
    <>
      <Button size={size} onClick={() => setDialog("approve")}>
        <Check aria-hidden /> {t("approve")}
        <span className="sr-only">: {shopName}</span>
      </Button>
      <Button size={size} variant="destructive" onClick={() => setDialog("reject")}>
        <X aria-hidden /> {t("reject")}
        <span className="sr-only">: {shopName}</span>
      </Button>

      <ReasonDialog
        open={dialog === "approve"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t("approveTitle", { name: shopName })}
        description={t("approveBody")}
        confirmLabel={t("approveConfirm")}
        reason="none"
        onConfirm={() => {
          setDialog(null);
          onApprove();
        }}
      />
      <ReasonDialog
        open={dialog === "reject"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t("rejectTitle", { name: shopName })}
        description={t("rejectBody")}
        confirmLabel={t("rejectConfirm")}
        reason="required"
        destructive
        onConfirm={(reason) => {
          setDialog(null);
          onReject(reason);
        }}
      />
    </>
  );
}
