import { MessagesAdmin } from "@/components/admin/directory/messages-admin";
import { WithHistory } from "@/components/admin/history-tab";

export default function MessagesPage() {
  return <WithHistory scope="messages"><MessagesAdmin /></WithHistory>;
}
