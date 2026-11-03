"use client";

import { useTranslations } from "next-intl";
import { type BookingPriceInfo } from "@workshop/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * What the tooltip of an amount of money says about a booking: its original price (before any voucher), each voucher with what it took off, the total
 * of the booking, and optionally the amount of one payment or refund of it (`part`, shown when it is not the whole total, or always for a refund).
 */
export function PriceBreakdown({ price, total, money, part }: {
  price: BookingPriceInfo; total?: number; money: (n: number) => string; part?: { kind: "PAYMENT" | "REFUND"; amount: number };
}) {
  const t = useTranslations("ops.finance");
  const { subtotal, discounts } = price;
  const due = total ?? subtotal - discounts.reduce((n, d) => n + d.amount, 0);
  return (
    <div className="grid gap-1.5">
      <p className="flex justify-between gap-3"><span className="text-muted-foreground">{t("tipOriginal")}</span><span className="font-medium tabular-nums">{money(subtotal)}</span></p>
      {discounts.length ? (
        <div className="grid gap-0.5 border-t pt-1.5">
          <p className="text-muted-foreground">{t("vouchers")}</p>
          {discounts.map((d) => (
            <p key={d.code} className="flex justify-between gap-3"><span className="font-mono">{d.code}</span><span className="tabular-nums">−{money(d.amount)}</span></p>
          ))}
        </div>
      ) : <p className="border-t pt-1.5 text-muted-foreground">{t("noVoucher")}</p>}
      <p className="flex justify-between gap-3 border-t pt-1.5"><span className="text-muted-foreground">{t("tipTotal")}</span><span className="font-medium tabular-nums">{money(due)}</span></p>
      {part && (part.kind === "REFUND" || part.amount !== due) ? (
        <p className="flex justify-between gap-3"><span className="text-muted-foreground">{t(part.kind === "PAYMENT" ? "tipPayment" : "tipRefund")}</span><span className="tabular-nums">{money(part.amount)}</span></p>
      ) : null}
    </div>
  );
}

/** An amount of money that opens the price breakdown of its booking on hover and on keyboard focus (needs a TooltipProvider around the table). */
export function PriceTip({ text, price, total, money, part, testId }: {
  text: string; price: BookingPriceInfo; total?: number; money: (n: number) => string; part?: { kind: "PAYMENT" | "REFUND"; amount: number }; testId: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger data-testid={testId} className="cursor-help rounded underline decoration-dotted decoration-muted-foreground underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        {text}
      </TooltipTrigger>
      <TooltipContent side="left" className="w-64" data-testid={`${testId}-tip`}>
        <PriceBreakdown price={price} total={total} money={money} part={part} />
      </TooltipContent>
    </Tooltip>
  );
}
