import { UsersAdmin } from "@/components/admin/directory/users-admin";
import { WithHistory } from "@/components/admin/history-tab";

export default function UsersPage() {
  return <WithHistory scope="users"><UsersAdmin /></WithHistory>;
}
