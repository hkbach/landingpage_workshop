"use client";

import { useState } from "react";

/**
 * Whether the data of a form differs from what it held when it was opened, so Save can stay disabled until the owner changes something.
 * `key` names the record being edited: when it changes (another record, or the form closing and opening again) the current value becomes
 * the new baseline. Values are compared as JSON, so they must be plain data.
 */
export function useDirty(value: unknown, key: unknown = null): boolean {
  const json = JSON.stringify(value ?? null);
  const [baseline, setBaseline] = useState({ key, json });
  if (!Object.is(baseline.key, key)) {
    setBaseline({ key, json }); // React re-renders at once with the new baseline
    return false;
  }
  return json !== baseline.json;
}
