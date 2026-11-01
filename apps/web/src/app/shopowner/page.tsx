import { redirect } from "next/navigation";
import { currentShop } from "@/lib/mock/data";

// /shopowner has no shop in it: go to the address of the shop of the session. TODO(api): the slug of the session's organization.
export default function ShopOwnerRoot() {
  redirect(`/shopowner/${currentShop.slug}`);
}
