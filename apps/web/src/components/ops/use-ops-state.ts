"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applySessionAction, canCompleteSession, canEditSession, isSessionFinished, canReopenSession, checkCloseReason, isFutureStart, checkReschedule, closeIfEnded, isValidBookingCutoff, nextSessionCode, rescheduleCount, canCloseAgain, withNote, closeWaitsForEnd, type BookingStatus, type PaymentMethod, type RescheduleError, type SessionAction, type SessionCloseReason } from "@workshop/shared";
import type { Booking, PaymentEntry, Session } from "@/lib/types";
import {
  canTransition, computePaymentStatus, netPaid, reservedSeats, seatDelta, targetStatus,
  type BlockedReason, type BookingAction } from "@/lib/booking-state";
import { persistBookingStatus, persistPaid } from "@/lib/bookings-api";

export interface BookingEvent { status: BookingStatus; at?: string; note?: string }

export type OpResult = { ok: true } | { ok: false; reason: BlockedReason | "REASON_REQUIRED" | "NOT_FOUND" | "INVALID_AMOUNT" | "NO_CAPACITY" };

export interface PaymentInput { type: "PAYMENT" | "REFUND"; amount: number; method: PaymentMethod; note?: string }

/**
 * Client-side simulation of booking/session operations (optimistic local state; nothing is persisted).
 * The authoritative rules live in `@/lib/booking-state` and will be enforced again by the backend.
 */
export function useOpsState(init: { bookings: Booking[]; sessions: Session[]; nowIso: string; actor: string }) {
  const [bookings, setBookings] = useState<Booking[]>(init.bookings);
  const [storedSessions, setSessions] = useState<Session[]>(init.sessions);
  const [history, setHistory] = useState<Record<string, BookingEvent[]>>({});
  const [now, setNow] = useState(() => new Date(init.nowIso));
  // A session whose time is over is closed by the system (shown as Closed with a note), whatever its stored status.
  // The seats taken are counted from the bookings, so cancelling a booking frees its seats at once.
  const sessions = useMemo(
    () => storedSessions.map((x) => ({ ...closeIfEnded(x, now), reservedCount: reservedSeats(bookings, x.id) })),
    [storedSessions, bookings, now],
  );
  const counter = useRef(0);
  const nextId = (p: string) => `${p}-local-${++counter.current}`;

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const pushEvent = (bookingId: string, ev: BookingEvent) =>
    setHistory((h) => ({ ...h, [bookingId]: [...(h[bookingId] ?? []), ev] }));

  const adjustSeats = (sessionId: string, delta: number) =>
    setSessions((list) => list.map((s) => (s.id === sessionId ? { ...s, reservedCount: Math.max(0, s.reservedCount + delta) } : s)));

  const perform = useCallback(
    (bookingId: string, action: BookingAction, reason?: string): OpResult => {
      const b = bookings.find((x) => x.id === bookingId);
      const s = b && sessions.find((x) => x.id === b.sessionId);
      if (!b || !s) return { ok: false, reason: "NOT_FOUND" };
      const state = canTransition(b, s, new Date())[action];
      if (!state.allowed) return { ok: false, reason: state.reason ?? "INVALID_STATE" };
      if (state.requiresReason && !reason?.trim()) return { ok: false, reason: "REASON_REQUIRED" };
      const to = targetStatus(action, b);
      if (!to) return { ok: false, reason: "INVALID_STATE" };
      const at = new Date().toISOString();
      setBookings((list) =>
        list.map((x) => {
          if (x.id !== b.id) return x;
          // The time of a check-in is kept for tracking; an uncheck-in (or a cancel) clears it.
          const { checkedInAt: _was, statusBeforeCheckIn: _before, ...rest } = x;
          void _was; void _before;
          // A check-in remembers the status the booking had (not confirmed or confirmed): the uncheck-in goes back to it.
          const before = action === "CHECK_IN" && (b.status === "NOT_CONFIRMED" || b.status === "CONFIRMED") ? b.status : undefined;
          return { ...rest, status: to, cancelReason: action === "CANCEL" ? reason!.trim() : x.cancelReason, ...(action === "CHECK_IN" ? { checkedInAt: at } : {}), ...(before ? { statusBeforeCheckIn: before } : {}) };
        }),
      );
      adjustSeats(s.id, seatDelta(b.status, to, b.quantity));
      pushEvent(b.id, { status: to, at, note: action === "CANCEL" ? reason!.trim() : undefined });
      persistBookingStatus(b.id, to, action === "CANCEL" ? reason!.trim() : undefined, action === "CHECK_IN" ? at : undefined, action === "CHECK_IN" && (b.status === "NOT_CONFIRMED" || b.status === "CONFIRMED") ? b.status : undefined);
      return { ok: true };
    },
    [bookings, sessions],
  );

  const addPayment = useCallback(
    (bookingId: string, input: PaymentInput): OpResult => {
      const b = bookings.find((x) => x.id === bookingId);
      if (!b) return { ok: false, reason: "NOT_FOUND" };
      if (sessions.find((x) => x.id === b.sessionId)?.status === "COMPLETED") return { ok: false, reason: "INVALID_STATE" }; // a completed session no longer changes
      if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, reason: "INVALID_AMOUNT" };
      if (input.type === "REFUND" && input.amount > netPaid(b.payments)) return { ok: false, reason: "INVALID_AMOUNT" };
      const entry: PaymentEntry = {
        id: nextId("pm"), type: input.type, amount: input.amount, method: input.method,
        note: input.note?.trim() || undefined, recordedAt: new Date().toISOString(), recordedBy: init.actor,
      };
      setBookings((list) =>
        list.map((x) => {
          if (x.id !== b.id) return x;
          const payments = [...x.payments, entry]; // entries are append-only (no edit/delete)
          return { ...x, payments, paymentStatus: computePaymentStatus(x.totalAmount, payments) };
        }),
      );
      return { ok: true };
    },
    [bookings, sessions, init.actor],
  );

  /**
   * Sets a booking Paid or Unpaid after the session (the shop owner confirms the payment received at the studio). Paid records the missing
   * amount as a cash payment; Unpaid gives back what was recorded as a refund entry (entries are never edited or deleted). A free booking has nothing to pay.
   */
  const setPaid = useCallback(
    (bookingId: string, paid: boolean): OpResult => {
      const b = bookings.find((x) => x.id === bookingId);
      if (!b) return { ok: false, reason: "NOT_FOUND" };
      if (b.totalAmount <= 0) return { ok: false, reason: "INVALID_STATE" };
      const net = netPaid(b.payments);
      if (paid) {
        if (b.paymentStatus === "PAID") return { ok: true };
        const res = addPayment(bookingId, { type: "PAYMENT", amount: b.totalAmount - Math.max(0, net), method: "CASH", note: "Payment confirmed after the session" });
        if (res.ok) persistPaid(bookingId, true);
        return res;
      }
      if (b.paymentStatus === "UNPAID") return { ok: true };
      const res = addPayment(bookingId, { type: "REFUND", amount: net, method: "CASH", note: "Marked as unpaid" });
      if (res.ok) persistPaid(bookingId, false);
      return res;
    },
    [bookings, addPayment],
  );

  const reschedule = useCallback(
    (bookingId: string, targetSessionId: string): OpResult => {
      const b = bookings.find((x) => x.id === bookingId);
      const from = b && sessions.find((x) => x.id === b.sessionId);
      const to = sessions.find((x) => x.id === targetSessionId);
      if (!b || !from || !to) return { ok: false, reason: "NOT_FOUND" };
      if (!canTransition(b, from, new Date()).RESCHEDULE.allowed) return { ok: false, reason: "INVALID_STATE" };
      if (to.workshopId !== b.workshopId || isSessionFinished(to.status) || to.id === from.id) return { ok: false, reason: "INVALID_STATE" };
      if (to.capacity - to.reservedCount < b.quantity) return { ok: false, reason: "NO_CAPACITY" };
      setBookings((list) => list.map((x) => (x.id === b.id ? { ...x, sessionId: to.id, startsAt: to.startsAt, endsAt: to.endsAt } : x)));
      setSessions((list) =>
        list.map((s) =>
          s.id === from.id ? { ...s, reservedCount: s.reservedCount - b.quantity }
            : s.id === to.id ? { ...s, reservedCount: s.reservedCount + b.quantity } : s,
        ),
      );
      return { ok: true };
    },
    [bookings, sessions],
  );

  // ----- session operations (FR-SCHED-02/03) -----
  /** start / pause / close (close needs a reason). False when the action is not allowed now. */
  const sessionAction = useCallback(
    (id: string, action: SessionAction, closeReason?: { code: string; note?: string }): boolean => {
      const s = sessions.find((x) => x.id === id);
      const next = s ? applySessionAction(s, action) : null;
      if (!s || !next) return false;
      if (action === "close" && closeWaitsForEnd(s, now)) return false; // not while the session is taking place
      if (action === "close" && !canCloseAgain(s.notes)) return false; // at most 4 closes per session
      // Closing before the start needs a reason: a basic one, or OTHER with a text.
      const reason = action === "close" ? checkCloseReason(closeReason?.code ?? "", closeReason?.note ?? "") : null;
      if (reason && !reason.ok) return false;
      setSessions((list) => list.map((x) => (x.id === id ? { ...x, ...next, ...(reason?.ok ? { notes: withNote(x.notes, { type: "CLOSED", at: now.toISOString(), reason: reason.reason }) } : {}) } : x)));
      return true;
    },
    [sessions, now],
  );

  /** The owner marks a closed session that took place as Completed (it is final). False when it cannot be. */
  const completeSession = useCallback(
    (id: string): boolean => {
      const s = sessions.find((x) => x.id === id);
      if (!s || !canCompleteSession(s)) return false;
      // The displayed session (closed by the system when its time ended) becomes the stored one, so its history is kept.
      setSessions((list) => list.map((x) => (x.id === id ? { ...closeIfEnded(x, now), status: "COMPLETED" } : x)));
      return true;
    },
    [sessions, now],
  );

  /** Re-opens a session the owner closed before it started: it is Open again, and the reason of the close is forgotten. False when it cannot be. */
  const reopenSession = useCallback(
    (id: string): boolean => {
      const s = sessions.find((x) => x.id === id);
      if (!s || !canReopenSession(s, now)) return false;
      setSessions((list) => list.map((x) => {
        if (x.id !== id) return x;
        // The notes are kept: the close stays in the history, and the re-open is added to it.
        return { ...x, status: "OPEN", notes: withNote(x.notes, { type: "REOPENED", at: now.toISOString() }) };
      }));
      return true;
    },
    [sessions, now],
  );

  /**
   * Moves a paused session to a new start (the length stays) and moves its bookings with it. The reason is required (a basic one, or Other with
   * a text). Returns why it was refused, or what changed: the session before and after, and the bookings that moved.
   */
  const rescheduleSession = useCallback(
    (id: string, newStartsAt: string, reason: { code: string; note?: string }):
      { ok: true; oldStartsAt: string; startsAt: string; endsAt: string; reason: SessionCloseReason; moved: Booking[] } | { ok: false; error: RescheduleError } => {
      const s = sessions.find((x) => x.id === id);
      if (!s) return { ok: false, error: "NOT_RESCHEDULABLE" };
      const checked = checkReschedule({ ...s, reschedules: rescheduleCount(s.notes) }, newStartsAt, now, sessions.filter((x) => x.workshopId === s.workshopId && x.id !== id).map((x) => x.startsAt));
      const why = checkCloseReason(reason.code, reason.note ?? "");
      if (!checked.ok) return { ok: false, error: checked.error };
      if (!why.ok) return { ok: false, error: "NOT_RESCHEDULABLE" };
      setSessions((list) => list.map((x) => (x.id === id ? { ...x, startsAt: checked.startsAt, endsAt: checked.endsAt, notes: withNote(x.notes, { type: "RESCHEDULED", at: now.toISOString(), reason: why.reason }) } : x)));
      const moved = bookings.filter((b) => b.sessionId === id && b.status === "CONFIRMED");
      setBookings((list) => list.map((b) => (b.sessionId === id ? { ...b, startsAt: checked.startsAt, endsAt: checked.endsAt } : b)));
      return { ok: true, oldStartsAt: s.startsAt, startsAt: checked.startsAt, endsAt: checked.endsAt, reason: why.reason, moved };
    },
    [sessions, bookings, now],
  );

  /**
   * Edits a session: workshop, capacity, booking cut-off and image (never the date and time: that is Re-schedule). The capacity cannot go below
   * the seats already reserved, and the workshop of a session that has bookings cannot change. When the workshop changes the session keeps
   * its start and takes the length of the new workshop (`endsAt`). False when something is not allowed.
   */
  const updateSession = useCallback(
    (id: string, patch: { workshopId: string; capacity: number; bookingCutoffMinutes: number; imageUrl?: string; endsAt: string }): boolean => {
      const s = sessions.find((x) => x.id === id);
      if (!s || !canEditSession(s.status)) return false; // a running session is not edited: pause it first
      const hasBookings = s.reservedCount > 0 || bookings.some((b) => b.sessionId === id && b.status !== "CANCELLED");
      if (patch.workshopId !== s.workshopId) {
        if (hasBookings) return false;
        if (sessions.some((x) => x.id !== id && x.workshopId === patch.workshopId && x.startsAt === s.startsAt)) return false;
      }
      if (!Number.isInteger(patch.capacity) || patch.capacity < 1 || patch.capacity < s.reservedCount || !isValidBookingCutoff(patch.bookingCutoffMinutes)) return false;
      setSessions((list) => list.map((x) => {
        if (x.id !== id) return x;
        const { imageUrl: _old, ...rest } = x;
        void _old;
        return { ...rest, workshopId: patch.workshopId, capacity: patch.capacity, bookingCutoffMinutes: patch.bookingCutoffMinutes, endsAt: patch.endsAt, ...(patch.imageUrl ? { imageUrl: patch.imageUrl } : {}) };
      }));
      return true;
    },
    [sessions, bookings],
  );

  const addSession = useCallback((s: Omit<Session, "id" | "code" | "reservedCount" | "status">): boolean => {
    if (!isFutureStart(s.startsAt, new Date())) return false; // no session in the past
    setSessions((list) => [...list, { ...s, id: nextId("se"), code: nextSessionCode(list.map((x) => x.code)), reservedCount: 0, status: "OPEN" }]); // a new session is open (not running): Start makes it bookable
    return true;
  }, []);

  const addBooking = useCallback((b: Booking) => {
    setBookings((list) => [b, ...list]);
    adjustSeats(b.sessionId, b.quantity);
  }, []);

  return {
    bookings, sessions, history, now, perform, addPayment, setPaid, reschedule,
    sessionAction, completeSession, reopenSession, rescheduleSession, updateSession, addSession, addBooking,
  };
}
