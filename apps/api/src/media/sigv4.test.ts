import { describe, expect, it } from "vitest";
import { presignUrl } from "./sigv4";

describe("presignUrl", () => {
  // The example of "Authenticating Requests: Using Query Parameters" of the S3 documentation (made-up keys of the documentation, not secrets).
  it("gives the signature of the S3 documentation example", () => {
    const url = presignUrl({
      method: "GET", host: "examplebucket.s3.amazonaws.com", path: "/test.txt", accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      region: "us-east-1", expiresSeconds: 86_400, now: new Date("2013-05-24T00:00:00Z"),
    });
    expect(url).toContain("X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");
    expect(url.startsWith("https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request")).toBe(true);
  });

  it("signs the headers it is given (the content type of an upload) and encodes the path", () => {
    const url = presignUrl({
      method: "PUT", host: "a.r2.cloudflarestorage.com", path: "/bucket/shops/x y/é.png", accessKeyId: "ID", secretAccessKey: "SECRET", region: "auto", expiresSeconds: 300,
      now: new Date("2026-11-14T10:00:00Z"), signedHeaders: { "Content-Type": "image/png" },
    });
    expect(url).toContain("X-Amz-SignedHeaders=content-type%3Bhost");
    expect(url).toContain("/bucket/shops/x%20y/%C3%A9.png?");
    expect(url).toContain("X-Amz-Date=20261114T100000Z");
    // another content type gives another signature
    const other = presignUrl({ method: "PUT", host: "a.r2.cloudflarestorage.com", path: "/bucket/shops/x y/é.png", accessKeyId: "ID", secretAccessKey: "SECRET", region: "auto", expiresSeconds: 300, now: new Date("2026-11-14T10:00:00Z"), signedHeaders: { "Content-Type": "image/webp" } });
    expect(other.split("X-Amz-Signature=")[1]).not.toBe(url.split("X-Amz-Signature=")[1]);
  });
});
