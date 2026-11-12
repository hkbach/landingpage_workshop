import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { type OrgContext, Client, CurrentOrg, CurrentUser, TenantGuard } from "../auth/auth.guards";
import type { AuthContext, ClientContext } from "../auth/auth.service";
import type { Actor } from "../catalog/workshops.service";
import { UuidPipe } from "../common/uuid.pipe";
import { ZodPipe } from "../common/zod.pipe";
import { bookingListQuery, cancelBookingSchema, customerListQuery, manualBookingSchema, paymentSchema } from "./booking-ops.schemas";
import { idempotencyKey } from "./booking.schemas";
import { BookingsService, type BookingListQuery, type ManualBookingInput } from "./bookings.service";
import { CustomersService } from "./customers.service";

const actorOf = (auth: AuthContext, client: ClientContext): Actor => ({ userId: auth.user.id, ip: client.ip });

/** `/api/v1/bookings` of the shop of the session. A booking of another shop is a 404, never a 403. */
@Controller("bookings")
@UseGuards(TenantGuard)
export class BookingsController {
  constructor(@Inject(BookingsService) private readonly bookings: BookingsService) {}

  @Get()
  list(@CurrentOrg() org: OrgContext, @Query(new ZodPipe(bookingListQuery)) q: BookingListQuery) {
    return this.bookings.list(org, q);
  }

  /** 201, or 200 with the same booking when the `Idempotency-Key` was used before. */
  @Post()
  async create(
    @CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodPipe(manualBookingSchema)) body: ManualBookingInput, @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { booking, replay } = await this.bookings.createManual(org, body, new ZodPipe(idempotencyKey).transform(key ?? ""), actorOf(auth, client));
    void reply.status(replay ? 200 : 201);
    return booking;
  }

  @Get(":id")
  get(@CurrentOrg() org: OrgContext, @Param("id", new UuidPipe()) id: string) {
    return this.bookings.get(org, id);
  }

  @Post(":id/check-in")
  @HttpCode(200)
  checkIn(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string) {
    return this.bookings.act(org, id, "CHECK_IN", actorOf(auth, client));
  }

  @Post(":id/uncheck-in")
  @HttpCode(200)
  uncheckIn(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string) {
    return this.bookings.act(org, id, "UNDO_CHECK_IN", actorOf(auth, client));
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(cancelBookingSchema)) body: { reason: string }) {
    return this.bookings.act(org, id, "CANCEL", actorOf(auth, client), { reason: body.reason });
  }

  @Post(":id/payment")
  @HttpCode(200)
  payment(
    @CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string,
    @Body(new ZodPipe(paymentSchema)) body: { paid: boolean; method?: "CASH" | "CARD" | "BANK_TRANSFER" | "E_WALLET" | "OTHER" | undefined; note?: string | undefined },
  ) {
    return this.bookings.setPaid(org, id, body, actorOf(auth, client));
  }
}

@Controller("customers")
@UseGuards(TenantGuard)
export class CustomersController {
  constructor(@Inject(CustomersService) private readonly customers: CustomersService) {}

  @Get()
  list(@CurrentOrg() org: OrgContext, @Query(new ZodPipe(customerListQuery)) q: { q?: string | undefined; limit: number; cursor?: string | undefined }) {
    return this.customers.list(org, q);
  }

  @Get(":id")
  get(@CurrentOrg() org: OrgContext, @Param("id", new UuidPipe()) id: string) {
    return this.customers.get(org, id);
  }
}
