// The words of the emails about an ACCOUNT in the five languages of the platform (en, vi, ko, ja, zh): verify the email, reset or change the password, the code of a booking, a notice of the
// administrator. Only OUR words are here: a message an administrator wrote is never translated. English is the fallback for any other value. The emails about a BOOKING hold six languages in one
// email and are written by @workshop/shared.
export const EMAIL_LOCALES = ["en", "vi", "ko", "ja", "zh"] as const;
export type EmailLocale = (typeof EMAIL_LOCALES)[number];

export const asEmailLocale = (v: unknown): EmailLocale => ((EMAIL_LOCALES as readonly string[]).includes(v as string) ? (v as EmailLocale) : "en");

/** The tag `Intl` needs to write a date and an amount of money the way a reader of that language expects. */
export const INTL_TAG: Record<EmailLocale, string> = { en: "en-GB", vi: "vi-VN", ko: "ko-KR", ja: "ja-JP", zh: "zh-CN" };

/** What changed, told to the owner of a shop after the administrator acted for them. */
export type EditKind = "SHOP_SETTINGS" | "WORKSHOP_ACTIVATED" | "WORKSHOP_DEACTIVATED" | "SESSION_CLOSED" | "SESSION_REOPENED" | "SESSION_MOVED" | "LANDING_PAGE_PUBLISHED";

export interface Msgs {
  hello(name: string): string;
  verify: { subject: string; textIntro: string; htmlIntro: string; button: string; note(hours: number): string };
  reset: { subject: string; textIntro: string; htmlIntro: string; button: string; note(hours: number): string };
  exists: { subject: string; intro: string; loginLabel: string; forgotLabel: string; forgotQuestion: string; resetLabel: string; ignore: string };
  changed: { subject: string; body: string };
  otp: { subject(code: string): string; text(shop: string, code: string): string; htmlIntro(shop: string): string; note(minutes: number): string };
  adminMessage: { subject: string };
  adminEdit: { subject(shop: string): string; body(what: string): string; reason: string; footer: string; what(kind: EditKind, detail: string): string };
}

const en: Msgs = {
  hello: (n) => `Hello ${n},`,
  verify: { subject: "Confirm your email", textIntro: "Confirm your email to finish creating your account:", htmlIntro: "Confirm your email to finish creating your account.", button: "Confirm email", note: (h) => `The link works for ${h} hours. If you did not sign up, ignore this email.` },
  reset: { subject: "Reset your password", textIntro: "Choose a new password here:", htmlIntro: "Choose a new password.", button: "Choose a new password", note: (h) => `The link works for ${h} hours and only once. If you did not ask for it, ignore this email: your password is unchanged.` },
  exists: { subject: "You already have an account", intro: "Someone tried to sign up with this email, but it already has an account.", loginLabel: "Log in", forgotLabel: "Forgot your password", forgotQuestion: "Forgot your password?", resetLabel: "Reset it", ignore: "If it was not you, ignore this email." },
  changed: { subject: "Your password was changed", body: "The password of your account was just changed and every device was logged out. If it was not you, reset your password at once." },
  otp: {
    subject: (c) => `Your booking code: ${c}`, text: (s, c) => `Your code to confirm a booking at ${s} is ${c}.`, htmlIntro: (s) => `Your code to confirm a booking at ${s} is:`,
    note: (m) => `It works for ${m} minutes. If you did not ask for it, ignore this email.`,
  },
  adminMessage: { subject: "A message from the platform" },
  adminEdit: {
    subject: (s) => `The platform changed your shop ${s}`, body: (w) => `A platform administrator changed ${w}.`, reason: "Reason", footer: "You can see and change it in your dashboard; the latest save wins.",
    what: (k, d) => ({
      SHOP_SETTINGS: `the settings of your shop (${d})`, WORKSHOP_ACTIVATED: `a workshop of your shop (${d}): it was activated`, WORKSHOP_DEACTIVATED: `a workshop of your shop (${d}): it was deactivated`,
      SESSION_CLOSED: `the session ${d} of your shop: it was closed`, SESSION_REOPENED: `the session ${d} of your shop: it was opened again`, SESSION_MOVED: `the session ${d} of your shop: it was moved`,
      LANDING_PAGE_PUBLISHED: "the landing page of your shop: a new version was published",
    })[k],
  },
};

const vi: Msgs = {
  hello: (n) => `Xin chào ${n},`,
  verify: { subject: "Xác nhận email của bạn", textIntro: "Hãy xác nhận email để hoàn tất việc tạo tài khoản:", htmlIntro: "Hãy xác nhận email để hoàn tất việc tạo tài khoản.", button: "Xác nhận email", note: (h) => `Liên kết có hiệu lực trong ${h} giờ. Nếu bạn không đăng ký, hãy bỏ qua email này.` },
  reset: { subject: "Đặt lại mật khẩu", textIntro: "Chọn mật khẩu mới tại đây:", htmlIntro: "Chọn mật khẩu mới.", button: "Chọn mật khẩu mới", note: (h) => `Liên kết có hiệu lực trong ${h} giờ và chỉ dùng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này: mật khẩu của bạn không thay đổi.` },
  exists: { subject: "Bạn đã có tài khoản", intro: "Có người đã thử đăng ký bằng email này nhưng email đã có tài khoản.", loginLabel: "Đăng nhập", forgotLabel: "Quên mật khẩu", forgotQuestion: "Quên mật khẩu?", resetLabel: "Đặt lại mật khẩu", ignore: "Nếu không phải bạn, hãy bỏ qua email này." },
  changed: { subject: "Mật khẩu của bạn đã được đổi", body: "Mật khẩu tài khoản của bạn vừa được đổi và mọi thiết bị đã bị đăng xuất. Nếu không phải bạn, hãy đặt lại mật khẩu ngay." },
  otp: {
    subject: (c) => `Mã đặt chỗ của bạn: ${c}`, text: (s, c) => `Mã xác nhận đặt chỗ tại ${s} của bạn là ${c}.`, htmlIntro: (s) => `Mã xác nhận đặt chỗ tại ${s} của bạn là:`,
    note: (m) => `Mã có hiệu lực trong ${m} phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.`,
  },
  adminMessage: { subject: "Thông báo từ nền tảng" },
  adminEdit: {
    subject: (s) => `Nền tảng đã thay đổi shop ${s} của bạn`, body: (w) => `Quản trị viên nền tảng đã thay đổi ${w}.`, reason: "Lý do", footer: "Bạn có thể xem và chỉnh lại trong trang quản lý của mình; lần lưu sau cùng sẽ được áp dụng.",
    what: (k, d) => ({
      SHOP_SETTINGS: `cài đặt shop của bạn (${d})`, WORKSHOP_ACTIVATED: `một workshop của shop bạn (${d}): đã được kích hoạt`, WORKSHOP_DEACTIVATED: `một workshop của shop bạn (${d}): đã bị ngừng kích hoạt`,
      SESSION_CLOSED: `buổi học ${d} của shop bạn: đã bị đóng`, SESSION_REOPENED: `buổi học ${d} của shop bạn: đã được mở lại`, SESSION_MOVED: `buổi học ${d} của shop bạn: đã được dời`,
      LANDING_PAGE_PUBLISHED: "landing page của shop bạn: một phiên bản mới đã được công bố",
    })[k],
  },
};

const ko: Msgs = {
  hello: (n) => `${n}님, 안녕하세요.`,
  verify: { subject: "이메일을 확인해 주세요", textIntro: "계정 만들기를 마치려면 이메일을 확인해 주세요:", htmlIntro: "계정 만들기를 마치려면 이메일을 확인해 주세요.", button: "이메일 확인", note: (h) => `이 링크는 ${h}시간 동안 유효합니다. 가입하지 않으셨다면 이 이메일을 무시해 주세요.` },
  reset: { subject: "비밀번호 재설정", textIntro: "아래에서 새 비밀번호를 선택해 주세요:", htmlIntro: "새 비밀번호를 선택해 주세요.", button: "새 비밀번호 선택", note: (h) => `이 링크는 ${h}시간 동안 유효하며 한 번만 사용할 수 있습니다. 요청하지 않으셨다면 이 이메일을 무시해 주세요. 비밀번호는 변경되지 않았습니다.` },
  exists: { subject: "이미 계정이 있습니다", intro: "누군가 이 이메일로 가입을 시도했지만 이미 계정이 있습니다.", loginLabel: "로그인", forgotLabel: "비밀번호를 잊으셨나요", forgotQuestion: "비밀번호를 잊으셨나요?", resetLabel: "재설정하기", ignore: "본인이 아니라면 이 이메일을 무시해 주세요." },
  changed: { subject: "비밀번호가 변경되었습니다", body: "계정 비밀번호가 방금 변경되었으며 모든 기기에서 로그아웃되었습니다. 본인이 아니라면 즉시 비밀번호를 재설정해 주세요." },
  otp: {
    subject: (c) => `예약 코드: ${c}`, text: (s, c) => `${s}의 예약을 확인하는 코드는 ${c}입니다.`, htmlIntro: (s) => `${s}의 예약을 확인하는 코드:`,
    note: (m) => `이 코드는 ${m}분 동안 유효합니다. 요청하지 않으셨다면 이 이메일을 무시해 주세요.`,
  },
  adminMessage: { subject: "플랫폼 안내" },
  adminEdit: {
    subject: (s) => `플랫폼에서 ${s} 샵을 변경했습니다`, body: (w) => `플랫폼 관리자가 ${w}을(를) 변경했습니다.`, reason: "사유", footer: "대시보드에서 확인하고 수정할 수 있으며, 마지막으로 저장한 내용이 적용됩니다.",
    what: (k, d) => ({
      SHOP_SETTINGS: `샵 설정(${d})`, WORKSHOP_ACTIVATED: `샵의 워크숍(${d}): 활성화되었습니다`, WORKSHOP_DEACTIVATED: `샵의 워크숍(${d}): 비활성화되었습니다`,
      SESSION_CLOSED: `샵의 세션 ${d}: 종료되었습니다`, SESSION_REOPENED: `샵의 세션 ${d}: 다시 열렸습니다`, SESSION_MOVED: `샵의 세션 ${d}: 일정이 변경되었습니다`,
      LANDING_PAGE_PUBLISHED: "샵의 랜딩 페이지: 새 버전이 게시되었습니다",
    })[k],
  },
};

const ja: Msgs = {
  hello: (n) => `${n} 様`,
  verify: { subject: "メールアドレスの確認", textIntro: "アカウントの作成を完了するため、メールアドレスを確認してください:", htmlIntro: "アカウントの作成を完了するため、メールアドレスを確認してください。", button: "メールアドレスを確認", note: (h) => `このリンクは${h}時間有効です。登録した覚えがない場合は、このメールを無視してください。` },
  reset: { subject: "パスワードの再設定", textIntro: "こちらから新しいパスワードを設定してください:", htmlIntro: "新しいパスワードを設定してください。", button: "新しいパスワードを設定", note: (h) => `このリンクは${h}時間有効で、1回のみ使えます。依頼した覚えがない場合は、このメールを無視してください。パスワードは変更されていません。` },
  exists: { subject: "すでにアカウントがあります", intro: "このメールアドレスで登録しようとした方がいましたが、すでにアカウントがあります。", loginLabel: "ログイン", forgotLabel: "パスワードをお忘れの場合", forgotQuestion: "パスワードをお忘れですか？", resetLabel: "再設定する", ignore: "心当たりがない場合は、このメールを無視してください。" },
  changed: { subject: "パスワードが変更されました", body: "アカウントのパスワードが変更され、すべての端末からログアウトされました。心当たりがない場合は、直ちにパスワードを再設定してください。" },
  otp: {
    subject: (c) => `予約コード: ${c}`, text: (s, c) => `${s}での予約を確認するコードは ${c} です。`, htmlIntro: (s) => `${s}での予約を確認するコード:`,
    note: (m) => `このコードは${m}分間有効です。依頼した覚えがない場合は、このメールを無視してください。`,
  },
  adminMessage: { subject: "プラットフォームからのお知らせ" },
  adminEdit: {
    subject: (s) => `プラットフォームがショップ ${s} を変更しました`, body: (w) => `プラットフォーム管理者が${w}を変更しました。`, reason: "理由", footer: "ダッシュボードで確認・変更できます。最後に保存した内容が反映されます。",
    what: (k, d) => ({
      SHOP_SETTINGS: `ショップの設定（${d}）`, WORKSHOP_ACTIVATED: `ショップのワークショップ（${d}）: 有効にしました`, WORKSHOP_DEACTIVATED: `ショップのワークショップ（${d}）: 無効にしました`,
      SESSION_CLOSED: `ショップのセッション ${d}: 終了しました`, SESSION_REOPENED: `ショップのセッション ${d}: 再開しました`, SESSION_MOVED: `ショップのセッション ${d}: 日時を変更しました`,
      LANDING_PAGE_PUBLISHED: "ショップのランディングページ: 新しいバージョンを公開しました",
    })[k],
  },
};

const zh: Msgs = {
  hello: (n) => `${n}，您好：`,
  verify: { subject: "请确认您的邮箱", textIntro: "请确认邮箱以完成账号创建：", htmlIntro: "请确认邮箱以完成账号创建。", button: "确认邮箱", note: (h) => `该链接在 ${h} 小时内有效。如果您没有注册，请忽略此邮件。` },
  reset: { subject: "重置密码", textIntro: "请在此设置新密码：", htmlIntro: "请设置新密码。", button: "设置新密码", note: (h) => `该链接在 ${h} 小时内有效，且只能使用一次。如果不是您本人操作，请忽略此邮件，您的密码不会改变。` },
  exists: { subject: "您已有账号", intro: "有人尝试使用此邮箱注册，但该邮箱已有账号。", loginLabel: "登录", forgotLabel: "忘记密码", forgotQuestion: "忘记密码？", resetLabel: "重置密码", ignore: "如果不是您本人操作，请忽略此邮件。" },
  changed: { subject: "您的密码已更改", body: "您账号的密码刚刚被更改，所有设备均已退出登录。如果不是您本人操作，请立即重置密码。" },
  otp: {
    subject: (c) => `您的预订验证码：${c}`, text: (s, c) => `您在 ${s} 确认预订的验证码是 ${c}。`, htmlIntro: (s) => `您在 ${s} 确认预订的验证码：`,
    note: (m) => `验证码在 ${m} 分钟内有效。如果不是您本人操作，请忽略此邮件。`,
  },
  adminMessage: { subject: "来自平台的消息" },
  adminEdit: {
    subject: (s) => `平台修改了您的店铺 ${s}`, body: (w) => `平台管理员修改了${w}。`, reason: "原因", footer: "您可以在控制台查看并修改；以最后一次保存为准。",
    what: (k, d) => ({
      SHOP_SETTINGS: `店铺设置（${d}）`, WORKSHOP_ACTIVATED: `店铺的工作坊（${d}）：已启用`, WORKSHOP_DEACTIVATED: `店铺的工作坊（${d}）：已停用`,
      SESSION_CLOSED: `店铺的场次 ${d}：已关闭`, SESSION_REOPENED: `店铺的场次 ${d}：已重新开放`, SESSION_MOVED: `店铺的场次 ${d}：已改期`,
      LANDING_PAGE_PUBLISHED: "店铺的落地页：已发布新版本",
    })[k],
  },
};

export const MESSAGES: Record<EmailLocale, Msgs> = { en, vi, ko, ja, zh };
