import { RatingsAdmin } from "@/components/admin/directory/ratings-admin";
import { WithHistory } from "@/components/admin/history-tab";

export default function RatingsPage() {
  return <WithHistory scope="ratings"><RatingsAdmin /></WithHistory>;
}
