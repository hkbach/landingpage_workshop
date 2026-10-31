import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { ReviewDetail } from "@/components/admin/review-detail";
import { orgStats } from "@/lib/mock/admin";
import { shops } from "@/lib/mock/data";

export default async function ReviewDetailPage({ params }: PageProps<"/admin/reviews/[id]">) {
  const { id } = await params;
  const shop = shops.find((s) => s.id === id);
  if (!shop) notFound();

  const t = await getTranslations("admin.reviewDetail");
  return (
    <div className="grid gap-4">
      <header className="grid gap-2">
        <Link href="/admin/reviews" className="inline-flex w-fit items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> {t("backToQueue")}
        </Link>
        <h1 className="text-2xl font-semibold">{shop.name}</h1>
      </header>
      <ReviewDetail shop={shop} workshops={orgStats[shop.id]?.workshops ?? 0} />
    </div>
  );
}
