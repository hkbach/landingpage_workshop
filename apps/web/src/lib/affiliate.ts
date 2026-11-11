// Browser side of an affiliate link: `{shop site}/?ref=CODE&book=WORKSHOP`. The landing page keeps the code of the link the guest came through (so a booking made later in the
// visit carries it) and opens the booking of the workshop the link is for. Every read and write of the browser storage is guarded: the page works without it.
// TODO(api): the code travels in a first-party cookie set by the server, with an expiry.

const KEY = (slug: string) => `wk:ref:${slug}`;
const CODE_RE = /^[A-Za-z0-9_-]{1,40}$/;

/** The code of the link the guest came through at this shop, when there is one. */
export function readAffiliateCode(slug: string): string | null {
  try {
    const code = window.localStorage.getItem(KEY(slug));
    return code && CODE_RE.test(code) ? code : null;
  } catch {
    return null;
  }
}

/**
 * Reads `?ref=` and `?book=` of the address of the page. A valid code is kept for the shop; the workshop to book (if any) is returned. `fresh` is true the first time the
 * code is seen in this tab (so the click is counted once per visit, not at every reload).
 */
export function captureAffiliate(slug: string, search: string): { code: string | null; workshopId: string | null; fresh: boolean } {
  const sp = new URLSearchParams(search);
  const ref = sp.get("ref");
  const code = ref && CODE_RE.test(ref) ? ref : null;
  const workshopId = sp.get("book");
  let fresh = false;
  if (code) {
    try {
      window.localStorage.setItem(KEY(slug), code);
      const seen = `wk:ref-seen:${slug}:${code}`;
      fresh = !window.sessionStorage.getItem(seen);
      window.sessionStorage.setItem(seen, "1");
    } catch {
      fresh = true;
    }
  }
  return { code, workshopId: workshopId && workshopId.length <= 100 ? workshopId : null, fresh };
}

// ---- the invitation of a friend: `{shop site}/?invite=CODE` opens the registration of a customer account; the code is kept until the account is made ----
const INVITE_KEY = (slug: string) => `wk:invite:${slug}`;

/** The invite code the guest came through at this shop, when there is one. */
export function readInviteCode(slug: string): string | null {
  try {
    const code = window.localStorage.getItem(INVITE_KEY(slug));
    return code && CODE_RE.test(code) ? code : null;
  } catch {
    return null;
  }
}

/** Reads `?invite=` of the address of the page: a valid code is kept for the shop and returned (null when there is none). */
export function captureInvite(slug: string, search: string): string | null {
  const raw = new URLSearchParams(search).get("invite");
  const code = raw && CODE_RE.test(raw) ? raw : null;
  if (code) {
    try { window.localStorage.setItem(INVITE_KEY(slug), code); } catch { /* the code is only kept for the registration that follows */ }
  }
  return code;
}

/** The invitation was used (the account is made): the code is not kept any longer. */
export function clearInviteCode(slug: string): void {
  try { window.localStorage.removeItem(INVITE_KEY(slug)); } catch { /* nothing to clear */ }
}
