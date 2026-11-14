import { BadRequestException } from "@nestjs/common";
import { sql, type AnyColumn, type SQL } from "drizzle-orm";
import { decodeCursor, encodeCursor } from "./cursor";

// Paging by a KEYSET: the cursor holds the time and the id of the last row the client saw, and the next page is "the rows after that one" in the order of the list. A page costs the same whether it is the
// first or the thousandth (an OFFSET reads and throws away every row before the page), no row is skipped or shown twice when rows are added while somebody pages, and the order `(time desc, id desc)` is the
// order of an index.
//
// The time is carried as TEXT exact to the microsecond: the database keeps microseconds and a JavaScript date only milliseconds, so a cursor made from a date could not tell two rows of the same
// millisecond apart (and would skip one of them).

export interface Keyset { t: string; id: string }

const TS_FORMAT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The time of a column as text to the microsecond (select it as `ts` and give it to `writeKeyset`). */
export const tsOf = (column: AnyColumn | SQL): SQL<string> => sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export function isKeyset(t: unknown, id: unknown): boolean {
  return typeof t === "string" && TS_FORMAT.test(t) && typeof id === "string" && UUID_FORMAT.test(id);
}

/** The keyset of a cursor; none when there is no cursor. A cursor that is not one is a 400, never a guess. */
export function readKeyset(cursor: string | undefined): Keyset | undefined {
  if (!cursor) return undefined;
  const c = decodeCursor<{ t: string; id: string }>(cursor, ["t", "id"]);
  if (!isKeyset(c.t, c.id)) throw new BadRequestException({ code: "BAD_CURSOR", message: "The cursor is not valid." });
  return { t: String(c.t), id: String(c.id) };
}

export const writeKeyset = (t: string, id: string): string => encodeCursor({ t, id });

/** The cursor that goes after the page: the keyset of the last row shown, when there is one more row than the page holds. */
export function nextKeyset<T extends { ts: string; id: string }>(rows: readonly T[], limit: number): string | null {
  const last = rows.length > limit ? rows[limit - 1] : undefined;
  return last ? writeKeyset(String(last.ts), String(last.id)) : null;
}

/** "After the cursor" for a list in the order `time desc, id desc`: one row comparison, which an index on `(time desc, id desc)` serves as a range. */
export const olderThan = (time: AnyColumn | SQL, id: AnyColumn | SQL, k: Keyset): SQL => sql`(${time}, ${id}) < (${k.t}::timestamptz, ${k.id}::uuid)`;
