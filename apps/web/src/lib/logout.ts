/** Ends the session on the server (the API deletes it and clears the cookie). A failure (offline, the sample-data app that has no such route) never blocks the person from leaving. */
export async function endSession(): Promise<void> {
  try {
    await fetch("/api/v1/auth/logout", { method: "POST" });
  } catch {
    /* the person leaves anyway */
  }
}
