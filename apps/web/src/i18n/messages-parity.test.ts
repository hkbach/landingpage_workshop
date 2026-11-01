import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "@workshop/shared";

// Every static text exists in all five languages (en, vi, ko, ja, zh) with the same ICU arguments. Add or change a text in all of them.
const DIR = path.join(process.cwd(), "messages");
const AREAS = readdirSync(path.join(DIR, "en")).filter((f) => f.endsWith(".json"));

type Tree = { [k: string]: string | Tree };
const flat = (t: Tree, prefix = ""): Record<string, string> =>
  Object.entries(t).reduce<Record<string, string>>((acc, [k, v]) => (typeof v === "string" ? { ...acc, [prefix + k]: v } : { ...acc, ...flat(v, `${prefix}${k}.`) }), {});
const read = (locale: string, file: string) => flat(JSON.parse(readFileSync(path.join(DIR, locale, file), "utf8")) as Tree);
const args = (s: string) => [...new Set([...s.matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]/g)].map((m) => m[1]!))].sort();

describe("messages in every language", () => {
  it("English has every area", () => expect(AREAS.length).toBeGreaterThan(0));
  for (const locale of LOCALES.filter((l) => l !== "en")) {
    describe(locale, () => {
      for (const file of AREAS) {
        it(`${file}: same keys and ICU arguments as English, none empty`, () => {
          const en = read("en", file);
          const other = read(locale, file);
          expect(Object.keys(other).sort()).toEqual(Object.keys(en).sort());
          for (const [key, text] of Object.entries(other)) {
            expect(text.trim(), key).not.toBe("");
            expect(args(text), key).toEqual(args(en[key]!));
          }
        });
      }
    });
  }
});
