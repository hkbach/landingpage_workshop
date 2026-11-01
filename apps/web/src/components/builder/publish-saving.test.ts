import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import type { OrgStatus } from "@workshop/shared";
import builder from "../../../messages/en/builder.json";
import { BuilderHeader } from "./BuilderHeader";
import { PublishPanel } from "./PublishPanel";
import { publishAction, type Prerequisite } from "./publish-state";
import type { SaveState } from "./save-state";

const ready: Prerequisite[] = [
  { key: "identity", met: true }, { key: "hero", met: true }, { key: "contact", met: true }, { key: "workshop", met: true },
];
const base = { prerequisites: ready, invalidSections: 0, invalidTheme: false };

describe("publishAction while the draft is being saved", () => {
  it("a live shop cannot publish while saving, and can again afterwards", () => {
    expect(publishAction({ ...base, status: "ACTIVE", saving: true })).toEqual({ kind: "publish", disabled: true, reason: "saving" });
    expect(publishAction({ ...base, status: "ACTIVE", saving: false })).toEqual({ kind: "publish", disabled: false, reason: null });
    expect(publishAction({ ...base, status: "ACTIVE" })).toEqual({ kind: "publish", disabled: false, reason: null });
  });
  it("a draft shop cannot submit for review while saving", () => {
    expect(publishAction({ ...base, status: "DRAFT", saving: true })).toEqual({ kind: "submit", disabled: true, reason: "saving" });
    expect(publishAction({ ...base, status: "DRAFT", saving: false })).toEqual({ kind: "submit", disabled: false, reason: null });
  });
  it("saving is reported first, the other reasons come back once the save is done", () => {
    const broken = { ...base, invalidSections: 2, invalidTheme: true, prerequisites: ready.map((p) => ({ ...p, met: false })) };
    expect(publishAction({ ...broken, status: "ACTIVE", saving: true })).toMatchObject({ reason: "saving" });
    expect(publishAction({ ...broken, status: "ACTIVE", saving: false })).toMatchObject({ reason: "errors" });
    expect(publishAction({ ...broken, status: "DRAFT", saving: true })).toMatchObject({ reason: "saving" });
    expect(publishAction({ ...broken, status: "DRAFT", saving: false })).toMatchObject({ reason: "checklist" });
  });
  it("pending review and suspended shops are unaffected", () => {
    expect(publishAction({ ...base, status: "PENDING_REVIEW", saving: true })).toEqual({ kind: "pending" });
    expect(publishAction({ ...base, status: "SUSPENDED", saving: true })).toEqual({ kind: "suspended" });
  });
});

const Provider = NextIntlClientProvider as unknown as ComponentType<{ locale: string; messages: { builder: typeof builder }; children?: ReactNode }>;
const render = (node: ReactNode) => renderToStaticMarkup(createElement(Provider, { locale: "en", messages: { builder } }, node));

/** The last button of the header (Publish / Submit) and of the card. */
const lastButton = (html: string) => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0]).pop() ?? "";

describe("the Publish button in the sticky header", () => {
  const header = (status: OrgStatus, saveState: SaveState) => {
    const action = publishAction({ ...base, status, saving: saveState === "pending" });
    return render(createElement(BuilderHeader, { pageId: "main", pageName: "Clay & Co Studio", saveState, status, action, message: null, onPublish: () => {}, onSubmit: () => {} }));
  };

  it("is disabled while the draft is saving, with the reason, and a spinner instead of the icon", () => {
    const html = header("ACTIVE", "pending");
    const btn = lastButton(html);
    expect(btn).toContain("Publish");
    expect(btn).toMatch(/\bdisabled=""/);
    expect(btn).toContain("animate-spin");
    expect(html).toContain("Saving your changes. You can publish in a moment.");
  });
  it("is enabled once the draft is saved", () => {
    for (const s of ["saved", "idle"] as const) {
      const btn = lastButton(header("ACTIVE", s));
      expect(btn, s).toContain("Publish");
      expect(btn, s).not.toMatch(/\bdisabled=""/);
    }
  });
  it("the Submit for review button of a draft shop follows the same rule", () => {
    expect(lastButton(header("DRAFT", "pending"))).toMatch(/\bdisabled=""/);
    expect(lastButton(header("DRAFT", "saved"))).not.toMatch(/\bdisabled=""/);
  });
});

describe("the Publish button in the Publish card", () => {
  const card = (status: OrgStatus, saving: boolean) =>
    render(createElement(PublishPanel, { status, prerequisites: ready, invalidSections: 0, invalidTheme: false, saving, message: null, onSubmitForReview: () => {}, onPublish: () => {} }));

  it("is disabled while saving and says why", () => {
    const html = card("ACTIVE", true);
    const btn = lastButton(html);
    expect(btn).toContain("Publish");
    expect(btn).toMatch(/\bdisabled=""/);
    expect(html).toContain("Saving your changes. You can publish in a moment.");
  });
  it("is enabled when not saving, with no saving message", () => {
    const html = card("ACTIVE", false);
    expect(lastButton(html)).not.toMatch(/\bdisabled=""/);
    expect(html).not.toContain("Saving your changes");
  });
  it("Submit for review is disabled while saving", () => {
    expect(lastButton(card("DRAFT", true))).toMatch(/\bdisabled=""/);
    expect(lastButton(card("DRAFT", false))).not.toMatch(/\bdisabled=""/);
  });
});
