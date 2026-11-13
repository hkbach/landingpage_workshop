import { expect, test } from "@playwright/test";
import { SHOP, demoOtp, open, watchBrowser } from "./helpers";

// The landing page of a shop as a visitor sees it.
test.describe("the landing page of a shop", () => {
  test("shows the shop, its workshops and offers in the language of the visitor, with no policy violation", async ({ page }) => {
    const problems = watchBrowser(page);
    await open(page, `${SHOP}/`);
    await expect(page.getByRole("heading", { name: "Make something with your hands", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Fresh Pasta from Scratch" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Special offers" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open in Google Maps" })).toHaveAttribute("href", /^https:\/\/maps\.app\.goo\.gl\//);

    // another language is its own address, and the page is written in it
    await page.getByRole("link", { name: "Tiếng Việt" }).click();
    await expect(page).toHaveURL(/\/vi$/);
    await expect(page.locator("main").first().locator("xpath=ancestor-or-self::*[@lang][1]")).toHaveAttribute("lang", "vi"); // the page itself is marked as Vietnamese
    expect(problems).toEqual([]);
  });

  test("tells a visitor that a shop or a page that does not exist is not there", async ({ page }) => {
    const response = await page.goto(`${SHOP.replace("whiskladle", "no-such-shop-anywhere")}/`, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(404);
  });

  test("a guest books a workshop in five steps and gets the code of the booking", async ({ page }) => {
    const problems = watchBrowser(page);
    await open(page, `${SHOP}/`);
    await page.getByRole("button", { name: "Book Fresh Pasta from Scratch" }).click();
    const dialog = page.getByRole("dialog", { name: "Book a workshop" });

    // 1. a date that has a session, and its time
    await expect(dialog.getByText("Step 1 of 5")).toBeVisible();
    const day = dialog.getByRole("group", { name: "Choose a date" }).getByRole("radio", { disabled: false }).first();
    await day.locator("xpath=ancestor::label").click();
    const time = dialog.getByRole("group", { name: "Choose a time" }).getByRole("radio").first();
    await time.locator("xpath=ancestor::label").click();
    await dialog.getByRole("button", { name: "Next" }).click();

    // 2. guests, 3. who is coming (a phone number with its country code is needed)
    await expect(dialog.getByText("Step 2 of 5")).toBeVisible();
    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(dialog.getByText("Step 3 of 5")).toBeVisible();
    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(dialog.getByRole("alert").first()).toBeVisible(); // nothing is let through while the required fields are empty
    await dialog.getByRole("textbox", { name: "Full name" }).fill("Ava Tran");
    await dialog.getByRole("textbox", { name: "Email" }).fill("ava.e2e@example.test");
    await dialog.getByRole("combobox", { name: "Country" }).selectOption({ label: "Italy" });
    await dialog.getByRole("textbox", { name: "Phone / WhatsApp" }).fill("+39 333 123 4567");
    await dialog.getByRole("button", { name: "Next" }).click();

    // 4. the summary, and the agreement to the booking terms
    await expect(dialog.getByText("Step 4 of 5")).toBeVisible();
    await expect(dialog.getByText("Ava Tran · ava.e2e@example.test")).toBeVisible();
    await dialog.getByRole("button", { name: "Confirm booking" }).click();
    await expect(dialog.getByText("You must agree to continue.")).toBeVisible(); // not without the agreement
    await dialog.getByRole("checkbox", { name: /I agree to the booking terms/ }).check();
    await dialog.getByRole("button", { name: "Confirm booking" }).click();

    // 5. the code that was sent to the email (in the sample data it is always the same, and nothing is sent)
    await expect(dialog.getByText("Step 5 of 5")).toBeVisible();
    await dialog.getByRole("textbox", { name: "Verification code" }).fill(demoOtp());
    await dialog.getByRole("button", { name: "Verify and book" }).click();
    // the booking page: its code, what was booked, and the link of the email that confirms it
    await expect(page.getByRole("heading", { name: "Booking received", level: 1 })).toBeVisible();
    const code = (await page.getByRole("region", { name: "Booking code" }).getByRole("paragraph").last().textContent())!.trim();
    expect(code).toMatch(/^SES-\d{4}-\d{3}$/);
    await expect(page.getByText("Fresh Pasta from Scratch").first()).toBeVisible();
    await expect(page.getByText("Pay at the studio")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Please confirm your booking" })).toBeVisible();

    // until the guest opens the link of the email the booking is not confirmed; opening it confirms it
    // (the sample data shows the link of the email on the page in development only; in production nobody but the mailbox has it)
    const demoLink = page.getByRole("link", { name: "open the link of the email" });
    if (await demoLink.isVisible()) {
      await demoLink.click();
      await expect(page.getByText(/confirmed/i).first()).toBeVisible();
    }
    expect(problems).toEqual([]);
  });
});
