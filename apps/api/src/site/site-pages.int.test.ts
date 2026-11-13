import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, cookieOf, emailFor, signupBody, startApp, unique, type TestApp } from "../test/helpers";

// The landing pages of a shop on a real PostgreSQL: structure checks, autosave that never touches the live page, publish with the checklist of a first publish, one live page, versions, isolation.
const d = describe.skipIf(!TEST_DATABASE_URL);

interface Shop { cookie: string; orgId: string; slug: string }
const sec = (type: string, props: Record<string, unknown> = {}, id = unique("s")) => ({ id, type, enabled: true, props });
const page = (over: Record<string, unknown> = {}, middle: unknown[] = [sec("about", { heading: { en: "About" } })]) => ({
  schemaVersion: 1,
  sections: [sec("hero", { title: { en: "Welcome" } }), ...middle, sec("footer", { text: { en: "Bye" } })],
  seo: { title: { en: "Shop" }, description: { en: "A shop" } },
  ...over,
});

d("landing pages", () => {
  let t: TestApp;
  let a: Shop;
  let b: Shop;

  const put = (url: string, body: unknown, cookie: string) => t.app.inject({ method: "PUT", url: `/api/v1${url}`, remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie }, payload: body as object });
  const del = (url: string, cookie: string) => t.app.inject({ method: "DELETE", url: `/api/v1${url}`, remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie } });
  const newPage = async (shop: Shop, name = `Page ${unique("p")}`) => (await t.post("/site/pages", { name }, { cookie: shop.cookie })).json();

  async function makeShop(label: string, ready = false): Promise<Shop> {
    const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", emailFor(label), `Shop ${unique(label)}`));
    const cookie = cookieOf(res);
    const { id: orgId, slug } = res.json().organization as { id: string; slug: string };
    if (ready) {
      await t.pool.query("update organizations set contact_phone = '+84 90 000 0000' where id = $1", [orgId]);
      const w = await t.post("/workshops", { title: { en: `W ${unique("w")}` }, durationMinutes: 60, priceAmount: 100_000, defaultCapacity: 5, maxPerBooking: 4, categories: ["COOKING"] }, { cookie });
      await t.post(`/workshops/${w.json().id}/status`, { status: "ACTIVE" }, { cookie });
      await t.pool.query(
        `insert into workshop_sessions (organization_id, workshop_id, starts_at, origin_starts_at, ends_at, capacity, status, code)
         select $1, $2, s, s, s + interval '1 hour', 5, 'RUNNING', 'SES-0001' from (select now() + interval '3 days' as s) x`, [orgId, w.json().id]);
    }
    return { cookie, orgId, slug };
  }

  beforeAll(async () => {
    t = await startApp();
    a = await makeShop("sitea");
    b = await makeShop("siteb");
  });
  afterAll(async () => { await t.close(); });

  it("creates at most two pages (even when asked at the same time) and trims and bounds the name", async () => {
    const shop = await makeShop("sitelimit");
    expect((await t.post("/site/pages", { name: "   " }, { cookie: shop.cookie })).statusCode).toBe(422);
    expect((await t.post("/site/pages", { name: "x".repeat(61) }, { cookie: shop.cookie })).json().error.details.fields).toEqual({ name: "tooLong" });
    const results = await Promise.all([t.post("/site/pages", { name: "  Home  " }, { cookie: shop.cookie }), t.post("/site/pages", { name: "Autumn" }, { cookie: shop.cookie }), t.post("/site/pages", { name: "Third" }, { cookie: shop.cookie })]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 201, 409]);
    expect(results.find((r) => r.statusCode === 409)!.json().error).toMatchObject({ code: "LIMIT", details: { max: 2 } });
    const list = (await t.get("/site/pages", { cookie: shop.cookie })).json();
    expect(list.items).toHaveLength(2);
    expect(list.items.map((p: { name: string }) => p.name)).toContain("Home"); // trimmed
    expect(list.items[0]).toMatchObject({ isLive: false, version: 0, hasDraft: false, hasUnpublishedChanges: false });
  });

  it("saves a draft without touching the live page, and opens with the draft first, then the published page", async () => {
    const shop = await makeShop("sitedraft", true);
    const p = await newPage(shop);
    expect((await t.get(`/site/pages/${p.id}`, { cookie: shop.cookie })).json()).toMatchObject({ content: null, source: "NONE" });
    const saved = await put(`/site/pages/${p.id}/draft`, { content: page(), theme: { primary: "#112233" }, templateKey: "magazine" }, shop.cookie);
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ hasDraft: true, isLive: false, hasUnpublishedChanges: true, templateKey: "magazine" });
    expect((await t.get(`/site/pages/${p.id}`, { cookie: shop.cookie })).json()).toMatchObject({ source: "DRAFT", theme: { primary: "#112233" } });

    const published = (await t.post(`/site/pages/${p.id}/publish`, {}, { cookie: shop.cookie })).json();
    expect(published).toMatchObject({ isLive: true, version: 1, hasUnpublishedChanges: false, shopStatus: "ACTIVE", firstPublish: true });

    // a later draft is only a draft: the public page keeps showing what was published
    const changed = page({}, [sec("about", { heading: { en: "Changed" } })]);
    await put(`/site/pages/${p.id}/draft`, { content: changed }, shop.cookie);
    const live = (await t.app.inject({ method: "GET", url: `/api/v1/public/sites/${shop.slug}` })).json();
    expect(live.page).toMatchObject({ version: 1, templateKey: "magazine" });
    expect(live.page.content.sections[1].props.heading.en).toBe("About");
    expect((await t.get(`/site/pages/${p.id}`, { cookie: shop.cookie })).json()).toMatchObject({ source: "DRAFT", hasUnpublishedChanges: true });
  });

  it("refuses a page that is not text or not in order, with the codes of the editor: hero first, footer last, sizes, forbidden keys, colours", async () => {
    const shop = await makeShop("sitebad");
    const p = await newPage(shop);
    const save = async (content: unknown, theme?: unknown) => put(`/site/pages/${p.id}/draft`, { content, ...(theme ? { theme } : {}) }, shop.cookie);
    const fields = async (content: unknown, theme?: unknown) => Object.entries((await save(content, theme)).json().error?.details?.fields ?? {}) as [string, string][];
    expect(await fields(page({ sections: [sec("about"), sec("footer")] }))).toContainEqual(["content.sections.0", "heroFirst"]);
    expect(await fields(page({ sections: [sec("hero"), sec("about")] }))).toContainEqual(["content.sections.1", "footerLast"]);
    expect(await fields(page({ sections: [sec("hero"), sec("hero"), sec("footer")] }))).toContainEqual(["content.sections", "heroOnce"]);
    expect((await fields(page({ sections: [sec("hero", {}, "same"), sec("about", {}, "same"), sec("footer")] }))).map(([, c]) => c)).toContain("duplicateId");
    expect((await fields(page({ sections: [sec("hero"), sec("carousel"), sec("footer")] }))).length).toBeGreaterThan(0); // an unknown section type
    expect(await fields(page({}, [sec("about", { html: "<script>alert(1)</script>" })]))).toContainEqual(["content.sections.1.props.html", "forbiddenKey"]);
    expect(await fields(page({}, [sec("about", { body: { en: "x".repeat(5001) } })]))).toContainEqual(["content.sections.1.props.body.en", "tooLong"]);
    expect(await fields(page({}, [{ ...sec("about"), style: { background: "red; position:fixed" } }]))).toContainEqual(["content.sections.1.style.background", "colorInvalid"]);
    expect(await fields(page({ sections: Array.from({ length: 41 }, (_, i) => sec(i === 0 ? "hero" : i === 40 ? "footer" : "about")) }))).toContainEqual(["content.sections", "tooMany"]);
    expect(await fields(page({ schemaVersion: 2 }))).not.toEqual([]);
    expect(await fields(page(), { primary: "blue" })).toContainEqual(["theme.primary", "colorInvalid"]);
    let deep: Record<string, unknown> = {};
    for (let i = 0; i < 9; i++) deep = { n: deep };
    expect(await fields(page({}, [sec("about", deep)]))).toEqual(expect.arrayContaining([expect.arrayContaining(["tooDeep"])]));
    expect((await put(`/site/pages/${p.id}/draft`, { content: "nope" }, shop.cookie)).statusCode).toBe(422);
    expect((await t.get(`/site/pages/${p.id}`, { cookie: shop.cookie })).json().source).toBe("NONE"); // nothing bad was saved
    const ok = await save(page({}, [sec("about", { heading: { en: "Fine", vi: "Tốt" }, imageUrl: "https://cdn.example.com/a.jpg" })]));
    expect(ok.statusCode).toBe(200);
  });

  it("a first publish needs the checklist (hero, contact details, an active workshop with a session to come) and makes the shop ACTIVE, with no review", async () => {
    const shop = await makeShop("sitefirst");
    const p = await newPage(shop);
    expect((await t.post(`/site/pages/${p.id}/publish`, {}, { cookie: shop.cookie })).json().error.code).toBe("NOTHING_TO_PUBLISH");
    await put(`/site/pages/${p.id}/draft`, { content: page() }, shop.cookie);
    const refused = await t.post(`/site/pages/${p.id}/publish`, {}, { cookie: shop.cookie });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toMatchObject({ code: "CHECKLIST", details: { missing: ["CONTACT", "WORKSHOP_WITH_SESSION"] } });
    expect((await t.pool.query("select status from organizations where id = $1", [shop.orgId])).rows[0]).toEqual({ status: "DRAFT" });
    expect((await t.app.inject({ method: "GET", url: `/api/v1/public/sites/${shop.slug}` })).statusCode).toBe(404); // not public yet

    await t.pool.query("update organizations set contact_phone = '+84 90 111 1111' where id = $1", [shop.orgId]);
    const w = (await t.post("/workshops", { title: { en: `W ${unique("w")}` }, durationMinutes: 60, priceAmount: 100_000, defaultCapacity: 5, maxPerBooking: 4, categories: ["COOKING"] }, { cookie: shop.cookie })).json().id;
    expect((await t.post(`/site/pages/${p.id}/publish`, {}, { cookie: shop.cookie })).json().error.details.missing).toEqual(["WORKSHOP_WITH_SESSION"]); // a draft workshop does not count
    await t.post(`/workshops/${w}/status`, { status: "ACTIVE" }, { cookie: shop.cookie });
    expect((await t.post(`/site/pages/${p.id}/publish`, {}, { cookie: shop.cookie })).json().error.details.missing).toEqual(["WORKSHOP_WITH_SESSION"]); // no session yet
    await t.pool.query(
      `insert into workshop_sessions (organization_id, workshop_id, starts_at, origin_starts_at, ends_at, capacity, status, code)
       select $1, $2, s, s, s + interval '1 hour', 5, 'OPEN', 'SES-0001' from (select now() + interval '2 days' as s) x`, [shop.orgId, w]);
    const done = await t.post(`/site/pages/${p.id}/publish`, {}, { cookie: shop.cookie });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ shopStatus: "ACTIVE", firstPublish: true, isLive: true });
    expect((await t.pool.query("select status from organizations where id = $1", [shop.orgId])).rows[0]).toEqual({ status: "ACTIVE" });
    expect((await t.app.inject({ method: "GET", url: `/api/v1/public/sites/${shop.slug}` })).statusCode).toBe(200); // public at once
    const log = await t.pool.query("select action from audit_logs where entity_id = $1", [p.id]);
    expect(log.rows.map((r) => r.action)).toEqual(expect.arrayContaining(["site.page_create", "shop.publish"]));
  });

  it("keeps one live page: publishing a second takes the first offline; versions are kept and a version can be put back as the draft", async () => {
    const shop = await makeShop("sitelive", true);
    const one = await newPage(shop, "One");
    const two = await newPage(shop, "Two");
    await put(`/site/pages/${one.id}/draft`, { content: page({}, [sec("about", { heading: { en: "First" } })]) }, shop.cookie);
    await t.post(`/site/pages/${one.id}/publish`, {}, { cookie: shop.cookie });
    await put(`/site/pages/${two.id}/draft`, { content: page({}, [sec("about", { heading: { en: "Second" } })]) }, shop.cookie);
    await t.post(`/site/pages/${two.id}/publish`, {}, { cookie: shop.cookie });
    const list = (await t.get("/site/pages", { cookie: shop.cookie })).json().items as { id: string; isLive: boolean }[];
    expect(list.filter((p) => p.isLive).map((p) => p.id)).toEqual([two.id]); // only one is public
    expect((await t.app.inject({ method: "GET", url: `/api/v1/public/sites/${shop.slug}` })).json().page.content.sections[1].props.heading.en).toBe("Second");

    // two more versions of page two
    await put(`/site/pages/${two.id}/draft`, { content: page({}, [sec("about", { heading: { en: "Third" } })]) }, shop.cookie);
    await t.post(`/site/pages/${two.id}/publish`, {}, { cookie: shop.cookie });
    const versions = (await t.get(`/site/pages/${two.id}/versions`, { cookie: shop.cookie })).json().items as { version: number }[];
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    const back = await t.post(`/site/pages/${two.id}/rollback/1`, {}, { cookie: shop.cookie });
    expect(back.statusCode).toBe(200);
    expect(back.json()).toMatchObject({ source: "DRAFT", hasUnpublishedChanges: true });
    expect(back.json().content.sections[1].props.heading.en).toBe("Second");
    expect((await t.app.inject({ method: "GET", url: `/api/v1/public/sites/${shop.slug}` })).json().page.content.sections[1].props.heading.en).toBe("Third"); // the live page is unchanged
    expect((await t.post(`/site/pages/${two.id}/rollback/99`, {}, { cookie: shop.cookie })).statusCode).toBe(404);

    expect((await del(`/site/pages/${two.id}`, shop.cookie)).json().error.code).toBe("PAGE_IS_LIVE"); // the page the public sees stays
    expect((await del(`/site/pages/${one.id}`, shop.cookie)).statusCode).toBe(204);
    expect((await t.get("/site/pages", { cookie: shop.cookie })).json().items).toHaveLength(1);
    // the database too: two live pages in one shop cannot exist
    await expect(t.pool.query("update site_pages set is_live = true where organization_id = $1", [shop.orgId])).resolves.toBeTruthy(); // the one that is already live
    const extra = await newPage(shop, "Extra");
    await expect(t.pool.query("update site_pages set is_live = true, published_content = '{}'::jsonb where id = $1", [extra.id])).rejects.toThrow(/site_pages_one_live_per_org/);
  });

  it("the shops are isolated and a suspended shop cannot publish or save", async () => {
    const mine = await newPage(a);
    await put(`/site/pages/${mine.id}/draft`, { content: page() }, a.cookie);
    expect((await t.get(`/site/pages/${mine.id}`, { cookie: b.cookie })).statusCode).toBe(404);
    expect((await put(`/site/pages/${mine.id}/draft`, { content: page() }, b.cookie)).statusCode).toBe(404);
    expect((await t.post(`/site/pages/${mine.id}/publish`, {}, { cookie: b.cookie })).statusCode).toBe(404);
    expect((await t.get(`/site/pages/${mine.id}/versions`, { cookie: b.cookie })).statusCode).toBe(404);
    expect((await t.post(`/site/pages/${mine.id}/rollback/1`, {}, { cookie: b.cookie })).statusCode).toBe(404);
    expect((await del(`/site/pages/${mine.id}`, b.cookie)).statusCode).toBe(404);
    expect((await t.get("/site/pages", { cookie: b.cookie })).json().items.some((p: { id: string }) => p.id === mine.id)).toBe(false);
    expect((await t.get(`/site/pages/${mine.id}`, { cookie: a.cookie })).json().source).toBe("DRAFT"); // untouched
    expect((await t.get("/site/pages")).statusCode).toBe(401);

    await t.pool.query("update organizations set status = 'SUSPENDED' where id = $1", [a.orgId]);
    try {
      expect((await t.get(`/site/pages/${mine.id}`, { cookie: a.cookie })).statusCode).toBe(200);
      expect((await put(`/site/pages/${mine.id}/draft`, { content: page() }, a.cookie)).json().error.code).toBe("SHOP_SUSPENDED");
      expect((await t.post(`/site/pages/${mine.id}/publish`, {}, { cookie: a.cookie })).statusCode).toBe(403);
      expect((await t.post("/site/pages", { name: "New" }, { cookie: a.cookie })).statusCode).toBe(403);
    } finally {
      await t.pool.query("update organizations set status = 'DRAFT' where id = $1", [a.orgId]);
    }
  });

  it("checks the props of every section type with the schemas of the editor, and keeps the variant, the Book button and the layout", async () => {
    const shop = await makeShop("siteprops");
    const p = await newPage(shop);
    const save = (middle: unknown[], over: Record<string, unknown> = {}) => put(`/site/pages/${p.id}/draft`, { content: page(over, middle) }, shop.cookie);
    const fields = async (middle: unknown[], over: Record<string, unknown> = {}) => Object.fromEntries(Object.entries((await save(middle, over)).json().error?.details?.fields ?? {}).map(([k, v]) => [k.replace("content.sections.1.", ""), v]));

    expect(await fields([sec("about", { photos: [] })])).toEqual({ "props.photos": "unknownField" }); // a field the type does not have
    expect(await fields([sec("about", { imageUrl: "http://insecure.example/a.jpg" })])).toEqual({ "props.imageUrl": "https_url" });
    expect(await fields([sec("about", { imageUrl: "data:image/png;base64,AAAA" })])).toEqual({ "props.imageUrl": "https_url" }); // an uploaded data image is never stored
    expect(await fields([sec("about", { imageUrl: "javascript:alert(1)" })])).toEqual({ "props.imageUrl": "https_url" });
    expect(await fields([sec("location", { mapsUrl: "https://evil.example/maps" })])).toEqual({ "props.mapsUrl": "maps_url" });
    expect(await fields([sec("location", { mapsUrl: "https://www.google.com/maps/place/x" })])).toEqual({});
    expect(await fields([sec("contact", { email: "not-an-email" })])).toEqual({ "props.email": "email" });
    expect(await fields([sec("contact", { socials: [{ label: "FB", url: "ftp://x.example" }] })])).toEqual({ "props.socials.0.url": "https_url" });
    expect(await fields([sec("contact", { socials: Array.from({ length: 7 }, () => ({ label: "x", url: "https://x.example" })) })])).toEqual({ "props.socials": "tooMany" });
    expect(await fields([sec("video", { videos: ["bad video!"] })])).toEqual({ "props.videos.0": "youtube_id" });
    expect(await fields([sec("video", { videos: Array.from({ length: 6 }, () => "dQw4w9WgXcQ") })])).toEqual({}); // more than 5 videos are cut to 5, like the editor does
    expect(await fields([sec("gallery", { imageUrls: Array.from({ length: 13 }, () => "https://cdn.example.com/a.jpg") })])).toEqual({ "props.imageUrls": "tooMany" });
    expect(await fields([sec("team", { members: [{ name: "x".repeat(81), role: {}, bio: {}, imageUrl: "" }] })])).toEqual({ "props.members.0.name": "tooLong" });
    expect(await fields([sec("about", { heading: { en: "x".repeat(81) } })])).toEqual({ "props.heading.en": "tooLong" });
    expect(await fields([sec("about", { heading: { xx: "unknown language" } })])).toEqual({}); // only the five languages are kept
    expect(await fields([sec("about", { heading: "plain text instead of the languages" })])).toEqual({ "props.heading": "invalid" });
    expect(await fields([sec("faq", { items: "no" })])).toEqual({ "props.items": "invalid" });

    // a variant of the type, the Book button, the layout
    expect(await fields([{ ...sec("about"), variant: "no-such-variant" }])).toEqual({ variant: "invalid" });
    expect(await fields([{ ...sec("about"), variant: "hero-split" }])).toEqual({ variant: "invalid" }); // a variant of another type
    expect((await save([sec("about")], { layout: "no-such-layout" })).json().error.details.fields["content.layout"]).toBe("invalid");
    const footer = (await put(`/site/pages/${p.id}/draft`, { content: { ...page(), sections: [sec("hero"), { ...sec("footer"), showBook: true }] } }, shop.cookie)).json();
    expect(footer.error.details.fields["content.sections.1.showBook"]).toBe("invalid"); // the footer never carries a Book button

    // what is valid is kept, including the variant, the Book button and the layout (they used to be dropped)
    const good = await save([{ ...sec("about", { heading: { en: "Fine" }, imageUrl: "/api/v1/media/workshop/0b1f2a4e-8b1c-4f6a-9d3e-0123456789ab" }), variant: "stacked", showBook: true }], { layout: "magazine" });
    expect(good.statusCode).toBe(200);
    const back = (await t.get(`/site/pages/${p.id}`, { cookie: shop.cookie })).json();
    expect(back.content.layout).toBe("magazine");
    expect(back.content.sections[1]).toMatchObject({ variant: "stacked", showBook: true, props: { heading: { en: "Fine" } } });
    expect(back.content.sections[1].props.heading.xx).toBeUndefined();

    // the old video section (one videoId) is upgraded to the list
    const video = await save([sec("video", { videoId: "dQw4w9WgXcQ", heading: { en: "Watch" } })]);
    expect(video.statusCode).toBe(200);
    expect((await t.get(`/site/pages/${p.id}`, { cookie: shop.cookie })).json().content.sections[1].props).toMatchObject({ videos: ["dQw4w9WgXcQ"] });
  });
});
