"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { LOCALES } from "@workshop/shared";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setUiLocale } from "./actions";

export function LocaleSwitcher() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    if (next === locale) return;
    startTransition(async () => {
      await setUiLocale(next);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={buttonVariants({ variant: "outline", size: "default" })}
        aria-label={t("dashboard.shell.language")}
        disabled={pending}
      >
        <Globe aria-hidden />
        <span className="hidden sm:inline">{t(`common.languages.${locale}`)}</span>
        <span className="uppercase sm:hidden">{locale}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("dashboard.shell.language")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={locale} onValueChange={change}>
            {LOCALES.map((l) => (
              <DropdownMenuRadioItem key={l} value={l}>{t(`common.languages.${l}`)}</DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
