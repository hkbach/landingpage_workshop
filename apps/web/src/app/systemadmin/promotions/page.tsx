import { VouchersAdmin } from "@/components/admin/directory/promotions-admin";
import { WithHistory } from "@/components/admin/history-tab";

export default function VouchersPage() {
  return <WithHistory scope="promotions"><VouchersAdmin /></WithHistory>;
}
