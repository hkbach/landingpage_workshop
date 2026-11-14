import { EmailsAdmin } from "@/components/admin/directory/emails-admin";
import { WithHistory } from "@/components/admin/history-tab";

export default function EmailsPage() {
  return <WithHistory scope="emails"><EmailsAdmin /></WithHistory>;
}
