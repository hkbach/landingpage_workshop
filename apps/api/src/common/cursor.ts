import { BadRequestException } from "@nestjs/common";

/** A cursor is a small JSON object in base64url: the sort keys of the last row the client saw. A cursor that does not decode is a 400, never a guess. */
export function encodeCursor(value: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeCursor<T extends Record<string, string | number>>(cursor: string, keys: readonly (keyof T & string)[]): T {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
    for (const k of keys) if (typeof value[k] !== "string" && typeof value[k] !== "number") throw new Error("bad cursor");
    return value as T;
  } catch {
    throw new BadRequestException({ code: "BAD_CURSOR", message: "The cursor is not valid." });
  }
}
