import { ForbiddenException } from "@nestjs/common";
import type { OrgContext } from "../auth/auth.guards";

/** A suspended shop is read only (REQUIREMENTS FR-ADM-03): every endpoint that changes its data calls this first. */
export function assertShopWritable(org: Pick<OrgContext, "status">): void {
  if (org.status === "SUSPENDED") throw new ForbiddenException({ code: "SHOP_SUSPENDED", message: "This shop is suspended: its data can be read but not changed." });
}
