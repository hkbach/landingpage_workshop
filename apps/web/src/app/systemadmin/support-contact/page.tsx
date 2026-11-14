import { SupportContactAdmin } from "@/components/admin/directory/support-contact-admin";
import { WithHistory } from "@/components/admin/history-tab";

export default function SupportContactPage() {
  return <WithHistory scope="platform"><SupportContactAdmin /></WithHistory>;
}
