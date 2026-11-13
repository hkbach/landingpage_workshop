import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { PlatformAdminGuard } from "../auth/auth.guards";
import { ZodPipe } from "../common/zod.pipe";
import { DirectoryService } from "./directory.service";

const page = { limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().max(300).optional() };
const q = z.string().trim().max(100).optional();
const workshopsQuery = z.object({ q, status: z.enum(["ACTIVE", "DRAFT"]).optional(), ...page });
const sessionsQuery = z.object({ q, status: z.enum(["OPEN", "PAUSED", "RUNNING", "CLOSED", "COMPLETED"]).optional(), forGood: z.enum(["true", "false"]).optional().transform((v) => v === "true"), ...page });
const bookingsQuery = z.object({ q, from: z.string().trim().max(10).optional(), to: z.string().trim().max(10).optional(), ...page });
const plainQuery = z.object({ q, ...page });

/** `/api/v1/admin/directory/*`: the lists of every shop for the platform administrator (FR-ADM-10 to FR-ADM-14). SUPER_ADMIN only, read only. */
@Controller("admin/directory")
@UseGuards(PlatformAdminGuard)
export class DirectoryController {
  constructor(@Inject(DirectoryService) private readonly directory: DirectoryService) {}

  @Get("workshops")
  workshops(@Query(new ZodPipe(workshopsQuery)) query: z.infer<typeof workshopsQuery>) {
    return this.directory.workshops(query);
  }

  @Get("sessions")
  sessions(@Query(new ZodPipe(sessionsQuery)) query: z.infer<typeof sessionsQuery>) {
    return this.directory.sessions(query);
  }

  @Get("bookings")
  bookings(@Query(new ZodPipe(bookingsQuery)) query: z.infer<typeof bookingsQuery>) {
    return this.directory.bookings(query);
  }

  @Get("customers")
  customers(@Query(new ZodPipe(plainQuery)) query: z.infer<typeof plainQuery>) {
    return this.directory.customers(query);
  }

  @Get("landing-pages")
  landingPages(@Query(new ZodPipe(plainQuery)) query: z.infer<typeof plainQuery>) {
    return this.directory.landingPages(query);
  }
}
