"use client";

import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { endSession } from "@/lib/logout";

/** A link to the login page that ends the session first. A full page load follows, so nothing of the private area stays in the memory of the browser. */
export function LogoutLink({ onClick, children, ...rest }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <a
      {...rest}
      href="/login"
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        void endSession().then(() => window.location.replace("/login"));
      }}
    >
      {children}
    </a>
  );
}
