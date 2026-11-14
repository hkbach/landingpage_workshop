import { LegalAdmin } from "@/components/admin/directory/legal-admin";
import { LegalDrafts } from "@/components/admin/directory/legal-drafts";
import { realApi } from "@/lib/api-server";

// Connected to the API the texts have a draft and a published version (D17); the sample data keeps one text that is live as soon as it is saved.
export default function LegalPage() {
  return realApi() ? <LegalDrafts /> : <LegalAdmin />;
}
