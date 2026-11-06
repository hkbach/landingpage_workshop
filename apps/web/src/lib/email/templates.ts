// The emails the platform sends to a guest. Every email holds the SAME message in six languages, one after the other (English, Vietnamese, Thai,
// Chinese, Korean, Japanese): the reader scrolls to the language they read. Nothing is detected (no country, no browser language, no language saved on
// the customer), so the email is the same for everybody. Pure: the same data always gives the same email. TODO(api): the worker renders these when it
// sends the outbox event.
import { formatMoney, type SessionCloseReason } from "@workshop/shared";

export const EMAIL_LANGS = ["en", "vi", "th", "zh", "ko", "ja"] as const;
export type EmailLang = (typeof EMAIL_LANGS)[number];

/** The language names, each written in its own language (the headings of the sections). */
export const EMAIL_LANG_NAMES: Record<EmailLang, string> = { en: "English", vi: "Tiếng Việt", th: "ภาษาไทย", zh: "中文", ko: "한국어", ja: "日本語" };

// Locale tags used to write dates and money. Thai is written with the Gregorian year (the default Thai calendar would write 2569 for 2026).
const TAG: Record<EmailLang, string> = { en: "en", vi: "vi", th: "th-u-ca-gregory", zh: "zh", ko: "ko", ja: "ja" };

export interface RenderedEmail { subject: string; text: string; html: string }

interface Row { label: string; value: string }
interface Section { lang: EmailLang; subject: string; greeting: string; paragraphs: string[]; rows: Row[]; button?: { label: string; url: string }; fallback?: string; footer: string }

const dateTime = (iso: string, timeZone: string, lang: EmailLang) => new Intl.DateTimeFormat(TAG[lang], { dateStyle: "full", timeStyle: "short", timeZone }).format(new Date(iso));
const range = (a: string, b: string, timeZone: string, lang: EmailLang) =>
  `${dateTime(a, timeZone, lang)} – ${new Intl.DateTimeFormat(TAG[lang], { timeStyle: "short", timeZone }).format(new Date(b))} (${timeZone})`;

const fill = (text: string, vars: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// ---- the words, by language ----------------------------------------------------------------------------------------------------------

type Words = Record<EmailLang, string>;
const w = (en: string, vi: string, th: string, zh: string, ko: string, ja: string): Words => ({ en, vi, th, zh, ko, ja });

const REASON: Record<Exclude<SessionCloseReason["code"], "OTHER">, Words> = {
  NOT_ENOUGH_GUESTS: w("Not enough guests", "Chưa đủ khách", "ผู้เข้าร่วมไม่เพียงพอ", "报名人数不足", "인원 부족", "参加者が不足"),
  INSTRUCTOR_UNAVAILABLE: w("The instructor is not available", "Giảng viên không thể tham gia", "ผู้สอนไม่สะดวก", "讲师无法到场", "강사 사정", "講師の都合"),
  VENUE_ISSUE: w("Studio or venue problem", "Sự cố studio hoặc địa điểm", "ปัญหาของสตูดิโอหรือสถานที่", "工作室或场地出现问题", "스튜디오 또는 장소 문제", "スタジオまたは会場の問題"),
  SCHEDULE_CHANGE: w("Schedule changed", "Lịch thay đổi", "ตารางเวลาเปลี่ยนแปลง", "日程变更", "일정 변경", "スケジュールの変更"),
  WORKSHOP_COMPLETED: w("The workshop has been completed", "Buổi workshop đã hoàn thành", "เวิร์กช็อปเสร็จสิ้นแล้ว", "工作坊已完成", "워크숍이 완료됨", "ワークショップが完了"),
};
/** The reason in a language; the explanation of "Other" is the text the shop typed, so it is not translated. */
const reasonText = (reason: SessionCloseReason, lang: EmailLang) => (reason.code === "OTHER" ? (reason.note ?? "") : REASON[reason.code][lang]);

const L = {
  hello: w("Hello {name},", "Xin chào {name},", "สวัสดีคุณ {name}", "{name}，您好：", "{name}님, 안녕하세요.", "{name} 様"),
  code: w("Booking code", "Mã booking", "รหัสการจอง", "预订编号", "예약 번호", "予約番号"),
  workshop: w("Workshop", "Workshop", "เวิร์กช็อป", "工作坊", "워크숍", "ワークショップ"),
  when: w("Date and time", "Ngày giờ", "วันและเวลา", "日期和时间", "날짜 및 시간", "日時"),
  where: w("Where", "Địa điểm", "สถานที่", "地点", "장소", "場所"),
  addressNote: w("Address note", "Ghi chú địa chỉ", "หมายเหตุสถานที่", "地址备注", "주소 메모", "住所メモ"),
  guests: w("Guests", "Số khách", "จำนวนผู้เข้าร่วม", "人数", "인원", "人数"),
  total: w("Total (pay at the studio)", "Tổng tiền (thanh toán tại studio)", "ยอดรวม (ชำระที่สตูดิโอ)", "总价（到工作室支付）", "합계(스튜디오에서 결제)", "合計（スタジオでお支払い）"),
  reason: w("Reason", "Lý do", "เหตุผล", "原因", "사유", "理由"),
  languages: w("This email is written in six languages. Scroll down to read it in yours:", "Email này có sáu ngôn ngữ. Hãy cuộn xuống để đọc bằng ngôn ngữ của bạn:", "อีเมลนี้มีหกภาษา เลื่อนลงเพื่ออ่านในภาษาของคุณ:", "本邮件包含六种语言，请向下滚动阅读您的语言版本：", "이 이메일은 여섯 가지 언어로 작성되었습니다. 아래로 스크롤하여 원하는 언어로 읽어 보세요:", "このメールは6つの言語で書かれています。下へスクロールしてお読みください："),
};

// ---- the emails ------------------------------------------------------------------------------------------------------------------------

export interface BookingConfirmationData {
  guestName: string; shopName: string; bookingCode: string; workshopTitle: string; startsAt: string; endsAt: string; timezone: string;
  quantity: number; totalAmount: number; currency: string; confirmUrl: string;
  /** Where the workshop takes place (its own address, or the shop's); left out of the email when not given. */
  address?: string;
  /** The note the shop owner wrote about the address; left out of the email when not given. */
  addressNote?: string;
}

/** The email sent when a guest has booked: the booking and the link that confirms it. */
export function renderBookingConfirmation(d: BookingConfirmationData): RenderedEmail {
  const T = {
    subject: w("Please confirm your booking {code}", "Vui lòng xác nhận booking {code}", "โปรดยืนยันการจอง {code}", "请确认您的预订 {code}", "예약 {code}을(를) 확인해 주세요", "ご予約 {code} の確認をお願いします"),
    intro: w(
      "Thank you for booking at {shop}. Please confirm your booking with the button below; until you do, it stays unconfirmed.",
      "Cảm ơn bạn đã đặt chỗ tại {shop}. Vui lòng xác nhận booking bằng nút bên dưới; cho đến khi bạn xác nhận, booking vẫn ở trạng thái chưa xác nhận.",
      "ขอบคุณที่จองกับ {shop} โปรดยืนยันการจองด้วยปุ่มด้านล่าง การจองจะยังไม่ได้รับการยืนยันจนกว่าคุณจะกดยืนยัน",
      "感谢您在 {shop} 预订。请点击下方按钮确认预订；在您确认之前，预订处于未确认状态。",
      "{shop}에 예약해 주셔서 감사합니다. 아래 버튼으로 예약을 확인해 주세요. 확인하기 전까지 예약은 확인되지 않은 상태로 유지됩니다.",
      "{shop}にご予約いただきありがとうございます。下のボタンでご予約を確認してください。確認いただくまで、ご予約は未確認の状態です。",
    ),
    button: w("Confirm my booking", "Xác nhận booking", "ยืนยันการจองของฉัน", "确认我的预订", "내 예약 확인", "予約を確認する"),
    fallback: w("If the button does not work, copy this link into your browser:", "Nếu nút không hoạt động, hãy sao chép đường link này vào trình duyệt:", "หากปุ่มใช้งานไม่ได้ ให้คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:", "如果按钮无法使用，请将此链接复制到浏览器中：", "버튼이 작동하지 않으면 이 링크를 브라우저에 복사해 붙여넣으세요:", "ボタンが使えない場合は、次のリンクをブラウザーにコピーしてください："),
    footer: w("If you did not make this booking, you can ignore this email.", "Nếu bạn không thực hiện booking này, bạn có thể bỏ qua email này.", "หากคุณไม่ได้เป็นผู้จองนี้ สามารถละเว้นอีเมลฉบับนี้ได้", "如果这不是您本人的预订，请忽略此邮件。", "본인이 한 예약이 아니라면 이 이메일을 무시하셔도 됩니다.", "このご予約に心当たりがない場合は、このメールを無視してください。"),
  };
  return compose(EMAIL_LANGS.map((lang): Section => ({
    lang, subject: fill(T.subject[lang], { code: d.bookingCode }),
    greeting: fill(L.hello[lang], { name: d.guestName }),
    paragraphs: [fill(T.intro[lang], { shop: d.shopName })],
    rows: [
      { label: L.code[lang], value: d.bookingCode }, { label: L.workshop[lang], value: d.workshopTitle },
      { label: L.when[lang], value: range(d.startsAt, d.endsAt, d.timezone, lang) }, ...(d.address ? [{ label: L.where[lang], value: d.address }] : []), ...(d.addressNote ? [{ label: L.addressNote[lang], value: d.addressNote }] : []), { label: L.guests[lang], value: String(d.quantity) },
      { label: L.total[lang], value: formatMoney(d.totalAmount, d.currency, TAG[lang]) },
    ],
    button: { label: T.button[lang], url: d.confirmUrl }, fallback: T.fallback[lang], footer: T.footer[lang],
  })));
}

export type BookingInfoData = Omit<BookingConfirmationData, "confirmUrl">;

/** The email sent to a guest the shop booked (walk-in, phone): the booking is already confirmed, so it only holds the details. */
export function renderBookingInfo(d: BookingInfoData): RenderedEmail {
  const T = {
    subject: w("Your booking {code} is confirmed", "Booking {code} của bạn đã được xác nhận", "การจอง {code} ของคุณได้รับการยืนยันแล้ว", "您的预订 {code} 已确认", "예약 {code}이(가) 확정되었습니다", "ご予約 {code} が確定しました"),
    intro: w(
      "Thank you for booking at {shop}. {shop} has recorded your booking for you, so there is nothing more to confirm. The details are below.",
      "Cảm ơn bạn đã đặt chỗ tại {shop}. {shop} đã ghi nhận booking cho bạn nên bạn không cần xác nhận thêm. Thông tin chi tiết ở bên dưới.",
      "ขอบคุณที่จองกับ {shop} ทางร้านได้บันทึกการจองให้คุณแล้ว จึงไม่ต้องยืนยันเพิ่มเติม รายละเอียดอยู่ด้านล่าง",
      "感谢您在 {shop} 预订。{shop} 已为您登记预订，无需再次确认。详情如下。",
      "{shop}에 예약해 주셔서 감사합니다. {shop}에서 예약을 대신 등록했으므로 추가 확인은 필요하지 않습니다. 자세한 내용은 아래와 같습니다.",
      "{shop}にご予約いただきありがとうございます。{shop}がご予約を登録しましたので、追加の確認は不要です。詳細は以下のとおりです。",
    ),
    footer: w("If anything looks wrong, please contact the studio.", "Nếu có sai sót, vui lòng liên hệ studio.", "หากมีสิ่งใดไม่ถูกต้อง โปรดติดต่อสตูดิโอ", "如有不符，请联系工作室。", "문제가 있으면 스튜디오로 문의해 주세요.", "誤りがある場合は、スタジオまでご連絡ください。"),
  };
  return compose(EMAIL_LANGS.map((lang): Section => ({
    lang, subject: fill(T.subject[lang], { code: d.bookingCode }), greeting: fill(L.hello[lang], { name: d.guestName }),
    paragraphs: [fill(T.intro[lang], { shop: d.shopName })],
    rows: [
      { label: L.code[lang], value: d.bookingCode }, { label: L.workshop[lang], value: d.workshopTitle },
      { label: L.when[lang], value: range(d.startsAt, d.endsAt, d.timezone, lang) }, ...(d.address ? [{ label: L.where[lang], value: d.address }] : []), ...(d.addressNote ? [{ label: L.addressNote[lang], value: d.addressNote }] : []), { label: L.guests[lang], value: String(d.quantity) },
      { label: L.total[lang], value: formatMoney(d.totalAmount, d.currency, TAG[lang]) },
    ],
    footer: T.footer[lang],
  })));
}

export interface BookingCancelledData {
  guestName: string; shopName: string; bookingCode: string; workshopTitle: string; startsAt: string; endsAt: string; timezone: string; quantity: number;
  /** True when the guest cancelled, false when the shop did. */
  byGuest: boolean;
  /** Why (the text of the shop, or the one the guest wrote): not translated. */
  reason?: string;
}

/** The email sent to the guest when a booking is cancelled: the guest cancelled it (a confirmation) or the shop did. */
export function renderBookingCancelled(d: BookingCancelledData): RenderedEmail {
  const T = {
    subject: w("Your booking {code} has been cancelled", "Booking {code} của bạn đã được hủy", "การจอง {code} ของคุณถูกยกเลิกแล้ว", "您的预订 {code} 已取消", "예약 {code}이(가) 취소되었습니다", "ご予約 {code} がキャンセルされました"),
    byGuest: w(
      "As you asked, your booking {code} for {workshop} at {shop} has been cancelled. The seats are free again.",
      "Theo yêu cầu của bạn, booking {code} cho {workshop} tại {shop} đã được hủy. Các chỗ đã được nhả lại.",
      "ตามที่คุณขอ การจอง {code} สำหรับ {workshop} ที่ {shop} ถูกยกเลิกแล้ว ที่นั่งว่างอีกครั้งแล้ว",
      "按您的要求，您在 {shop} 的预订 {code}（{workshop}）已取消，座位已重新开放。",
      "요청하신 대로 {shop}의 {workshop} 예약 {code}이(가) 취소되었습니다. 자리가 다시 비었습니다.",
      "ご依頼のとおり、{shop}の{workshop}のご予約 {code} をキャンセルしました。席は再び空きました。",
    ),
    byShop: w(
      "{shop} has cancelled your booking {code} for {workshop}.",
      "{shop} đã hủy booking {code} của bạn cho {workshop}.",
      "{shop} ได้ยกเลิกการจอง {code} ของคุณสำหรับ {workshop}",
      "{shop} 已取消您的预订 {code}（{workshop}）。",
      "{shop}에서 {workshop} 예약 {code}을(를) 취소했습니다.",
      "{shop}が{workshop}のご予約 {code} をキャンセルしました。",
    ),
    footer: w("If you did not expect this, please contact the studio.", "Nếu bạn không mong đợi điều này, vui lòng liên hệ studio.", "หากคุณไม่คาดคิดเรื่องนี้ โปรดติดต่อสตูดิโอ", "如果这不在您的预期之内，请联系工作室。", "예상하지 못한 일이라면 스튜디오로 문의해 주세요.", "心当たりがない場合は、スタジオまでご連絡ください。"),
  };
  return compose(EMAIL_LANGS.map((lang): Section => ({
    lang, subject: fill(T.subject[lang], { code: d.bookingCode }), greeting: fill(L.hello[lang], { name: d.guestName }),
    paragraphs: [fill((d.byGuest ? T.byGuest : T.byShop)[lang], { shop: d.shopName, code: d.bookingCode, workshop: d.workshopTitle })],
    rows: [
      { label: L.code[lang], value: d.bookingCode }, { label: L.workshop[lang], value: d.workshopTitle },
      { label: L.when[lang], value: range(d.startsAt, d.endsAt, d.timezone, lang) }, { label: L.guests[lang], value: String(d.quantity) },
      ...(d.reason ? [{ label: L.reason[lang], value: d.reason }] : []),
    ],
    footer: T.footer[lang],
  })));
}

export interface ShopBookingNoticeData {
  /** A guest booked (the booking is not confirmed until the guest opens the link), or a guest cancelled a booking. */
  kind: "CREATED" | "CANCELLED_BY_GUEST";
  shopName: string; guestName: string; guestEmail?: string; guestPhone?: string; bookingCode: string; workshopTitle: string; startsAt: string; endsAt: string; timezone: string;
  quantity: number; totalAmount: number; currency: string; reason?: string;
}

/** The email the shop receives when a guest books or cancels a booking. */
export function renderShopBookingNotice(d: ShopBookingNoticeData): RenderedEmail {
  const T = {
    created: w("New booking {code}", "Booking mới {code}", "การจองใหม่ {code}", "新预订 {code}", "새 예약 {code}", "新しい予約 {code}"),
    cancelled: w("Booking {code} was cancelled by the guest", "Booking {code} đã bị khách hủy", "การจอง {code} ถูกผู้จองยกเลิก", "预订 {code} 已被客人取消", "예약 {code}을(를) 손님이 취소했습니다", "ご予約 {code} がお客様によりキャンセルされました"),
    introCreated: w(
      "A guest booked a workshop at {shop}. The booking is not confirmed until the guest opens the link in the email.",
      "Có khách vừa đặt chỗ tại {shop}. Booking chưa được xác nhận cho đến khi khách bấm link trong email.",
      "มีผู้จองเวิร์กช็อปที่ {shop} การจองจะยังไม่ได้รับการยืนยันจนกว่าผู้จองจะเปิดลิงก์ในอีเมล",
      "有客人在 {shop} 预订了工作坊。在客人打开邮件中的链接之前，预订处于未确认状态。",
      "{shop}에 손님이 예약했습니다. 손님이 이메일의 링크를 열 때까지 예약은 확인되지 않은 상태입니다.",
      "{shop}にお客様のご予約が入りました。お客様がメールのリンクを開くまで、ご予約は未確認の状態です。",
    ),
    introCancelled: w(
      "A guest cancelled a booking at {shop}. The seats are free again.",
      "Một khách đã hủy booking tại {shop}. Các chỗ đã được nhả lại.",
      "ผู้จองได้ยกเลิกการจองที่ {shop} ที่นั่งว่างอีกครั้งแล้ว",
      "有客人取消了在 {shop} 的预订，座位已重新开放。",
      "손님이 {shop}의 예약을 취소했습니다. 자리가 다시 비었습니다.",
      "お客様が{shop}のご予約をキャンセルしました。席は再び空きました。",
    ),
    guest: w("Guest", "Khách", "ผู้จอง", "客人", "손님", "お客様"),
    email: w("Email", "Email", "อีเมล", "邮箱", "이메일", "メールアドレス"),
    phone: w("Phone", "Điện thoại", "โทรศัพท์", "电话", "전화", "電話"),
    footer: w("You can see the booking in Bookings.", "Bạn có thể xem booking trong mục Bookings.", "คุณดูการจองได้ที่เมนู Bookings", "您可以在“Bookings”中查看该预订。", "Bookings에서 예약을 확인할 수 있습니다.", "予約は「Bookings」で確認できます。"),
  };
  const cancelled = d.kind === "CANCELLED_BY_GUEST";
  return compose(EMAIL_LANGS.map((lang): Section => ({
    lang, subject: fill((cancelled ? T.cancelled : T.created)[lang], { code: d.bookingCode }), greeting: fill(L.hello[lang], { name: d.shopName }),
    paragraphs: [fill((cancelled ? T.introCancelled : T.introCreated)[lang], { shop: d.shopName })],
    rows: [
      { label: L.code[lang], value: d.bookingCode }, { label: T.guest[lang], value: d.guestName },
      ...(d.guestEmail ? [{ label: T.email[lang], value: d.guestEmail }] : []), ...(d.guestPhone ? [{ label: T.phone[lang], value: d.guestPhone }] : []),
      { label: L.workshop[lang], value: d.workshopTitle }, { label: L.when[lang], value: range(d.startsAt, d.endsAt, d.timezone, lang) },
      { label: L.guests[lang], value: String(d.quantity) }, { label: L.total[lang], value: formatMoney(d.totalAmount, d.currency, TAG[lang]) },
      ...(d.reason ? [{ label: L.reason[lang], value: d.reason }] : []),
    ],
    footer: T.footer[lang],
  })));
}

export interface PaymentReceivedData {
  guestName: string; shopName: string; bookingCode: string; workshopTitle: string; startsAt: string; endsAt: string; timezone: string;
  quantity: number; totalAmount: number; currency: string;
}

/** The email sent when the shop confirms the payment of a booking (it became Paid): a receipt for the guest. */
export function renderPaymentReceived(d: PaymentReceivedData): RenderedEmail {
  const T = {
    subject: w("Payment received for booking {code}", "Đã nhận thanh toán cho booking {code}", "ได้รับการชำระเงินสำหรับการจอง {code} แล้ว", "已收到预订 {code} 的付款", "예약 {code} 결제가 완료되었습니다", "ご予約 {code} のお支払いを確認しました"),
    intro: w(
      "Thank you! {shop} has received your payment for booking {code} ({workshop}). Your booking is now paid.",
      "Cảm ơn bạn! {shop} đã nhận được thanh toán cho booking {code} ({workshop}). Booking của bạn đã được thanh toán.",
      "ขอบคุณ {shop} ได้รับการชำระเงินสำหรับการจอง {code} ({workshop}) แล้ว การจองของคุณชำระเงินเรียบร้อยแล้ว",
      "感谢您！{shop} 已收到您的预订 {code}（{workshop}）的付款，您的预订现已付款。",
      "감사합니다! {shop}에서 예약 {code}({workshop})의 결제를 확인했습니다. 예약이 결제 완료 상태입니다.",
      "ありがとうございます。{shop}は、ご予約 {code}（{workshop}）のお支払いを確認しました。ご予約は支払い済みです。",
    ),
    paid: w("Amount paid", "Số tiền đã thanh toán", "จำนวนเงินที่ชำระ", "已付金额", "결제 금액", "お支払い金額"),
    footer: w(
      "Please keep this email as your receipt. If anything looks wrong, contact the studio.",
      "Hãy giữ email này làm biên nhận. Nếu có sai sót, vui lòng liên hệ studio.",
      "โปรดเก็บอีเมลนี้ไว้เป็นหลักฐานการชำระเงิน หากมีสิ่งใดไม่ถูกต้อง โปรดติดต่อสตูดิโอ",
      "请保留此邮件作为付款凭证。如有疑问，请联系工作室。",
      "이 이메일을 영수증으로 보관해 주세요. 문제가 있으면 스튜디오로 문의해 주세요.",
      "このメールは領収の控えとして保管してください。誤りがある場合はスタジオまでご連絡ください。",
    ),
  };
  return compose(EMAIL_LANGS.map((lang): Section => ({
    lang, subject: fill(T.subject[lang], { code: d.bookingCode }), greeting: fill(L.hello[lang], { name: d.guestName }),
    paragraphs: [fill(T.intro[lang], { shop: d.shopName, code: d.bookingCode, workshop: d.workshopTitle })],
    rows: [
      { label: L.code[lang], value: d.bookingCode }, { label: L.workshop[lang], value: d.workshopTitle },
      { label: L.when[lang], value: range(d.startsAt, d.endsAt, d.timezone, lang) }, { label: L.guests[lang], value: String(d.quantity) },
      { label: T.paid[lang], value: formatMoney(d.totalAmount, d.currency, TAG[lang]) },
    ],
    footer: T.footer[lang],
  })));
}

export interface SessionRescheduledData {
  guestName: string; shopName: string; bookingCode: string; workshopTitle: string; timezone: string;
  oldStartsAt: string; newStartsAt: string; newEndsAt: string; reason: SessionCloseReason;
}

/** The email sent when the shop moves a session: the old and the new time, and why. */
export function renderSessionRescheduled(d: SessionRescheduledData): RenderedEmail {
  const T = {
    subject: w("Your session has been rescheduled ({code})", "Session của bạn đã được đổi lịch ({code})", "เซสชันของคุณถูกเลื่อนเวลา ({code})", "您的场次已改期（{code}）", "세션 일정이 변경되었습니다 ({code})", "セッションの日程が変更されました（{code}）"),
    intro: w(
      "{shop} has moved your session. Your booking {code} for {workshop} now takes place at the new time below.",
      "{shop} đã đổi lịch session của bạn. Booking {code} cho {workshop} sẽ diễn ra vào thời gian mới bên dưới.",
      "{shop} ได้เปลี่ยนเวลาเซสชันของคุณ การจอง {code} สำหรับ {workshop} จะจัดขึ้นในเวลาใหม่ด้านล่าง",
      "{shop} 已更改您的场次时间。您的预订 {code}（{workshop}）将在下方的新时间举行。",
      "{shop}에서 세션 일정을 변경했습니다. {workshop} 예약 {code}은(는) 아래의 새 시간에 진행됩니다.",
      "{shop}がセッションの日程を変更しました。{workshop}のご予約 {code} は、下記の新しい日時に開催されます。",
    ),
    before: w("Previous time", "Thời gian cũ", "เวลาเดิม", "原时间", "이전 일정", "変更前の日時"),
    after: w("New time", "Thời gian mới", "เวลาใหม่", "新时间", "새 일정", "変更後の日時"),
    footer: w("If the new time does not suit you, please contact the studio.", "Nếu thời gian mới không phù hợp, vui lòng liên hệ studio.", "หากเวลาใหม่ไม่สะดวก โปรดติดต่อสตูดิโอ", "如果新的时间不方便，请联系工作室。", "새 일정이 맞지 않으시면 스튜디오로 문의해 주세요.", "新しい日時が合わない場合は、スタジオまでご連絡ください。"),
  };
  return compose(EMAIL_LANGS.map((lang): Section => ({
    lang, subject: fill(T.subject[lang], { code: d.bookingCode }), greeting: fill(L.hello[lang], { name: d.guestName }),
    paragraphs: [fill(T.intro[lang], { shop: d.shopName, code: d.bookingCode, workshop: d.workshopTitle })],
    rows: [
      { label: T.before[lang], value: `${dateTime(d.oldStartsAt, d.timezone, lang)} (${d.timezone})` },
      { label: T.after[lang], value: range(d.newStartsAt, d.newEndsAt, d.timezone, lang) },
      { label: L.reason[lang], value: reasonText(d.reason, lang) },
    ],
    footer: T.footer[lang],
  })));
}

export interface SessionClosedData {
  guestName: string; shopName: string; bookingCode: string; workshopTitle: string; timezone: string; startsAt: string; endsAt: string;
  /** Set when the owner or an administrator closed the session; missing when the system closed it because its time ended. */
  reason?: SessionCloseReason;
}

/** The email sent when a session is closed (by the shop, an administrator or the system when its time ended). */
export function renderSessionClosed(d: SessionClosedData): RenderedEmail {
  const T = {
    subject: w("Your session has been closed ({code})", "Session của bạn đã bị đóng ({code})", "เซสชันของคุณถูกปิด ({code})", "您的场次已关闭（{code}）", "세션이 닫혔습니다 ({code})", "セッションがクローズされました（{code}）"),
    intro: w(
      "{shop} has closed the session of your booking {code} for {workshop}. It will not take place.",
      "{shop} đã đóng session của booking {code} cho {workshop}. Session sẽ không diễn ra.",
      "{shop} ได้ปิดเซสชันของการจอง {code} สำหรับ {workshop} เซสชันนี้จะไม่จัดขึ้น",
      "{shop} 已关闭您的预订 {code}（{workshop}）所属的场次，该场次将不会举行。",
      "{shop}에서 {workshop} 예약 {code}의 세션을 닫았습니다. 이 세션은 진행되지 않습니다.",
      "{shop}が{workshop}のご予約 {code} のセッションをクローズしました。このセッションは開催されません。",
    ),
    introDone: w(
      "{shop} has closed the session of your booking {code} for {workshop}: the workshop has been completed. Thank you for joining us!",
      "{shop} đã đóng session của booking {code} cho {workshop}: buổi workshop đã hoàn thành. Cảm ơn bạn đã tham gia!",
      "{shop} ได้ปิดเซสชันของการจอง {code} สำหรับ {workshop} เนื่องจากเวิร์กช็อปเสร็จสิ้นแล้ว ขอบคุณที่เข้าร่วม",
      "{shop} 已关闭您的预订 {code}（{workshop}）所属的场次：工作坊已完成。感谢您的参与！",
      "{shop}에서 {workshop} 예약 {code}의 세션을 닫았습니다. 워크숍이 완료되었습니다. 참여해 주셔서 감사합니다!",
      "{shop}が{workshop}のご予約 {code} のセッションをクローズしました。ワークショップは完了しました。ご参加ありがとうございました！",
    ),
    introAuto: w(
      "The session of your booking {code} for {workshop} at {shop} has been closed because its time has ended.",
      "Session của booking {code} cho {workshop} tại {shop} đã được đóng vì đã hết thời gian tổ chức.",
      "เซสชันของการจอง {code} สำหรับ {workshop} ที่ {shop} ถูกปิดเนื่องจากหมดเวลาจัดกิจกรรมแล้ว",
      "您在 {shop} 的预订 {code}（{workshop}）所属的场次因举办时间已结束而被关闭。",
      "{shop}의 {workshop} 예약 {code}의 세션이 진행 시간이 끝나 닫혔습니다.",
      "{shop}の{workshop}のご予約 {code} のセッションは、開催時間が終了したためクローズされました。",
    ),
    time: w("Session time", "Thời gian session", "เวลาเซสชัน", "场次时间", "세션 시간", "セッション時間"),
    autoReason: w("The session time has ended.", "Session đã hết thời gian tổ chức.", "หมดเวลาจัดเซสชันแล้ว", "场次举办时间已结束。", "세션 진행 시간이 종료되었습니다.", "セッションの開催時間が終了しました。"),
    footer: w("Please contact the studio if you have questions.", "Nếu có thắc mắc, vui lòng liên hệ studio.", "หากมีคำถาม โปรดติดต่อสตูดิโอ", "如有疑问，请联系工作室。", "문의 사항은 스튜디오로 연락해 주세요.", "ご不明な点はスタジオまでお問い合わせください。"),
  };
  return compose(EMAIL_LANGS.map((lang): Section => ({
    lang, subject: fill(T.subject[lang], { code: d.bookingCode }), greeting: fill(L.hello[lang], { name: d.guestName }),
    paragraphs: [fill((d.reason ? (d.reason.code === "WORKSHOP_COMPLETED" ? T.introDone : T.intro) : T.introAuto)[lang], { shop: d.shopName, code: d.bookingCode, workshop: d.workshopTitle })],
    rows: [
      { label: T.time[lang], value: range(d.startsAt, d.endsAt, d.timezone, lang) },
      { label: L.reason[lang], value: d.reason ? reasonText(d.reason, lang) : T.autoReason[lang] },
    ],
    footer: T.footer[lang],
  })));
}

// ---- layout ---------------------------------------------------------------------------------------------------------------------------

/** The six sections one after the other. The subject is the six subjects on one line. */
function compose(sections: Section[]): RenderedEmail {
  const subject = sections.map((s) => s.subject).join(" | ");
  const names = EMAIL_LANGS.map((l) => EMAIL_LANG_NAMES[l]).join(" · ");

  const text = [
    `${L.languages.en} ${names}`, "",
    ...sections.flatMap((s) => [
      `==== ${EMAIL_LANG_NAMES[s.lang]} ====`, s.subject, "", s.greeting, "", ...s.paragraphs, "",
      ...s.rows.map((r) => `${r.label}: ${r.value}`),
      ...(s.button ? ["", `${s.button.label}: ${s.button.url}`] : []), "", s.footer, "",
    ]),
  ].join("\n");

  const block = (s: Section) => `
    <section lang="${s.lang === "zh" ? "zh-Hans" : s.lang}" id="lang-${s.lang}" style="margin:0 0 28px;padding:20px;border:1px solid #e4e4e7;border-radius:12px;background:#ffffff">
      <p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#52525b">${esc(EMAIL_LANG_NAMES[s.lang])}</p>
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.35;color:#18181b">${esc(s.subject)}</h2>
      <p style="margin:0 0 8px;font-size:15px;color:#27272a">${esc(s.greeting)}</p>
      ${s.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#27272a">${esc(p)}</p>`).join("")}
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:14px">
        ${s.rows.map((r) => `<tr><td style="padding:6px 12px 6px 0;vertical-align:top;color:#52525b;white-space:nowrap">${esc(r.label)}</td><td style="padding:6px 0;color:#18181b;font-weight:600">${esc(r.value)}</td></tr>`).join("")}
      </table>
      ${s.button ? `<p style="margin:0 0 12px"><a href="${esc(s.button.url)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#18181b;color:#ffffff;font-weight:700;text-decoration:none">${esc(s.button.label)}</a></p>
      <p style="margin:0 0 14px;font-size:12px;color:#52525b;word-break:break-all">${esc(s.fallback ?? "")}<br><a href="${esc(s.button.url)}" style="color:#1d4ed8">${esc(s.button.url)}</a></p>` : ""}
      <p style="margin:0;font-size:13px;color:#52525b">${esc(s.footer)}</p>
    </section>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:#f4f4f5;font-family:-apple-system,'Segoe UI',Roboto,'Noto Sans','Noto Sans Thai','Noto Sans SC','Noto Sans KR','Noto Sans JP',Arial,sans-serif">
  <div style="max-width:620px;margin:0 auto">
    <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#3f3f46">${EMAIL_LANGS.map((l) => esc(L.languages[l])).join("<br>")}<br>
      ${EMAIL_LANGS.map((l) => `<a href="#lang-${l}" style="color:#1d4ed8">${esc(EMAIL_LANG_NAMES[l])}</a>`).join(" · ")}</p>
    ${sections.map(block).join("\n")}
  </div>
</body></html>`;

  return { subject, text, html };
}

export interface PasswordResetData {
  name: string; accountEmail: string;
  /** The password the administrator's reset gave: the page of the link asks for it. */
  tempPassword: string;
  /** The page where the person chooses a new password (it holds the secret of the reset). */
  resetUrl: string;
  /** When the temporary password and the link stop working (ISO). */
  expiresAt: string;
}

/**
 * The email sent when an administrator resets the password of an account: the account is deactivated until the person opens the link, gives the temporary password and
 * chooses a new one. The temporary password is only valid once, for a few days, and is useless without the link.
 */
export function renderPasswordReset(d: PasswordResetData): RenderedEmail {
  const T = {
    subject: w("Choose a new password for your account", "Đặt mật khẩu mới cho tài khoản của bạn", "ตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ", "为您的账户设置新密码", "계정의 새 비밀번호를 설정하세요", "アカウントの新しいパスワードを設定してください"),
    intro: w(
      "An administrator has reset the password of your account. Your account is deactivated until you choose a new password. Open the link below, enter the temporary password from this email, then choose and confirm a new password.",
      "Quản trị viên đã đặt lại mật khẩu của tài khoản bạn. Tài khoản của bạn bị vô hiệu hóa cho đến khi bạn đặt mật khẩu mới. Hãy mở liên kết bên dưới, nhập mật khẩu tạm thời trong email này, rồi đặt và xác nhận mật khẩu mới.",
      "ผู้ดูแลระบบได้รีเซ็ตรหัสผ่านของบัญชีคุณ บัญชีของคุณจะถูกปิดใช้งานจนกว่าคุณจะตั้งรหัสผ่านใหม่ โปรดเปิดลิงก์ด้านล่าง กรอกรหัสผ่านชั่วคราวจากอีเมลนี้ แล้วตั้งและยืนยันรหัสผ่านใหม่",
      "管理员已重置您账户的密码。在您设置新密码之前，账户处于停用状态。请打开下方链接，输入本邮件中的临时密码，然后设置并确认新密码。",
      "관리자가 계정의 비밀번호를 재설정했습니다. 새 비밀번호를 설정할 때까지 계정은 비활성화됩니다. 아래 링크를 열어 이 이메일의 임시 비밀번호를 입력한 뒤 새 비밀번호를 설정하고 확인해 주세요.",
      "管理者がアカウントのパスワードをリセットしました。新しいパスワードを設定するまで、アカウントは無効です。下のリンクを開き、このメールの一時パスワードを入力して、新しいパスワードを設定・確認してください。",
    ),
    account: w("Account", "Tài khoản", "บัญชี", "账户", "계정", "アカウント"),
    temp: w("Temporary password", "Mật khẩu tạm thời", "รหัสผ่านชั่วคราว", "临时密码", "임시 비밀번호", "一時パスワード"),
    until: w("Valid until", "Có hiệu lực đến", "ใช้ได้ถึง", "有效期至", "유효 기간", "有効期限"),
    button: w("Choose a new password", "Đặt mật khẩu mới", "ตั้งรหัสผ่านใหม่", "设置新密码", "새 비밀번호 설정", "新しいパスワードを設定"),
    fallback: w("If the button does not work, copy this link into your browser:", "Nếu nút không hoạt động, hãy sao chép đường link này vào trình duyệt:", "หากปุ่มใช้งานไม่ได้ ให้คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:", "如果按钮无法使用，请将此链接复制到浏览器：", "버튼이 작동하지 않으면 이 링크를 브라우저에 복사하세요:", "ボタンが使えない場合は、このリンクをブラウザにコピーしてください："),
    footer: w(
      "The temporary password and the link work once and stop working after the date above. If you did not expect this email, contact the support of the platform.",
      "Mật khẩu tạm thời và liên kết chỉ dùng được một lần và hết hiệu lực sau thời điểm trên. Nếu bạn không mong đợi email này, hãy liên hệ bộ phận hỗ trợ của nền tảng.",
      "รหัสผ่านชั่วคราวและลิงก์ใช้ได้เพียงครั้งเดียวและจะหมดอายุหลังวันที่ด้านบน หากคุณไม่ได้คาดหวังอีเมลนี้ โปรดติดต่อฝ่ายสนับสนุนของแพลตฟอร์ม",
      "临时密码和链接仅可使用一次，并在上述日期后失效。如果您并未预期收到此邮件，请联系平台支持。",
      "임시 비밀번호와 링크는 한 번만 사용할 수 있으며 위 날짜 이후에는 사용할 수 없습니다. 이 이메일을 예상하지 못했다면 플랫폼 지원팀에 문의해 주세요.",
      "一時パスワードとリンクは一度だけ使え、上記の日付を過ぎると使えなくなります。このメールに心当たりがない場合は、プラットフォームのサポートにご連絡ください。",
    ),
  };
  return compose(EMAIL_LANGS.map((lang): Section => ({
    lang, subject: T.subject[lang], greeting: fill(L.hello[lang], { name: d.name }), paragraphs: [T.intro[lang]],
    rows: [
      { label: T.account[lang], value: d.accountEmail }, { label: T.temp[lang], value: d.tempPassword },
      { label: T.until[lang], value: dateTime(d.expiresAt, "UTC", lang) },
    ],
    button: { label: T.button[lang], url: d.resetUrl }, fallback: T.fallback[lang], footer: T.footer[lang],
  })));
}
