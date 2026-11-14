import { LandingPagesAdmin } from "@/components/admin/directory/landing-pages-admin";
import { WithHistory } from "@/components/admin/history-tab";

export default function LandingPagesPage() {
  return <WithHistory scope="landingPages"><LandingPagesAdmin /></WithHistory>;
}
