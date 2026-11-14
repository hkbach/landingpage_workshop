import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { Client, PublicRoute } from "../auth/auth.guards";
import type { ClientContext } from "../auth/auth.service";
import { UuidPipe } from "../common/uuid.pipe";
import { ZodPipe } from "../common/zod.pipe";
import { availabilityQuery, bookingCreateSchema, cancelSchema, confirmSchema, idempotencyKey, lookupSchema, otpRequestSchema, type BookingCreateInput } from "./booking.schemas";
import { PublicBookingsService } from "./public-bookings.service";

/** `/api/v1/public/*`: the landing page of a shop, with no account. Every endpoint is answered for an ACTIVE shop only; anything else is the same 404. */
@Controller("public")
@PublicRoute()
export class PublicController {
  constructor(@Inject(PublicBookingsService) private readonly service: PublicBookingsService) {}

  @Get("workshops/featured")
  featured(@Query("limit") limit?: string) {
    return this.service.featured(Math.min(Math.max(Number.parseInt(limit ?? "10", 10) || 10, 1), 30));
  }

  @Get("sites/:slug")
  site(@Param("slug") slug: string) {
    return this.service.site(slug);
  }

  @Get("sites/:slug/workshops/:id/availability")
  availability(@Param("slug") slug: string, @Param("id", new UuidPipe()) id: string, @Query(new ZodPipe(availabilityQuery)) q: { from?: string | undefined; to?: string | undefined }) {
    return this.service.availability(slug, id, q);
  }

  @Post("sites/:slug/booking-otp")
  @HttpCode(202)
  async otp(@Param("slug") slug: string, @Body(new ZodPipe(otpRequestSchema)) body: { email: string; turnstileToken?: string | undefined; locale?: string | undefined }, @Client() client: ClientContext) {
    await this.service.requestOtp(slug, body.email, body.turnstileToken, client, new Date(), body.locale);
    return { status: "ACCEPTED" };
  }

  /** 201 with the booking; 200 with the same booking when the `Idempotency-Key` was used before. */
  @Post("sites/:slug/bookings")
  async create(
    @Param("slug") slug: string, @Headers("idempotency-key") key: string | undefined, @Body(new ZodPipe(bookingCreateSchema)) body: BookingCreateInput,
    @Client() client: ClientContext, @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const parsed = new ZodPipe(idempotencyKey).transform(key ?? "");
    const { booking, replay } = await this.service.createBooking(slug, body, parsed, client);
    void reply.status(replay ? 200 : 201);
    return booking;
  }

  @Post("bookings/confirm")
  @HttpCode(200)
  confirm(@Body(new ZodPipe(confirmSchema)) body: { token: string }, @Client() client: ClientContext) {
    return this.service.confirm(body.token, client);
  }

  @Post("sites/:slug/bookings/lookup")
  @HttpCode(200)
  lookup(@Param("slug") slug: string, @Body(new ZodPipe(lookupSchema)) body: { code: string; email: string }, @Client() client: ClientContext) {
    return this.service.lookup(slug, body.code, body.email, client);
  }

  @Post("sites/:slug/bookings/cancel")
  @HttpCode(200)
  cancel(@Param("slug") slug: string, @Body(new ZodPipe(cancelSchema)) body: { code: string; email: string; reason?: string | undefined }, @Client() client: ClientContext) {
    return this.service.cancel(slug, body, client);
  }
}
