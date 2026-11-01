import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

export interface SummaryRow { label: string; value: string; /** Tone of the value: negative numbers are written in red and also carry their minus sign. */ negative?: boolean }

/** One area of the shop (bookings, workshops, ...) with its two or three key numbers. The whole card links to that area. */
export function SummaryCard({ href, icon: Icon, title, rows, linkLabel }: { href: string; icon: LucideIcon; title: string; rows: SummaryRow[]; linkLabel: string }) {
  return (
    <li>
      <Link href={href} aria-label={`${title}: ${linkLabel}`} className="block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <Card className="h-full transition-colors hover:bg-muted/50">
          <CardHeader>
            <CardDescription className="flex items-center gap-2 font-medium text-foreground"><Icon className="size-4" aria-hidden />{title}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid content-start gap-1.5">
              {rows.map((r) => (
                <div key={r.label} className="flex items-baseline justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">{r.label}</dt>
                  <dd className={`text-base font-semibold tabular-nums ${r.negative ? "text-destructive" : ""}`}>{r.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </Link>
    </li>
  );
}
