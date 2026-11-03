"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { canEditWorkshop, pickLocalized, type WorkshopStatus } from "@workshop/shared";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDisplayLocale } from "@/lib/use-shop-language";
import type { Workshop } from "@/lib/types";
import type { ScheduleRule } from "@/lib/mock/ops";
import { ScheduleRulesEditor } from "./schedule-rules-editor";
import { WorkshopForm, type ShopForCatalog } from "./workshop-form";
import { WorkshopStatusBadge } from "./workshop-status-badge";

/** What the popup of one workshop needs, read on the server by the list. */
export interface WorkshopEditData { workshop: Workshop; rules: ScheduleRule[]; bookingCount: number; shop: ShopForCatalog }

/**
 * A workshop as a popup over the list: its details (FR-WS-01) and its schedule rules (FR-SCHED-01). Only a deactivated (draft) workshop can be edited:
 * an active or archived one shows a note instead of the form, and is switched off in the list first (its schedule can still be read and changed).
 */
export function WorkshopEditDialog({ data, open, onOpenChange }: { data: WorkshopEditData; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        {/* Mounted only while the popup is open, so the form starts from the workshop every time. */}
        {open ? <EditContent data={data} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EditContent({ data: { workshop, rules, bookingCount, shop } }: { data: WorkshopEditData }) {
  const t = useTranslations("catalog");
  const displayLocale = useDisplayLocale(shop);
  const [status, setStatus] = useState<WorkshopStatus>(workshop.status);
  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2">
          {pickLocalized(workshop.title, displayLocale, shop.defaultLocale)}
          <WorkshopStatusBadge status={status} />
        </DialogTitle>
        <DialogDescription>{t("list.editHint")}</DialogDescription>
      </DialogHeader>
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">{t("detail.tabDetails")}</TabsTrigger>
          <TabsTrigger value="schedule">{t("detail.tabSchedule")}</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="pt-2">
          {canEditWorkshop(workshop.status) ? (
            <WorkshopForm workshop={workshop} shop={shop} bookingCount={bookingCount} onStatusChange={setStatus} />
          ) : (
            <p role="note" data-testid="edit-locked-note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{t("list.editLocked")}</p>
          )}
        </TabsContent>
        <TabsContent value="schedule" className="pt-2">
          <ScheduleRulesEditor workshopId={workshop.id} initialRules={rules} timezone={shop.timezone} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
