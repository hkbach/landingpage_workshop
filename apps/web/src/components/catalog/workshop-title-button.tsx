"use client";

import { useState } from "react";
import { WorkshopEditDialog, type WorkshopEditData } from "./workshop-edit-dialog";

/** The title of a workshop in the list: it opens the workshop in a popup (details and schedule). */
export function WorkshopTitleButton({ data, title }: { data: WorkshopEditData; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid="workshop-title" onClick={() => setOpen(true)} className="text-left font-medium underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">
        {title}
      </button>
      <WorkshopEditDialog data={data} open={open} onOpenChange={setOpen} />
    </>
  );
}
