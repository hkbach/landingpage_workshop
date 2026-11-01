"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BookingStatus, PaymentMethod } from "@workshop/shared";
import type { Booking, PaymentEntry, Session } from "@/lib/types";
import {
  canTransition, computePaymentStatus, netPaid, seatDelta, targetStatus,
  type BlockedReason, type BookingAction,
} from "@/lib/booking-state";
import { persistBookingStatus } from "@/lib/bookings-api";

export interface BookingEvent { status: BookingStatus; at?: string; note?: string }

export type OpResult = { ok: true } | { ok: false; reason: BlockedReason | "REASON_REQUIRED" | "NOT_FOUND" | "INVALID_AMOUNT" | "NO_CAPACITY" };

export interface PaymentInput { type: "PAYMENT" | "REFUND"; amount: number; method: PaymentMethod; note?: string }

/**
 * Client-side simulation of booking/session operations (optimistic local state; nothing is persisted).
 * The authoritative rules live in `@/lib/booking-state` and will be enforced again by the backend.
 */
export function useOpsState(init: { bookings: Booking[]; sessions: Session[]; nowIso: string; actor: string }) {
  const [bookings, setBookings] = useState<Booking[]>(init.bookings);
  const [sessions, setSessions] = useState<Session[]>(init.sessions);
  const [history, setHistory] = useState<Record<string, BookingEvent[]>>({});
  const [now, setNow] = useState(() => new Date(init.nowIso));
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
      const to = targetStatus(action);
      if (!to) return { ok: false, reason: "INVALID_STATE" };
      const at = new Date().toISOString();
      setBookings((list) =>
        list.map((x) => (x.id === b.id ? { ...x, status: to, cancelReason: action === "CANCEL" ? reason!.trim() : x.cancelReason } : x)),
      );
      adjustSeats(s.id, seatDelta(b.status, to, b.quantity));
      pushEvent(b.id, { status: to, at, note: action === "CANCEL" ? reason!.trim() : undefined });
      persistBookingStatus(b.id, to, action === "CANCEL" ? reason!.trim() : undefined);
      return { ok: true };
    },
    [bookings, sessions],
  );

  const addPayment = useCallback(
    (bookingId: string, input: PaymentInput): OpResult => {
      const b = bookings.find((x) => x.id === bookingId);
      if (!b) return { ok: false, reason: "NOT_FOUND" };
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
    [bookings, init.actor],
  );

  const reschedule = useCallback(
    (bookingId: string, targetSessionId: string): OpResult => {
      const b = bookings.find((x) => x.id === bookingId);
      const from = b && sessions.find((x) => x.id === b.sessionId);
      const to = sessions.find((x) => x.id === targetSessionId);
      if (!b || !from || !to) return { ok: false, reason: "NOT_FOUND" };
      if (!canTransition(b, from, new Date()).RESCHEDULE.allowed) return { ok: false, reason: "INVALID_STATE" };
      if (to.workshopId !== b.workshopId || to.status === "CANCELLED" || to.id === from.id) return { ok: false, reason: "INVALID_STATE" };
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
  const setSessionStatus = useCallback((id: string, status: "OPEN" | "CLOSED") => {
    setSessions((list) => list.map((s) => (s.id === id && s.status !== "CANCELLED" ? { ...s, status } : s)));
  }, []);

  const setSessionCapacity = useCallback(
    (id: string, capacity: number): boolean => {
      const s = sessions.find((x) => x.id === id);
      if (!s || capacity < s.reservedCount || capacity < 1) return false;
      setSessions((list) => list.map((x) => (x.id === id ? { ...x, capacity } : x)));
      return true;
    },
    [sessions],
  );

  const cancelSession = useCallback((id: string, reason: string) => {
    const text = reason.trim();
    if (!text) return false;
    for (const b of bookings) if (b.sessionId === id && b.status === "CONFIRMED") persistBookingStatus(b.id, "CANCELLED", text);
    setSessions((list) => list.map((s) => (s.id === id ? { ...s, status: "CANCELLED", cancelReason: text, reservedCount: 0 } : s)));
    setBookings((list) =>
      list.map((b) => (b.sessionId === id && b.status === "CONFIRMED" ? { ...b, status: "CANCELLED", cancelReason: text } : b)),
    );
    return true;
  }, [bookings]);

  const addSession = useCallback((s: Omit<Session, "id" | "reservedCount" | "status">) => {
    setSessions((list) => [...list, { ...s, id: nextId("se"), reservedCount: 0, status: "OPEN" }]);
  }, []);

  const addBooking = useCallback((b: Booking) => {
    setBookings((list) => [b, ...list]);
    adjustSeats(b.sessionId, b.quantity);
  }, []);

  return {
    bookings, sessions, history, now, perform, addPayment, reschedule,
    setSessionStatus, setSessionCapacity, cancelSession, addSession, addBooking,
  };
}
