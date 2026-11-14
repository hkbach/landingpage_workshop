import { redirect } from "next/navigation";
import { homeOf, requireArea } from "@/lib/api-server";

// /shopowner has no shop in it: go to the address of the shop of the session.
export default async function ShopOwnerRoot() {
  const me = await requireArea("SHOP_OWNER");
  redirect(homeOf(me));
}
