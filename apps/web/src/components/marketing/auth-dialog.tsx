"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoginForm, SignupForm } from "@/app/(auth)/_components/auth-forms";

type Mode = "login" | "signup";
type Kind = "customer" | "owner";
interface Open { mode: Mode; kind?: Kind }

const AuthDialogContext = createContext<((mode: Mode, kind?: Kind) => void) | null>(null);

/** Opens the popup Log in or Sign up (with the tab of a customer or of a shop owner). */
export function useAuthDialog(): (mode: Mode, kind?: Kind) => void {
  const open = useContext(AuthDialogContext);
  if (!open) throw new Error("useAuthDialog is used outside of the public site");
  return open;
}

/**
 * Log in and Sign up are popups of the public site, not pages. The address `/?auth=login` or `/?auth=signup` (`&tab=owner` for the shop owner tab) opens the popup too: it is where the old
 * /login and /signup addresses, the links of the emails and Log out lead. After a login the person is sent to their own area, see goHome in auth-forms.
 */
export function AuthDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Open | null>(null);
  const openDialog = useCallback((mode: Mode, kind?: Kind) => setState({ mode, ...(kind ? { kind } : {}) }), []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const auth = q.get("auth");
    if (auth !== "login" && auth !== "signup") return;
    const tab = q.get("tab");
    queueMicrotask(() => setState({ mode: auth, ...(tab === "owner" || tab === "customer" ? { kind: tab } : {}) }));
  }, []);

  const close = (open: boolean) => {
    if (open) return;
    setState(null);
    // The popup was opened by the address: take the query away so a reload does not open it again.
    const url = new URL(window.location.href);
    if (url.searchParams.has("auth")) {
      url.searchParams.delete("auth");
      url.searchParams.delete("tab");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  };
  const value = useMemo(() => openDialog, [openDialog]);

  return (
    <AuthDialogContext.Provider value={value}>
      {children}
      <Dialog open={state !== null} onOpenChange={close}>
        <DialogContent className="max-h-[92dvh] gap-4 overflow-y-auto p-5 sm:max-w-md sm:p-6" data-testid="auth-dialog">
          {state ? <AuthPanel key={`${state.mode}-${state.kind ?? ""}`} state={state} onSwitch={openDialog} /> : null}
        </DialogContent>
      </Dialog>
    </AuthDialogContext.Provider>
  );
}

function AuthPanel({ state, onSwitch }: { state: Open; onSwitch: (mode: Mode, kind?: Kind) => void }) {
  const t = useTranslations("auth");
  const login = state.mode === "login";
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold">{login ? t("login.title") : t("signup.title")}</DialogTitle>
        <DialogDescription>{login ? t("login.subtitle") : t("signup.subtitle")}</DialogDescription>
      </DialogHeader>
      {login ? <LoginForm /> : <SignupForm initialTab={state.kind ?? "customer"} />}
      <p className="text-center text-sm text-muted-foreground">
        {login ? t("login.noAccount") : t("signup.haveAccount")}{" "}
        <button type="button" onClick={() => onSwitch(login ? "signup" : "login")} className="font-medium text-foreground underline underline-offset-4" data-testid="auth-switch">
          {login ? t("login.signupLink") : t("signup.loginLink")}
        </button>
      </p>
    </>
  );
}

/** A button or link of the public site that opens the popup. */
export function AuthTrigger({ mode, kind, className, children, onOpen, testId }: { mode: Mode; kind?: Kind; className?: string; children: ReactNode; onOpen?: () => void; testId?: string }) {
  const open = useAuthDialog();
  return (
    <button type="button" className={className} data-testid={testId} onClick={() => { onOpen?.(); open(mode, kind); }}>
      {children}
    </button>
  );
}
