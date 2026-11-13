import { describe, expect, it } from "vitest";
import { EMAIL_LANGS, EMAIL_LANG_NAMES, renderBookingConfirmation, renderBookingInfo, renderPaymentReceived, renderSessionClosed, renderSessionRescheduled, type BookingConfirmationData } from "./booking-emails";

// An email holds the same message in six languages, one after the other; nothing about the recipient chooses the language.

const BOOKING: BookingConfirmationData = {
  guestName: "Tran Binh", shopName: "Clay & Co Studio", bookingCode: "SES-0007-001", workshopTitle: "Pottery <Wheel> Basics",
  startsAt: "2026-11-07T02:00:00Z", endsAt: "2026-11-07T04:00:00Z", timezone: "Asia/Ho_Chi_Minh", quantity: 2, totalAmount: 1_300_000, currency: "VND",
  confirmUrl: "http://whiskladle.localtest.me:3000/booking/confirm/abc-123",
};
const NAMES = ["English", "Tiếng Việt", "ภาษาไทย", "中文", "한국어", "日本語"];

describe("the languages of an email", () => {
  it("are English, Vietnamese, Thai, Chinese, Korean and Japanese, in that order", () => {
    expect([...EMAIL_LANGS]).toEqual(["en", "vi", "th", "zh", "ko", "ja"]);
    expect(EMAIL_LANGS.map((l) => EMAIL_LANG_NAMES[l])).toEqual(NAMES);
  });
});

describe("the booking confirmation email", () => {
  const mail = renderBookingConfirmation(BOOKING);
  it("has one section for each of the six languages, in order, each marked with its language", () => {
    const langs = [...mail.html.matchAll(/<section lang="([^"]+)"/g)].map((m) => m[1]);
    expect(langs).toEqual(["en", "vi", "th", "zh-Hans", "ko", "ja"]);
    let at = -1;
    for (const name of NAMES) {
      const i = mail.html.indexOf(`>${name}</p>`);
      expect(i, name).toBeGreaterThan(at);
      at = i;
    }
  });
  it("says the same thing in each language: the link and a button to confirm", () => {
    expect(mail.html.split('href="http://whiskladle.localtest.me:3000/booking/confirm/abc-123"').length - 1).toBe(12); // the button and the plain link, six times
    for (const label of ["Confirm my booking", "Xác nhận booking", "ยืนยันการจองของฉัน", "确认我的预订", "내 예약 확인", "予約を確認する"]) expect(mail.html, label).toContain(label);
  });
  it("greets the guest in each language", () => {
    for (const hello of ["Hello Tran Binh,", "Xin chào Tran Binh,", "สวัสดีคุณ Tran Binh", "Tran Binh，您好：", "Tran Binh님, 안녕하세요.", "Tran Binh 様"]) expect(mail.html, hello).toContain(hello);
  });
  it("puts the six subjects on one line", () => {
    expect(mail.subject.split(" | ")).toHaveLength(6);
    expect(mail.subject).toContain("Please confirm your booking SES-0007-001");
    expect(mail.subject).toContain("ご予約 SES-0007-001 の確認をお願いします");
  });
  it("writes the date in each language (Thai with the Gregorian year)", () => {
    expect(mail.html).toContain("Saturday, November 7, 2026");
    expect(mail.html).not.toContain("2569");
    expect(mail.html).toContain("2026");
  });
  it("escapes what the guest and the shop typed", () => {
    expect(mail.html).toContain("Pottery &lt;Wheel&gt; Basics");
    expect(mail.html).not.toContain("<Wheel>");
    const sneaky = renderBookingConfirmation({ ...BOOKING, guestName: '<img src=x onerror="alert(1)">' });
    expect(sneaky.html).not.toContain("<img");
    expect(sneaky.html).toContain("&lt;img");
  });
  it("is the same for everybody: nothing about the recipient changes it", () => {
    expect(renderBookingConfirmation({ ...BOOKING })).toEqual(mail);
  });
  it("has a plain-text version with the six languages too", () => {
    for (const name of NAMES) expect(mail.text, name).toContain(`==== ${name} ====`);
    expect(mail.text).toContain("http://whiskladle.localtest.me:3000/booking/confirm/abc-123");
  });
});

describe("where the workshop takes place, in the booking emails", () => {
  const ADDRESS = "88 Pasteur <Street>, District 3";
  const WHERE = ["Where", "Địa điểm", "สถานที่", "地点", "장소", "場所"];
  it("the confirmation and the information email give the address in each of the six languages, escaped", () => {
    const { confirmUrl: _url, ...info } = BOOKING;
    void _url;
    for (const mail of [renderBookingConfirmation({ ...BOOKING, address: ADDRESS }), renderBookingInfo({ ...info, address: ADDRESS })]) {
      expect(mail.html.split("88 Pasteur &lt;Street&gt;, District 3").length - 1).toBe(6);
      expect(mail.html).not.toContain("<Street>");
      for (const label of WHERE) expect(mail.html, label).toContain(label);
      expect(mail.text).toContain(ADDRESS);
    }
  });
  it("without an address there is no such line", () => {
    const mail = renderBookingConfirmation(BOOKING);
    expect(mail.html).not.toContain("Địa điểm");
    expect(mail.html).not.toContain("สถานที่");
  });
  it("the note about the address is a line of its own in each language, escaped, and only when there is one", () => {
    const NOTE = "Second floor <green door>\nPark on the left";
    const { confirmUrl: _url, ...info } = BOOKING;
    void _url;
    for (const mail of [renderBookingConfirmation({ ...BOOKING, address: ADDRESS, addressNote: NOTE }), renderBookingInfo({ ...info, address: ADDRESS, addressNote: NOTE })]) {
      expect(mail.html.split("Second floor &lt;green door&gt;").length - 1).toBe(6);
      expect(mail.html).not.toContain("<green door>");
      for (const label of ["Address note", "Ghi chú địa chỉ", "หมายเหตุสถานที่", "地址备注", "주소 메모", "住所メモ"]) expect(mail.html, label).toContain(label);
      expect(mail.text).toContain("Park on the left");
    }
    expect(renderBookingConfirmation({ ...BOOKING, address: ADDRESS }).html).not.toContain("Ghi chú địa chỉ");
  });
});

describe("the session emails", () => {
  const base = { guestName: "Binh", shopName: "Clay & Co", bookingCode: "SES-0001-001", workshopTitle: "Mug", timezone: "Asia/Ho_Chi_Minh" };
  it("re-schedule: six languages, the new date and the reason in each language", () => {
    const mail = renderSessionRescheduled({ ...base, oldStartsAt: "2026-11-07T02:00:00Z", newStartsAt: "2026-11-09T02:00:00Z", newEndsAt: "2026-11-09T04:00:00Z", reason: { code: "VENUE_ISSUE" } });
    expect([...mail.html.matchAll(/<section lang=/g)]).toHaveLength(6);
    for (const r of ["Studio or venue problem", "Sự cố studio hoặc địa điểm", "ปัญหาของสตูดิโอหรือสถานที่", "工作室或场地出现问题", "스튜디오 또는 장소 문제", "スタジオまたは会場の問題"]) expect(mail.html, r).toContain(r);
    expect(mail.html).toContain("Monday, November 9, 2026");
  });
  it("re-schedule with the reason Other: the text of the shop, as typed, in every language", () => {
    const mail = renderSessionRescheduled({ ...base, oldStartsAt: "2026-11-07T02:00:00Z", newStartsAt: "2026-11-09T02:00:00Z", newEndsAt: "2026-11-09T04:00:00Z", reason: { code: "OTHER", note: "The kiln broke" } });
    expect(mail.html.split("The kiln broke").length - 1).toBe(6);
  });
  it("closed by the shop: it will not take place, with the reason", () => {
    const mail = renderSessionClosed({ ...base, startsAt: "2026-11-07T02:00:00Z", endsAt: "2026-11-07T04:00:00Z", reason: { code: "NOT_ENOUGH_GUESTS" } });
    expect([...mail.html.matchAll(/<section lang=/g)]).toHaveLength(6);
    expect(mail.html).toContain("It will not take place.");
    expect(mail.html).toContain("Chưa đủ khách");
    expect(mail.html).toContain("参加者が不足");
  });
  it("closed by the system when its time ended: says so, and does not say it will not take place", () => {
    const mail = renderSessionClosed({ ...base, startsAt: "2026-11-01T02:00:00Z", endsAt: "2026-11-01T04:00:00Z" });
    expect(mail.html).toContain("has been closed because its time has ended.");
    expect(mail.html).not.toContain("It will not take place.");
    for (const r of ["The session time has ended.", "Session đã hết thời gian tổ chức.", "หมดเวลาจัดเซสชันแล้ว", "场次举办时间已结束。", "세션 진행 시간이 종료되었습니다.", "セッションの開催時間が終了しました。"]) expect(mail.html, r).toContain(r);
  });
});

describe("the payment received email", () => {
  const mail = renderPaymentReceived({ guestName: "Tran Binh", shopName: "Clay & Co Studio", bookingCode: "SES-0007-001", workshopTitle: "Pottery <Wheel> Basics", startsAt: "2026-11-07T02:00:00Z", endsAt: "2026-11-07T04:00:00Z", timezone: "Asia/Ho_Chi_Minh", quantity: 2, totalAmount: 1_300_000, currency: "VND" });
  it("is in the six languages, with the booking code and the amount paid", () => {
    expect([...mail.html.matchAll(/<section lang="([^"]+)"/g)].map((m) => m[1])).toEqual(["en", "vi", "th", "zh-Hans", "ko", "ja"]);
    expect(mail.subject.split(" | ")).toHaveLength(6);
    expect(mail.subject).toContain("Payment received for booking SES-0007-001");
    for (const label of ["Amount paid", "Số tiền đã thanh toán", "จำนวนเงินที่ชำระ", "已付金额", "결제 금액", "お支払い金額"]) expect(mail.html, label).toContain(label);
    expect(mail.html).toContain("₫1,300,000");
  });
  it("says the booking is paid, escapes the title and has no confirmation link", () => {
    expect(mail.html).toContain("Your booking is now paid.");
    expect(mail.html).toContain("Pottery &lt;Wheel&gt; Basics");
    expect(mail.html).not.toContain("<a href=\"http");
  });
});

describe("the booking information email (a booking the shop made)", () => {
  const mail = renderBookingInfo({ guestName: "Tran Binh", shopName: "Clay & Co Studio", bookingCode: "SES-0007-001", workshopTitle: "Pottery <Wheel> Basics", startsAt: "2026-11-07T02:00:00Z", endsAt: "2026-11-07T04:00:00Z", timezone: "Asia/Ho_Chi_Minh", quantity: 2, totalAmount: 1_300_000, currency: "VND" });
  it("is in the six languages with the details and the total to pay at the studio", () => {
    expect([...mail.html.matchAll(/<section lang="([^"]+)"/g)].map((m) => m[1])).toEqual(["en", "vi", "th", "zh-Hans", "ko", "ja"]);
    expect(mail.subject.split(" | ")).toHaveLength(6);
    expect(mail.subject).toContain("Your booking SES-0007-001 is confirmed");
    expect(mail.html).toContain("Total (pay at the studio)");
    expect(mail.html).toContain("₫1,300,000");
  });
  it("says there is nothing to confirm, has no button or link, and escapes the title", () => {
    expect(mail.html).toContain("there is nothing more to confirm");
    expect(mail.html).not.toContain("<a href=\"http");
    expect(mail.html).toContain("Pottery &lt;Wheel&gt; Basics");
  });
});
