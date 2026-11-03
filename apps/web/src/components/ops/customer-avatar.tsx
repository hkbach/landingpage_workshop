"use client";

import { useState } from "react";
import { safeImage } from "@/components/sections/safe-url";
import { cn } from "@/lib/utils";

/** The letters shown when a customer has no picture: the first letter of the first and the last word of the name ("Emma Johnson" → "EJ"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letter = (w: string) => Array.from(w)[0]!.toUpperCase();
  return words.length === 1 ? letter(words[0]!) : letter(words[0]!) + letter(words[words.length - 1]!);
}

/**
 * The avatar of a customer: the picture of their account, or their initials when they have none (a guest who only booked) or the picture cannot be loaded.
 * The name is always written next to it, so the picture itself is decorative.
 */
export function CustomerAvatar({ name, url, className }: { name: string; url?: string; className?: string }) {
  const src = safeImage(url);
  const [failed, setFailed] = useState(false);
  const shown = src && !failed ? src : null;
  return (
    <span data-testid="customer-avatar" data-kind={shown ? "image" : "initials"} className={cn("inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium text-muted-foreground", className)}>
      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shown} alt="" loading="lazy" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
}
