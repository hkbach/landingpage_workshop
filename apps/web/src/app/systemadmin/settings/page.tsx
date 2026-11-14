import { SettingsAdmin } from "@/components/admin/directory/settings-admin";
import { WithHistory } from "@/components/admin/history-tab";

export default function SettingsPage() {
  return <WithHistory scope="platform"><SettingsAdmin /></WithHistory>;
}
