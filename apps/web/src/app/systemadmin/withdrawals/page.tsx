import { WithdrawalsAdmin } from "@/components/admin/directory/withdrawals-admin";
import { WithHistory } from "@/components/admin/history-tab";

export default function WithdrawalsPage() {
  return <WithHistory scope="withdrawals"><WithdrawalsAdmin /></WithHistory>;
}
