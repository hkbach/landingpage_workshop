import { describe, expect, it } from "vitest";
import { mapsSearchUrl, ownAddress, WORKSHOP_ADDRESS_MAX, workshopAddress, workshopDirectionsUrl } from "./workshop-address";

const SHOP = { address: "12 Nguyen Hue, District 1", mapsUrl: "https://maps.app.goo.gl/shop" };

describe("the address of a workshop", () => {
  it("is the one the shop owner wrote, or the address of the shop when there is none", () => {
    expect(workshopAddress({ address: "  88 Pasteur, District 3 " }, SHOP.address)).toBe("88 Pasteur, District 3");
    for (const address of [undefined, "", "   "]) expect(workshopAddress({ address }, ` ${SHOP.address} `), String(address)).toBe(SHOP.address);
    expect(ownAddress({})).toBe("");
    expect(ownAddress({ address: " x " })).toBe("x");
    expect(WORKSHOP_ADDRESS_MAX).toBe(300);
  });
  it("makes a Google Maps search link that is safe to put in a page", () => {
    const url = mapsSearchUrl("88 Pasteur,\n  District 3 & more");
    expect(url).toBe("https://www.google.com/maps/search/?api=1&query=88%20Pasteur%2C%20District%203%20%26%20more");
    const u = new URL(url);
    expect(u.protocol).toBe("https:");
    expect(u.hostname).toBe("www.google.com");
    expect(u.pathname.startsWith("/maps/")).toBe(true);
  });
  it("gives the directions: the map link of the shop for the shop's address, a search for an address of its own", () => {
    expect(workshopDirectionsUrl({}, SHOP)).toBe(SHOP.mapsUrl);
    expect(workshopDirectionsUrl({ address: SHOP.address }, SHOP)).toBe(SHOP.mapsUrl); // the same address written again
    expect(workshopDirectionsUrl({ address: "  12  Nguyen Hue,\nDistrict 1 " }, SHOP)).toBe(SHOP.mapsUrl);
    expect(workshopDirectionsUrl({ address: "88 Pasteur" }, SHOP)).toBe(mapsSearchUrl("88 Pasteur"));
  });
  it("searches the address of the shop when it has no map link, and gives nothing when there is no address at all", () => {
    expect(workshopDirectionsUrl({}, { address: "12 Nguyen Hue" })).toBe(mapsSearchUrl("12 Nguyen Hue"));
    expect(workshopDirectionsUrl({}, { address: "  " })).toBeUndefined();
  });
});
