import { Body, Controller, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { type OrgContext, CurrentOrg, TenantGuard } from "../auth/auth.guards";
import { ZodPipe } from "../common/zod.pipe";
import { assertShopWritable } from "../tenant/shop-writable";
import { IMAGE_TYPES, MEDIA_PURPOSES, MediaService, type MediaPurpose } from "./media.service";

const presignBody = z.object({
  purpose: z.enum(MEDIA_PURPOSES, { error: "invalid" }),
  contentType: z.enum(Object.keys(IMAGE_TYPES) as [keyof typeof IMAGE_TYPES, ...(keyof typeof IMAGE_TYPES)[]], { error: "unsupportedType" }),
  size: z.number({ error: "invalid" }),
});

/** `POST /api/v1/media/presign`: the URL the browser uploads one image of the shop to (FR-MEDIA-01). */
@Controller("media")
@UseGuards(TenantGuard)
export class MediaController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}

  @Post("presign")
  @HttpCode(200)
  presign(@CurrentOrg() org: OrgContext, @Body(new ZodPipe(presignBody)) body: { purpose: MediaPurpose; contentType: keyof typeof IMAGE_TYPES; size: number }) {
    assertShopWritable(org);
    return this.media.presign(org.id, body);
  }
}
