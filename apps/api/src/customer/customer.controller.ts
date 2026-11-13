import { Body, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { GENDERS, LOCALES, SOCIAL_PLATFORMS, WORKSHOP_CATEGORIES, FAVORITE_CATEGORY_COUNT } from "@workshop/shared";
import { AuthGuard, Client, CurrentOrg, CurrentUser, PlatformAdminGuard, TenantGuard, type OrgContext } from "../auth/auth.guards";
import type { AuthContext, ClientContext } from "../auth/auth.service";
import type { Actor } from "../catalog/workshops.service";
import { UuidPipe } from "../common/uuid.pipe";
import { ZodPipe } from "../common/zod.pipe";
import { CustomerService, type ProfileInput } from "./customer.service";
import { RatingsService } from "./ratings.service";

const isRealDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T12:00:00Z`).toISOString().startsWith(d);
const isHttps = (v: string) => { try { return new URL(v).protocol === "https:"; } catch { return false; } };

// The profile is written whole. Every text is trimmed (BR-16); what is empty is dropped; the codes of the errors are the ones the form already knows.
const socials = z.object(Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, z.string().trim().max(100, "tooLong").optional()]))).partial().transform((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v)) as Record<string, string>);
const profileSchema = z.object({
  fullName: z.string({ error: "required" }).trim().min(1, "required").max(120, "tooLong"),
  phone: z.string().trim().max(40, "tooLong").optional().transform((v) => v || undefined),
  preferredLocale: z.enum(LOCALES, { error: "invalid" }),
  country: z.string({ error: "required" }).trim().toUpperCase().regex(/^[A-Z]{2}$/, "invalid"),
  birthDate: z.string({ error: "required" }).trim().refine(isRealDate, "invalid").refine((d) => d <= new Date().toISOString().slice(0, 10), "future"),
  favoriteCategories: z.array(z.enum(WORKSHOP_CATEGORIES, { error: "invalid" }), { error: "required" }).length(FAVORITE_CATEGORY_COUNT, "count").refine((c) => new Set(c).size === c.length, "count"),
  gender: z.enum(GENDERS, { error: "invalid" }).optional(),
  socials: socials.optional(),
  avatarUrl: z.string().trim().max(500, "tooLong").refine((v) => v === "" || isHttps(v), "invalid").optional().transform((v) => v || undefined),
});
const ratingSchema = z.object({ stars: z.number({ error: "starsInvalid" }).int("starsInvalid").min(1, "starsInvalid").max(5, "starsInvalid"), comment: z.string().trim().max(500, "tooLong").optional().transform((v) => v || undefined) });
const searchQuery = z.object({ q: z.string().trim().max(100).optional() });
const adminRatingsQuery = z.object({ q: z.string().trim().max(100).optional(), status: z.enum(["SHOWN", "REMOVED"]).optional(), stars: z.coerce.number().int().min(1).max(5).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().max(300).optional() });
const removeBody = z.object({ removed: z.boolean({ error: "required" }), reason: z.string().trim().max(300, "tooLong").optional() });

const actorOf = (auth: AuthContext, client: ClientContext): Actor => ({ userId: auth.user.id, ip: client.ip });

/** `/api/v1/customer/{id}/*`: the area of the customer in the session. The id of the path must be the account's own (anything else is a 404, never a peek at somebody else's account). */
@Controller("customer")
@UseGuards(AuthGuard)
export class CustomerController {
  constructor(@Inject(CustomerService) private readonly customer: CustomerService) {}

  private own(auth: AuthContext, id: string): string {
    if (id !== auth.user.id) throw new NotFoundException({ code: "NOT_FOUND", message: "Account not found." });
    return auth.user.id;
  }

  @Get(":id")
  profile(@CurrentUser() auth: AuthContext, @Param("id", new UuidPipe()) id: string) {
    return this.customer.profile(this.own(auth, id));
  }

  @Patch(":id")
  updateProfile(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(profileSchema)) body: ProfileInput) {
    return this.customer.updateProfile(this.own(auth, id), body, actorOf(auth, client));
  }

  @Get(":id/bookings")
  bookings(@CurrentUser() auth: AuthContext, @Param("id", new UuidPipe()) id: string) {
    return this.customer.bookings(this.own(auth, id));
  }

  @Post(":id/bookings/:bookingId/check-in")
  @HttpCode(200)
  checkIn(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Param("bookingId", new UuidPipe()) bookingId: string) {
    return this.customer.checkIn(this.own(auth, id), bookingId, actorOf(auth, client));
  }

  @Post(":id/bookings/:bookingId/rating")
  rate(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Param("bookingId", new UuidPipe()) bookingId: string, @Body(new ZodPipe(ratingSchema)) body: { stars: number; comment?: string | undefined }) {
    return this.customer.rate(this.own(auth, id), bookingId, body, actorOf(auth, client));
  }

  @Get(":id/workshops")
  workshops(@CurrentUser() auth: AuthContext, @Param("id", new UuidPipe()) id: string, @Query(new ZodPipe(searchQuery)) q: { q?: string | undefined }) {
    return this.customer.workshops(this.own(auth, id), q.q);
  }

  @Get(":id/favorites")
  favorites(@CurrentUser() auth: AuthContext, @Param("id", new UuidPipe()) id: string) {
    return this.customer.favorites(this.own(auth, id));
  }

  @Put(":id/favorites/:workshopId")
  @HttpCode(204)
  async addFavorite(@CurrentUser() auth: AuthContext, @Param("id", new UuidPipe()) id: string, @Param("workshopId", new UuidPipe()) workshopId: string): Promise<void> {
    await this.customer.addFavorite(this.own(auth, id), workshopId);
  }

  @Delete(":id/favorites/:workshopId")
  @HttpCode(204)
  async removeFavorite(@CurrentUser() auth: AuthContext, @Param("id", new UuidPipe()) id: string, @Param("workshopId", new UuidPipe()) workshopId: string): Promise<void> {
    await this.customer.removeFavorite(this.own(auth, id), workshopId);
  }
}

/** `GET /api/v1/ratings`: the ratings of the workshops of the shop of the session (read only). */
@Controller("ratings")
@UseGuards(TenantGuard)
export class ShopRatingsController {
  constructor(@Inject(RatingsService) private readonly ratings: RatingsService) {}

  @Get()
  list(@CurrentOrg() org: OrgContext) {
    return this.ratings.forShop(org);
  }
}

/** The ratings of every workshop for the platform administrator (FR-ADM-27). SUPER_ADMIN only. */
@Controller("admin")
@UseGuards(PlatformAdminGuard)
export class AdminRatingsController {
  constructor(@Inject(RatingsService) private readonly ratings: RatingsService) {}

  @Get("directory/ratings")
  list(@Query(new ZodPipe(adminRatingsQuery)) q: { q?: string | undefined; status?: "SHOWN" | "REMOVED" | undefined; stars?: number | undefined; limit: number; cursor?: string | undefined }) {
    return this.ratings.adminList(q);
  }

  @Post("ratings/:id")
  @HttpCode(200)
  remove(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(removeBody)) body: { removed: boolean; reason?: string | undefined }) {
    return this.ratings.setRemoved(id, body, actorOf(auth, client));
  }
}
