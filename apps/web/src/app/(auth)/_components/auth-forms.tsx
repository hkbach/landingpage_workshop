"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Store, UserRound } from "lucide-react";
import { generateShopSlug, PASSWORD_MAX, PASSWORD_MIN } from "@workshop/shared";
import { writeGuestEmail } from "@/lib/favorites";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field, describedBy } from "@/components/dashboard/shell/field";
import { zodResolver } from "@/lib/zod-resolver";

const email = z.string().trim().min(1, "errors.emailRequired").pipe(z.email("errors.emailInvalid"));
const password = z.string().min(PASSWORD_MIN, "errors.passwordMin");

const loginSchema = z.object({ email, password: z.string().min(1, "errors.passwordRequired") });
// The box of the Terms and the Privacy Policy: nobody opens an account without it (D17). The server keeps the proof (the version and the time).
const consent = z.boolean().refine((v) => v, "errors.termsRequired");
const passwordPair = { password: password.max(PASSWORD_MAX, "errors.passwordMax"), confirm: z.string().min(1, "errors.confirmRequired"), consent };
const samePair = (v: { password: string; confirm: string }) => v.password === v.confirm;
// The popup Sign up has two kinds: a customer (email + password twice) and a shop owner (the same + the name of the shop, which gives the slug of the shop).
const customerSchema = z.object({ email, ...passwordPair }).refine(samePair, { path: ["confirm"], message: "errors.passwordMismatch" });
const ownerSchema = z.object({ email, ...passwordPair, shopName: z.string().trim().min(1, "errors.shopNameRequired").max(120, "errors.shopNameTooLong") }).refine(samePair, { path: ["confirm"], message: "errors.passwordMismatch" });
const forgotSchema = z.object({ email });
// The page of the link of the reset email: the new password twice. The link is the proof (it works once and expires).
const resetSchema = z
  .object({ password: password.max(PASSWORD_MAX, "errors.passwordMax"), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "errors.passwordMismatch" });

type LoginValues = z.infer<typeof loginSchema>;
type OwnerValues = z.infer<typeof ownerSchema>;
type ForgotValues = z.infer<typeof forgotSchema>;
type ResetValues = z.infer<typeof resetSchema>;

function SuccessNotice({ title, body }: { title: string; body: string }) {
  return (
    <div role="status" className="grid gap-1 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">
      <p className="font-semibold">{title}</p>
      <p>{body}</p>
    </div>
  );
}

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = form;
  const err = (k: keyof LoginValues) => (errors[k]?.message ? t(errors[k]!.message as string) : undefined);

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={handleSubmit(async (values) => {
        setFailure(null);
        try {
          const res = await fetch("/api/v1/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) });
          if (!res.ok) {
            const code = ((await res.json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code;
            setFailure(code === "DEACTIVATED" ? "login.deactivated" : code === "EMAIL_NOT_VERIFIED" ? "login.notVerified" : code === "TOO_MANY_ATTEMPTS" ? "login.tooMany" : code === "INVALID_CREDENTIALS" ? "login.invalid" : "login.failed");
            return;
          }
          goHome(router, (await res.json()) as Me);
        } catch {
          setFailure("login.failed");
        }
      })}
    >
      {failure ? <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{t(failure)}</p> : null}
      <Field htmlFor="login-email" label={t("fields.email")} error={err("email")}>
        <Input id="login-email" type="email" autoComplete="email" aria-invalid={!!errors.email}
          aria-describedby={describedBy("login-email", { error: !!errors.email })} {...register("email")} />
      </Field>
      <Field htmlFor="login-password" label={t("fields.password")} error={err("password")}>
        <Input id="login-password" type="password" autoComplete="current-password" aria-invalid={!!errors.password}
          aria-describedby={describedBy("login-password", { error: !!errors.password })} {...register("password")} />
      </Field>
      <div className="text-right text-sm">
        <Link href="/forgot-password" className="underline underline-offset-4">{t("login.forgot")}</Link>
      </div>
      <Button type="submit" size="lg" disabled={isSubmitting}>{isSubmitting ? t("login.submitting") : t("login.submit")}</Button>
    </form>
  );
}

/** What the server answers to a login or a signup: where the person goes next (the API: `organization` for a shop owner; the sample data: `slug`, `guestSlug` and `setup`). */
type Me = {
  type: "SHOP_OWNER" | "CUSTOMER" | "SUPER_ADMIN"; id: string; email: string; slug?: string; guestSlug?: string; /** A shop that just signed up: its owner finishes the setup first. */ setup?: boolean;
  organization?: { slug: string; status: "DRAFT" | "ACTIVE" | "SUSPENDED" };
};

/** The person is logged in: the platform administrator goes to the admin area, a shop owner to the shop, a customer to Today of the customer area. */
function goHome(router: ReturnType<typeof useRouter>, me: Me) {
  if (me.type === "SUPER_ADMIN") {
    router.push("/systemadmin");
    return;
  }
  if (me.type === "SHOP_OWNER") {
    const slug = me.organization?.slug ?? me.slug ?? "";
    router.push(me.setup || me.organization?.status === "DRAFT" ? `/shopowner/onboarding?shop=${encodeURIComponent(slug)}` : `/shopowner/${slug}`);
    return;
  }
  if (me.guestSlug) writeGuestEmail(me.guestSlug, me.email); // (the customer area of the sample data looks the account up with the email of the guest session)
  router.push(`/customer/${me.id}/today`);
}

type SignupKind = "customer" | "owner";
const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || "localtest.me";

/** The popup Sign up: two tabs, one for a customer and one for a shop owner. A new account is logged in at once and sent to its own area. */
export function SignupForm({ initialTab = "customer" }: { initialTab?: SignupKind }) {
  const t = useTranslations("auth");
  const [tab, setTab] = useState<SignupKind>(initialTab);
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as SignupKind)} className="gap-4" data-testid="signup-tabs">
      <TabsList className="grid w-full grid-cols-2" aria-label={t("signup.tabsLabel")}>
        <TabsTrigger value="customer" data-testid="signup-tab-customer"><UserRound aria-hidden />{t("signup.tabCustomer")}</TabsTrigger>
        <TabsTrigger value="owner" data-testid="signup-tab-owner"><Store aria-hidden />{t("signup.tabOwner")}</TabsTrigger>
      </TabsList>
      <TabsContent value="customer" className="grid gap-3"><p className="text-muted-foreground">{t("signup.customerIntro")}</p><SignupKindForm kind="customer" /></TabsContent>
      <TabsContent value="owner" className="grid gap-3"><p className="text-muted-foreground">{t("signup.ownerIntro")}</p><SignupKindForm kind="owner" /></TabsContent>
    </Tabs>
  );
}

function SignupKindForm({ kind }: { kind: SignupKind }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const locale = useLocale();
  const [failure, setFailure] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const owner = kind === "owner";
  const form = useForm<OwnerValues>({
    resolver: zodResolver(owner ? ownerSchema : customerSchema) as never,
    defaultValues: { email: "", password: "", confirm: "", shopName: "", consent: false },
  });
  const { register, handleSubmit, setError, control, formState: { errors, isSubmitting } } = form;
  const shopName = useWatch({ control, name: "shopName" });
  const err = (k: keyof OwnerValues) => (errors[k]?.message ? t(errors[k]!.message as string) : undefined);
  const id = (k: string) => `signup-${kind}-${k}`;
  // The address the shop will get (the server adds a number when the name is already taken).
  const slug = owner && shopName.trim() ? generateShopSlug(shopName, () => false) : "";

  if (checkEmail) return <SuccessNotice title={t("signup.checkEmailTitle")} body={t("signup.checkEmailBody")} />;

  return (
    <form
      noValidate
      className="grid gap-4"
      data-testid={`signup-form-${kind}`}
      onSubmit={handleSubmit(async (v) => {
        setFailure(null);
        const body = { type: owner ? "SHOP_OWNER" : "CUSTOMER", email: v.email, password: v.password, confirmPassword: v.confirm, locale, ...(owner ? { shopName: v.shopName } : {}) };
        try {
          const res = await fetch("/api/v1/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
          if (res.status === 202) return setCheckEmail(true); // the email has to be confirmed first (the answer is the same for a new and an existing email)
          if (res.status === 201) {
            const me = (await res.json()) as Me;
            // The proof of the box (the version of the Terms and of the Privacy Policy and the time). A failure here is not the end of the signup: the area asks again before the person goes on.
            await fetch("/api/v1/legal/consent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kinds: ["terms", "privacy"], locale }) }).catch(() => null);
            return goHome(router, me);
          }
          const j = (await res.json().catch(() => null)) as { error?: { code?: string; details?: { fields?: Record<string, string> } } } | null;
          const f = j?.error?.details?.fields ?? {};
          if (res.status === 409) return setError("email", { message: "errors.emailTaken" });
          if (res.status === 422 && (f.email || f.password || f.confirmPassword || f.shopName)) {
            if (f.email) setError("email", { message: "errors.emailInvalid" });
            if (f.password) setError("password", { message: "errors.passwordMin" });
            if (f.confirmPassword) setError("confirm", { message: "errors.passwordMismatch" });
            if (f.shopName) setError("shopName", { message: "errors.shopNameRequired" });
            return;
          }
          setFailure("signup.failed");
        } catch {
          setFailure("signup.failed");
        }
      })}
    >
      {failure ? <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{t(failure)}</p> : null}
      {owner ? (
        <Field htmlFor={id("shop")} label={t("fields.shopName")} error={err("shopName")}>
          <Input id={id("shop")} autoComplete="organization" maxLength={120} aria-invalid={!!errors.shopName}
            aria-describedby={describedBy(id("shop"), { error: !!errors.shopName })} {...register("shopName")} />
          {slug ? <p className="text-xs text-muted-foreground" data-testid="signup-slug-preview">{t("signup.addressPreview", { address: `${slug}.${PLATFORM_DOMAIN}` })}</p> : <p className="text-xs text-muted-foreground">{t("signup.shopNameHint")}</p>}
        </Field>
      ) : null}
      <Field htmlFor={id("email")} label={t("fields.email")} error={err("email")}>
        <Input id={id("email")} type="email" autoComplete="email" aria-invalid={!!errors.email}
          aria-describedby={describedBy(id("email"), { error: !!errors.email })} {...register("email")} />
      </Field>
      <Field htmlFor={id("password")} label={t("fields.password")} hint={t("signup.passwordHint")} error={err("password")}>
        <Input id={id("password")} type="password" autoComplete="new-password" aria-invalid={!!errors.password}
          aria-describedby={describedBy(id("password"), { error: !!errors.password, hint: true })} {...register("password")} />
      </Field>
      <Field htmlFor={id("confirm")} label={t("fields.confirmPassword")} error={err("confirm")}>
        <Input id={id("confirm")} type="password" autoComplete="new-password" aria-invalid={!!errors.confirm}
          aria-describedby={describedBy(id("confirm"), { error: !!errors.confirm })} {...register("confirm")} />
      </Field>
      <div className="grid gap-1">
        <div className="flex items-start gap-2">
          <Controller
            control={control}
            name="consent"
            render={({ field }) => (
              <Checkbox id={id("consent")} checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} onBlur={field.onBlur} aria-invalid={!!errors.consent}
                aria-describedby={errors.consent ? `${id("consent")}-error` : undefined} data-testid={`signup-consent-${kind}`} className="mt-0.5" />
            )}
          />
          <label htmlFor={id("consent")} className="text-sm text-muted-foreground">
            {t.rich("signup.consent", {
              terms: (c) => <Link href="/terms" target="_blank" className="underline underline-offset-4">{c}</Link>,
              privacy: (c) => <Link href="/privacy" target="_blank" className="underline underline-offset-4">{c}</Link>,
            })}
          </label>
        </div>
        {errors.consent ? <p id={`${id("consent")}-error`} role="alert" className="text-sm text-destructive">{t(errors.consent.message as string)}</p> : null}
      </div>
      <Button type="submit" size="lg" disabled={isSubmitting} data-testid={`signup-submit-${kind}`}>{isSubmitting ? t("signup.submitting") : t("signup.submit")}</Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [done, setDone] = useState(false);
  const form = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema), defaultValues: { email: "" } });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = form;

  if (done) return <SuccessNotice title={t("forgot.sentTitle")} body={t("forgot.sentBody")} />;

  return (
    <form noValidate className="grid gap-4" onSubmit={handleSubmit(async (v) => {
      // The answer is the same for an email that has an account and one that has none (nobody learns which emails are registered): the notice is shown after any answer of the server.
      await fetch("/api/v1/auth/forgot-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: v.email }) }).catch(() => null);
      setDone(true);
    })}>
      <Field htmlFor="forgot-email" label={t("fields.email")} error={errors.email?.message ? t(errors.email.message) : undefined}>
        <Input id="forgot-email" type="email" autoComplete="email" aria-invalid={!!errors.email}
          aria-describedby={describedBy("forgot-email", { error: !!errors.email })} {...register("email")} />
      </Field>
      <Button type="submit" size="lg" disabled={isSubmitting}>{isSubmitting ? t("forgot.submitting") : t("forgot.submit")}</Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const form = useForm<ResetValues>({ resolver: zodResolver(resetSchema), defaultValues: { password: "", confirm: "" } });
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = form;
  const err = (k: keyof ResetValues) => (errors[k]?.message ? t(errors[k]!.message as string) : undefined);

  if (!token || invalid) return <SuccessNotice title={t("reset.invalidTitle")} body={t("reset.invalidBody")} />;

  if (done) {
    return (
      <div className="grid gap-4">
        <SuccessNotice title={t("reset.doneTitle")} body={t("reset.doneBody")} />
        <Button render={<Link href="/login" />} nativeButton={false} size="lg">{t("reset.goToLogin")}</Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={handleSubmit(async (v) => {
        const res = await fetch("/api/v1/auth/reset-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password: v.password, confirmPassword: v.confirm }) }).catch(() => null);
        if (res?.ok) return setDone(true);
        const body = (await res?.json().catch(() => null)) as { error?: { code?: string; details?: { fields?: Record<string, string> } } } | null;
        if (body?.error?.code === "TOKEN_INVALID" || body?.error?.code === "INVALID_LINK") return setInvalid(true);
        const fields = body?.error?.details?.fields ?? {};
        if (fields.password) setError("password", { message: fields.password === "tooLong" ? "errors.passwordMax" : "errors.passwordMin" });
        else if (fields.confirmPassword) setError("confirm", { message: "errors.passwordMismatch" });
        else setError("password", { message: "errors.resetFailed" });
      })}
    >
      <Field htmlFor="reset-password" label={t("reset.newPassword")} hint={t("signup.passwordHint")} error={err("password")}>
        <Input id="reset-password" type="password" autoComplete="new-password" aria-invalid={!!errors.password}
          aria-describedby={describedBy("reset-password", { error: !!errors.password, hint: true })} {...register("password")} />
      </Field>
      <Field htmlFor="reset-confirm" label={t("reset.confirmPassword")} error={err("confirm")}>
        <Input id="reset-confirm" type="password" autoComplete="new-password" aria-invalid={!!errors.confirm}
          aria-describedby={describedBy("reset-confirm", { error: !!errors.confirm })} {...register("confirm")} />
      </Field>
      <Button type="submit" size="lg" disabled={isSubmitting}>{isSubmitting ? t("reset.submitting") : t("reset.submit")}</Button>
    </form>
  );
}
