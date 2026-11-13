import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { REPORT_REASONS, REPORT_STATUSES, createReportSchema, handleReportSchema } from "@workshop/shared";
import { AuthGuard, Client, CurrentUser, PlatformAdminGuard, PublicRoute } from "../auth/auth.guards";
import type { AuthContext, ClientContext } from "../auth/auth.service";
import type { Actor } from "../catalog/workshops.service";
import { UuidPipe } from "../common/uuid.pipe";
import { ZodPipe } from "../common/zod.pipe";
import { CONTACT_TOPICS, InboxService, MESSAGE_STATUSES } from "./inbox.service";
import { EmailsService } from "./emails.service";
import { PlatformService, type PlatformValues, type SupportContact } from "./platform.service";

const kindParam = z.enum(["terms", "privacy"], { error: "invalid" });
const text = (max: number) => z.string({ error: "required" }).trim().min(1, "required").max(max, "tooLong");
const contactBody = z.object({
  name: text(120), email: z.string({ error: "required" }).trim().min(1, "required").max(254, "tooLong").pipe(z.email("invalid")),
  topic: z.enum(CONTACT_TOPICS, { error: "invalid" }), message: z.string({ error: "required" }).trim().min(1, "required").min(10, "tooShort").max(2000, "tooLong"),
  website: z.string().max(200).optional(), turnstileToken: z.string().trim().max(2048).optional(),
});
const reportBody = createReportSchema.extend({ turnstileToken: z.string().trim().max(2048).optional() });
const int = z.number({ error: "required" });
const settingsBody = z.object({ resetLinkHours: int, contactPerHour: int });
const channel = z.string({ error: "invalid" }).max(100, "invalid");
const supportBody = z.object({ whatsapp: channel.default(""), phone: channel.default(""), zalo: channel.default(""), email: channel.default("") });
const legalBody = z.object({ locale: z.string({ error: "invalid" }), content: z.string({ error: "required" }).max(60_000, "tooLong") });
const messagesQuery = z.object({ q: z.string().trim().max(100).optional(), status: z.enum(MESSAGE_STATUSES).optional(), topic: z.enum(CONTACT_TOPICS).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().max(300).optional() });
const messagePatch = z.object({ status: z.enum(MESSAGE_STATUSES, { error: "invalid" }).optional(), note: z.string().trim().max(2100, "tooLong").optional() });
const replyBody = z.object({ subject: z.string().trim().max(200, "tooLong").optional(), body: z.string({ error: "required" }).trim().min(1, "required").max(10_000, "tooLong") });
const emailsQuery = z.object({ q: z.string().trim().max(100).optional(), type: z.string().trim().max(60).optional(), status: z.enum(["SENT", "FAILED", "PENDING"], { error: "invalid" }).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().max(300).optional() });
const composeBody = z.object({
  audience: z.enum(["ADDRESS", "SHOP_OWNERS", "CUSTOMERS"], { error: "invalid" }),
  address: z.string().trim().toLowerCase().max(254, "tooLong").pipe(z.email("invalid")).optional(),
  subject: z.string({ error: "required" }).trim().min(1, "required").max(200, "tooLong").refine((v) => !/[\r\n]/.test(v), "invalid"),
  body: z.string({ error: "required" }).trim().min(1, "required").max(10_000, "tooLong"),
});
const reportsQuery = z.object({ status: z.enum(REPORT_STATUSES, { error: "invalid" }).optional(), reason: z.enum(REPORT_REASONS, { error: "invalid" }).optional(), shop: z.string().trim().max(60).optional(), q: z.string().trim().max(120).optional(), sort: z.enum(["newest", "oldest"], { error: "invalid" }).optional() });

const actorOf = (auth: AuthContext, client: ClientContext): Actor => ({ userId: auth.user.id, ip: client.ip });

/** What a visitor sends to the platform and reads from it: the Contact form, the report of a site, the Terms and the Privacy. No account, no cookie. */
@Controller("public")
@PublicRoute()
export class PublicPlatformController {
  constructor(@Inject(InboxService) private readonly inbox: InboxService, @Inject(PlatformService) private readonly platform: PlatformService) {}

  @Post("contact")
  submit(@Body(new ZodPipe(contactBody)) body: z.infer<typeof contactBody>, @Client() client: ClientContext) {
    return this.inbox.submit(body, client.ip).then((r) => r);
  }

  @Post("sites/:slug/reports")
  report(@Param("slug") slug: string, @Body(new ZodPipe(reportBody)) body: z.infer<typeof reportBody>, @Client() client: ClientContext) {
    return this.inbox.report(slug, body, client.ip);
  }

  @Get("legal/:kind")
  legal(@Param("kind", new ZodPipe(kindParam)) kind: "terms" | "privacy", @Query("locale") locale = "en") {
    return this.platform.publicLegal(kind, locale);
  }
}

/** `GET /api/v1/support-contact`: how to reach the platform team. Only for somebody who is logged in (a shop owner or a customer): never on a public page. */
@Controller("support-contact")
@UseGuards(AuthGuard)
export class SupportContactController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get()
  get() {
    return this.platform.supportContact();
  }
}

/** The settings, the support channels, the Terms and Privacy, the support inbox and the reports of the platform administrator (FR-ADM-04, 07, 20, 21, 23). SUPER_ADMIN only. */
@Controller("admin")
@UseGuards(PlatformAdminGuard)
export class AdminPlatformController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService, @Inject(InboxService) private readonly inbox: InboxService, @Inject(EmailsService) private readonly emails: EmailsService) {}

  @Get("settings")
  settings() {
    return this.platform.settings();
  }

  @Put("settings")
  putSettings(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Body(new ZodPipe(settingsBody)) body: PlatformValues) {
    return this.platform.putSettings(body, actorOf(auth, client));
  }

  @Get("support-contact")
  supportContact() {
    return this.platform.supportContact();
  }

  @Put("support-contact")
  putSupportContact(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Body(new ZodPipe(supportBody)) body: SupportContact) {
    return this.platform.putSupportContact(body, actorOf(auth, client));
  }

  @Get("legal/:kind")
  legal(@Param("kind", new ZodPipe(kindParam)) kind: "terms" | "privacy") {
    return this.platform.legal(kind);
  }

  @Put("legal/:kind")
  putLegal(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("kind", new ZodPipe(kindParam)) kind: "terms" | "privacy", @Body(new ZodPipe(legalBody)) body: { locale: string; content: string }) {
    return this.platform.putLegal(kind, body, actorOf(auth, client));
  }

  @Get("directory/messages")
  messages(@Query(new ZodPipe(messagesQuery)) q: z.infer<typeof messagesQuery>) {
    return this.inbox.messages(q);
  }

  @Patch("messages/:id")
  patchMessage(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(messagePatch)) body: z.infer<typeof messagePatch>) {
    return this.inbox.updateMessage(id, body, actorOf(auth, client));
  }

  @Post("messages/:id/reply")
  @HttpCode(200)
  reply(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(replyBody)) body: z.infer<typeof replyBody>) {
    return this.inbox.reply(id, body, actorOf(auth, client));
  }

  @Delete("messages/:id")
  @HttpCode(204)
  async deleteMessage(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string): Promise<void> {
    await this.inbox.deleteMessage(id, actorOf(auth, client));
  }

  @Get("directory/emails")
  emailList(@Query(new ZodPipe(emailsQuery)) q: z.infer<typeof emailsQuery>) {
    return this.emails.list(q);
  }

  @Get("emails/:id")
  email(@Param("id", new UuidPipe()) id: string) {
    return this.emails.get(id);
  }

  @Post("emails")
  @HttpCode(201)
  compose(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Body(new ZodPipe(composeBody)) body: z.infer<typeof composeBody>) {
    return this.emails.compose(body, actorOf(auth, client));
  }

  @Post("emails/:id/resend")
  @HttpCode(200)
  resend(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string) {
    return this.emails.resend(id, actorOf(auth, client));
  }

  @Get("reports")
  reports(@Query(new ZodPipe(reportsQuery)) q: z.infer<typeof reportsQuery>) {
    return this.inbox.reports(q);
  }

  @Patch("reports/:id")
  decide(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(handleReportSchema)) body: z.infer<typeof handleReportSchema>) {
    return this.inbox.decide(id, body, actorOf(auth, client));
  }
}
