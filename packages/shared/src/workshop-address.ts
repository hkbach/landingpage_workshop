// Where a workshop takes place. The shop owner can give an address for each workshop (a second studio, a kitchen, a farm); a workshop with none is held at the address of the
// shop. Guests always see the address that applies (`workshopAddress`).

export const WORKSHOP_ADDRESS_MAX = 300;
/** The note that goes with the address (the floor, the entrance, where to park...): a few lines. */
export const WORKSHOP_ADDRESS_NOTE_MAX = 500;

/** The address of a workshop, as the shop owner wrote it (trimmed): empty when the workshop is held at the address of the shop. */
export const ownAddress = (workshop: { address?: string }): string => (workshop.address ?? "").trim();

/** The note the shop owner wrote about the address (trimmed; empty when there is none). It belongs to the workshop and is shown with the address that applies, whichever it is. */
export const ownAddressNote = (workshop: { addressNote?: string }): string => (workshop.addressNote ?? "").trim();

/** The address a guest sees for a workshop: its own, or the one of the shop. */
export const workshopAddress = (workshop: { address?: string }, shopAddress: string): string => ownAddress(workshop) || shopAddress.trim();

/** A link that opens an address in Google Maps (only google.com/maps links are allowed on the sites). Spaces and line breaks are squeezed. */
export const mapsSearchUrl = (address: string): string =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.replace(/\s+/g, " ").trim())}`;

/**
 * The link of the directions to a workshop: the map link of the shop when the workshop is held at the shop's address (the shop owner pasted that link), a search of the
 * address when the workshop has an address of its own. Nothing when there is no address to find.
 */
export function workshopDirectionsUrl(workshop: { address?: string }, shop: { address: string; mapsUrl?: string }): string | undefined {
  const own = ownAddress(workshop);
  if (own && own.replace(/\s+/g, " ") !== shop.address.replace(/\s+/g, " ").trim()) return mapsSearchUrl(own);
  return shop.mapsUrl || (shop.address.trim() ? mapsSearchUrl(shop.address) : undefined);
}
