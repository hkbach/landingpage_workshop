"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { pickLocalized, type WorkshopStatus } from "@workshop/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDisplayLocale } from "@/lib/use-shop-language";
import type { Workshop } from "@/lib/types";
import type { ScheduleRule } from "@/lib/mock/ops";
import { ScheduleRulesEditor } from "./schedule-rules-editor";
import { WorkshopForm, type ShopForCatalog } from "./workshop-form";
import { WorkshopStatusBadge } from "./workshop-status-badge";

/** Workshop detail: details form (FR-WS-01) + schedule rules (FR-SCHED-01). */
export function WorkshopDetail({
  workshop, rules, shop, bookingCount,
}: { workshop: Workshop; rules: ScheduleRule[]; shop: ShopForCatalog; bookingCount: number }) {
  const t = useTranslations("catalog");
  const displayLocale = useDisplayLocale(shop);
  const [status, setStatus] = useState<WorkshopStatus>(workshop.status);
  return (
    <div className="grid gap-4">
      <Link href="/shopowner/workshops" className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("list.title")}
      </Link>
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold sm:text-2xl">{pickLocalized(workshop.title, displayLocale, shop.defaultLocale)}</h1>
        <WorkshopStatusBadge status={status} />
      </header>
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">{t("detail.tabDetails")}</TabsTrigger>
          <TabsTrigger value="schedule">{t("detail.tabSchedule")}</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="pt-2">
          <WorkshopForm workshop={workshop} shop={shop} bookingCount={bookingCount} onStatusChange={setStatus} />
        </TabsContent>
        <TabsContent value="schedule" className="pt-2">
          <ScheduleRulesEditor workshopId={workshop.id} initialRules={rules} timezone={shop.timezone} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
