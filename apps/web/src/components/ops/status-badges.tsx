import { useTranslations } from "next-intl";
import type { BookingStatus, PaymentStatus, SessionStatus } from "@workshop/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const BOOKING: Record<BookingStatus, string> = {
  NOT_CONFIRMED: "bg-amber-100 text-amber-950",
  CONFIRMED: "bg-blue-100 text-blue-900",
  CHECKED_IN: "bg-emerald-100 text-emerald-900",
  CANCELLED: "bg-red-100 text-red-900",
};
const PAYMENT: Record<PaymentStatus, string> = {
  UNPAID: "bg-slate-100 text-slate-900",
  PAID: "bg-emerald-100 text-emerald-900",
};
const SESSION: Record<SessionStatus, string> = {
  OPEN: "bg-sky-100 text-sky-900",
  PAUSED: "bg-slate-100 text-slate-900",
  RUNNING: "bg-emerald-100 text-emerald-900",
  CLOSED: "bg-amber-100 text-amber-950",
  COMPLETED: "bg-teal-100 text-teal-900",
};

export function BookingStatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  const t = useTranslations("ops");
  return <Badge variant="outline" className={cn("border-transparent", BOOKING[status], className)}>{t(`bookingStatus.${status}`)}</Badge>;
}

export function PaymentStatusBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  const t = useTranslations("ops");
  return <Badge variant="outline" className={cn("border-transparent", PAYMENT[status], className)}>{t(`paymentStatus.${status}`)}</Badge>;
}

export function SessionStatusBadge({ status, className }: { status: SessionStatus; className?: string }) {
  const t = useTranslations("ops");
  return <Badge variant="outline" className={cn("border-transparent", SESSION[status], className)}>{t(`sessionStatus.${status}`)}</Badge>;
}
