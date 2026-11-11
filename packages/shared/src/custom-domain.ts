// The own domain of a shop (shop.example.com), used for its landing page instead of {slug}.{PLATFORM_DOMAIN}. What a shop owner types is cleaned and checked here, the same on the
// server and in the form. Pure functions, so they can be tested.

export type CustomDomainError =
  /** Not a host name: spaces, a port, odd characters, one label, a bad ending. */
  | "INVALID"
  /** The domain of the platform itself or one of its subdomains: that address already belongs to the platform. */
  | "PLATFORM";

export type CustomDomainCheck = { ok: true; domain: string } | { ok: false; error: CustomDomainError };

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * The host name a shop owner typed, cleaned: spaces trimmed, lower case, `https://`, a path, a query, a port and a trailing dot taken away (so a pasted address works).
 * An empty value is allowed and means "no own domain" (`domain: ""`). Rejected: an IP address, `localhost`, a single label, a label that is longer than 63 characters or starts / ends
 * with `-`, a name longer than 253 characters, a top level that is not letters (or punycode `xn--`), and the platform domain with its subdomains.
 * An international name has to be typed in its punycode form (`xn--...`): it is converted when it is a Unicode name that the URL parser can convert.
 */
export function checkCustomDomain(input: string, platformDomain: string): CustomDomainCheck {
  let value = input.trim().toLowerCase();
  if (value === "") return { ok: true, domain: "" };
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d{1,5}$/, "").replace(/\.$/, "");
  if (value === "" || /[\s@:]/.test(value)) return { ok: false, error: "INVALID" };
  let host = value;
  if (/[^\x00-\x7f]/.test(value)) {
    try {
      host = new URL(`http://${value}`).hostname; // Unicode names become punycode
    } catch {
      return { ok: false, error: "INVALID" };
    }
  }
  const labels = host.split(".");
  if (host.length > 253 || labels.length < 2) return { ok: false, error: "INVALID" };
  if (!labels.every((l) => LABEL.test(l))) return { ok: false, error: "INVALID" };
  const tld = labels[labels.length - 1]!;
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld)) return { ok: false, error: "INVALID" }; // also rules out IP addresses (the top level of 10.0.0.1 is "1")
  const platform = platformDomain.trim().toLowerCase();
  if (platform && (host === platform || host.endsWith(`.${platform}`))) return { ok: false, error: "PLATFORM" };
  return { ok: true, domain: host };
}
