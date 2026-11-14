// An account (shop owner or customer) as the admin screens show it.
export type AccountType = "CUSTOMER" | "SHOP_OWNER";
export type AccountStatus = "ACTIVE" | "DEACTIVATED";
export type DeactivationReason = "ADMIN" | "PASSWORD_RESET";

export interface Account {
  /** The id of the user. */
  id: string;
  type: AccountType;
  email: string;
  fullName: string;
  phone?: string;
  status: AccountStatus;
  deactivationReason?: DeactivationReason;
  /** Shop owner: the shop. */
  shop?: { id: string; name: string; slug: string };
  /** Customer: the profile of the account. */
  country?: string;
  birthDate?: string;
  favoriteCategories?: string[];
  createdAt?: string;
}
