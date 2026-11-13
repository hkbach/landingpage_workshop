# Nối `apps/web` với `apps/api`: hiện trạng và kế hoạch

> **Trạng thái (13/11/2026): ĐÃ XONG lát 0 và 1 (nền + xác thực); lát 2–6 chưa làm.** Đặt `API_URL` thì web nối API thật cho tài khoản; không đặt thì vẫn chạy hoàn toàn trên dữ liệu mẫu (mock). Xem mục 0. Tài liệu này ghi lại **vì sao việc này lớn hơn một lần chuyển đổi cấu hình**, những gì đã đo được và một kế hoạch theo từng lát cắt để làm tiếp. Đây là việc cần quyết định thứ tự ưu tiên của chủ sản phẩm.

## 0. Đã làm (lát 0 và 1)

- **Chế độ thật:** biến `API_URL` (địa chỉ API mà máy chủ web gọi tới). Khi đặt (lúc build và lúc chạy), `next.config.ts` chuyển `/api/v1/*` sang API (`beforeFiles`, thắng route mock; cookie đi cùng nên không cần CORS). Không đặt: route mock trả lời như cũ. API phải đặt `APP_URL` đúng địa chỉ trình duyệt dùng (kiểm tra Origin).
- **Phía máy chủ web:** `src/lib/api-server.ts` (`apiFetch` chuyển tiếp cookie, không ghi log; `getSession`, `requireArea`, `homeOf`); `proxy.ts` tra tên miền riêng bằng `GET /public/domains/{host}` (nhớ 60 giây).
- **Bảo vệ khu vực:** `/shopowner` (đúng shop của phiên), `/customer/{id}` (đúng tài khoản), `/systemadmin` (SUPER_ADMIN) cần phiên thật; không có phiên thì về `/login`, sai loại thì về khu của mình.
- **Form:** đăng nhập (kể cả `EMAIL_NOT_VERIFIED`), đăng ký (hộp đồng ý Terms/Privacy bắt buộc, gửi `locale`, ghi bằng chứng qua `POST /legal/consent`, trả 202 thì báo kiểm tra email), quên mật khẩu, đặt lại mật khẩu (**bỏ mật khẩu tạm**: link một lần là bằng chứng, đúng hợp đồng API), đăng xuất thật (`LogoutLink`), trang xác minh email, onboarding lấy shop từ phiên.
- **Đồng ý lại Terms/Privacy (D17):** `ConsentGate` hỏi `GET /legal/consent`; khi có bản mới, cửa sổ chặn khu vực cho đến khi đồng ý hoặc đăng xuất.
- **Còn dở theo thiết kế:** các trang bên trong khu vực vẫn đọc dữ liệu mẫu (lát 3–5). Shop mới đăng ký thật chưa có dữ liệu vào dashboard; wizard onboarding còn gọi `/onboarding` của mock (cần `PATCH /organization`, lát 3). Luồng admin reset mật khẩu bằng mật khẩu tạm chỉ còn trong mock.
- **Kiểm thử:** `e2e/real-auth.spec.ts` (3 test, chạy với `E2E_REAL_API=1`, xem `e2e/README.md`) pass trên stack thật (Postgres + API + web), không vi phạm CSP.

## 1. Đã đo được (13/11/2026)

| Số liệu | Giá trị |
|---|---|
| Route mock của web (`apps/web/src/app/api/v1/**/route.ts`, tính theo method + đường dẫn) | 83 |
| Route của `apps/api` | 150 |
| Route mock có **cùng method và đường dẫn** ở API thật | 59 (71%) |
| Route mock **không có** đường dẫn tương ứng ở API thật | 24 (xem mục 3) |
| Trang server của web đọc **thẳng từ kho mock** (không qua `fetch`) | khoảng 30 (`app/shopowner/**`, `app/customer/**`, `app/sites/**`, trang Terms / Privacy) |

Đường dẫn và hình dạng phản hồi của API thật được thiết kế bám theo mock (các test của API ghi rõ "trả lời như mock"), nên phần **client** (các lời gọi `fetch` từ component) phần lớn chỉ cần trỏ sang API thật. Khó khăn nằm ở **phía server của web**:

- Các trang server (ví dụ `app/shopowner/[slug]/bookings/page.tsx`) gọi hàm của kho mock (`liveBookings()`, `currentShop`, ...) rồi **truyền cả tập dữ liệu** xuống component client; component lọc, sắp xếp, tìm kiếm trên toàn bộ mảng trong bộ nhớ. API thật trả dữ liệu **phân trang theo con trỏ** và lọc ở server, nên mỗi danh sách phải đổi cách lấy dữ liệu và cách lọc.
- Layout của khu chủ shop đọc "shop hiện tại" từ kho mock (`currentShop`, `liveShop`); với API thật phải lấy từ phiên đăng nhập (`GET /auth/me`) và đường dẫn `/shopowner/{slug}`.
- Đăng nhập mock đặt cookie riêng và nhiều route mock nhận danh tính bằng header `x-guest-email` hoặc `id` trong đường dẫn; API thật lấy danh tính **chỉ từ cookie phiên** (`wsp_sid`) và từ chối `id` khác tài khoản trong phiên.

## 2. Kế hoạch theo lát cắt

Mỗi lát hoàn tất khi: trang server lấy dữ liệu từ API (chuyển tiếp cookie của người dùng), các lời gọi của client trỏ sang API, kho mock tương ứng **bị xóa** (không để hai nguồn sự thật), test của web được viết lại, và luồng đó có E2E chạy trên stack thật (`docker compose` dev: PostgreSQL + API + worker + web + Mailpit).

0. **Nền:** biến `API_URL`; một helper `fetch` phía server (chuyển tiếp `cookie`, `x-forwarded-for`, `Origin` của app, không bao giờ log cookie); `rewrites` của Next đưa `/api/v1/*` sang API khi chạy ở chế độ thật; xử lý lỗi chuẩn (`{error: {code, message, details}}`) thành lỗi của form (`fields`) như mock đang làm.
1. **Xác thực:** đăng ký, đăng nhập, đăng xuất, quên / đặt lại mật khẩu, xác minh email, `GET /auth/me`; popup đăng nhập; bảo vệ khu `/shopowner`, `/customer`, `/systemadmin` bằng phiên thật (hiện khu admin của mock không cần đăng nhập). Từ lát này, `proxy.ts` (host → shop) tra tên miền bằng `GET /public/domains/{host}` thay cho kho mock.
2. **Trang công khai và đặt chỗ:** `GET /public/sites/{slug}`, lịch còn chỗ, OTP, đặt chỗ, tra cứu / hủy bằng mã + email, xác nhận qua link, SEO (sitemap, robots, hreflang), trang Terms / Privacy (`GET /public/legal/{kind}`), Contact và báo cáo vi phạm. Đây là lát có giá trị nhìn thấy sớm nhất.
3. **Khu chủ shop:** Overview (`/dashboard/*`), Workshops, Sessions, Bookings / Today / Customers, Finance, Promotions, Ratings, Settings (kể cả tên miền riêng), Landing pages và builder (bản nháp, publish, phiên bản). Làm từng trang một; mỗi trang đổi từ "cả mảng" sang phân trang theo con trỏ.
4. **Khu customer:** hồ sơ, booking, yêu thích, Workshops, ví, affiliate / referral, rút tiền (D6, D23).
5. **Khu admin:** Shops, Users, danh sách (workshops, sessions, bookings, customers, landing pages), Settings, hộp thư, email hệ thống, Terms / Privacy (nháp, công bố, đồng ý lại: D17), tài chính, rút tiền, báo cáo vi phạm, audit.
6. **Gỡ mock:** xóa `apps/web/src/lib/mock/**` và các route mock; bản chạy không cần API chỉ còn là dữ liệu cho test đơn vị nếu cần.

Ước lượng thô để chủ sản phẩm cân nhắc (cần xác nhận lại sau khi làm lát 0 và 1): lát 0 đến 2 là phần cốt lõi để có sản phẩm chạy thật; lát 3 đến 5 chiếm phần lớn khối lượng vì mỗi trang đều phải viết lại cách tải dữ liệu.

## 3. Các chỗ API thật khác mock (đã biết)

| Mock | API thật |
|---|---|
| `POST /public/sites/{slug}/bookings/confirm` | `POST /public/bookings/confirm` (token trong body) |
| `PATCH /bookings/{id}/status`, `POST /bookings/{id}/paid`, `PATCH /bookings/{id}/payment` | các hành động riêng: `check-in`, `uncheck-in`, `cancel`, `payment` (một trạng thái chỉ đổi qua một hành động hợp lệ) |
| `POST /sessions/{id}/closed`, `POST /sessions/auto-closed` | `POST /sessions/{id}/close`; tự đóng session hết giờ do worker làm (mỗi phút) |
| `POST /site/publish` | `POST /site/pages/{id}/publish` (publish theo trang, có checklist lần đầu) |
| `GET /admin/directory/{name}`, `GET /admin/sessions`, `POST /admin/sessions/{id}`, `GET`/`PATCH /admin/users/{id}` | các danh sách có tên riêng (`/admin/directory/workshops`, `.../sessions`, ...), hành động của admin ở `/admin/shops/{shopId}/...` kèm lý do bắt buộc (D15), `/admin/users/{id}/status` |
| `POST /onboarding` | thiết lập shop qua `PATCH /organization` |
| `POST/GET /media/**`, `/admin/media/{id}` | **chưa có** (cần khóa Cloudflare R2 để làm tải ảnh) |
| `GET /outbox/**` | chỉ dev; thay bằng Mailpit |
| `POST /public/sites/{slug}/accounts`, `.../accounts/lookup` | tạo tài khoản khi đặt chỗ: đang thiết kế lại theo D2 / D3 (không lộ email đã đăng ký) |

## 4. Quyết định cần chốt trước khi làm

- **Cookie và host:** tài khoản customer là toàn nền tảng (D6) nhưng landing page chạy ở `{slug}.{PLATFORM_DOMAIN}` hoặc tên miền riêng; cookie phiên chỉ đặt cho `app.` (D21). Khách đặt chỗ trên trang của shop có cần phiên không, hay chỉ mã OTP + email như hiện nay? Đề xuất: khách **không** cần phiên trên trang của shop.
- **`Origin` của API (chống CSRF):** hiện so với `APP_URL`. Các route công khai (đặt chỗ, liên hệ, báo cáo) gọi từ host của shop nên đã được miễn; xác nhận danh sách này khi nối.
- **Thông báo lỗi:** API trả mã lỗi ngắn; web dịch ra 5 ngôn ngữ như đang làm cho mock.
- **Tải ảnh:** chờ khóa R2 (Cloudflare) để làm presign; trong lúc chờ ảnh vẫn là link `https`.
- **`html lang` của trang shop:** E2E phát hiện `<html lang>` của trang landing page luôn là `en` kể cả khi trang ở `/vi` (ngôn ngữ chỉ được đặt ở thẻ bao nội dung). Nên sửa ở lát 2: đặt `lang` ở thẻ `html` theo ngôn ngữ của trang.

## 5. Việc đã làm sẵn cho việc này

- API: các route công khai, auth, shop, tài chính, admin, nền tảng (Terms / Privacy, hộp thư, email) đã có và có test tích hợp trên PostgreSQL thật (228 test).
- `packages/shared`: schema props của section, validator URL, renderer email booking 6 ngôn ngữ, quy tắc tài chính và booking dùng chung cho cả web và API.
- E2E Playwright (`e2e/`) cho các luồng chính, hiện chạy trên mock; khi nối xong từng lát chỉ cần chạy lại trên stack thật (xem `e2e/README.md`).
- Hạ tầng triển khai: Dockerfile, compose, Caddyfile, backup (xem `RUNBOOK.md`); Caddy đã định tuyến `/api/v1/*` sang API, nên **khi web gọi API cùng origin** không cần CORS.
