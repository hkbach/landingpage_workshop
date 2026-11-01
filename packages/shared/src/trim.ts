/**
 * Input rule of the whole system (BR-16): a person may type spaces at both ends of a text box, and every text is trimmed when the
 * form is submitted. Returns a copy of `value` in which every string is trimmed; objects and arrays are walked, every other value
 * (numbers, booleans, null, dates) is left as it is. Passwords are never passed through this: surrounding spaces count there.
 */
export function trimDeep<T>(value: T): T {
  if (typeof value === "string") return value.trim() as T;
  if (Array.isArray(value)) return value.map((v) => trimDeep(v)) as T;
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, trimDeep(v)])) as T;
  }
  return value;
}
