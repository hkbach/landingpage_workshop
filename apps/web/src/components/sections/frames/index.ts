import type { ComponentType } from "react";
import type { LayoutKey } from "@/lib/types";
import { AppStyleFrame } from "./AppStyleFrame";
import { BentoFrame } from "./BentoFrame";
import { BookingRailFrame } from "./BookingRailFrame";
import { CinematicFrame } from "./CinematicFrame";
import { ClassicFrame } from "./ClassicFrame";
import { FloatingCardsFrame } from "./FloatingCardsFrame";
import { JourneyFrame } from "./JourneyFrame";
import { MagazineFrame } from "./MagazineFrame";
import { QuickLinksFrame } from "./QuickLinksFrame";
import { SidebarFrame } from "./SidebarFrame";
import type { FrameProps } from "./kit";

/** One frame (page structure) per layout key. */
export const FRAMES: Record<LayoutKey, ComponentType<FrameProps>> = {
  classic: ClassicFrame,
  quicklinks: QuickLinksFrame,
  sidebar: SidebarFrame,
  bento: BentoFrame,
  bookingrail: BookingRailFrame,
  magazine: MagazineFrame,
  cinematic: CinematicFrame,
  floatingcards: FloatingCardsFrame,
  journey: JourneyFrame,
  appstyle: AppStyleFrame,
};
