import { WorkshopsAdmin } from "@/components/admin/directory/workshops-admin";
import { WithHistory } from "@/components/admin/history-tab";

export default function WorkshopsPage() {
  return <WithHistory scope="workshops"><WorkshopsAdmin /></WithHistory>;
}
