import { ShopsAdmin } from "@/components/admin/directory/shops-admin";
import { WithHistory } from "@/components/admin/history-tab";

export default function OrganizationsPage() {
  return <WithHistory scope="shops"><ShopsAdmin /></WithHistory>;
}
