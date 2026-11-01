// Browser side of the booking settings endpoint (/api/v1/settings/booking).

export async function saveBookingCutoffRequest(minutes: number): Promise<void> {
  const res = await fetch("/api/v1/settings/booking", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookingCutoffMinutes: minutes }) });
  if (!res.ok) throw new Error(`settings ${res.status}`);
}
