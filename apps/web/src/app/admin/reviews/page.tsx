import { getTranslations } from "next-intl/server";
import { ReviewQueue } from "@/components/admin/review-queue";
import { shops } from "@/lib/mock/data";

export default async function ReviewsPage() {
  const t = await getTranslations("admin.reviews");
  const pending = shops.filter((s) => s.status === "PENDING_REVIEW");
  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <ReviewQueue initial={pending} />
    </div>
  );
}
