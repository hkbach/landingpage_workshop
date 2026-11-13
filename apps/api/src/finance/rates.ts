import { DEFAULT_FEE_RATES, type FeeRates } from "@workshop/shared";

export interface Rates extends FeeRates { affiliateBps: number; inviteBonusBps: number }
/** Until an administrator sets the rates of a shop (a round value to start with; the real percentages are a business decision). */
export const DEFAULT_RATES: Rates = { ...DEFAULT_FEE_RATES, affiliateBps: 1000, inviteBonusBps: 1000 };
