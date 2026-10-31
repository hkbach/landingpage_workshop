"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, describedBy } from "@/components/dashboard/shell/field";
import { zodResolver } from "@/lib/zod-resolver";

const fakeRequest = () => new Promise<void>((resolve) => setTimeout(resolve, 700));

const email = z.string().trim().min(1, "errors.emailRequired").pipe(z.email("errors.emailInvalid"));
const password = z.string().min(10, "errors.passwordMin");

const loginSchema = z.object({ email, password: z.string().min(1, "errors.passwordRequired") });
const signupSchema = z.object({
  fullName: z.string().trim().min(1, "errors.fullNameRequired").max(120),
  email,
  password,
  acceptTerms: z.boolean().refine((v) => v, "errors.termsRequired"),
});
const forgotSchema = z.object({ email });
const resetSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "errors.passwordMismatch" });

type LoginValues = z.infer<typeof loginSchema>;
type SignupValues = z.infer<typeof signupSchema>;
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
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = form;
  const err = (k: keyof LoginValues) => (errors[k]?.message ? t(errors[k]!.message as string) : undefined);

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={handleSubmit(async () => {
        await fakeRequest();
        router.push("/shopowner");
      })}
    >
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

export function SignupForm() {
  const t = useTranslations("auth");
  const [done, setDone] = useState(false);
  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: "", email: "", password: "", acceptTerms: false },
  });
  const { register, handleSubmit, setValue, control, formState: { errors, isSubmitting } } = form;
  const acceptTerms = useWatch({ control, name: "acceptTerms" });
  const err = (k: keyof SignupValues) => (errors[k]?.message ? t(errors[k]!.message as string) : undefined);

  // FR-AUTH-01: the same generic message is shown whether or not the email is already registered.
  if (done) return <SuccessNotice title={t("signup.checkEmailTitle")} body={t("signup.checkEmailBody")} />;

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={handleSubmit(async () => {
        await fakeRequest();
        setDone(true);
      })}
    >
      <Field htmlFor="signup-name" label={t("fields.fullName")} error={err("fullName")}>
        <Input id="signup-name" autoComplete="name" aria-invalid={!!errors.fullName}
          aria-describedby={describedBy("signup-name", { error: !!errors.fullName })} {...register("fullName")} />
      </Field>
      <Field htmlFor="signup-email" label={t("fields.email")} error={err("email")}>
        <Input id="signup-email" type="email" autoComplete="email" aria-invalid={!!errors.email}
          aria-describedby={describedBy("signup-email", { error: !!errors.email })} {...register("email")} />
      </Field>
      <Field htmlFor="signup-password" label={t("fields.password")} hint={t("signup.passwordHint")} error={err("password")}>
        <Input id="signup-password" type="password" autoComplete="new-password" aria-invalid={!!errors.password}
          aria-describedby={describedBy("signup-password", { error: !!errors.password, hint: true })} {...register("password")} />
      </Field>

      <div className="grid gap-1.5">
        <div className="flex items-start gap-2">
          <Checkbox
            id="signup-terms"
            checked={acceptTerms}
            onCheckedChange={(v) => setValue("acceptTerms", v === true, { shouldValidate: true })}
            aria-invalid={!!errors.acceptTerms}
            aria-describedby={describedBy("signup-terms", { error: !!errors.acceptTerms })}
            className="mt-0.5"
          />
          <Label htmlFor="signup-terms" className="text-sm font-normal leading-snug">
            {t.rich("signup.acceptTerms", {
              terms: (c) => <Link href="/terms" className="underline underline-offset-4">{c}</Link>,
              privacy: (c) => <Link href="/privacy" className="underline underline-offset-4">{c}</Link>,
            })}
          </Label>
        </div>
        {err("acceptTerms") ? <p id="signup-terms-error" role="alert" className="text-xs text-destructive">{err("acceptTerms")}</p> : null}
      </div>

      {/* Placeholder only: the real Cloudflare Turnstile widget is wired up with the backend. */}
      <div role="group" aria-label={t("signup.turnstileLabel")}
        className="flex h-16 items-center justify-center rounded-lg border border-dashed bg-muted/40 text-xs text-muted-foreground">
        {t("signup.turnstilePlaceholder")}
      </div>

      <Button type="submit" size="lg" disabled={isSubmitting}>{isSubmitting ? t("signup.submitting") : t("signup.submit")}</Button>
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
    <form noValidate className="grid gap-4" onSubmit={handleSubmit(async () => { await fakeRequest(); setDone(true); })}>
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
  const [done, setDone] = useState(false);
  const form = useForm<ResetValues>({ resolver: zodResolver(resetSchema), defaultValues: { password: "", confirm: "" } });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = form;
  const err = (k: keyof ResetValues) => (errors[k]?.message ? t(errors[k]!.message as string) : undefined);

  if (done) {
    return (
      <div className="grid gap-4">
        <SuccessNotice title={t("reset.doneTitle")} body={t("reset.doneBody")} />
        <Button render={<Link href="/login" />} nativeButton={false} size="lg">{t("reset.goToLogin")}</Button>
      </div>
    );
  }

  return (
    <form noValidate className="grid gap-4" onSubmit={handleSubmit(async () => { await fakeRequest(); setDone(true); })}>
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
