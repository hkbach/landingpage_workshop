import { ReferralsAdmin } from "@/components/admin/directory/referrals-admin";
import { WithHistory } from "@/components/admin/history-tab";

export default function ReferralsPage() {
  return <WithHistory scope="referrals"><ReferralsAdmin /></WithHistory>;
}
