import { SessionsAdmin } from "@/components/admin/directory/sessions-admin";
import { WithHistory } from "@/components/admin/history-tab";

export default function SessionsPage() {
  return <WithHistory scope="sessions"><SessionsAdmin /></WithHistory>;
}
