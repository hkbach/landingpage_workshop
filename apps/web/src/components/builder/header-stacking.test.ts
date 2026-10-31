import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The sticky builder header must stay on top of the page content while it scrolls underneath. A bug showed the numbered
// badges of the Journey template thumbnail (z-10, drawn later in the page) painting over the header (also z-10).
const DIR = join(process.cwd(), "src/components/builder");
const read = (f: string) => readFileSync(join(DIR, f), "utf8");
const zValues = (source: string) => [...source.matchAll(/(?<![-\w:])z-(\d+)\b/g)].map((m) => Number(m[1]));

describe("stacking order of the sticky builder header", () => {
  const headerZ = Number(read("BuilderHeader.tsx").match(/sticky top-14 z-(\d+)/)?.[1]);

  it("is above page content that uses z-10 (template badges, dragged section rows)", () => {
    expect(headerZ).toBeGreaterThan(10);
  });
  it("stays below the mobile menu backdrop (z-30), the drawer (z-40) and dialogs (z-50)", () => {
    expect(headerZ).toBeLessThan(30);
  });
  it("no other builder component uses a z-index that could reach the header", () => {
    for (const f of readdirSync(DIR).filter((n) => /\.tsx?$/.test(n) && !/\.test\./.test(n) && n !== "BuilderHeader.tsx")) {
      for (const z of zValues(read(f))) expect(z, `${f} uses z-${z}`).toBeLessThan(headerZ);
    }
  });
  it("the template thumbnails keep their inner z-index local (isolate)", () => {
    const picker = read("TemplatePicker.tsx");
    expect(picker).toMatch(/aria-hidden className="isolate [^"]*overflow-hidden/);
    expect(picker).toMatch(/z-10/); // the numbered badges still rely on it inside the thumbnail
  });
});
