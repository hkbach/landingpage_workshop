"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WorkshopForm, type ShopForCatalog } from "./workshop-form";

/**
 * "New workshop" as a popup over the workshop list. The workshop is saved as a draft (there is no visibility to choose): it is switched on with
 * Activate in the list. Mock only, like the form: nothing is persisted.
 */
export function NewWorkshopDialog({ shop }: { shop: ShopForCatalog }) {
  const t = useTranslations("catalog");
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState(false);
  return (
    <>
      <Button onClick={() => { setCreated(false); setOpen(true); }} data-testid="new-workshop-button">
        <Plus aria-hidden="true" />{t("list.new")}
      </Button>
      {created ? <p role="status" data-testid="workshop-created" className="basis-full text-sm font-medium text-emerald-800">{t(shop.viaApi ? "list.createdReal" : "list.createdSim")}</p> : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("list.new")}</DialogTitle>
            <DialogDescription>{t("list.newHint")}</DialogDescription>
          </DialogHeader>
          {/* The form is mounted only while the popup is open, so it starts empty every time. */}
          {open ? <WorkshopForm shop={shop} onCancel={() => setOpen(false)} onSaved={() => { setOpen(false); setCreated(true); }} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
