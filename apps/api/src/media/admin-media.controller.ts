import { Body, Controller, Get, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { Client, CurrentUser, PlatformAdminGuard } from "../auth/auth.guards";
import type { AuthContext, ClientContext } from "../auth/auth.service";
import { ZodPipe } from "../common/zod.pipe";
import { AdminMediaService, MAX_DELETE, MEDIA_KEY } from "./admin-media.service";

const deleteBody = z.object({
  keys: z.array(z.string().regex(MEDIA_KEY, "invalid"), { error: "required" }).min(1, "required").max(MAX_DELETE, "tooMany"),
  reason: z.string().trim().max(300, "tooLong").optional(),
});

/** `/api/v1/admin/media`: the images in the storage and which of them nothing shows any more; the platform administrator (SUPER_ADMIN) only. */
@Controller("admin/media")
@UseGuards(PlatformAdminGuard)
export class AdminMediaController {
  constructor(@Inject(AdminMediaService) private readonly media: AdminMediaService) {}

  /** Every file of the bucket with `status` `USED` or `UNUSED` (and what shows it). `truncated` is true when the bucket holds more than one listing reads. */
  @Get()
  list() {
    return this.media.list();
  }

  /** Removes up to 100 UNUSED files for good. A file that is in use again is skipped (`inUse`); the answer says what was removed, skipped and what failed. */
  @Post("delete")
  @HttpCode(200)
  remove(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Body(new ZodPipe(deleteBody)) body: { keys: string[]; reason?: string | undefined }) {
    return this.media.deleteUnused(body.keys, body.reason, { userId: auth.user.id, ip: client.ip });
  }
}
