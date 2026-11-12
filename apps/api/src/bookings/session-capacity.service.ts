import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import type { Executor } from "../db/db.module";
import { workshopSessions } from "../db/schema";

export type SessionRow = typeof workshopSessions.$inferSelect;

export type ReserveRefusal = "NOT_FOUND" | "NOT_BOOKABLE" | "BOOKING_CLOSED" | "SESSION_FULL";

export interface Reserved { session: SessionRow; /** The number of this booking in its session (1, 2, 3...): the digits of the booking code. */ bookingNumber: number }

const refuse = (code: ReserveRefusal, message: string, details: Record<string, unknown> = {}): ConflictException | NotFoundException =>
  code === "NOT_FOUND" ? new NotFoundException({ code, message }) : new ConflictException({ code, message, details });

/**
 * The ONLY place that changes `reserved_count` (CLAUDE.md, REQUIREMENTS 7.1). Every change takes the row lock of the session first (`SELECT ... FOR UPDATE`), checks the rules while it holds
 * the lock, and writes the new count in the same transaction as the booking: two requests for the last seat are served one after the other, and the second one is told the session is full.
 * The CHECK (reserved_count BETWEEN 0 AND capacity) of the table is the last line of defence.
 */
@Injectable()
export class SessionCapacityService {
  /**
   * Takes `quantity` seats and a booking number. `online` bookings need a RUNNING session whose cut-off has not passed; a booking made by the shop (a walk-in, a phone call) may also be
   * made for a session that has started, as long as it is not closed and seats remain.
   */
  async reserve(tx: Executor, input: { organizationId: string; sessionId: string; quantity: number; online: boolean; now?: Date }): Promise<Reserved> {
    const now = input.now ?? new Date();
    const [session] = await tx.select().from(workshopSessions).where(and(eq(workshopSessions.organizationId, input.organizationId), eq(workshopSessions.id, input.sessionId))).limit(1).for("update");
    if (!session) throw refuse("NOT_FOUND", "Session not found.");
    if (input.online) {
      if (session.status !== "RUNNING") throw refuse("NOT_BOOKABLE", "This session cannot be booked.");
      if (session.startsAt.getTime() - session.bookingCutoffMinutes * 60_000 <= now.getTime()) throw refuse("BOOKING_CLOSED", "Online booking for this session is closed.", { cutoffMinutes: session.bookingCutoffMinutes });
    } else if (session.status === "CLOSED" || session.status === "COMPLETED" || session.endsAt.getTime() <= now.getTime()) {
      throw refuse("NOT_BOOKABLE", "This session cannot be booked.");
    }
    const remaining = session.capacity - session.reservedCount;
    if (input.quantity > remaining) throw refuse("SESSION_FULL", "There are not enough seats left in this session.", { remaining });
    const [row] = await tx
      .update(workshopSessions)
      .set({ reservedCount: sql`${workshopSessions.reservedCount} + ${input.quantity}`, bookingSeq: sql`${workshopSessions.bookingSeq} + 1`, updatedAt: now })
      .where(and(eq(workshopSessions.organizationId, input.organizationId), eq(workshopSessions.id, input.sessionId)))
      .returning();
    if (!row) throw refuse("NOT_FOUND", "Session not found.");
    return { session: row, bookingNumber: row.bookingSeq };
  }

  /** Gives seats back (a booking was cancelled). The count never goes below zero. */
  async release(tx: Executor, input: { organizationId: string; sessionId: string; quantity: number; now?: Date }): Promise<void> {
    const [session] = await tx.select({ reserved: workshopSessions.reservedCount }).from(workshopSessions).where(and(eq(workshopSessions.organizationId, input.organizationId), eq(workshopSessions.id, input.sessionId))).limit(1).for("update");
    if (!session) throw refuse("NOT_FOUND", "Session not found.");
    await tx.update(workshopSessions)
      .set({ reservedCount: sql`GREATEST(${workshopSessions.reservedCount} - ${input.quantity}, 0)`, updatedAt: input.now ?? new Date() })
      .where(and(eq(workshopSessions.organizationId, input.organizationId), eq(workshopSessions.id, input.sessionId)));
  }

  /**
   * Moves seats from one session to another (re-scheduling a booking): both rows are locked, always in the same order (by id), so two moves in opposite directions cannot wait for each
   * other. The booking keeps its number in the new session by taking the next one there.
   */
  async move(tx: Executor, input: { organizationId: string; fromSessionId: string; toSessionId: string; quantity: number; now?: Date }): Promise<Reserved> {
    const ids = [input.fromSessionId, input.toSessionId].sort();
    for (const id of ids) await tx.select({ id: workshopSessions.id }).from(workshopSessions).where(and(eq(workshopSessions.organizationId, input.organizationId), eq(workshopSessions.id, id))).limit(1).for("update");
    const reserved = await this.reserve(tx, { organizationId: input.organizationId, sessionId: input.toSessionId, quantity: input.quantity, online: false, ...(input.now ? { now: input.now } : {}) });
    await this.release(tx, { organizationId: input.organizationId, sessionId: input.fromSessionId, quantity: input.quantity, ...(input.now ? { now: input.now } : {}) });
    return reserved;
  }
}
