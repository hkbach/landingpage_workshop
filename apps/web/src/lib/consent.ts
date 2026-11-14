// Agreeing to the Terms of Service and the Privacy Policy (D17), from the browser.

type Status = { items: Array<{ kind: "terms" | "privacy"; published: unknown; mustAccept: boolean }>; mustAcceptAny: boolean };

/**
 * Records that the logged-in person agrees to the texts that are published (a text that is not published cannot be agreed to: the server refuses it). `onlyPending`: only the texts the person
 * has not agreed to (or must agree to again). Returns whether the server recorded it (or there was nothing to record).
 */
export async function recordConsent(locale: string, onlyPending: boolean): Promise<boolean> {
  try {
    const res = await fetch(`/api/v1/legal/consent?locale=${encodeURIComponent(locale)}`, { cache: "no-store" });
    if (!res.ok) return false;
    const status = (await res.json()) as Status;
    const kinds = status.items.filter((i) => i.published !== null && (!onlyPending || i.mustAccept)).map((i) => i.kind);
    if (kinds.length === 0) return true;
    const posted = await fetch("/api/v1/legal/consent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kinds, locale }) });
    return posted.ok;
  } catch {
    return false;
  }
}
