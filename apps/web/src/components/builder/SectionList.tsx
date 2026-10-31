"use client";

import { useTranslations } from "next-intl";
import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, Lock, Plus, Trash2, TriangleAlert } from "lucide-react";
import type { SectionType } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { canMove, isPositionLocked, moveSection, movablePosition, movableSections } from "@/components/sections/order";
import { ADDABLE_TYPES, SECTION_REGISTRY } from "@/components/sections/registry";
import type { SectionInstance } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

interface Props {
  sections: SectionInstance[];
  /** Ids of sections that fail validation or colour contrast ("Needs attention"). */
  attention: ReadonlySet<string>;
  selectedId: string;
  onSelect: (id: string) => void;
  onReorder: (sections: SectionInstance[]) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
  onAdd: (type: SectionType) => void;
}

function Row({ section, invalid, selected, canUp, canDown, onMove, onSelect, onToggle, onRemove }: {
  section: SectionInstance; invalid: boolean; selected: boolean; canUp: boolean; canDown: boolean;
  onMove: (direction: -1 | 1) => void; onSelect: () => void; onToggle: (enabled: boolean) => void; onRemove: () => void;
}) {
  const t = useTranslations("builder");
  const def = SECTION_REGISTRY[section.type];
  // fixed: the footer (cannot be hidden or removed). locked: hero and footer keep their position (first / last).
  const fixed = !def.removable;
  const locked = isPositionLocked(section.type);
  const lockedHint = section.type === "hero" ? t("sections.heroLocked") : t("sections.footerLocked");
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: section.id, disabled: locked });
  const name = t(`sectionTypes.${section.type}`);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-1 rounded-lg border bg-card p-1.5",
        selected && "border-primary ring-2 ring-primary/30",
        isDragging && "z-10 opacity-80 shadow-md",
        !section.enabled && "opacity-70",
      )}
    >
      {locked ? (
        <span className="flex size-8 items-center justify-center text-muted-foreground" title={lockedHint}>
          <Lock className="size-4" aria-hidden /><span className="sr-only">{lockedHint}</span>
        </span>
      ) : (
        <button
          type="button" ref={setActivatorNodeRef} {...attributes} {...listeners}
          aria-label={t("sections.dragHandle", { name })}
          className="flex size-8 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
      )}
      <button
        type="button" onClick={onSelect} aria-current={selected ? "true" : undefined}
        className="flex min-h-8 flex-1 items-center gap-2 rounded-md px-1.5 text-left text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="truncate">{name}</span>
        {invalid ? (
          <span className="flex items-center gap-1 text-xs font-normal text-amber-800">
            <TriangleAlert className="size-3.5" aria-hidden />{t("sections.needsAttention")}
          </span>
        ) : null}
      </button>
      {/* Up/down buttons; locked rows keep the same width so the columns line up. */}
      <div className="flex w-[3.75rem] shrink-0 items-center justify-end gap-0.5">
        {locked ? null : (
          <>
            <Button
              type="button" variant="ghost" size="icon-sm" disabled={!canUp} onClick={() => onMove(-1)}
              data-move={`${section.id}:-1`} title={t("sections.moveUp", { name })} aria-label={t("sections.moveUp", { name })}
            >
              <ArrowUp />
            </Button>
            <Button
              type="button" variant="ghost" size="icon-sm" disabled={!canDown} onClick={() => onMove(1)}
              data-move={`${section.id}:1`} title={t("sections.moveDown", { name })} aria-label={t("sections.moveDown", { name })}
            >
              <ArrowDown />
            </Button>
          </>
        )}
      </div>
      <div className="flex items-center gap-1.5 px-1" title={fixed ? t("sections.footerLocked") : t("sections.showHint")}>
        <Checkbox
          id={`en-${section.id}`} checked={section.enabled} disabled={fixed}
          onCheckedChange={(v) => onToggle(v === true)} aria-label={t("sections.enable", { name })}
        />
        {/* Visible text so the switch is understandable at a glance; the accessible name above contains it ("Show ..."). */}
        <Label htmlFor={`en-${section.id}`} aria-hidden className="cursor-pointer text-xs font-normal text-muted-foreground">
          {t("sections.show")}
        </Label>
      </div>
      {fixed ? null : (
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} title={t("sections.remove", { name })}>
          <Trash2 /><span className="sr-only">{t("sections.remove", { name })}</span>
        </Button>
      )}
    </li>
  );
}

export function SectionList({ sections, attention, selectedId, onSelect, onReorder, onToggle, onRemove, onAdd }: Props) {
  const t = useTranslations("builder");
  const [toAdd, setToAdd] = useState<SectionType | "">("");
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ id: string; direction: -1 | 1 } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // The hero is always first and the footer always last (locked positions): only the sections between them are sortable.
  const hero = sections.filter((s) => s.type === "hero");
  const footer = sections.filter((s) => s.type === "footer");
  const movable = movableSections(sections);
  const present = new Set(sections.map((s) => s.type));
  const addable = ADDABLE_TYPES.filter((ty) => !present.has(ty));
  const nameOf = (id: string | number) => {
    const s = sections.find((x) => x.id === id);
    return s ? t(`sectionTypes.${s.type}`) : "";
  };

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = movable.findIndex((s) => s.id === e.active.id);
    const to = movable.findIndex((s) => s.id === e.over!.id);
    if (from < 0 || to < 0) return;
    onReorder([...hero, ...arrayMove(movable, from, to), ...footer]);
  }

  function move(id: string, direction: -1 | 1) {
    const next = moveSection(sections, id, direction);
    const pos = movablePosition(next, id);
    pendingFocus.current = { id, direction };
    onReorder(next);
    if (pos) setAnnouncement(t("sections.moved", { name: nameOf(id), position: pos.position, total: pos.total }));
  }

  // Keep keyboard focus on the button that was used (re-ordering moves DOM nodes); at an edge fall back to the other one.
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    const root = listRef.current;
    const same = root?.querySelector<HTMLButtonElement>(`[data-move="${pending.id}:${pending.direction}"]`);
    const other = root?.querySelector<HTMLButtonElement>(`[data-move="${pending.id}:${-pending.direction}"]`);
    (same && !same.disabled ? same : other)?.focus();
  }, [sections]);

  const rowProps = (s: SectionInstance) => ({
    section: s, invalid: attention.has(s.id), selected: selectedId === s.id,
    canUp: canMove(sections, s.id, -1), canDown: canMove(sections, s.id, 1),
    onMove: (d: -1 | 1) => move(s.id, d), onSelect: () => onSelect(s.id),
  });

  return (
    <div className="space-y-3" ref={listRef}>
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
      <ul className="space-y-1.5">
        {hero.map((s) => (
          <Row key={s.id} {...rowProps(s)} onToggle={(en) => onToggle(s.id, en)} onRemove={() => onRemove(s.id)} />
        ))}
      </ul>
      <DndContext
        sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: { draggable: t("sections.dndInstructions") },
          announcements: {
            onDragStart: ({ active }) => t("sections.dndPickedUp", { name: nameOf(active.id) }),
            onDragOver: ({ active, over }) => (over ? t("sections.dndOver", { name: nameOf(active.id), over: nameOf(over.id) }) : undefined),
            onDragEnd: ({ active, over }) => (over ? t("sections.dndDropped", { name: nameOf(active.id), over: nameOf(over.id) }) : t("sections.dndDroppedNone", { name: nameOf(active.id) })),
            onDragCancel: ({ active }) => t("sections.dndCancelled", { name: nameOf(active.id) }),
          },
        }}
      >
        <SortableContext items={movable.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1.5">
            {movable.map((s) => (
              <Row key={s.id} {...rowProps(s)} onToggle={(en) => onToggle(s.id, en)} onRemove={() => onRemove(s.id)} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <ul className="space-y-1.5">
        {footer.map((s) => (
          <Row key={s.id} {...rowProps(s)} onToggle={() => {}} onRemove={() => {}} />
        ))}
      </ul>

      <div className="flex items-end gap-2 border-t pt-3">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="add-section">{t("sections.addLabel")}</Label>
          <select
            id="add-section" value={toAdd} disabled={addable.length === 0}
            onChange={(e) => setToAdd(e.target.value as SectionType | "")}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">{addable.length === 0 ? t("sections.allAdded") : t("sections.choose")}</option>
            {addable.map((ty) => <option key={ty} value={ty}>{t(`sectionTypes.${ty}`)}</option>)}
          </select>
        </div>
        <Button type="button" variant="outline" disabled={!toAdd} onClick={() => { if (toAdd) { onAdd(toAdd); setToAdd(""); } }}>
          <Plus />{t("sections.add")}
        </Button>
      </div>
    </div>
  );
}
