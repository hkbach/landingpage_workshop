import { describe, expect, it } from "vitest";
import { POST as upload } from "./media/sessions/route";
import { GET as serve } from "./media/sessions/[id]/route";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSlAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const post = (dataUrl: unknown) => upload(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dataUrl }) }));

describe("session image upload", () => {
  it("stores an image and serves it at /api/v1/media/sessions/{id}", async () => {
    const res = await post(PNG);
    expect(res.status).toBe(201);
    const { id, url } = (await res.json()) as { id: string; url: string };
    expect(url).toBe(`/api/v1/media/sessions/${id}`);
    const img = await serve(new Request("http://x"), { params: Promise.resolve({ id }) } as never);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("x-content-type-options")).toBe("nosniff");
  });
  it("refuses a file that is not a jpeg, png or webp image", async () => {
    expect((await post("data:text/html;base64,PGI+")).status).toBe(422);
    expect((await post(42)).status).toBe(422);
  });
  it("answers 404 for an unknown image", async () => {
    expect((await serve(new Request("http://x"), { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) } as never)).status).toBe(404);
  });
});
