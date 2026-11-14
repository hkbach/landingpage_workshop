import { FeesAdmin } from "@/components/admin/directory/fees-admin";
import { WithHistory } from "@/components/admin/history-tab";

export default function FeesPage() {
  return <WithHistory scope="fees"><FeesAdmin /></WithHistory>;
}
