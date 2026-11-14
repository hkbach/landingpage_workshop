import { AffiliateAdmin } from "@/components/admin/directory/affiliate-admin";
import { WithHistory } from "@/components/admin/history-tab";

export default function AffiliatePage() {
  return <WithHistory scope="affiliate"><AffiliateAdmin /></WithHistory>;
}
