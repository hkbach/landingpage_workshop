import { LegalDrafts } from "@/components/admin/directory/legal-drafts";
import { WithHistory } from "@/components/admin/history-tab";

// The Terms of Service and the Privacy Policy: a draft and a published text for each language (D17).
export default function LegalPage() {
  return <WithHistory scope="legal"><LegalDrafts /></WithHistory>;
}
