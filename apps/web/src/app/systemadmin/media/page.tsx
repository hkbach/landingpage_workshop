import { MediaAdmin } from "@/components/admin/directory/media-admin";
import { WithHistory } from "@/components/admin/history-tab";

export default function MediaPage() {
  return <WithHistory scope="media"><MediaAdmin /></WithHistory>;
}
