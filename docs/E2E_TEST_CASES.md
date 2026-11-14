# Danh mục test case E2E (Playwright)

> Trạng thái: **bản nháp để review** (14/11/2026). Nguồn: `docs/REQUIREMENTS.md` (ghi tắt **REQ**, kèm số dòng `L…` khi cần), `docs/WEB_API_INTEGRATION.md` (ghi tắt **WAI**), `e2e/*.spec.ts`, `e2e/helpers.ts`, `e2e/README.md`, route thật trong `apps/web/src/app/**` và endpoint thật trong `apps/api/src/**/*.controller.ts`.
> Mọi kết quả mong đợi đều lấy từ REQ hoặc từ mã nguồn (cột "Tham chiếu"). Chỗ nào yêu cầu ghi **chưa làm / TODO** thì case được liệt kê với trạng thái **"Chưa có — tính năng chưa làm"**, không tự đặt kỳ vọng. Chỗ yêu cầu tự mâu thuẫn được ghi ở **Mục 5**; các case liên quan cần chủ sản phẩm xác nhận trước khi viết test.

## 1. Mục đích, phạm vi, môi trường, dữ liệu và cách chạy

### 1.1 Mục đích

- Có một danh mục đầy đủ các luồng end-to-end cần tự động hóa bằng Playwright, xếp theo khu vực và mức ưu tiên, để chọn việc tự động hóa tiếp theo.
- Đối chiếu với những gì **đã** tự động hóa (22 test trong 6 file `e2e/*.spec.ts`) để thấy khoảng trống.
- Không thay thế test đơn vị / tích hợp: luật nghiệp vụ chi tiết (máy trạng thái, tính giá, phí, chống đặt vượt chỗ) đã có test tích hợp trên PostgreSQL thật ở `apps/api` (WAI L78: 231 test). E2E chỉ kiểm tra luồng người dùng và các điểm nối giữa web, API, worker, email.

### 1.2 Phạm vi

| Trong phạm vi | Ngoài phạm vi |
|---|---|
| Website công khai (`app.localtest.me`: Home, About, Contact, Terms, Privacy, popup Log in / Sign up) | Thanh toán online, hoàn tiền, gói trả phí (REQ §1.3) |
| Trang shop `{slug}.localtest.me` và đặt chỗ 5 bước với OTP email | App mobile native, marketplace |
| Khu chủ shop `/shopowner/{slug}/*`, khu customer `/customer/{id}/*`, khu admin `/systemadmin/*` | Hiệu năng (NFR-PERF-*), backup / restore (NFR-REL-02), giám sát |
| Ảnh trên Cloudflare R2 (tùy chọn, tự bỏ qua khi chưa cấu hình) | Tên miền riêng với DNS / TLS thật (chỉ ghi nhận, xem SET-11, SET-12) |
| Bảo mật mức luồng: phân quyền, cách ly tenant, kiểm tra `Origin`, header | Kiểm thử xâm nhập, rà soát mã bảo mật (cần người làm) |

Lưu ý phạm vi:
- **Shop không có rút tiền / ví** (quyết định D22, REQ L1457): chỉ customer rút tiền Affiliate / Referrals. Đề bài nhắc "withdrawals/wallet" của chủ shop nên danh mục có một case phủ định (FIN-08).
- **Khu customer không có trang "ratings" và "wallet" riêng**: đánh giá là nút trong My Booking, ví nằm trong trang Affiliate / Referrals (route thật: `today, bookings, workshops, favorites, affiliate, referrals, profile`).
- **Schedule rule** là tab Schedule trong popup sửa workshop (REQ L396), không có trang riêng.

### 1.3 Môi trường chạy (stack thật)

| Thành phần | Cách chạy | Ghi chú |
|---|---|---|
| PostgreSQL 16 + Mailpit | `docker compose -f infra/docker-compose.yml up -d db mailpit` | Mailpit UI / API: `http://127.0.0.1:8025` |
| Database | `pnpm db:migrate` rồi `pnpm db:seed` | Seed ghi mật khẩu tài khoản mẫu vào `apps/api/.seed-credentials` (git bỏ qua). **Không** đọc hay chép mật khẩu vào tài liệu / mã |
| API | `APP_URL=http://app.localtest.me:3100 pnpm --filter api dev` | `APP_URL` phải đúng origin trình duyệt dùng (OriginGuard so sánh) |
| Worker (pg-boss) | `APP_URL=http://app.localtest.me:3100 pnpm --filter api dev:worker` | Bắt buộc cho mọi case có email (OTP, xác nhận, hủy, reset) và các job `sessions.sweep` (mỗi phút), `sessions.generate`, `finance.close` (mỗi giờ), `maintenance.purge` |
| Web | Playwright tự khởi động `next dev -p $E2E_PORT` với `API_URL` (mặc định `http://127.0.0.1:4000`), hoặc dùng lại server đang chạy | Chỉ một `next dev` của dự án chạy được cùng lúc |
| Cloudflare R2 (tùy chọn) | 5 biến `R2_*` trong `apps/api/.env`, `MEDIA_UPLOAD_ORIGIN` cho web, CORS của bucket cho origin app | Thiếu cấu hình: API trả `503 MEDIA_NOT_CONFIGURED`, test tự `skip` (CI không có R2) |

`*.localtest.me` được trình duyệt ánh xạ về 127.0.0.1 bằng `--host-resolver-rules` (`playwright.config.ts`), không cần DNS. Cấu hình hiện tại: 1 worker, không song song, `retries` = 1 trên CI, trace / screenshot giữ khi lỗi.

### 1.4 Dữ liệu kiểm thử và quy ước

- **Tài khoản seed:** admin `admin@workshopkit.example`, chủ shop `linh@whiskladle.example` (shop `whiskladle`). Mật khẩu lấy từ `E2E_PASSWORD` hoặc file seed qua `seedPassword()` (`e2e/helpers.ts`); không bao giờ in ra log.
- **Mỗi test tự tạo dữ liệu riêng** (tài khoản, shop, workshop, session, booking, khuyến mãi) qua API, không dựa vào thứ tự chạy hay dữ liệu test khác để lại. Tên / email duy nhất theo thời gian: `e2e-${Date.now()}-${random}@example.com`, `E2E Workshop ${Date.now().toString(36)}` (quy ước đã dùng trong `auth.spec.ts`, `owner.spec.ts`).
- **Shop thứ hai** cho case cách ly tenant: đăng ký `SHOP_OWNER` qua `POST /auth/signup` (ở dev `REQUIRE_EMAIL_VERIFICATION=false` nên trả `201` kèm cookie, REQ L1021).
- **Trạng thái toàn nền tảng** (Terms / Privacy đã công bố, Settings, phí, hiển thị shop) là dữ liệu dùng chung: test nào đổi thì phải trả lại giá trị cũ trong `finally` và chạy tuần tự. Terms công bố dạng `major` bắt mọi tài khoản đồng ý lại: helper `acceptLegal()` xử lý cho các test không nói về việc này.
- **Rate limit nằm trong bộ nhớ** của API (REQ L1224): test về giới hạn dùng email riêng; giới hạn theo IP chỉ reset khi khởi động lại API.
- Mọi test nên gọi `watchBrowser(page)` và kiểm tra danh sách rỗng (lỗi CSP hoặc lỗi không bắt). Hiện một số test chưa gọi (ví dụ `auth.spec.ts` test 3–5, `admin.spec.ts` test 2–4).
- Chạy trên **database dành cho test**, không bao giờ trên dữ liệu thật (e2e/README).

### 1.5 Cách chạy

```
pnpm exec playwright install chromium          # một lần
pnpm test:e2e                                  # mọi file
pnpm exec playwright test e2e/owner.spec.ts    # một file
E2E_PORT=3200 pnpm test:e2e                    # cổng khác (API phải có APP_URL cùng cổng)
E2E_CHANNEL=chrome pnpm test:e2e               # dùng Chrome / Edge cài sẵn (msedge) thay cho bản Playwright tải về
E2E_PASSWORD=... pnpm test:e2e                 # mật khẩu seed (không đặt thì đọc apps/api/.seed-credentials)
E2E_MAILPIT=http://127.0.0.1:8025              # địa chỉ API của Mailpit (mặc định như bên trái)
API_URL=http://127.0.0.1:4000                  # API mà web gọi tới (mặc định như bên trái)
E2E_PORT=3000 pnpm exec playwright test e2e/media.spec.ts   # R2: origin phải khớp CORS của bucket
```

Ký hiệu dùng trong bảng: **P0** = luồng tiền, đặt chỗ, bảo mật; **P1** = chức năng chính; **P2** = phụ. Trạng thái: **Đã có** (`file › tên test`), **Đã có (một phần)** (test hiện có chỉ kiểm một phần kết quả mong đợi), **Chưa có**, **Chưa có — tính năng chưa làm**, **Không tự động được** (kèm lý do).

## 2. Danh mục test case

### 2.1 Xác thực & đồng ý điều khoản (AUTH)

| ID | Tiêu đề | Tiền điều kiện | Các bước | Kết quả mong đợi | Ưu tiên | Tham chiếu | Trạng thái tự động hóa |
|---|---|---|---|---|---|---|---|
| E2E-AUTH-01 | Đăng ký customer qua popup, vào khu customer | Email mới | 1) Mở `/?auth=signup` 2) Nhập email, mật khẩu, nhập lại 3) Tick ô đồng ý 4) Create account | Chuyển tới `/customer/{uuid}/today`; `GET /auth/me` trả `CUSTOMER` | P1 | FR-AUTH-01, FR-BOOK-06, WAI L10 | Đã có: `auth.spec.ts` › a customer signs up with the box of the Terms, lands in their area, logs out, and the area is closed again |
| E2E-AUTH-02 | Không tick ô đồng ý thì không tạo tài khoản | Email mới | 1) Popup Sign up, điền đủ 2) Không tick ô đồng ý 3) Create account | Báo "You must accept the Terms and Privacy Policy to continue."; không chuyển trang | P1 | D17, WAI L10 | Đã có: `auth.spec.ts` › a customer signs up with the box of the Terms… (phần đầu) |
| E2E-AUTH-03 | Đăng ký chủ shop (tab Shop owner) | Email mới | 1) `/?auth=signup&tab=owner` 2) Nhập tên shop, email, mật khẩu ×2 3) Xem `signup-slug-preview` 4) Đồng ý, Create | Xem trước `{slug}.localtest.me`; tạo shop `DRAFT` + `OWNER`; vào `/shopowner/{slug}` hoặc wizard onboarding | P1 | FR-AUTH-01, FR-ORG-01, D5 | Chưa có |
| E2E-AUTH-04 | Slug sinh từ tên shop (bỏ dấu, trùng, reserved) | Hai email mới | 1) Đăng ký shop "Bánh Đà Lạt {ts}" 2) Đăng ký shop có tên reserved `Admin` 3) Đăng ký lại cùng tên shop ở bước 1 | Slug chữ thường, bỏ dấu (`đ`→`d`), `-` giữa các cụm, ≤ 32 ký tự; tên reserved / đã dùng thêm `-2`, `-3`… | P1 | FR-ORG-01 L291-292, BR-02, BR-21 | Chưa có |
| E2E-AUTH-05 | Kiểm tra form đăng ký | — | Gửi lần lượt: mật khẩu 9 ký tự; 73 ký tự; nhập lại không khớp; email sai định dạng | Lỗi dưới từng ô (`weak` / `tooLong` / `mismatch` / `invalid`), không tạo tài khoản | P1 | FR-AUTH-01 L274, L277 | Chưa có |
| E2E-AUTH-06 | Trim email, không trim mật khẩu | Email mới | 1) Đăng ký với `"  Email@X.com  "` và mật khẩu có khoảng trắng đầu / cuối 2) Đăng nhập bằng email thường, mật khẩu nguyên văn 3) Đăng nhập bằng mật khẩu đã cắt khoảng trắng | Bước 2 thành công; bước 3 bị từ chối | P2 | BR-16 | Chưa có |
| E2E-AUTH-07 | Email đã có tài khoản | Một tài khoản có sẵn | Đăng ký lại cùng email | Dev (`REQUIRE_EMAIL_VERIFICATION=false`): `409 EMAIL_TAKEN`, popup báo "đã có tài khoản, hãy đăng nhập". Chế độ xác minh bật: `202 CHECK_EMAIL` như mọi email, chủ hộp thư nhận email báo | P1 | FR-AUTH-01 L274-275, D3, REQ L1021 | Chưa có |
| E2E-AUTH-08 | Một email chỉ một vai trò | Tài khoản customer | Đăng ký shop owner bằng cùng email | Bị từ chối (email đã có tài khoản) | P2 | D4 | Chưa có |
| E2E-AUTH-09 | Đăng nhập chuyển đúng khu vực | Tài khoản seed và một customer | Đăng nhập lần lượt owner, customer, admin qua popup | Owner → `/shopowner/whiskladle`; customer → `/customer/{id}/today`; admin → `/systemadmin` | P1 | FR-AUTH-02, FR-BOOK-06 | Đã có (một phần): helper `login()` dùng trong `owner.spec.ts`, `admin.spec.ts` (owner, admin) |
| E2E-AUTH-10 | Sai mật khẩu và email lạ cùng một thông báo | Tài khoản seed | 1) Email lạ + mật khẩu bất kỳ 2) Email owner + mật khẩu sai | Cùng thông báo; API `401 INVALID_CREDENTIALS` cho cả hai | P0 | FR-AUTH-02 L285, REQ L1022 | Đã có (một phần): `auth.spec.ts` › a wrong password is refused with the same message for any email (chỉ kiểm email lạ) |
| E2E-AUTH-11 | Khóa đăng nhập sau 5 lần sai | Tài khoản mới | 1) Sai mật khẩu 5 lần 2) Lần 6 với mật khẩu đúng 3) Đăng nhập một tài khoản khác | Bước 2: `429 RATE_LIMITED` (5 lần sai / 15 phút theo IP + email), UI báo; bước 3 vẫn thành công | P0 | FR-AUTH-02 L283, REQ L1022 | Chưa có |
| E2E-AUTH-12 | Tài khoản bị vô hiệu hóa | Admin vô hiệu một tài khoản | 1) Đăng nhập đúng mật khẩu 2) Đăng nhập sai mật khẩu | Bước 1: `403 DEACTIVATED`; bước 2: thông báo chung như sai mật khẩu | P0 | FR-AUTH-02 L285, FR-ADM-08 | Đã có (một phần): `admin.spec.ts` › deactivates a user: the server refuses their login after it (chỉ kiểm 403) |
| E2E-AUTH-13 | Đăng xuất kết thúc phiên ở server | Đã đăng nhập | 1) Log out 2) Gõ lại địa chỉ khu vực | Về `/?auth=login` | P0 | FR-AUTH-02, WAI L9-10 | Đã có: `auth.spec.ts` › a customer signs up with the box of the Terms… (đăng xuất qua API, chưa qua nút) |
| E2E-AUTH-14 | Quên mật khẩu không lộ email | — | `/forgot-password` với email có tài khoản và email lạ | Cùng thông báo (API luôn `202`); chỉ email có tài khoản nhận thư trong Mailpit | P1 | FR-AUTH-02, REQ L1023 | Chưa có |
| E2E-AUTH-15 | Đặt lại mật khẩu bằng link | Hai trình duyệt đã đăng nhập cùng tài khoản | 1) Quên mật khẩu 2) Mở link trong Mailpit 3) Đặt mật khẩu mới 4) Dùng phiên ở trình duyệt thứ hai | Mật khẩu mới đăng nhập được, mật khẩu cũ không; phiên cũ bị đăng xuất; có email "đã đổi mật khẩu" | P0 | FR-AUTH-02 L282, REQ L1023, BR-12 | Chưa có |
| E2E-AUTH-16 | Link đặt lại dùng lần hai / sai token | Một link đã dùng | Mở lại link; mở link với token sửa | `400 TOKEN_INVALID`, trang báo link không còn hiệu lực | P0 | BR-12, REQ L1023 | Chưa có |
| E2E-AUTH-17 | Link đặt lại hết hạn | Link đã quá hạn | Mở link | Bị từ chối, báo hết hạn | P1 | FR-AUTH-02, FR-ADM-20 (`resetLinkHours`) | Chưa có (cần hook thời gian, Mục 4.2) |
| E2E-AUTH-18 | Bắt buộc xác minh email | API chạy với `REQUIRE_EMAIL_VERIFICATION=true` | 1) Đăng ký 2) Đăng nhập trước khi xác minh 3) Mở link `/verify-email` từ Mailpit 4) Đăng nhập 5) `resend-verification` với email lạ | 1: `202 CHECK_EMAIL`; 2: `403 EMAIL_NOT_VERIFIED`, UI báo; 4: thành công; 5: luôn `202` | P0 | FR-AUTH-01, D2, REQ L1021-1023, WAI L10 | Chưa có (cần một lần chạy với cờ bật) |
| E2E-AUTH-19 | Popup Log in / Sign up theo địa chỉ | — | Mở `/?auth=login`, `/?auth=signup&tab=customer`, `/login`, `/signup`; nhấn Esc; bấm ra ngoài | Popup mở đúng tab; `/login` `/signup` chuyển về `?auth=`; Esc / bấm ngoài đóng popup và bỏ `?auth` | P2 | FR-AUTH-01 L270 | Chưa có |
| E2E-AUTH-20 | Nút Register trên trang shop chỉ cho customer | Shop `whiskladle` có trang public | 1) Bấm `site-register` 2) Đăng ký | Sang `app.…/?auth=signup&only=customer`; có `signup-customer-only`, không có `signup-tab-owner`; tài khoản mới là `CUSTOMER` | P1 | FR-SITE-05 L372, WAI L26 | Đã có: `auth.spec.ts` › a visitor of a shop page registers as a customer from the Register button… |
| E2E-AUTH-21 | Nút Log in trên trang shop | Như trên | Bấm `site-login` | Sang `app.…/?auth=login`, popup Log in mở | P2 | FR-SITE-05 | Đã có: `auth.spec.ts` › the Log in button of a shop page opens the log in popup of the platform |
| E2E-AUTH-22 | Quay lại trang shop sau khi đăng nhập / đăng ký từ trang shop | — | — | — | P2 | FR-SITE-05 L372, WAI L28 | Chưa có — tính năng chưa làm |
| E2E-AUTH-23 | Wizard onboarding của shop mới | Chủ shop vừa đăng ký | 1) `/shopowner/onboarding` 2) Điền khu vực, ngôn ngữ, liên hệ 3) Save and continue 4) Mở lại `/shopowner/{slug}` | Dữ liệu lưu qua `PATCH /organization`; trước khi xong, trang chào có khung "Finish the setup" (`setup-pending`) | P1 | FR-ORG-01 L294, D5, WAI L10, L134 | Chưa có |
| E2E-AUTH-24 | Đồng ý lại Terms sau bản thay đổi lớn (customer) | Admin công bố Terms `major: true` | 1) Customer mở khu vực 2) Kiểm tra nút Accept 3) Tick, Accept | `consent-dialog` chặn khu vực; `consent-accept` bị khóa tới khi tick; sau đó dialog đóng, `mustAcceptAny = false` | P1 | FR-ADM-23 L770, D17, WAI L11 | Đã có: `customer.spec.ts` › is asked to agree to the published Terms before going on, and then the area opens |
| E2E-AUTH-25 | Đồng ý lại Terms ở khu chủ shop | Như trên, tài khoản owner mới | Owner mở `/shopowner/{slug}` | Dialog đồng ý chặn khu chủ shop tới khi đồng ý | P1 | D17, e2e/README | Chưa có |
| E2E-AUTH-26 | Công bố không phải thay đổi lớn | Người dùng đã đồng ý bản trước | Admin công bố bản mới với `major: false` | `epoch` không đổi nên người dùng không bị hỏi lại (chỉ `major: true` tăng `epoch`) | P2 | FR-ADM-23 L770 | Chưa có |
| E2E-AUTH-27 | Từ chối đồng ý thì đăng xuất | Dialog đồng ý đang hiện | Chọn đăng xuất trong dialog | Phiên kết thúc, không vào được khu vực | P2 | WAI L11 | Chưa có |
| E2E-AUTH-28 | Đăng ký khi chỉ một văn bản đã công bố | Chỉ Terms đã công bố, Privacy chưa | Đăng ký customer có tick đồng ý | Đăng ký thành công; chỉ ghi đồng ý cho văn bản đã công bố (lỗi đã sửa) | P1 | WAI L82 | Đã có (một phần): `customer.spec.ts` › is asked to agree to the published Terms… (không cố định trạng thái của Privacy) |
| E2E-AUTH-29 | Admin gửi link đặt lại mật khẩu | Một tài khoản customer | 1) Admin Reset Password 2) Mở link trong Mailpit 3) Đặt mật khẩu mới | API `202`, admin không thấy link / token; đặt xong mọi thiết bị bị đăng xuất. Luồng mật khẩu tạm thời chỉ còn trong mock (xem Mục 5, mâu thuẫn C5) | P1 | FR-ADM-08, REQ L1089, WAI L10, L12 | Chưa có |

### 2.2 Trang công khai (nền tảng và shop) & đặt chỗ (PUB)

| ID | Tiêu đề | Tiền điều kiện | Các bước | Kết quả mong đợi | Ưu tiên | Tham chiếu | Trạng thái tự động hóa |
|---|---|---|---|---|---|---|---|
| E2E-PUB-01 | Mục Workshops của trang Home | Ít nhất một shop `ACTIVE` được admin chọn hiển thị | Mở `/`, xem `home-workshops`, bấm một thẻ | Tối đa 10 workshop `ACTIVE` từ `GET /public/workshops/featured`; không có workshop nháp; bấm thẻ mở landing page của shop | P2 | REQ L682, WAI L80 | Chưa có |
| E2E-PUB-02 | Các trang công khai mở không lỗi | — | Mở `/`, `/about`, `/contact`, `/terms`, `/privacy` | Có tiêu đề, không lỗi CSP / lỗi không bắt | P2 | REQ L680-686 | Chưa có |
| E2E-PUB-03 | Gửi form Contact | — | Điền tên, email, chủ đề, nội dung 10–2000 ký tự; gửi | Lời cảm ơn kèm email (`contact-success`); tin xuất hiện ở `/systemadmin/messages` trạng thái `NEW` | P1 | REQ L685, L754, FR-ADM-21 | Chưa có |
| E2E-PUB-04 | Kiểm tra form Contact | — | Nội dung 9 ký tự; 2001 ký tự; email sai | Lỗi dưới từng ô (`tooShort` / `tooLong` / `invalid`), không gửi | P2 | REQ L685, L754 | Chưa có |
| E2E-PUB-05 | Giới hạn gửi Contact | Admin đặt `contactPerHour = 1` (trả lại sau test) | Gửi 2 tin liên tiếp | Tin 2: `429 RATE_LIMITED` kèm `Retry-After`, UI báo | P1 | FR-ADM-20 L744, REQ L754 | Chưa có |
| E2E-PUB-06 | Bẫy robot của Contact | — | Gửi `POST /public/contact` có ô ẩn `website` | `201` nhưng tin không có trong Support inbox | P2 | REQ L685, L754 | Chưa có |
| E2E-PUB-07 | Trang shop hiển thị workshop đang bán | Shop `ACTIVE` có trang public, 1 workshop `ACTIVE` và 1 `DRAFT` | Mở `{slug}.localtest.me/` | Có hero, workshop `ACTIVE` với nút Book; workshop `DRAFT` không hiện | P0 | FR-SITE-05, FR-BOOK-01, REQ L1066 | Đã có (một phần): `booking.spec.ts` › opens the landing page of the shop, books a session… (chưa kiểm workshop nháp) |
| E2E-PUB-08 | Slug không tồn tại | — | Mở `no-such-shop-anywhere.localtest.me/` | HTTP 404 | P1 | REQ §3.3, L1065 | Đã có: `booking.spec.ts` › a shop that does not exist is a 404, and the shop has a sitemap and a robots.txt of its own |
| E2E-PUB-09 | Shop `DRAFT` chưa publish | Shop mới đăng ký | Mở `{slug}.localtest.me/` | HTTP 404 | P1 | REQ §3.3 L189, L1065 | Chưa có |
| E2E-PUB-10 | Shop bị khóa | Shop `ACTIVE` có trang public, admin khóa | 1) Mở trang shop 2) Gọi OTP / đặt chỗ qua API 3) Admin mở khóa, mở lại | 1, 2: cùng một `404`; 3: trang hiện lại | P0 | FR-ADM-03, AC-03, REQ L190, L1065 | Đã có: `booking-rules.spec.ts` › E2E-PUB-10 |
| E2E-PUB-11 | Lịch chỉ hiện session đặt được | Workshop có session `OPEN`, `PAUSED`, `RUNNING`, `CLOSED` | Mở modal đặt chỗ, bước 1 | `RUNNING` chọn được; `CLOSED` hiện mờ, không chọn được; `OPEN` và `PAUSED` không hiện | P0 | FR-SCHED-02 L407, REQ L1066 | Chưa có |
| E2E-PUB-12 | Giờ theo múi giờ của shop | Shop múi giờ khác máy test | Xem bước 1 | Giờ theo múi giờ shop, có dòng tên múi giờ (ví dụ "Times shown in Asia/Ho_Chi_Minh") | P2 | FR-BOOK-01 L417 | Chưa có |
| E2E-PUB-13 | Session hết chỗ | Session `RUNNING` sức chứa 1 đã có 1 booking | Bước 1 của modal | Giờ đó ghi "Sold out", không chọn được; ngày chỉ có giờ không chọn được ghi "Not available" | P0 | FR-BOOK-01, FR-BOOK-02 L421 | Chưa có |
| E2E-PUB-14 | Trong khoảng cut-off | Session `RUNNING` bắt đầu sau 60 phút, cut-off 120 | Bước 1 | Ghi "Booking closed", không chọn được; mỗi giờ có câu "Online booking closes N minutes before a session starts." | P0 | FR-BOOK-02 L422, REQ L1066 | Chưa có |
| E2E-PUB-15 | Đặt chỗ đủ 5 bước với OTP | Shop có session `RUNNING` còn chỗ, worker chạy | Bước 1–4, lấy mã 6 số từ Mailpit, Verify and book | Trang "Booking received"; mã dạng `SES-0003-001`; booking `NOT_CONFIRMED`, `UNPAID`; không có mã demo (`otp-demo`) | P0 | FR-BOOK-02, §6.1, REQ L1067-1068 | Đã có: `booking.spec.ts` › opens the landing page of the shop, books a session with the emailed code… |
| E2E-PUB-16 | OTP sai | Đang ở bước 5 | Nhập mã sai | Báo lỗi (`alert`), API `422 OTP_INVALID` kèm `attemptsLeft`, chưa tạo booking | P0 | FR-BOOK-02 L424, REQ L1067 | Đã có: `booking-rules.spec.ts` › E2E-PUB-16 / PUB-17 |
| E2E-PUB-17 | Khóa OTP sau 5 lần sai | Đang ở bước 5 | Nhập sai 5 lần, rồi nhập mã đúng | Sau lần 5: `429 OTP_LOCKED`, UI báo khóa; mã đúng cũng không tạo booking | P0 | FR-BOOK-02 L424, REQ L1067 | Đã có: `booking-rules.spec.ts` › E2E-PUB-16 / PUB-17 (qua API) |
| E2E-PUB-18 | OTP hết hạn 10 phút | Mã đã quá 10 phút | Nhập mã | `OTP_INVALID`, không tạo booking | P1 | REQ L1067 | Chưa có (cần hook thời gian) |
| E2E-PUB-19 | Gửi lại mã | Đang ở bước 5 | Bấm gửi lại ngay; chờ 30 giây rồi bấm | Nút đếm ngược 30 giây; mã mới chỉ được gửi sau 30 giây (API luôn `202`) | P2 | FR-BOOK-02 L424, REQ L1067 | Chưa có |
| E2E-PUB-20 | Giới hạn số mã OTP | — | Yêu cầu mã 6 lần trong một giờ cho một email (cách nhau ≥ 30 giây) | API vẫn `202` như nhau; Mailpit chỉ nhận tối đa 5 mã / giờ / email | P2 | REQ L1067 | Chưa có |
| E2E-PUB-21 | Vượt số khách tối đa mỗi booking | Workshop `max_per_booking = 2` | Bước 2 chọn 3; gọi API với `quantity: 3` | UI không cho chọn quá 2; API `422 fields.quantity = quantityRange` | P0 | FR-BOOK-02 L430, REQ L1068 | Đã có (một phần): `booking-rules.spec.ts` › E2E-PUB-21 / PUB-22 (API; giới hạn ở giao diện chưa kiểm) |
| E2E-PUB-22 | Đặt nhiều hơn số chỗ còn lại | Session còn 1 chỗ | Đặt 2 khách | `409 SESSION_FULL` kèm `remaining`; UI yêu cầu chọn giờ khác | P0 | FR-BOOK-02 L437, REQ L1068 | Đã có (một phần): `booking-rules.spec.ts` › E2E-PUB-21 / PUB-22 (API; thông báo ở giao diện chưa kiểm) |
| E2E-PUB-23 | Hai khách tranh chỗ cuối | Session còn 1 chỗ, hai OTP hợp lệ | Gửi hai `POST …/bookings` cùng lúc | Đúng một `201`, một `409 SESSION_FULL`; `remaining = 0` | P0 | AC-05, NFR-REL-01, FR-BOOK-02 AC, REQ L1069 | Chưa có (đã có test tích hợp ở API) |
| E2E-PUB-24 | Lặp `Idempotency-Key` | Một booking vừa tạo | Gửi lại đúng request với cùng key | `200` cùng booking; không có booking mới; số chỗ không đổi | P0 | §7.2, FR-BOOK-02 L436, REQ L1068 | Đã có: `booking-rules.spec.ts` › E2E-PUB-25 / PUB-24 (kể cả key của khách khác → `409`) |
| E2E-PUB-25 | Server tự tính giá | — | Gửi booking kèm `totalAmount`, `status`, `organizationId` giả | Booking có tổng = đơn giá × số khách (trừ khuyến mãi hợp lệ), `NOT_CONFIRMED`; trường giả bị bỏ qua | P0 | BR-04, §4.1, REQ L1068 | Đã có: `booking-rules.spec.ts` › E2E-PUB-25 / PUB-24 |
| E2E-PUB-26 | Trường bắt buộc ở bước 3 | — | Bỏ trống lần lượt họ tên, email, quốc gia, phone; yêu cầu đặc biệt 501 ký tự | Không qua được bước 3, lỗi dưới ô | P1 | FR-BOOK-02 L425 | Chưa có |
| E2E-PUB-27 | Bắt buộc đồng ý ở bước 4 | — | Không tick đồng ý; gọi API với `consent: false` | Không qua được; API `422 consentRequired` | P1 | FR-BOOK-02 L425, REQ L1068 | Chưa có |
| E2E-PUB-28 | Bill ở bước 2 và 4 | Workshop có giá | Chọn 2 khách | Bước 2 và 4 hiện tạm tính, từng khuyến mãi, tổng; chính sách đến trễ hiện ở modal | P1 | FR-BOOK-02 L420, BR-09 | Chưa có |
| E2E-PUB-29 | Quá cut-off trong lúc đang mở form | Session sắp vào khoảng cut-off | Đi tới bước 5, chờ qua cut-off, nhập đúng OTP | Quay về bước 1 với thông báo, không tạo booking (`409 BOOKING_CLOSED`) | P0 | FR-BOOK-02 L422, REQ L1068 | Chưa có (cần hook thời gian) |
| E2E-PUB-30 | Session bị Pause trong lúc đặt | Owner Pause session sau khi khách chọn giờ | Hoàn tất bước 5 | `409 NOT_BOOKABLE`, không tạo booking | P1 | REQ L1068 | Chưa có |
| E2E-PUB-31 | Email sau khi đặt | Booking vừa tạo | Đọc Mailpit | Khách nhận email có link xác nhận, mã, workshop, ngày giờ + múi giờ, địa chỉ, tổng "pay at studio", chính sách đến trễ; email liên hệ của shop nhận thông báo booking mới | P0 | FR-BOOK-02 L435, FR-MAIL-01, BR-09 | Đã có (một phần): `booking.spec.ts` › opens the landing page… (chỉ lấy link xác nhận) |
| E2E-PUB-32 | Xác nhận bằng link | Booking `NOT_CONFIRMED` | Mở link 2 lần | Lần 1 `CONFIRMED`; lần 2 không đổi gì (`changed: false`) | P0 | §6.1, REQ L1071 | Đã có (một phần): `booking.spec.ts` › opens the landing page… (chỉ mở 1 lần) |
| E2E-PUB-33 | Xác nhận booking đã hủy | Booking đã hủy | Mở link xác nhận | `409 BOOKING_CANCELLED`, trang báo không xác nhận được | P1 | FR-BOOK-02 L435, REQ L1071 | Chưa có |
| E2E-PUB-34 | Token xác nhận sai / hết hạn | — | Mở `/booking/confirm/{token-sai}`; token quá 14 ngày | `400 TOKEN_INVALID`, trang báo lỗi | P1 | REQ L1071 | Chưa có (hết hạn cần hook thời gian) |
| E2E-PUB-35 | Tra cứu bằng mã + email | Một booking | Mở `/booking/{code}?email=` với email đúng, email sai, mã sai | Đúng: hiện booking; sai email và sai mã: cùng một câu trả lời, không lộ booking | P0 | FR-BOOK-03 L444, REQ L1071 | Đã có (một phần): `booking.spec.ts` › opens the landing page… (chưa kiểm mã sai) |
| E2E-PUB-36 | Nội dung trang xác nhận | Một booking | Mở trang xác nhận | Có mã, workshop, ngày giờ (múi giờ shop), số khách, tổng "Pay at the studio", địa chỉ + link bản đồ, ghi chú địa chỉ, chính sách đến trễ, liên hệ shop | P1 | FR-BOOK-03 L443, FR-WS-01 L388 | Chưa có |
| E2E-PUB-37 | Khách tự hủy booking | Booking `NOT_CONFIRMED` hoặc `CONFIRMED`, session chưa bắt đầu | Trang xác nhận → Cancel booking → lý do (≤ 300) → xác nhận | "This booking has been cancelled"; chỗ được nhả ngay (`remaining` tăng); khách và shop đều nhận email | P0 | FR-BOOK-03 L444, BR-11, AC-08, REQ L1071 | Chưa có |
| E2E-PUB-38 | Không hủy được | Booking `CHECKED_IN`; session đã đóng; session đã bắt đầu | Mở trang xác nhận; gọi `…/bookings/cancel` | Không có nút Cancel, câu "To change or cancel, please contact the studio."; API `409 NOT_CANCELLABLE` | P0 | FR-BOOK-03 L444-445, BR-11 | Chưa có (trường hợp "đã bắt đầu" cần hook thời gian) |
| E2E-PUB-39 | Booking do shop hủy | Shop đã hủy với lý do | Mở trang xác nhận | "The studio cancelled this booking" kèm lý do | P2 | FR-BOOK-03 L444 | Chưa có |
| E2E-PUB-40 | Link affiliate mở đúng workshop | Customer có link `?ref=CODE&book=ID` | Mở link; reload | Popup đặt chỗ của đúng workshop mở; `ref` và `book` bị bỏ khỏi địa chỉ; reload không mở lại; lượt mở được đếm | P1 | FR-CUST-02 L581, REQ L584 | Chưa có |
| E2E-PUB-41 | Link affiliate bị tắt | Workshop bị deactivate hoặc admin tắt link | Mở link | Landing page của shop với popup "Workshop đã kết thúc" (có Close), không mở popup đặt chỗ; lượt mở vẫn đếm | P1 | FR-CUST-02 L580, FR-ADM-15 | Chưa có |
| E2E-PUB-42 | Gắn booking vào link affiliate | Link của customer A | 1) Khách khác đặt qua link, đúng workshop 2) Chính A đặt qua link 3) Đặt workshop khác 4) Mã `ref` sai | Chỉ 1 được tính cho link; 2, 3 không tính; 4 vẫn tạo booking bình thường | P0 | FR-CUST-02 L581, REQ L584 | Chưa có |
| E2E-PUB-43 | Báo cáo vi phạm | Shop `ACTIVE` | Footer → "Report this site" → lý do, mô tả 10–2000, email tùy chọn | Popup gửi được (`201`); mô tả < 10 ký tự bị báo lỗi; shop không `ACTIVE` trả `404` | P2 | FR-ADM-04, REQ L649 | Chưa có |
| E2E-PUB-44 | Giới hạn báo cáo | — | Gửi 6 báo cáo trong một giờ | Báo cáo 6: `429` kèm `Retry-After` | P2 | FR-ADM-04 L645 | Chưa có |
| E2E-PUB-45 | Trang `/report` khi không có JavaScript | Context tắt JS | Mở `/report` trên host shop | Có cùng form báo cáo | P2 | FR-ADM-04 L644 | Chưa có |
| E2E-PUB-46 | Section Promotions trên landing page | Shop có / không có khuyến mãi đang chạy | Mở trang shop | Có khuyến mãi: hiện mức giảm, tiêu đề, workshop áp dụng, hạn, mã, "Can be combined / Cannot be combined"; không có: section và link menu tự ẩn | P1 | FR-PROMO-01 L549, L554 | Chưa có |
| E2E-PUB-47 | Địa chỉ của workshop | Workshop có địa chỉ riêng + ghi chú; workshop để trống địa chỉ | Xem thẻ workshop và bước tóm tắt | Thẻ và dòng "Where" hiện địa chỉ áp dụng (riêng hoặc của shop) kèm ghi chú | P2 | FR-WS-01 L388 | Chưa có |
| E2E-PUB-48 | Một email, một customer | — | Đặt 2 lần cùng email (khác hoa thường, có khoảng trắng) với hai họ tên khác nhau | Danh sách Customers của shop có 1 customer; mỗi booking giữ họ tên nhập lúc đặt | P1 | BR-10, FR-BOOK-02 L433, REQ L1070 | Chưa có |
| E2E-PUB-49 | Nút tim yêu thích trên trang shop | — | — | — | P2 | FR-BOOK-04, WAI L60 | Chưa có — tính năng chưa làm (không còn nút tim trên trang shop khi chạy với API) |
| E2E-PUB-50 | Đăng nhập / tạo tài khoản ngay trên trang shop và gộp booking theo email | — | — | — | P2 | FR-BOOK-05, D2, D3, WAI L20, L137 | Chưa có — tính năng chưa làm |
| E2E-PUB-51 | Turnstile ở form đặt chỗ / đăng ký | — | — | — | P1 | FR-BOOK-02 L428, WAI L20 | Chưa có — tính năng chưa làm (widget thật; ở production cũng không tự động được vì cần Cloudflare) |
| E2E-PUB-52 | Đường dẫn trang shop trên host `app.` | — | Mở `app.localtest.me/sites/whiskladle` | Hiện vẫn mở được; cần chuyển hướng khi tách host (D21) | P2 | REQ L1428, D21 | Chưa có — tính năng chưa làm |

### 2.3 Chủ shop: vận hành (OPS)

| ID | Tiêu đề | Tiền điều kiện | Các bước | Kết quả mong đợi | Ưu tiên | Tham chiếu | Trạng thái tự động hóa |
|---|---|---|---|---|---|---|---|
| E2E-OPS-01 | Mọi trang khu chủ shop mở được | Owner seed đăng nhập | Mở Overview, Today, Bookings, Customers, Workshops, Sessions, Finance, Promotions, Ratings, Landing pages, Settings | Có tiêu đề h1, không "This page couldn’t load", không lỗi CSP | P1 | WAI L30-41 | Đã có: `owner.spec.ts` › opens every page of the owner area on the data of the server, with no error in the page |
| E2E-OPS-02 | KPI và thẻ của Overview | Shop có booking / session / page | Mở `/shopowner/{slug}` | KPI booking hôm nay, session sắp tới, Not confirmed, "Awaiting payment confirmation", "To pay at the studio"; thẻ Landing pages "n / 2" và page đang public | P2 | FR-PAY-03, REQ L539 | Chưa có |
| E2E-OPS-03 | Biểu đồ booking của Overview | — | Đổi kỳ 1m / 3m / 6m / 12m | Biểu đồ đổi theo kỳ (theo ngày cho 1m, theo tháng cho kỳ dài), có bảng số liệu thay thế | P2 | FR-PAY-03 L537-539 | Chưa có |
| E2E-OPS-04 | Màn hình Today | Session hôm nay `RUNNING` có booking | Mở Today; check-in rồi undo | Số liệu Sessions / Guests expected / Arrived / Not confirmed / Paid; check-in, undo được; không có Cancel và nút thanh toán; session Closed chỉ xem | P1 | FR-OPS-01 L498-499 | Chưa có |
| E2E-OPS-05 | Ô tổng hợp của Bookings | Booking ở nhiều trạng thái | Bấm ô Confirmed; bấm ô Paid; bấm lại | Bảng lọc theo ô (`aria-pressed`); hai hàng lọc chéo; tổng các trạng thái = All bookings | P1 | FR-OPS-01 L493 | Chưa có |
| E2E-OPS-06 | Bộ lọc Bookings | — | Lọc From/To, preset All (`preset-all`), workshop, session; tìm theo mã / tên / email | Danh sách đúng điều kiện | P2 | FR-OPS-01 L496 | Đã có (một phần): `owner.spec.ts` › starts a session, and cancels a booking of it… (preset All + tìm mã) |
| E2E-OPS-07 | Booking tay cho khách walk-in không email | Session `RUNNING` còn chỗ | `/shopowner/{slug}/bookings/new`: WALK_IN, họ tên, 1 khách | `201`, `CONFIRMED` ngay, `UNPAID`, mã `SES-xxxx-nnn`, không gửi email | P0 | FR-OPS-02, REQ L1050 | Đã có (một phần): `owner.spec.ts` › starts a session, and cancels a booking of it… (tạo qua API, không qua form) |
| E2E-OPS-08 | Booking tay PHONE / OTHER | — | Tạo PHONE không email; tạo PHONE có email | Không email: bị từ chối (bắt buộc); có email: khách nhận email thông tin, không có link xác nhận | P1 | FR-OPS-02 L503-504 | Chưa có |
| E2E-OPS-09 | Booking tay không được vượt chỗ / vào session đã đóng | Session còn 1 chỗ; session đã đóng | Tạo 2 khách; tạo vào session đã đóng | `409 SESSION_FULL`; session đã đóng / hết giờ bị từ chối và không có trong danh sách của form | P0 | FR-OPS-02 L505-506, REQ L1050 | Chưa có |
| E2E-OPS-10 | Idempotency của booking tay | — | `POST /bookings` thiếu `Idempotency-Key`; gửi lại cùng key | Thiếu key bị từ chối; cùng key trả cùng booking | P1 | §7.2, REQ L1050 | Chưa có |
| E2E-OPS-11 | Check-in và Undo từ Not confirmed | Booking `NOT_CONFIRMED`, session chưa đóng | Check in → Undo check-in | `CHECKED_IN` rồi về đúng `NOT_CONFIRMED`; giờ check-in bị xóa | P0 | FR-OPS-03 L509-510, §6.1 | Chưa có |
| E2E-OPS-12 | Check-in và Undo từ Confirmed | Booking `CONFIRMED` | Check in → Undo | Về `CONFIRMED`; số chỗ của session không đổi | P0 | FR-OPS-03, BR-07 | Chưa có |
| E2E-OPS-13 | Check-in khi session đã đóng | Session do owner đóng (Pause → Close) | Mở danh sách check-in; gọi API check-in | Chỉ đọc, không có nút; API `409 INVALID_TRANSITION` | P1 | FR-OPS-03 L511, BR-11 | Chưa có |
| E2E-OPS-14 | Shop hủy booking | Booking `CONFIRMED` có email | Cancel booking: để trống lý do; rồi nhập lý do | Trống: bị chặn (`422`); có lý do: `CANCELLED`, chỗ nhả, khách nhận email kèm lý do (một lần) | P0 | FR-OPS-06, BR-11, REQ L1050 | Đã có (một phần): `owner.spec.ts` › starts a session, and cancels a booking of it: the server keeps both (chỉ kiểm `CANCELLED`) |
| E2E-OPS-15 | Booking đã hủy không đổi được nữa | Booking `CANCELLED` | Xem dòng; gọi check-in / cancel / payment | Không có nút; API `409 INVALID_TRANSITION` / `409 INVALID_STATE` | P0 | §6.1, BR-11, REQ L1050 | Chưa có |
| E2E-OPS-16 | Confirm payment (bản nháp → Submit) | Session `CLOSED` có booking `UNPAID` | Mở Confirm payment, bấm Confirm payment ở một dòng, Submit | Trước Submit: nhãn "Not saved yet", chưa lưu; sau Submit: `PAID`, booking `CHECKED_IN` (nếu đang Not confirmed / Confirmed), khách nhận email biên nhận; thông báo "N payments saved. Emails sent: …" | P0 | FR-SCHED-02 L406, FR-PAY-01, REQ L1050 | Chưa có |
| E2E-OPS-17 | Bỏ bản nháp thanh toán | Như trên | Đánh dấu Paid rồi Cancel / Esc | Không có khoản thanh toán nào được lưu | P1 | FR-SCHED-02 L406 | Chưa có |
| E2E-OPS-18 | Unpaid sửa nhầm | Booking `PAID` (trước đó Not confirmed) | Unpaid → Submit | Ghi một `REVERSAL`, `UNPAID`, booking về `NOT_CONFIRMED`, không gửi email | P0 | FR-PAY-01 L526, §6.1, REQ L1050 | Chưa có |
| E2E-OPS-19 | Chọn hàng loạt theo phần | Session đóng có booking ở 3 phần | Select all ở phần Not checked in → Confirm payment (N) | Chỉ các booking đã chọn của phần đó được xác nhận; booking hủy / tổng 0 không có ô chọn; API trả `409 INVALID_STATE` cho booking hủy hoặc tổng 0 | P1 | FR-SCHED-02 L406, REQ L1050 | Chưa có |
| E2E-OPS-20 | Completed session | Session `CLOSED` | Completed → xác nhận | Session `COMPLETED`, chỉ còn nút Completed (chỉ đọc); ghi thanh toán sau đó: `409 SESSION_COMPLETED` | P0 | FR-SCHED-02 L405-406, §6.3, REQ L1050 | Chưa có |
| E2E-OPS-21 | Unpaid sau khi tháng đã kết sổ | Khoản thanh toán thuộc tháng đã kết sổ | Unpaid | `409 MONTH_CLOSED`; booking của tháng đang mở vẫn Unpaid được | P0 | D10, D11, REQ L1091 | Chưa có (cần hook thời gian / kết sổ) |
| E2E-OPS-22 | Customers | Khách có và không có tài khoản | Tìm theo tên / email (không dấu); lọc Country (có mục Guest / "Vãng lai") và Gender; mở popup con mắt | Kết quả đúng; popup có email, điện thoại, quốc gia, ngày sinh, số booking, đã thu ròng, mọi booking (kể cả đã hủy) | P2 | FR-CUST-01 | Chưa có |
| E2E-OPS-23 | Sắp xếp theo tiêu đề cột | Ít nhất 3 customer | Bấm tiêu đề 3 lần | Tăng dần → giảm dần → mặc định; giá trị trống luôn ở cuối; `aria-sort` đổi theo | P2 | FR-CUST-01 L566 | Chưa có |
| E2E-OPS-24 | Phân trang danh sách | > 10 dòng | Đổi page size 10 / 20 / 50; Next; đổi bộ lọc | "Showing a–b of N", "Page x of y"; đổi bộ lọc về trang 1; ≤ 10 dòng thì không có thanh phân trang | P2 | BR-22 | Chưa có |
| E2E-OPS-25 | Ratings của shop | Workshop có đánh giá, một đánh giá bị admin gỡ | Mở `/shopowner/{slug}/ratings` | Chỉ đọc; điểm trung bình và số lượt; đánh giá bị gỡ không hiện; shop khác không thấy | P2 | FR-BOOK-06 L473, D7, REQ L488 | Chưa có |
| E2E-OPS-26 | Shop bị khóa chỉ đọc | Admin khóa shop | Owner mở dashboard; thử tạo workshop, check-in | Banner thông báo; mọi thao tác ghi bị `403 SHOP_SUSPENDED`; dữ liệu vẫn đọc được | P0 | FR-ADM-03 L641, REQ L1044 | Chưa có |
| E2E-OPS-27 | Chi tiết booking | Booking có thanh toán | Mở `/shopowner/{slug}/bookings/{id}` | Danh sách khoản thanh toán chỉ xem; thao tác theo `actions` được phép; booking khách hủy ghi "Cancelled by the guest" kèm lý do | P2 | FR-PAY-01 L524, FR-OPS-06, REQ L1050 | Chưa có |
| E2E-OPS-28 | Chuyển booking sang session khác | — | — | — | P2 | FR-OPS-07, WAI L45 | Chưa có — tính năng chưa làm (tắt khi chạy với API, API chưa có route) |
| E2E-OPS-29 | Audit log của thao tác vận hành | Owner vừa check-in, hủy, tạo booking tay, Confirm payment | Admin lọc `/systemadmin/audit-logs` theo email owner | Có dòng cho từng thao tác, không chứa bí mật | P1 | AC-07, FR-ADM-05 L657 | Chưa có |

### 2.4 Chủ shop: danh mục workshop, session, lịch (CAT)

| ID | Tiêu đề | Tiền điều kiện | Các bước | Kết quả mong đợi | Ưu tiên | Tham chiếu | Trạng thái tự động hóa |
|---|---|---|---|---|---|---|---|
| E2E-CAT-01 | Tạo workshop nháp rồi Activate | Owner đăng nhập | Popup thêm workshop: tên, 1 category, giá → Save; reload; Activate | Thông báo đã tạo; dòng có sau reload; trạng thái Active | P1 | FR-WS-01 L394-395 | Đã có: `owner.spec.ts` › creates a workshop as a draft, activates it, and it is in the list after a reload |
| E2E-CAT-02 | Kiểm tra form workshop | — | Bỏ trống tên ngôn ngữ mặc định; 0 category; chọn 3 category; thời lượng 14 / 601; sức chứa 0 / 51 | Lỗi theo ô (`title.en: required`, "Choose at least 1 category (up to 3)."…); chọn đủ 3 thì các category còn lại bị khóa, có dòng "3 of 3 chosen" | P1 | FR-WS-01 L387, L389, REQ L1045 | Chưa có |
| E2E-CAT-03 | Chỉ sửa được workshop nháp | Workshop `ACTIVE` | Bấm Edit; gọi `PUT /workshops/{id}` | Nút Edit chỉ đọc kèm lý do viết dưới nút; popup chỉ có thông báo (tab Schedule vẫn dùng được); API `409 NOT_EDITABLE` | P1 | FR-WS-01 L394, L396, REQ L1045 | Chưa có |
| E2E-CAT-04 | Deactivate khi còn session chưa đóng | Workshop có session `OPEN` | Bấm Deactivate; gọi API | Nút chỉ đọc, ghi số session còn lại; API `409 SESSIONS_OPEN` kèm `details.open` | P1 | FR-WS-01 L394, REQ L1045 | Chưa có |
| E2E-CAT-05 | Deactivate khi mọi session đã đóng | Workshop có session đều `CLOSED` (hoặc chưa có session) | Deactivate | Về `DRAFT`, biến mất khỏi landing page; affiliate link của workshop thành Deactive | P1 | FR-WS-01 L390, L394, FR-CUST-02 L580 | Chưa có |
| E2E-CAT-06 | Không xóa được workshop | — | Tìm nút Delete; gọi `DELETE /workshops/{id}` | Không có nút; API không có route | P2 | FR-WS-01 L390, REQ L1045 | Chưa có |
| E2E-CAT-07 | Ô địa chỉ và nút Google Maps | — | Để trống Address; nhập địa chỉ rồi bấm Google Maps | Trống: nút bị khóa, gợi ý dùng địa chỉ shop; có địa chỉ: mở tab mới `https://www.google.com/maps/search/?api=1&query=…` (không kèm ghi chú) | P2 | FR-WS-01 L388 | Chưa có |
| E2E-CAT-08 | Đổi giá không đổi booking cũ | Workshop có booking ở session đã đóng | Deactivate, đổi giá, Activate; đặt booking mới | Booking cũ giữ đơn giá và tổng cũ; booking mới theo giá mới | P0 | BR-05, AC-06, FR-WS-01 L391 | Chưa có |
| E2E-CAT-09 | Tìm và lọc workshop | Workshop có tên vi và en | Tìm theo tên tiếng Anh, tiếng Việt (có / không dấu); lọc Draft / Active | Kết quả đúng (xem Mục 5, C14 về tìm không dấu) | P2 | FR-WS-01 L392, REQ L1052 | Chưa có |
| E2E-CAT-10 | Schedule rule sinh session | Workshop `ACTIVE` | Tab Schedule: tạo rule thứ 2, 4 lúc 09:00 | Session được sinh cho 60 ngày tới theo múi giờ shop, trạng thái `OPEN`; tạo lại không sinh trùng | P1 | FR-SCHED-01, REQ L1047-1048 | Chưa có |
| E2E-CAT-11 | Sửa / xóa rule | Rule có một session đã có booking | Sửa giờ của rule; xóa rule | Session tương lai chưa ai đụng bị xóa và sinh lại; session có booking / đã dời / đã bắt đầu giữ nguyên | P1 | FR-SCHED-01 L401, REQ L1047 | Chưa có |
| E2E-CAT-12 | Tạo session lẻ | Workshop `ACTIVE` | Thêm session tương lai; thêm session ngày quá khứ / giờ đã qua | Tương lai: `OPEN`, mã `SES-nnnn` tăng dần; quá khứ: ô ngày chặn, báo "The start cannot be in the past…", API từ chối | P1 | FR-SCHED-02 L405, REQ L1046 | Đã có (một phần): `owner.spec.ts` › starts a session… (tạo qua API, không kiểm quá khứ) |
| E2E-CAT-13 | Vòng đời session | Session `OPEN` | Start → Pause → Start → Pause → Close | `OPEN`→`RUNNING`→`PAUSED`→`RUNNING`→`PAUSED`→`CLOSED`; mỗi trạng thái chỉ hiện nút hợp lệ; chuyển sai qua API bị từ chối | P0 | FR-SCHED-02 L405, §6.3, REQ L1046 | Đã có (một phần): `owner.spec.ts` › starts a session, and cancels a booking of it… (chỉ Start) |
| E2E-CAT-14 | Edit session | Session `OPEN` có 2 chỗ đã đặt | Mở Edit; đặt sức chứa 1; xem trường ngày giờ; session `RUNNING` | Sức chứa < số đã đặt bị từ chối; ngày giờ chỉ đọc; `RUNNING` không có nút Edit | P1 | FR-SCHED-02 L405, REQ L1046 | Chưa có |
| E2E-CAT-15 | Lý do khi Close trước giờ | Session `PAUSED` chưa bắt đầu | Close với Other để trống; Other có text; tìm lý do "The workshop has been completed" | Other trống bị chặn; có text (≤ 300) thì đóng, thẻ ghi "{ngày} - Closed because: …"; lý do "completed" không chọn được trước giờ | P1 | FR-SCHED-02 L405, REQ L1046 | Chưa có |
| E2E-CAT-16 | Đóng session báo khách | Session có booking `NOT_CONFIRMED`, `CONFIRMED` (có email) và một booking đã hủy | Close | Mỗi booking còn hiệu lực nhận một email `session-notice` loại CLOSED; booking đã hủy không nhận | P0 | FR-SCHED-02 L405, AC-08, REQ L1052 | Chưa có |
| E2E-CAT-17 | Re-open session đã đóng trước giờ | Session do owner đóng trước giờ | Re-open | Về `OPEN`; lịch sử ghi chú giữ nguyên, thêm dòng Re-opened | P1 | FR-SCHED-02 L405, §6.3 | Chưa có |
| E2E-CAT-18 | Giới hạn đóng / dời | Session đã đóng 3 lần, dời 3 lần | Đóng lần 4; dời lần 4 | Popup lần đóng thứ 4 cảnh báo đóng vĩnh viễn, sau đó không còn Re-open; nút dời bị khóa kèm tooltip; API từ chối lần vượt | P1 | FR-SCHED-02 L405, REQ L1046 | Chưa có |
| E2E-CAT-19 | Re-schedule session | Session `PAUSED` có booking có email | Chọn ngày giờ mới tương lai + lý do | Giờ mới được lưu; khách có email nhận email (giờ cũ, giờ mới, lý do, mã); thẻ ghi "Re-scheduled because: …"; giờ trùng session khác cùng workshop / quá khứ / không đổi bị từ chối | P0 | FR-SCHED-02 L405, AC-08, REQ L1046, L1052 | Chưa có |
| E2E-CAT-20 | Clone session | Một session bất kỳ (kể cả `CLOSED`) | Clone, chọn ngày giờ mới | Session mới `OPEN`, mã mới, cùng workshop / sức chứa / cut-off / ảnh, ghi "Cloned from …" | P2 | FR-SCHED-02 L405 | Chưa có |
| E2E-CAT-21 | Tự đóng khi hết giờ | Session có `ends_at` đã qua | Chờ job `sessions.sweep` (mỗi phút) hoặc mở một trang của shop | `CLOSED` với ghi chú "Automatically closed because the session time has ended."; khách nhận email một lần | P1 | FR-SCHED-02 L405, REQ L1049 | Chưa có (cần hook thời gian) |
| E2E-CAT-22 | Close lúc đang diễn ra | Session đã bắt đầu, chưa kết thúc | Mở popup Close | Chỉ có lý do "The workshop has been completed" (chọn sẵn); email cảm ơn khách | P2 | FR-SCHED-02 L405 | Chưa có (cần hook thời gian) |
| E2E-CAT-23 | Không có hủy session | — | Tìm nút / API hủy session | Không có nút, hộp thoại hay API hủy | P2 | FR-SCHED-03, REQ L1046 | Chưa có |
| E2E-CAT-24 | Cut-off theo từng session | — | Tạo session với cut-off −1, 10081, 0 | Ngoài 0–10080 bị từ chối; 0 = đóng đặt chỗ đúng giờ bắt đầu; thẻ session ghi cut-off | P1 | FR-BOOK-02 L422, REQ L977 | Chưa có |
| E2E-CAT-25 | Lọc Sessions | Session ở nhiều trạng thái | Lọc Open / Paused / Running / Closed, workshop, khoảng ngày | Danh sách đúng điều kiện | P2 | FR-SCHED-02 L407 | Đã có (một phần): `owner.spec.ts` › starts a session… (lọc theo ngày) |
| E2E-CAT-26 | Đổi workshop của session | — | — | — | P2 | FR-SCHED-02 L405, WAI L46 | Chưa có — tính năng chưa làm (không đổi workshop khi chạy với API) |

### 2.5 Chủ shop: landing page builder (SITE)

| ID | Tiêu đề | Tiền điều kiện | Các bước | Kết quả mong đợi | Ưu tiên | Tham chiếu | Trạng thái tự động hóa |
|---|---|---|---|---|---|---|---|
| E2E-SITE-01 | Autosave bản nháp | Một page của shop | Sửa Title của hero; chờ "Draft saved"; mở lại builder | Bản nháp lưu ở server (debounce 2 giây); mở lại thấy giá trị mới (`builder-source` ghi đang xem bản nháp) | P1 | FR-SITE-02 L335, L343 | Đã có: `owner.spec.ts` › edits the landing page in the builder: the draft is kept by the server… |
| E2E-SITE-02 | Bản nháp không đổi trang live | Page đang public | Sửa và để autosave, không Publish; mở trang shop | Trang live vẫn nội dung cũ | P1 | FR-SITE-02 AC L344, REQ L1051 | Chưa có |
| E2E-SITE-03 | Publish đưa nội dung lên trang live | Shop `ACTIVE` | Publish | Trang shop hiện nội dung mới; version tăng | P1 | FR-SITE-04 | Đã có (một phần): `owner.spec.ts` › edits the landing page in the builder… (chưa kiểm version) |
| E2E-SITE-04 | Checklist chặn lần publish đầu | Shop `DRAFT` mới, chưa có workshop / liên hệ | Mở builder | Nút Publish khóa kèm checklist (`checklist-publish`); API `409 CHECKLIST` với `details.missing` (`HERO`, `SHOP_NAME`, `CONTACT`, `WORKSHOP_WITH_SESSION`) | P0 | FR-SITE-04 L352, REQ L1051 | Chưa có |
| E2E-SITE-05 | Luồng chính: đăng ký → publish là public ngay | Email mới | Đăng ký shop → onboarding → tạo workshop + rule / session, Start → sửa landing page → Publish → mở `{slug}.localtest.me` | Shop `ACTIVE` ngay, không qua duyệt; trang public; audit `shop.publish` | P0 | REQ §12.1 E2E, FR-SITE-04 L351, BR-13, AC-01, AC-03 | Chưa có |
| E2E-SITE-06 | Tối đa 2 landing page | Shop đã có 2 page | Tạo page thứ 3 (UI và API) | Nút Create khóa kèm thông báo; API `409 LIMIT` (kể cả hai request đồng thời) | P1 | FR-SITE-07 L359, REQ L1051 | Chưa có |
| E2E-SITE-07 | Tên page | — | Tạo page tên rỗng / 61 ký tự / "  Main  " | Rỗng và 61 bị từ chối; tên được trim | P2 | FR-SITE-07 L360, REQ L1051 | Chưa có |
| E2E-SITE-08 | Chỉ một page public | Page A đang public | Publish page B | Hộp xác nhận nói page A ngừng public; sau đó chỉ B live, nội dung A giữ nguyên; builder cảnh báo `builder-replaces-live` | P1 | FR-SITE-07 L362, REQ L1051 | Chưa có |
| E2E-SITE-09 | Xóa landing page | Page đang public và một page khác | `DELETE /site/pages/{id}` cho từng page | Page đang public: `409 PAGE_IS_LIVE`; page khác: `204`. Nút Delete trên giao diện chưa có | P2 | FR-SITE-07 L363, REQ L1051, WAI L47 | Chưa có — tính năng chưa làm (giao diện); API kiểm được |
| E2E-SITE-10 | Hero đầu, Footer cuối | Builder mở | Kéo / dùng mũi tên đưa section lên trước Hero, xuống sau Footer; thêm section; đổi template | Hero và Footer không có tay kéo / mũi tên; không section nào chen trước Hero hay sau Footer | P1 | FR-SITE-02 L336 | Chưa có |
| E2E-SITE-11 | Thêm, xóa, bật / tắt section | Builder mở | Thêm Gallery, tắt About, xóa Gallery, thử xóa Footer | Thao tác được, trừ Footer không xóa được | P2 | FR-SITE-02 L332, L334 | Chưa có |
| E2E-SITE-12 | Đổi template | Builder có nội dung | Preview template khác; áp dụng | Preview trước khi áp dụng; nội dung section cùng loại được giữ | P2 | FR-SITE-01 L313-314 | Chưa có |
| E2E-SITE-13 | Server kiểm nội dung trang | Owner có page | `PUT …/draft` với: thiếu hero; khóa `script` / `dangerouslySetInnerHTML`; màu không phải hex; link bản đồ không phải Google Maps; id YouTube sai; trường lạ | `422` kèm `fields` (ví dụ `content.sections.0: heroFirst`, `maps_url`, `youtube_id`, `unknownField`) | P0 | FR-SITE-02 L340, REQ L1051, NFR-SEC-03 | Chưa có |
| E2E-SITE-14 | Contrast màu chặn publish | Builder | Đặt màu chữ / nền của section contrast < 4.5:1 | Cảnh báo trong builder; Publish bị chặn | P1 | FR-SITE-02 L338 | Chưa có |
| E2E-SITE-15 | Ngôn ngữ trong builder | Shop bật en + vi | Mở thanh chọn ngôn ngữ; để trống bản vi; mở `/vi` trang live | Chỉ liệt kê en, vi; cảnh báo thiếu bản dịch; trang `/vi` dùng nội dung ngôn ngữ mặc định cho phần thiếu | P1 | FR-SITE-02 L341-342 | Chưa có |
| E2E-SITE-16 | Preview | Builder | Mở preview desktop / mobile, đổi ngôn ngữ, bấm Book đi hết các bước | Cùng renderer với trang public; Book chỉ báo "Preview … No booking was made"; nút Log in / Register hiện nhưng không bấm được | P1 | FR-SITE-03, FR-BOOK-02 L440, FR-SITE-05 L372 | Chưa có |
| E2E-SITE-17 | Preview chỉ cho thành viên shop | — | Mở `/shopowner/{slug}/site/preview` khi chưa đăng nhập; bằng owner của shop khác | Chưa đăng nhập: về đăng nhập; shop khác: `404` | P0 | FR-SITE-03 L348, REQ §3.3 | Chưa có |
| E2E-SITE-18 | Phiên bản và rollback | Page đã publish 2 lần | `GET …/versions`; `POST …/rollback/1` | Phiên bản 1 trở thành bản nháp; trang live không đổi | P2 | FR-SITE-04 L355, REQ L1051 | Chưa có (API có; chưa xác nhận giao diện có màn hình phiên bản) |
| E2E-SITE-19 | Section video | Builder | Thêm 6 link YouTube; mở trang live, bấm Play | Tối đa 5 link; player `youtube-nocookie.com` chỉ tải khi bấm Play; không vi phạm CSP | P2 | FR-SITE-02 L331, L340 | Chưa có |
| E2E-SITE-20 | Shop bị khóa không lưu / publish | Shop `SUSPENDED` | Autosave; Publish | `403` | P1 | FR-SITE-04 L353, REQ L1051 | Chưa có |
| E2E-SITE-21 | Section Promotions trong builder | Builder | Chọn section Promotions; bấm "Go to Promotion management" | Thông báo nội dung do Promotion management quản lý; bản nháp được lưu trước khi chuyển trang | P2 | FR-PROMO-01 L550 | Chưa có |
| E2E-SITE-22 | Một quy tắc validation props cho API và builder | Một page của shop | `PUT draft` với hero thiếu `imageUrl` và footer `{}`; rồi lưu bản đủ trường, mở builder | Thiếu trường: `422` kèm tên trường (`content.sections.0.props.imageUrl`); bản đủ trường: builder không có thông báo "marked as needing attention", Publish bật, sửa và autosave được | P1 | FR-SITE-02 (quy tắc validation props), `section-props.ts` | Đã có: `owner.spec.ts` › the API refuses a page whose sections lack fields… |

### 2.6 Chủ shop: khuyến mãi (PROMO)

| ID | Tiêu đề | Tiền điều kiện | Các bước | Kết quả mong đợi | Ưu tiên | Tham chiếu | Trạng thái tự động hóa |
|---|---|---|---|---|---|---|---|
| E2E-PROMO-01 | Tạo và Start khuyến mãi | Owner, workshop `ACTIVE` | Tạo PERCENT 10% kỳ chứa hôm nay → Save → Start; tạo một khuyến mãi bắt đầu tuần sau → Start | Sau Save luôn `PAUSED`; Start → `ACTIVE` (hôm nay trong kỳ) hoặc `SCHEDULED` (chưa tới ngày) | P1 | FR-PROMO-01 L543, L556 | Chưa có |
| E2E-PROMO-02 | Kiểm tra form khuyến mãi | — | Mã 2 ký tự / 21 ký tự / có khoảng trắng giữa / ký tự đặc biệt / "  sale10  "; PERCENT 101; ngày cuối trước ngày đầu; ngày cuối đã qua | Lỗi `codeInvalid`, `percentTooHigh`, `endBeforeStart`, `endInPast`; mã hợp lệ được trim và lưu chữ hoa `SALE10` | P1 | FR-PROMO-01 L542, L556, REQ L552 | Chưa có |
| E2E-PROMO-03 | Mã trùng | Shop có mã `SALE10` (đang tạm dừng); shop khác | Tạo `sale10` ở cùng shop; tạo `SALE10` ở shop khác | Cùng shop: `codeTaken`; shop khác: được | P1 | FR-PROMO-01 L558 | Chưa có |
| E2E-PROMO-04 | Tối đa 5 khuyến mãi chạy cùng ngày | 5 khuyến mãi đang chạy trùng ngày | Start khuyến mãi thứ 6 trùng ngày | `409 CONCURRENT_LIMIT` kèm ngày; pop-up có nút OK; "Running now: 5 of 5" | P1 | FR-PROMO-01 L545, L553 | Chưa có |
| E2E-PROMO-05 | Tối đa 20 khuyến mãi | Shop có 20 khuyến mãi | Tạo cái thứ 21 | `409 LIMIT_REACHED`, pop-up | P2 | FR-PROMO-01 L542, L545 | Chưa có |
| E2E-PROMO-06 | Chặn giảm 100% | Khuyến mãi MULTIPLE 60% đang chạy | Tạo và Start MULTIPLE 40% cùng ngày, cùng workshop | Form báo đỏ các workshop sẽ miễn phí, Save không lưu; API `422 FULL_DISCOUNT` kèm `workshopIds`; Start / Resume bị chặn tương tự | P0 | FR-PROMO-01 L547 | Chưa có |
| E2E-PROMO-07 | Cảnh báo vượt ngân sách | Khuyến mãi MULTIPLE 50% đang chạy | Tạo MULTIPLE 30% cùng ngày | Cảnh báo vàng (≥ 80%); Save hiện "Go back and change" / "Save anyway"; Save anyway lưu được | P2 | FR-PROMO-01 L546 | Chưa có |
| E2E-PROMO-08 | Chỉ sửa / xóa khuyến mãi tạm dừng | Khuyến mãi `ACTIVE` | Tìm Edit / Delete; gọi `PUT` / `DELETE` | Giao diện chỉ có Pause; API `409 EDIT_NOT_ALLOWED` / `409 DELETE_NOT_ALLOWED` | P1 | FR-PROMO-01 L556, L558, REQ L552 | Chưa có |
| E2E-PROMO-09 | Không Pause khi đang được dùng | Booking còn hiệu lực của session chưa kết thúc đang dùng khuyến mãi | Pause | `409 PROMOTION_IN_USE` kèm mã booking, pop-up | P1 | FR-PROMO-01 L558, REQ L552 | Chưa có |
| E2E-PROMO-10 | Khuyến mãi hết hạn: Renew | Khuyến mãi `EXPIRED` | Xem nút; Renew | Chỉ có Renew và Delete; Renew mở popup, con trỏ ở First day với gợi ý; lưu xong `PAUSED` | P2 | FR-PROMO-01 L556-557 | Chưa có (cần hook thời gian để có khuyến mãi hết hạn) |
| E2E-PROMO-11 | Khách chọn khuyến mãi trong form đặt chỗ | 2 MULTIPLE (20%, 15%) và 1 SINGLE đang chạy cho workshop | Tick 2 MULTIPLE; rồi tick SINGLE; rồi tick lại 1 MULTIPLE | 20% + 15% = giảm 35% giá gốc; tick SINGLE bỏ tick mọi lựa chọn khác; tick MULTIPLE bỏ SINGLE; chú thích `role=status` nêu lý do; tổng không âm | P0 | FR-PROMO-01 L554-555 | Chưa có |
| E2E-PROMO-12 | Server kiểm khuyến mãi khách gửi | — | Đặt chỗ với `promotionIds` của khuyến mãi chưa chạy / không áp dụng workshop; với SINGLE + MULTIPLE | `422 fields.promotionIds = unavailable` / `notCombinable`; không âm thầm bỏ qua | P0 | REQ L552, BR-04 | Chưa có |
| E2E-PROMO-13 | Booking giữ mức giảm cũ | Booking đã dùng khuyến mãi | Pause (sau khi session kết thúc), sửa mức giảm, xóa khuyến mãi | Tổng và giảm giá của booking cũ không đổi | P0 | BR-05, REQ L552 | Chưa có |
| E2E-PROMO-14 | Khuyến mãi bị admin tạm dừng | Admin hold một khuyến mãi đang chạy | Owner xem và bấm Start; khách mở form đặt chỗ | Owner thấy "tạm dừng bởi nền tảng" + lý do (`promotion-held`); Start bị `409 HELD_BY_ADMIN`; khách không còn thấy khuyến mãi | P1 | FR-ADM-25 L780 | Chưa có |
| E2E-PROMO-15 | Cột khuyến mãi trong danh sách workshop | Có khuyến mãi MULTIPLE và SINGLE đang chạy | Mở Workshops | "Promotions you can apply" kèm thời gian; "Maximum discount" có phần "All n promotions can be combined" và "Promotions used on their own" | P2 | FR-PROMO-01 L548 | Chưa có |
| E2E-PROMO-16 | Khuyến mãi cho booking tay của shop | — | — | — | P2 | FR-OPS-02 L503, REQ L552 | Chưa có — tính năng chưa làm |
| E2E-PROMO-17 | Tìm và lọc khuyến mãi | Nhiều khuyến mãi | Tìm theo tiêu đề (không dấu), khoảng ngày, workshop; xóa bộ lọc | Kết quả đúng, có số kết quả | P2 | FR-PROMO-01 L544 | Chưa có |

### 2.7 Chủ shop: tài chính (FIN)

| ID | Tiêu đề | Tiền điều kiện | Các bước | Kết quả mong đợi | Ưu tiên | Tham chiếu | Trạng thái tự động hóa |
|---|---|---|---|---|---|---|---|
| E2E-FIN-01 | Income chỉ tính booking đã thanh toán | Một booking vừa Confirm payment, một booking `UNPAID` | Mở Finance; Unpaid booking đã trả; mở lại | Chỉ booking `PAID` có trong bảng và tổng; sau Unpaid có dòng Reversal (số âm) và tổng giảm tương ứng | P0 | FR-PAY-02 L529, REQ L533 | Chưa có |
| E2E-FIN-02 | Phí tính trên giá gốc | Booking giá 100 (minor units theo tiền tệ) dùng khuyến mãi 50%, đã thanh toán; tỷ lệ 10% / 10% | Xem dòng trên Finance | Thu = 50; phí duy trì = 10, phí dịch vụ = 10 (trên giá gốc 100); lợi nhuận = 30; tooltip Amount nêu giá gốc và khuyến mãi | P0 | FR-PAY-02 L529-530, REQ L533 | Chưa có |
| E2E-FIN-03 | Khoảng ngày của Finance | — | Mặc định; From sau To; khoảng 366 ngày; khoảng 31 và 32 ngày | Mặc định 180 ngày; `422 beforeFrom` / `tooLong`; biểu đồ theo ngày khi ≤ 31 ngày, theo tháng khi dài hơn | P2 | FR-PAY-02 L530, REQ L533 | Chưa có |
| E2E-FIN-04 | Lọc loại khoản | Có Payment và Reversal | Lọc PAYMENT / REVERSAL | Bảng đúng loại; cột Promotions applied | P2 | FR-PAY-02 L530, REQ L533 | Chưa có |
| E2E-FIN-05 | Shop không thấy phí affiliate / referral | Booking qua link affiliate đã thanh toán | Xem Finance của owner | Không có Affiliate fee hay Referral bonus; lợi nhuận shop không bị trừ | P1 | FR-ADM-16 L728, REQ L533 | Chưa có |
| E2E-FIN-06 | Đổi tỷ lệ phí chỉ áp dụng về sau | Booking A đã thanh toán với 10% | Admin đổi phí duy trì thành 20%; Confirm payment booking B | A giữ 10%, B tính 20%; Unpaid A dùng tỷ lệ của khoản A | P0 | D24, REQ L1091 | Chưa có |
| E2E-FIN-07 | Kết sổ tháng | Shop có thanh toán ở tháng trước | Worker `finance.close` chạy | Tháng trước `closed`; chạy lại không kết lần hai; số liệu tháng đã kết không đổi | P0 | D11, FR-ADM-24, REQ L1091 | Chưa có (cần hook thời gian / dữ liệu tháng trước) |
| E2E-FIN-08 | Shop không có rút tiền / ví | Owner đăng nhập | Tìm menu Withdrawals / Wallet; mở `/shopowner/{slug}/withdrawals` | Không có menu; route không tồn tại (404) | P2 | D22 | Chưa có |
| E2E-FIN-09 | Gửi invoice phí cho shop | — | — | — | P2 | A1, FR-ADM-24 L774 | Chưa có — tính năng chưa làm |
| E2E-FIN-10 | Thẻ Income của Overview | Booking đã thanh toán tháng này | Mở Overview | Thẻ Income & expenses: thu, phí, lợi nhuận của tháng này (xem Mục 5, C13) | P2 | FR-PAY-03 L536, REQ L539 | Chưa có |

### 2.8 Chủ shop: cài đặt & tên miền (SET)

| ID | Tiêu đề | Tiền điều kiện | Các bước | Kết quả mong đợi | Ưu tiên | Tham chiếu | Trạng thái tự động hóa |
|---|---|---|---|---|---|---|---|
| E2E-SET-01 | Lưu cài đặt shop | Owner seed | Đổi Phone → Save changes → reload | Thông báo đã lưu; giá trị giữ sau reload | P1 | FR-ORG-02 | Đã có: `owner.spec.ts` › changes the settings of the shop, and the server keeps them |
| E2E-SET-02 | Nút Save chỉ bật khi đổi | — | Mở Settings; sửa rồi trả về giá trị cũ | Save khóa → bật → khóa lại | P2 | BR-17 | Chưa có |
| E2E-SET-03 | Kiểm tra cài đặt | — | Múi giờ `Mars/Base`; tiền tệ `XYZ`; ngôn ngữ mặc định không nằm trong ngôn ngữ bật; Maps URL `http://` | `422` kèm `fields` tương ứng | P1 | FR-ORG-02, REQ L306 | Chưa có |
| E2E-SET-04 | Đổi múi giờ / tiền tệ khi đã có booking | Shop có booking | Đổi múi giờ và tiền tệ | Lưu được, hiện cảnh báo (`timezoneChangedWithBookings`, `currencyChangedWithBookings`); booking cũ không đổi giá trị | P1 | FR-ORG-02 L299, REQ L306 | Chưa có |
| E2E-SET-05 | Slug không đổi được | — | Xem ô slug; `PATCH /organization` với `slug`, `status` khác | Ô chỉ đọc; `slug` và `status` trong body bị bỏ qua | P0 | BR-21, FR-ORG-01 L308, REQ L306 | Chưa có |
| E2E-SET-06 | Nhập tên miền riêng | — | Nhập `https://WWW.Shop-{ts}.example/path?x=1` → Save | Lưu `www.shop-{ts}.example`; hiện hướng dẫn CNAME tới `{slug}.localtest.me` (`domain-target`), `verified = false` | P1 | FR-ORG-02 L300-303, REQ L306 | Chưa có |
| E2E-SET-07 | Tên miền không hợp lệ | — | `127.0.0.1`, `localhost`, `shop`, nhãn 64 ký tự, `-a.com`, `x.localtest.me` | `422 fields.domain = invalid / platform / tooLong` | P1 | FR-ORG-02 L301, REQ L305 | Chưa có |
| E2E-SET-08 | Tên miền đã thuộc shop khác | Shop A đã lưu tên miền | Shop B lưu cùng tên miền | `409 DOMAIN_TAKEN` | P1 | FR-ORG-02 L302 | Chưa có |
| E2E-SET-09 | Gỡ tên miền | Shop có tên miền | Xóa trống → Save | Tên miền bị gỡ; audit `shop.domain_remove` (cũ -> mới) | P2 | FR-ORG-02 L301, L305 | Chưa có |
| E2E-SET-10 | Xác minh DNS | Shop chưa có tên miền; shop có tên miền không có CNAME | `POST /shop/domain/verify` | Chưa có tên miền: `409 NO_DOMAIN`; CNAME sai / không có: `verified = false` | P1 | REQ L306, D13 | Chưa có (trường hợp `verified = true`: Không tự động được, cần DNS thật) |
| E2E-SET-11 | Phục vụ landing page ở tên miền đã xác minh | Tên miền đã xác minh | Mở `/`, `/shopowner`, `/systemadmin`, `/customer` trên tên miền đó; xem canonical / sitemap | Chỉ landing page của shop; các khu quản lý `404`; canonical, sitemap, robots dùng tên miền riêng | P1 | FR-ORG-02 L304, `proxy.ts` L18-25 | Không tự động được (cần DNS thật để xác minh; có thể làm nếu thêm hook đặt `custom_domain_verified_at` trong database test, Mục 4.2) |
| E2E-SET-12 | Chuyển hướng 301 sang tên miền riêng và cấp TLS | — | — | — | P2 | D13, REQ L306 | Chưa có — tính năng chưa làm (hạ tầng, cần người duyệt; ngay cả khi làm cũng không tự động được nếu không có DNS / TLS thật) |
| E2E-SET-13 | Shop bị khóa không đổi tên miền | Shop `SUSPENDED` | `PUT /shop/domain` | Bị từ chối (`403`) | P2 | REQ L306 | Chưa có |
| E2E-SET-14 | Khối "Need help?" của chủ shop | Admin đã nhập kênh hỗ trợ | Mở menu trái và khung Publish của builder | Chỉ hiện kênh đã nhập (`wa.me`, `tel:`, `zalo.me`, `mailto:`); không hiện trên trang public | P2 | FR-ADM-07 L668, L671 | Chưa có |
| E2E-SET-15 | Log out ở menu trái của chủ shop | Owner đăng nhập | Bấm `sidebar-logout` | Phiên kết thúc, về trang công khai | P2 | FR-ADM-07 L670 | Chưa có |

### 2.9 Khách hàng (CUST)

| ID | Tiêu đề | Tiền điều kiện | Các bước | Kết quả mong đợi | Ưu tiên | Tham chiếu | Trạng thái tự động hóa |
|---|---|---|---|---|---|---|---|
| E2E-CUST-01 | Mọi trang khu customer mở được | Customer mới | Mở today, bookings, workshops, favorites, referrals, affiliate, profile | Có `main` và h1, không "This page couldn’t load" | P1 | FR-BOOK-06, WAI L55-63 | Đã có: `customer.spec.ts` › opens every page of their area, and a favorite is kept by the server |
| E2E-CUST-02 | Yêu thích | Customer, shop được hiển thị | Thả tim ở Workshops; mở Favorites; bỏ tim | Favorites có đúng workshop đó; bỏ tim thì thẻ biến mất; trống thì "No favorite workshops yet…" | P2 | FR-BOOK-06 L465, REQ L488 | Đã có (một phần): `customer.spec.ts` › opens every page of their area, and a favorite is kept by the server (chưa kiểm bỏ tim) |
| E2E-CUST-03 | Trang Workshops | Shop A hiển thị, shop B bị ẩn | Mở Workshops; tìm theo tên shop, tên workshop không dấu; tìm chuỗi không có | Chỉ workshop `ACTIVE` của shop `ACTIVE` được chọn; mỗi thẻ có "Shop: …" và rating hoặc "No ratings yet"; không khớp thì "No workshop matches “…”." | P2 | FR-BOOK-06 L464, REQ L488 | Chưa có |
| E2E-CUST-04 | Thứ tự xếp công bằng (`rankWorkshops`) | — | — | Theo số category trùng, luân phiên shop, seed theo ngày + id khách | P2 | FR-BOOK-06 L464 | Không tự động được ổn định bằng E2E (seed đổi theo ngày; nên giữ ở unit test của `packages/shared`) |
| E2E-CUST-05 | Đặt chỗ từ khu customer | Customer có hồ sơ đủ | Book ở trang Workshops | Họ tên và Email chỉ đọc kèm "From your account."; Quốc gia và Phone sửa được cho lần đặt này; hồ sơ không đổi | P1 | FR-BOOK-06 L464 | Chưa có |
| E2E-CUST-06 | My Profile | Customer | Sửa họ tên 121 ký tự; ngày sinh tương lai; 2 category; avatar `http://`; rồi dữ liệu hợp lệ | Lỗi `tooLong`, `future`, `count`, `invalid`; hợp lệ thì lưu; email chỉ đọc; Save chỉ bật khi đổi | P1 | FR-BOOK-06 L463, REQ L488 | Chưa có |
| E2E-CUST-07 | Nhắc bổ sung hồ sơ | Customer mới đăng ký qua popup (chưa có ngày sinh) | Mở Profile; lưu ngày sinh | Khung nhắc (`profile-incomplete`) hiện, biến mất sau khi lưu | P2 | D1, FR-AUTH-01 L275 | Chưa có |
| E2E-CUST-08 | My Booking | Customer có booking ở 2 shop (đặt bằng email tài khoản), một booking đã hủy | Mở My Booking; bấm All / Upcoming / Past / Cancelled; tìm theo mã | Có booking của mọi shop; tab vừa là số vừa là bộ lọc; booking sắp tới gần nhất có "Next up" | P1 | FR-BOOK-06 L466-470, REQ L488 | Chưa có |
| E2E-CUST-09 | Khách tự check-in | Booking `CONFIRMED` của session `RUNNING` bắt đầu trong 60 phút; booking `NOT_CONFIRMED`; booking của session tuần sau | Bấm Check in ở từng booking | Booking đầu: `CHECKED_IN`, báo "You are checked in for booking …"; booking chưa xác nhận: khóa, "Open the link in your confirmation email…"; quá sớm: khóa, "Check-in opens at …" (`409 NOT_CHECKABLE`, `TOO_EARLY`) | P1 | FR-BOOK-06 L476, REQ L488 | Chưa có |
| E2E-CUST-10 | Đánh giá workshop | Booking `CHECKED_IN`, session đã kết thúc | Rate this workshop: 0 sao; 4 sao + nhận xét 501 ký tự; 4 sao hợp lệ; gửi lần hai | Nút khóa trước khi đủ điều kiện; lỗi `starsInvalid` / `tooLong`; thành công thì "Bạn đã đánh giá 4/5"; lần hai `409 ALREADY_RATED` | P1 | FR-BOOK-06 L472, D8, D9, REQ L488 | Chưa có (cần hook thời gian để session kết thúc) |
| E2E-CUST-11 | Khách hủy từ My Booking | Booking `CONFIRMED` session tương lai; booking `CHECKED_IN` | Cancel booking chọn lý do; chọn Other có text; booking `CHECKED_IN` | Hủy được, danh sách cập nhật, "Booking … was cancelled."; khách và shop nhận email; booking `CHECKED_IN`: nút khóa kèm lý do | P0 | FR-BOOK-06 L477, BR-11 | Chưa có |
| E2E-CUST-12 | Today của customer | Booking hôm nay, tuần này | Mở Today | Lời chào theo giờ; khối workshop hôm nay; "Cần bạn xử lý" khi có booking chưa xác nhận; 7 ngày tới; 4 số liệu dẫn tới trang tương ứng | P2 | FR-BOOK-06 L479-486 | Chưa có |
| E2E-CUST-13 | Đăng ký Affiliate | Customer, workshop `ACTIVE`, workshop `DRAFT` | Register Affiliate; đăng ký lại; đăng ký workshop nháp | Nút thành Copy Affiliate link, không hủy được; mã `A` + 8 ký tự; lần hai `200` cùng link; workshop nháp `409 WORKSHOP_INACTIVE` | P1 | FR-CUST-02 L577, REQ L584 | Đã có (một phần): `customer.spec.ts` › opens every page of their area… (tạo link qua API, kiểm tab Affiliate link) |
| E2E-CUST-14 | Affiliate fee chờ kết sổ | Booking qua link của customer đã `PAID` (tháng chưa kết sổ) | Mở Affiliate | Paid bookings = 1, Earned = tỷ lệ × giá gốc; số tiền ở trạng thái chờ kết sổ (`unsettled`), không tính vào có thể rút; thông báo `wallet-closing-notice` | P0 | FR-CUST-02 L584, D23, FR-CUST-04 L606 | Chưa có |
| E2E-CUST-15 | Mời bạn bè (Referrals) | Customer A | A mở Referrals; B đăng ký với `inviteCode` của A; A tự dùng mã của mình; mã sai | Link duy nhất mã `I` + 8 ký tự, không đổi; B hiện "Registered, waiting for a paid booking" với email che; tự mời / mã sai bị bỏ qua, tài khoản vẫn tạo | P1 | FR-CUST-03, REQ L593 | Chưa có |
| E2E-CUST-16 | Bonus referral một lần | B là bạn của A; B có booking đặt trước khi đăng ký và 2 booking sau | Thanh toán các booking của B | Chỉ booking `PAID` đầu tiên đặt sau khi đăng ký mang bonus; booking trước đăng ký không tính; Unpaid booking đầu thì bonus chuyển sang booking đã thanh toán kế tiếp | P0 | FR-CUST-03 L590, REQ L593 | Chưa có |
| E2E-CUST-17 | Yêu cầu rút tiền | Ví có `available` > 0 (tháng đã kết sổ) | Rút tiền: để trống mọi ô; rồi nhập hợp lệ (số TK `0123 4567-89`) | Báo lỗi mọi ô cùng lúc; hợp lệ tạo invoice `WD-nnnn` Pending, chuyển tab History; số TK hiển thị `****…` 4 ký tự cuối | P0 | FR-CUST-04 L603-605, REQ L610 | Chưa có (cần hook kết sổ để có số dư) |
| E2E-CUST-18 | Giới hạn số tiền rút | Như trên; admin đặt min / max cho tiền tệ | Rút 0; vượt `available`; dưới min; trên max | `422 fields.amount = invalid / exceeds / belowMin / aboveMax` | P0 | FR-CUST-04 L603, FR-ADM-20 L741-742, REQ L610 | Chưa có |
| E2E-CUST-19 | Không có gì để rút | Customer mới | Mở Affiliate và Referrals | Nút Rút tiền bị khóa; có thông báo kết sổ | P1 | FR-CUST-04 L603, D23 | Chưa có |
| E2E-CUST-20 | Hai yêu cầu rút cùng lúc | Ví `available` = X | Gửi 2 yêu cầu X song song | Chỉ một thành công; tổng không vượt số dư | P0 | REQ L610 | Chưa có |
| E2E-CUST-21 | Invoice bị từ chối trả lại tiền | Invoice Pending | Admin Reject có lý do; customer mở History | Trạng thái Rejected kèm lý do; số tiền quay lại `available` | P0 | FR-CUST-04 L607-608, FR-ADM-19 | Chưa có |
| E2E-CUST-22 | Khối "Need help?" của customer | Admin đã nhập kênh hỗ trợ | Mở menu customer | Khối hiện dưới menu với kênh đã nhập | P2 | FR-ADM-07 L669 | Chưa có |
| E2E-CUST-23 | Log out của customer | Customer đăng nhập | Bấm Log out ở menu và ở Profile | Phiên kết thúc, về trang chủ nền tảng (xem Mục 5, C16) | P2 | FR-BOOK-06 L460, WAI L57 | Chưa có |

### 2.10 Admin (ADM)

| ID | Tiêu đề | Tiền điều kiện | Các bước | Kết quả mong đợi | Ưu tiên | Tham chiếu | Trạng thái tự động hóa |
|---|---|---|---|---|---|---|---|
| E2E-ADM-01 | 19 trang admin mở được | Admin seed | Mở organizations, sessions, bookings, customers, landing-pages, affiliate, referrals, ratings, promotions, emails, messages, reports, fees, income, legal, settings, support-contact, audit-logs, media | Có h1, không lỗi, không alert lỗi | P1 | REQ L678, WAI L65-74 | Đã có: `admin.spec.ts` › opens every page of the admin area on the data of the server, with no error in the page |
| E2E-ADM-02 | Các trang admin chưa có trong test trên | Admin | Mở `/systemadmin/users`, `/workshops`, `/withdrawals` | Như ADM-01 | P2 | FR-ADM-08, FR-ADM-10, FR-ADM-19 | Chưa có |
| E2E-ADM-03 | Danh sách và chi tiết shop | Admin | Tìm theo tên / slug / email owner; lọc status; mở chi tiết | Có owner, ngày tạo, số workshop, số booking 30 ngày, tỷ lệ phí | P2 | FR-ADM-01, FR-ADM-09 | Đã có (một phần): `admin.spec.ts` › opens the detail of a shop with its fee rates, and lists or hides it for the customers |
| E2E-ADM-04 | Khóa / mở khóa shop | Shop `ACTIVE` | Deactivate không lý do; có lý do; Activate; khóa lại shop `DRAFT` | Không lý do bị chặn; `SUSPENDED` (trang shop 404, dashboard chỉ đọc); mở khóa về `ACTIVE`; trạng thái khác `409 STATUS` | P0 | FR-ADM-03, FR-ADM-09 L698, REQ L1089 | Chưa có |
| E2E-ADM-05 | Hiển thị shop trên trang Workshops của customer | Admin | List / Hide một shop | `showOnCustomerPage` đổi và đổi lại | P2 | FR-ADM-09 L698, REQ L488 | Đã có: `admin.spec.ts` › opens the detail of a shop with its fee rates, and lists or hides it for the customers |
| E2E-ADM-06 | Admin sửa thông tin shop | Shop có owner | Edit: đổi tên, tên miền đã thuộc shop khác, rồi hợp lệ kèm lý do | Slug chỉ đọc; tên miền trùng `409 DOMAIN_TAKEN`; lưu được; owner nhận email nêu trường đã đổi (không nêu giá trị) và lý do; audit `shop.profile_update` `by: ADMIN` | P1 | FR-ADM-09, D14, D15, REQ L700 | Chưa có |
| E2E-ADM-07 | Vô hiệu hóa người dùng | Customer đang đăng nhập ở trình duyệt khác | Deactivate có lý do; customer bấm tiếp trong phiên; admin tự vô hiệu chính mình; Activate lại | Đăng nhập trả `403`; phiên đang mở kết thúc ngay; tự vô hiệu `409 SELF`; Activate lại thì đăng nhập được | P0 | FR-ADM-08, REQ L1089 | Đã có (một phần): `admin.spec.ts` › deactivates a user: the server refuses their login after it |
| E2E-ADM-08 | Admin sửa tên / điện thoại người dùng | — | — | — | P2 | FR-ADM-08 L692, WAI L73 | Chưa có — tính năng chưa làm (`PATCH /admin/users/{id}` chưa có) |
| E2E-ADM-09 | Admin sửa hộ shop qua API (lý do bắt buộc) | Shop có workshop, session, page | `POST /admin/shops/{shopId}/workshops/{id}/status`, `sessions/{id}/close / reopen / reschedule`, `site/pages/{id}/publish` không có `reason`; rồi có `reason` | Không lý do: `422 ADMIN_REASON_REQUIRED`, không đổi gì; có lý do: thay đổi được thực hiện, audit người làm là admin, owner nhận email | P1 | D15, REQ L714, L1450 | Chưa có |
| E2E-ADM-10 | Màn hình sửa hộ shop `/systemadmin/shops/{slug}/...` | — | — | — | P2 | FR-ADM-10, FR-ADM-13, FR-ADM-14, WAI L73 | Chưa có — tính năng chưa làm (giao diện báo chưa có khi chạy với API) |
| E2E-ADM-11 | Sessions của admin | Session đã bị owner đóng 4 lần | Lọc "chỉ session đã đóng vĩnh viễn"; Open lại có lý do; Close lại | Mở lại không giới hạn số lần; mỗi lần ghi audit; khách nhận email khi đóng | P1 | FR-ADM-13, REQ L712 | Chưa có |
| E2E-ADM-12 | Danh sách booking của admin | Một booking | Tìm theo mã, email, id customer; lọc ngày tạo; To trước From | Kết quả đúng; `422 fields.to = beforeFrom` | P2 | FR-ADM-11 | Chưa có |
| E2E-ADM-13 | Danh sách customer của admin | Email đã đặt ở 2 shop; tài khoản chưa đặt | Tìm theo email, tên shop | Mỗi email một dòng kèm các shop; tài khoản chưa booking cũng có | P2 | FR-ADM-12 | Chưa có |
| E2E-ADM-14 | Danh sách landing page của admin | Shop có page live | Tìm theo tên shop | Mỗi shop có các page (`isLive`, `version`, template), `liveUrl` | P2 | FR-ADM-14 L717 | Chưa có |
| E2E-ADM-15 | Tắt / bật link affiliate | Link đang On | Switch off không lý do; có lý do; tắt lại; mở link; Switch on | Không lý do `422`; tắt được; tắt lại `409 STATUS`; người truy cập thấy "workshop đã kết thúc", booking mới không tính; khoản đã kiếm giữ nguyên | P1 | FR-ADM-15, REQ L725 | Chưa có |
| E2E-ADM-16 | Tắt / bật link referral | Customer có link mời | Switch off có lý do; bạn mới đăng ký bằng link; tắt tài khoản chưa có link | Bạn mới không được tính; bạn cũ và bonus giữ; customer thấy cảnh báo; tài khoản chưa có link `404` | P1 | FR-ADM-18 L733-734 | Chưa có |
| E2E-ADM-17 | Xử lý invoice rút tiền | Invoice Pending | Mark as paid; Reject không lý do; xử lý lại invoice đã xử lý | Hộp xác nhận nêu ngân hàng và số TK đầy đủ; Reject không lý do `422`; lần hai `409 NOT_PENDING`; 3 ô tổng đúng | P0 | FR-ADM-19, REQ L738 | Chưa có (cần hook để có số dư) |
| E2E-ADM-18 | Cấu hình phí | Admin | Nhập 12,5 (dấu phẩy); 100.001; duy trì 60 + dịch vụ 50; Save một dòng; bulk áp dụng 4 tỷ lệ | 12,5 được nhận; quá 2 số lẻ và tổng > 100% bị từ chối (`totalTooHigh`); Save chỉ bật khi đổi; bulk có hộp xác nhận, áp dụng mọi shop | P0 | FR-ADM-17, REQ L1091 | Chưa có |
| E2E-ADM-19 | Income của nền tảng | Shop có thanh toán, có booking qua affiliate và bonus referral | Mở Income; mở Details của shop | Income admin = phí duy trì + phí dịch vụ; lợi nhuận = Income − Affiliate fee − Referral bonus; tổng theo từng tiền tệ; Details có các tháng, invoice = duy trì + dịch vụ, tổng khớp trang Income | P0 | FR-ADM-16, FR-ADM-24 | Chưa có |
| E2E-ADM-20 | Tạm dừng khuyến mãi vi phạm | Khuyến mãi đang chạy | Hold không lý do; có lý do; hold lần hai; Resume | `422`; tạm dừng ngay; `409 ALREADY_HELD`; Resume chạy lại nếu còn hạn | P1 | FR-ADM-25, REQ L782 | Chưa có |
| E2E-ADM-21 | Gỡ đánh giá | Có một đánh giá | Gỡ không lý do; có lý do; gỡ lần hai; Đưa lại | `422`; đánh giá thôi tính vào điểm, shop không thấy; `409 ALREADY_REMOVED`; đưa lại khôi phục | P1 | FR-ADM-27 | Chưa có (cần hook thời gian để có đánh giá) |
| E2E-ADM-22 | Xử lý báo cáo vi phạm | Báo cáo `OPEN` | Resolve có ghi chú; Resolve lần hai | `RESOLVED`; lần hai `409 INVALID_TRANSITION`; mô tả hiển thị dạng chữ thuần | P2 | FR-ADM-04 L646, L649 | Chưa có |
| E2E-ADM-23 | Support inbox | Tin Contact `NEW` | Đổi trạng thái; ghi chú nội bộ; trả lời; xóa | Trả lời gửi email (Mailpit) không chứa ghi chú, tin thành `DONE`; xóa có xác nhận và mất hẳn | P1 | FR-ADM-21, REQ L754 | Chưa có |
| E2E-ADM-24 | Email hệ thống | Có email xác nhận booking đã gửi | Mở email hệ thống; soạn email tới 1 địa chỉ với `<script>`; gửi lại email `SENT` | Nội dung email hệ thống không hiển thị (`content = null`); email soạn được gửi dạng chữ (escape); gửi lại email không lỗi: `409 NOT_FAILED` | P1 | FR-ADM-22, REQ L762 | Chưa có |
| E2E-ADM-25 | Soạn → công bố Terms | Admin | Viết nháp, Save, Publish; mở `/terms` | "Draft saved", "Published."; trang công khai hiện nội dung | P1 | FR-ADM-23, D17 | Đã có: `admin.spec.ts` › writes the Terms as a draft, publishes it, and the public page shows it |
| E2E-ADM-26 | Ngôn ngữ, lịch sử và khôi phục Terms | Terms chỉ có en | Mở `/terms` ở ngôn ngữ vi; Publish khi không có nháp; xem lịch sử, khôi phục bản 1; gỡ ngôn ngữ | vi hiện bản en kèm ghi chú (`legal-fallback`); `409 NO_DRAFT`; bản 1 thành nháp mới; gỡ ngôn ngữ thì trang không còn ngôn ngữ đó, lịch sử còn | P2 | FR-ADM-23 L768, L770 | Chưa có |
| E2E-ADM-27 | Terms không render HTML | Admin | Công bố nội dung có `<b>x</b>` và `<script>` | Trang `/terms` hiện nguyên văn dạng chữ, không có thẻ HTML được dựng, không chạy script | P0 | FR-ADM-23 L766, L770 | Chưa có |
| E2E-ADM-28 | Settings của nền tảng | Admin | `resetLinkHours` 0 / 169; `contactPerHour` 101; `emailRetentionDays` 6; giới hạn rút VND max < min | `422 fields.* = range`; `422 fields.maxAmount = belowMin`; giá trị hợp lệ có hiệu lực ngay, audit `platform.settings_update` | P1 | FR-ADM-20, REQ L742, L746 | Chưa có |
| E2E-ADM-29 | Kênh hỗ trợ | Admin | Phone 6 chữ số; email sai; để trống Zalo; Save | Lỗi dưới ô; kênh trống bị ẩn; owner và customer thấy ngay; khách vãng lai gọi `GET /support-contact` nhận `401` | P2 | FR-ADM-07 L672-675 | Chưa có |
| E2E-ADM-30 | Audit logs | Có thao tác của owner, admin, hệ thống | Lọc theo email (người làm hoặc bị tác động), shop, hành động, khoảng ngày | Kết quả đúng; dòng hệ thống `actor: SYSTEM`; không có mật khẩu, token, nội dung tin / ghi chú | P1 | FR-ADM-05, REQ L1089 | Chưa có |
| E2E-ADM-31 | Kiểm tra landing page `POST /admin/landing-pages/{slug}/audit` | — | — | — | P2 | FR-ADM-14 L716, WAI L73 | Chưa có — tính năng chưa làm (chưa có route) |
| E2E-ADM-32 | Admin sửa workshop của shop trên trang của chủ shop | Admin; shop `whiskladle` | Mở `/systemadmin/shops/whiskladle/workshops`; New workshop không nhập lý do; nhập lý do ở banner rồi Save | Không lý do: `422 ADMIN_REASON_REQUIRED`, không tạo; có lý do: workshop được tạo trong đúng shop, audit `admin_edit.reason`, email `WORKSHOP_CHANGED` tới chủ shop | P1 | FR-ADM-09 (admin sửa hộ), D15 | Đã có: `admin.spec.ts` › edits the workshops of a shop as the administrator… |
| E2E-ADM-33 | Hành động thay shop chỉ dành cho SUPER_ADMIN và chỉ workshop, session | Owner A, owner B, customer, admin | Gửi `X-Act-As-Shop` từ từng vai trò; admin ghi `/organization`, ghi không lý do | Owner / customer: header bị bỏ qua (shop của chính họ hoặc `403`); admin: ghi ngoài workshop, session `403 ACT_AS_NOT_ALLOWED`, thiếu lý do `422` | P0 | FR-ADM-09, §4.3 | Đã có: `security.spec.ts` › E2E-SEC-17 |

### 2.11 Ảnh / Cloudflare R2 (MEDIA)

| ID | Tiêu đề | Tiền điều kiện | Các bước | Kết quả mong đợi | Ưu tiên | Tham chiếu | Trạng thái tự động hóa |
|---|---|---|---|---|---|---|---|
| E2E-MEDIA-01 | Tải ảnh bìa workshop lên R2 | R2 đã cấu hình, `E2E_PORT=3000` | Form workshop → chọn PNG | Một PUT `200` lên R2; ô ảnh có URL `https://…/shops/…(webp/jpg)`; URL trả `image/*`; không lỗi CSP | P1 | FR-MEDIA-01, WAI L85-91 | Đã có: `media.spec.ts` › uploads a cover image to Cloudflare R2 from the workshop form, and the public address serves it |
| E2E-MEDIA-02 | Admin xóa ảnh không còn dùng | Ảnh không dùng ở đâu và đã tải lên quá 24 giờ (ảnh mới hơn luôn được giữ: có thể chủ shop chưa lưu form) | Images → tab Không còn sử dụng → chọn → Xóa khỏi Cloudflare (lý do) | "1 deleted"; ảnh không còn trong `GET /admin/media`; audit `media.delete` | P1 | FR-ADM-26 | Đã có (một phần): luồng xóa thật trên R2 không tự động được trong một lần chạy (ảnh dưới 24 giờ luôn được giữ); xóa có `media.int.test.ts` (bucket giả); `media.spec.ts` kiểm ảnh mới được giữ lại |
| E2E-MEDIA-03 | Loại file không hỗ trợ | Owner | Chọn GIF / PDF; gọi `POST /media/presign` với `image/gif` | Giao diện từ chối; API `422 fields.contentType = unsupportedType` | P1 | FR-MEDIA-01 L378, `media.controller.ts` | Chưa có |
| E2E-MEDIA-04 | Ảnh quá 5 MB | Owner | Presign với `size` 5 MB + 1 byte | `422 fields.size = tooLarge`; giao diện báo | P1 | FR-MEDIA-01 L378, `media.service.ts` L90 | Chưa có |
| E2E-MEDIA-05 | File giả đuôi ảnh | Owner | Chọn file văn bản đổi tên `.png` | Bộ tải lên của web kiểm byte đầu và từ chối (server không kiểm magic bytes, xem Mục 5, C15) | P1 | WAI L88, L93 | Chưa có |
| E2E-MEDIA-06 | R2 chưa cấu hình | API không có `R2_*` | Presign; mở form workshop | `503 MEDIA_NOT_CONFIGURED`; giao diện báo "chưa thiết lập", vẫn dán URL https được | P2 | WAI L87-88 | Chưa có |
| E2E-MEDIA-07 | Shop bị khóa không tải ảnh | Shop `SUSPENDED` | Presign | `403 SHOP_SUSPENDED` | P1 | WAI L87, `media.controller.ts` (`assertShopWritable`) | Chưa có |
| E2E-MEDIA-08 | Ảnh đang dùng không bị xóa | Ảnh dùng trong bản nháp / page đã publish / phiên bản cũ / workshop | Xem tab Đang sử dụng; gọi `POST /admin/media/delete` với key đó | Ảnh ở tab Đang sử dụng kèm nơi dùng; API trả key trong `inUse`, không xóa | P1 | FR-ADM-26 L786, L788 | Chưa có |
| E2E-MEDIA-09 | Giới hạn của API xóa ảnh | Admin; owner | Gửi key sai dạng; 101 key; owner gọi `GET /admin/media` | `422`; `422`; `403` | P1 | FR-ADM-26 L788-789 | Chưa có |
| E2E-MEDIA-10 | Ảnh ở builder, session, khuyến mãi | R2 đã cấu hình | Tải ảnh hero, ảnh session, ảnh khuyến mãi | Cùng đường tải lên; ảnh hiện ở trang public / form đặt chỗ / section Promotions | P2 | WAI L88, FR-SCHED-02 L405, FR-PROMO-01 L551 | Chưa có |
| E2E-MEDIA-11 | Ảnh luôn vào thư mục của shop trong phiên | Owner shop A | Presign rồi đọc `key` | `key` bắt đầu `shops/{id của shop A}/`, không có cách chọn shop khác | P0 | `media.service.ts` L92, §4.1 | Chưa có |

### 2.12 Bảo mật & phân quyền (SEC)

| ID | Tiêu đề | Tiền điều kiện | Các bước | Kết quả mong đợi | Ưu tiên | Tham chiếu | Trạng thái tự động hóa |
|---|---|---|---|---|---|---|---|
| E2E-SEC-01 | Customer không vào khu chủ shop / admin | Customer mới | Mở `/shopowner/whiskladle`, `/systemadmin` | Về `/customer/{id}/today` | P0 | WAI L9, §4.2 | Đã có: `auth.spec.ts` › a customer cannot open the shop owner area or the admin area |
| E2E-SEC-02 | Chủ shop không vào khu admin hay shop khác | Owner shop B | Mở `/systemadmin`; `/shopowner/whiskladle` | Cả hai: chuyển về khu của chính mình (`requireArea` → `homeOf`; shop nháp: `/shopowner/onboarding`) | P0 | REQ §3.3 L182, WAI L9 | Đã có: `security.spec.ts` › E2E-SEC-02 / SEC-03 / SEC-11 |
| E2E-SEC-03 | Chưa đăng nhập | Context mới | Mở `/shopowner/whiskladle`, `/customer/{id}/today`, `/systemadmin` | Về đăng nhập (`?auth=login`) | P0 | WAI L9 | Đã có: `security.spec.ts` › E2E-SEC-02 / SEC-03 / SEC-11 (cả ba khu) |
| E2E-SEC-04 | Customer không xem tài khoản khác | Customer A và B | A mở `/customer/{B}/today`; gọi `GET /customer/{B}`, `/bookings`, `/wallet` | Không mở được; API `404` | P0 | REQ L488, L610 | Đã có: `security.spec.ts` › E2E-SEC-06 / SEC-04 / SEC-14 (API; trang `/customer/{B}` chưa kiểm) |
| E2E-SEC-05 | Đoán id của shop khác | Shop A có workshop, session, booking, customer, khuyến mãi, page; owner shop B | B gọi `GET / PUT / POST …/{id của A}` cho từng loại | Mọi lời gọi `404` (không lộ tồn tại), dữ liệu A không đổi | P0 | §4.3, AC-09, BR-01, REQ L1044 | Đã có: `security.spec.ts` › E2E-SEC-05 (workshop, session, booking, customer, page; khuyến mãi chưa kiểm) |
| E2E-SEC-06 | API admin | Owner, customer, khách vãng lai | Gọi `GET /admin/organizations`, `POST /admin/users/{id}/status` | Owner / customer `403`; vãng lai `401` | P0 | REQ L1089 | Đã có: `security.spec.ts` › E2E-SEC-06 / SEC-04 / SEC-14 |
| E2E-SEC-07 | Kiểm tra `Origin` (CSRF) | Owner đăng nhập | `PATCH /organization` với `Origin: http://evil.example`; `Origin: null`; không Origin / Referer nhưng có cookie | Cả ba `403 FORBIDDEN_ORIGIN`; dữ liệu không đổi | P0 | §7.5 L921, `auth.guards.ts` L42-61 | Đã có: `security.spec.ts` › E2E-SEC-07 |
| E2E-SEC-08 | Route công khai không bị chặn Origin | — | Gọi OTP / đặt chỗ / Contact / báo cáo từ host shop | Thành công (được miễn kiểm `Origin`, vẫn có rate limit) | P1 | REQ L1065, WAI L142 | Đã có (một phần): `booking.spec.ts` › opens the landing page of the shop… (đặt chỗ từ host shop) |
| E2E-SEC-09 | Cookie phiên | Sau đăng nhập | Đọc `context.cookies()` | `wsp_sid` có `HttpOnly`, `SameSite=Lax` (`Secure` khi https) | P0 | FR-AUTH-02 L281, REQ L1022 | Đã có: `security.spec.ts` › E2E-SEC-09 / SEC-10 (`Secure` chỉ kiểm được trên https) |
| E2E-SEC-10 | Header bảo mật | — | Đọc header của trang shop, khu quản lý, API | CSP có nonce, không `unsafe-inline` cho script; `X-Content-Type-Options: nosniff`; `Referrer-Policy`; khu quản lý không cho nhúng iframe | P1 | NFR-SEC-04, M7 L1326, `next.config.ts` | Đã có (một phần): `security.spec.ts` › E2E-SEC-09 / SEC-10 (CSP có nonce, không `unsafe-inline`, có `frame-ancestors`; các header khác chưa kiểm) |
| E2E-SEC-11 | Khu admin không phục vụ trên host shop | — | Mở `whiskladle.localtest.me/systemadmin` | `404` (là trang của shop, không phải khu admin) | P0 | `proxy.ts` L28-30, FR-ORG-02 L304 | Đã có: `security.spec.ts` › E2E-SEC-02 / SEC-03 / SEC-11 |
| E2E-SEC-12 | Chống XSS ở nội dung do người dùng nhập | — | Đặt `<script>` / `<img onerror>` vào tên workshop, nội dung section, yêu cầu đặc biệt của booking, tin Contact, mô tả báo cáo | Mọi nơi hiển thị dạng chữ, không chạy script, không lỗi CSP | P0 | FR-SITE-02 L340, NFR-SEC-03, FR-ADM-04 L646 | Chưa có |
| E2E-SEC-13 | Phiên của người bị vô hiệu kết thúc ngay | Customer đang đăng nhập | Admin vô hiệu; customer gọi API tiếp | `401` | P0 | REQ L1089 | Đã có: `security.spec.ts` › E2E-SEC-13 |
| E2E-SEC-14 | Không lộ dữ liệu nhạy cảm | — | `GET /admin/users`; `GET /customer/{id}/wallet`; `GET /admin/emails/{id}` của email hệ thống | Không có mật khẩu / hash; chủ ví chỉ thấy số TK che; `content = null` | P0 | REQ L1089, FR-CUST-04 L605, FR-ADM-22 L761 | Đã có (một phần): `security.spec.ts` › E2E-SEC-06 / SEC-04 / SEC-14 (chỉ `GET /admin/users`) |
| E2E-SEC-15 | Địa chỉ cũ của khu chủ shop | Owner shop B | Mở `/shopowner/bookings` | Chuyển tới `/shopowner/{slug của B}/bookings` (mã hiện chuyển về shop demo, xem Mục 5, C17) | P1 | REQ §3.3 L182, `proxy.ts` L14 | Chưa có |
| E2E-SEC-16 | Đường dẫn cũ `/admin`, `/dashboard` | Admin; owner | Mở `/admin/users`, `/dashboard` | Chuyển tới `/systemadmin/users`, `/shopowner` | P2 | REQ §3.3 L182, `next.config.ts` | Chưa có |

### 2.13 Đa ngôn ngữ & SEO (I18N)

| ID | Tiêu đề | Tiền điều kiện | Các bước | Kết quả mong đợi | Ưu tiên | Tham chiếu | Trạng thái tự động hóa |
|---|---|---|---|---|---|---|---|
| E2E-I18N-01 | Ngôn ngữ của trang shop | Shop mặc định en, bật vi, ko | Mở `/`, `/vi`, `/ko`; dùng language switcher | `/` ngôn ngữ mặc định, `/{locale}` ngôn ngữ khác; switcher chỉ có ngôn ngữ đã bật | P1 | FR-SITE-05 L367-368 | Chưa có |
| E2E-I18N-02 | Không tự chuyển theo `Accept-Language` | Như trên | Mở `/` với `Accept-Language: ko` | Vẫn ngôn ngữ mặc định | P2 | FR-SITE-05 L368 | Chưa có |
| E2E-I18N-03 | hreflang và canonical trong `<head>` | Như trên | Đọc `<head>` của `/` và `/vi` | Một `hreflang` cho mỗi ngôn ngữ đã bật (zh → `zh`), canonical đúng | P1 | FR-SITE-05 L369, AC-10, A6 | Chưa có |
| E2E-I18N-04 | sitemap.xml theo host | Shop có trang public | `GET {slug}.localtest.me/sitemap.xml` | `200`, có `hreflang=` | P1 | FR-SITE-05 L369 | Đã có: `booking.spec.ts` › a shop that does not exist is a 404, and the shop has a sitemap and a robots.txt of its own |
| E2E-I18N-05 | robots.txt theo host | Như trên | `GET /robots.txt` | `Disallow: /booking/`, `Disallow: /report`, `Sitemap:` đúng host | P1 | FR-SITE-05 L369, `robots.txt/route.ts` | Đã có (một phần): cùng test trên (chỉ kiểm `Disallow: /booking/`) |
| E2E-I18N-06 | Meta và Open Graph | Như trên | Đọc `<title>`, meta description, `og:image` ở mỗi ngôn ngữ | Theo ngôn ngữ trang; `og:image` lấy từ hero | P2 | FR-SITE-05 L369, AC-10 | Chưa có |
| E2E-I18N-07 | `<html lang>` của trang shop | Như trên | Mở `/vi` | `lang="vi"` ở thẻ `html` | P2 | WAI L145 | Chưa có (cần xác minh đã sửa) |
| E2E-I18N-08 | Giao diện nền tảng 5 ngôn ngữ | — | Đổi ngôn ngữ en / vi / ko / ja / zh ở trang chủ, khu chủ shop, khu customer | Nhãn tĩnh đổi theo; không hiện khóa dịch thô (ví dụ `ratings.title`) | P1 | BR-18, NFR-I18N-01, WAI L53, L62 | Chưa có (đã có test parity ở đơn vị) |
| E2E-I18N-09 | Khu admin chỉ en + vi | Cookie ngôn ngữ = ko | Mở `/systemadmin` | Hiển thị tiếng Anh; nút chọn chỉ English / Tiếng Việt | P2 | BR-20 (L824), `proxy.ts` L28-33 | Chưa có |
| E2E-I18N-10 | Định dạng ngày theo ngôn ngữ | — | Xem ngày ở Bookings với en, vi, ko, ja | en `MM/DD/YYYY`, vi `DD/MM/YYYY`, ko `YYYY. MM. DD.`, ja / zh `YYYY/MM/DD`; DateInput nhận gõ tay | P2 | BR-20 (L823) | Đã có (một phần): `owner.spec.ts` › starts a session… (nhập ngày dạng en) |
| E2E-I18N-11 | Khu customer không lập chỉ mục | Customer | Đọc meta robots | `noindex` | P2 | FR-BOOK-06 L460 | Chưa có |
| E2E-I18N-12 | Email khách 6 ngôn ngữ trong một thư | Booking vừa tạo | Đọc email trong Mailpit | Tiêu đề gồm 6 tiêu đề nối nhau (xem ghi chú dưới bảng); nội dung en, vi, th, zh, ko, ja nối tiếp, có mục lục; không phụ thuộc quốc gia khách | P1 | FR-MAIL-01 L626-627, AC-04 | Chưa có (xem Mục 5, C3) |
| E2E-I18N-13 | Email tài khoản theo ngôn ngữ giao diện | Đăng ký với `locale: vi` | Quên mật khẩu | Email đặt lại bằng tiếng Việt | P2 | FR-MAIL-01 L627 | Chưa có |

Ghi chú I18N-12: tiêu đề email theo REQ L626 là 6 tiêu đề nối bằng dấu gạch đứng có khoảng trắng hai bên.

### 2.14 Responsive / mobile (RESP)

| ID | Tiêu đề | Tiền điều kiện | Các bước | Kết quả mong đợi | Ưu tiên | Tham chiếu | Trạng thái tự động hóa |
|---|---|---|---|---|---|---|---|
| E2E-RESP-01 | Trang shop ở 390px | Viewport 390 × 844 | Mở trang shop, mở menu ba gạch | Không cuộn ngang; Log in / Register nằm trong menu | P1 | NFR-UX-01, FR-SITE-05 L372 | Chưa có |
| E2E-RESP-02 | Đặt chỗ trên điện thoại | Viewport 390 | Đi hết 5 bước | Mọi bước dùng được, nút không bị che, đặt thành công | P1 | NFR-UX-01, FR-BOOK-02 | Chưa có |
| E2E-RESP-03 | Trang chủ ở 390px | Viewport 390 | Mở `/`, mở menu | Không cuộn ngang; nút 3 sọc 44px; CTA rộng hết hàng; Log in / Sign up chia đôi hàng | P2 | REQ L683 | Chưa có |
| E2E-RESP-04 | Menu ngăn kéo của khu customer | Viewport 390 | Bấm `customer-menu-button`; chọn mục; mở lại, nhấn Esc; bấm nền mờ | Drawer mở từ trái, có ảnh + tên, mục 44px, Log out, "Need help?"; đóng khi chọn / Esc / bấm nền; không cuộn ngang ở mọi trang | P1 | FR-BOOK-06 L460 | Chưa có |
| E2E-RESP-05 | Today của chủ shop trên điện thoại / tablet | Viewport 390 và 768 | Mở Today, check-in | Dùng được, không cuộn ngang | P2 | NFR-UX-01, FR-OPS-01 L498 | Chưa có |
| E2E-RESP-06 | Layout Book Now Rail trên điện thoại | Page dùng `bookingrail` | Viewport 390 | Thanh đặt chỗ ở dưới cùng | P2 | FR-SITE-01 L313 | Chưa có |
| E2E-RESP-07 | Khu admin trên điện thoại | Viewport 390 | Mở `/systemadmin` | Menu là một hàng cuộn ngang, không có tiêu đề nhóm | P2 | REQ L688 | Chưa có |

### 2.15 Khả năng truy cập cơ bản (A11Y)

| ID | Tiêu đề | Tiền điều kiện | Các bước | Kết quả mong đợi | Ưu tiên | Tham chiếu | Trạng thái tự động hóa |
|---|---|---|---|---|---|---|---|
| E2E-A11Y-01 | Đặt chỗ chỉ bằng bàn phím | Trang shop | Tab tới Book, Enter; chọn ngày / giờ bằng phím; đi hết các bước; Esc | Hoàn tất được không cần chuột; focus nằm trong modal; Esc đóng | P1 | NFR-A11Y-01 | Chưa có |
| E2E-A11Y-02 | Ô form có nhãn | — | Tìm ô theo `getByRole(…, { name })` ở modal đặt chỗ, popup đăng nhập / đăng ký, form workshop | Mọi ô tìm được theo nhãn | P1 | NFR-A11Y-01 | Đã có (một phần): các spec hiện có dùng `getByRole` theo tên ở các form đó |
| E2E-A11Y-03 | Quét tự động WCAG 2.1 AA | — | Quét trang shop và modal | Không có lỗi mức nghiêm trọng | P2 | NFR-A11Y-01 | Chưa có (cần thêm `@axe-core/playwright`: phải hỏi trước khi thêm dependency) |
| E2E-A11Y-04 | Nút tim yêu thích | Khu customer | Đọc thuộc tính nút tim | `aria-pressed`; tên "Add {tên} to favorites" / "Remove {tên} from favorites" | P2 | FR-BOOK-04 L454 | Chưa có |
| E2E-A11Y-05 | Thuộc tính ARIA của bảng | Bookings, Customers | Bấm ô tổng hợp, tiêu đề cột, nút mở rộng | `aria-pressed`, `aria-sort`, `aria-expanded` đổi theo | P2 | FR-OPS-01 L493, FR-CUST-01 L566, L569 | Chưa có |
| E2E-A11Y-06 | Sao đánh giá | Workshop có đánh giá; popup đánh giá | Đọc nhãn; chọn sao bằng phím | Nhãn dạng "Rated 4.8 out of 5, 126 ratings"; chọn được sao bằng bàn phím | P2 | FR-BOOK-06 L464, L472 | Chưa có |
| E2E-A11Y-07 | Sắp xếp section bằng bàn phím | Builder | Dùng nút mũi tên lên / xuống | Section đổi chỗ; có thông báo cho trình đọc màn hình | P2 | FR-SITE-02 L336 | Chưa có |
| E2E-A11Y-08 | Chú thích chọn khuyến mãi | Modal đặt chỗ có khuyến mãi | Tick SINGLE rồi MULTIPLE | Vùng `role=status` nêu khuyến mãi bị bỏ tick và lý do | P2 | FR-PROMO-01 L555 | Chưa có |

## 3. Ma trận tổng hợp

Đếm theo bảng ở Mục 2. "Đã có" gồm cả "Đã có (một phần)" (cột riêng). "Chưa làm" = "Chưa có — tính năng chưa làm". "Không TĐ" = "Không tự động được".

| Khu vực | Tổng | P0 | P1 | P2 | Đã có (đủ) | Đã có (một phần) | Chưa có | Chưa làm | Không TĐ |
|---|---|---|---|---|---|---|---|---|---|
| AUTH | 29 | 7 | 15 | 7 | 6 | 4 | 18 | 1 | 0 |
| PUB | 52 | 20 | 17 | 15 | 7 | 6 | 35 | 4 | 0 |
| OPS | 29 | 11 | 9 | 9 | 1 | 3 | 24 | 1 | 0 |
| CAT | 26 | 4 | 14 | 8 | 1 | 3 | 21 | 1 | 0 |
| SITE | 22 | 4 | 11 | 7 | 2 | 1 | 18 | 1 | 0 |
| PROMO | 17 | 4 | 7 | 6 | 0 | 0 | 16 | 1 | 0 |
| FIN | 10 | 4 | 1 | 5 | 0 | 0 | 9 | 1 | 0 |
| SET | 15 | 1 | 8 | 6 | 1 | 0 | 12 | 1 | 1 |
| CUST | 23 | 7 | 9 | 7 | 1 | 2 | 19 | 0 | 1 |
| ADM | 33 | 7 | 14 | 12 | 5 | 2 | 23 | 3 | 0 |
| MEDIA | 11 | 1 | 8 | 2 | 1 | 1 | 9 | 0 | 0 |
| SEC | 16 | 12 | 3 | 1 | 10 | 3 | 3 | 0 | 0 |
| I18N | 13 | 0 | 6 | 7 | 1 | 2 | 10 | 0 | 0 |
| RESP | 7 | 0 | 3 | 4 | 0 | 0 | 7 | 0 | 0 |
| A11Y | 8 | 0 | 2 | 6 | 0 | 1 | 7 | 0 | 0 |
| **Tổng** | **311** | **82** | **127** | **102** | **36** | **28** | **231** | **14** | **2** |

- Cập nhật 14/11/2026: 31 test (8 file, thêm `security.spec.ts` và `booking-rules.spec.ts`) phủ **64 case** (36 đủ, 28 một phần), khoảng 21% danh mục.
- P0: 81 case, phủ đủ 17 (AUTH-13, PUB-10, PUB-15, PUB-16, PUB-17, PUB-24, PUB-25, SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, SEC-07, SEC-09, SEC-11, SEC-13) và một phần 13 (AUTH-10, AUTH-12, PUB-07, PUB-21, PUB-22, PUB-31, PUB-32, PUB-35, OPS-07, OPS-14, CAT-13, ADM-07, SEC-14).
- 14 case thuộc tính năng chưa làm; 2 case không tự động được ổn định (SET-11 cần DNS thật; CUST-04 xếp theo seed ngày).
- 15 case ghi rõ "cần hook" thời gian / kết sổ / DNS (AUTH-17, PUB-18, PUB-29, PUB-34, PUB-38, OPS-21, CAT-21, CAT-22, PROMO-10, FIN-07, SET-11, CUST-10, CUST-17, ADM-17, ADM-21); thêm CUST-18, CUST-21 cũng cần số dư ví nên phụ thuộc cùng hook.

## 4. Thứ tự đề xuất để tự động hóa tiếp, và hook cần có

### 4.1 Thứ tự đề xuất

**Đợt 1 – P0 không cần hook (chỉ cần API + Mailpit, tạo dữ liệu riêng mỗi test):**
1. Bảo mật: SEC-05 (đoán id shop khác), SEC-07 (Origin), SEC-02, SEC-04, SEC-06, SEC-11, SEC-13, SEC-09, SEC-14, SEC-12, MEDIA-11.
2. Luồng chính của REQ §12.1: SITE-05 (đăng ký → onboarding → workshop + session → publish → public ngay), SITE-04 (checklist chặn), rồi PUB-15 (đã có) nối tiếp OPS-11 / OPS-16 (check-in và Confirm payment) trong cùng chuỗi.
3. Đặt chỗ và sức chứa: PUB-21, PUB-22, PUB-23, PUB-24, PUB-25, PUB-17, PUB-13, PUB-14, PUB-11, PUB-10 + ADM-04 + OPS-26 (khóa shop), PUB-37 + CUST-11 (khách hủy, nhả chỗ, email hai bên), PUB-42.
4. Vận hành có tiền: OPS-12, OPS-14 (hoàn thiện), OPS-15, OPS-18, OPS-20, OPS-09, CAT-08, CAT-13, CAT-16, CAT-19.
5. Khuyến mãi và tiền: PROMO-06, PROMO-11, PROMO-12, PROMO-13, FIN-01, FIN-02, FIN-06, ADM-18, ADM-19, ADM-07 (hoàn thiện), ADM-27, CUST-14, CUST-16, CUST-20.

**Đợt 2 – P0 cần hook thời gian / kết sổ:** PUB-29, PUB-38 (session đã bắt đầu), OPS-21, FIN-07, CUST-17, CUST-18, CUST-21, ADM-17.

**Đợt 3 – P1:** AUTH-03/04/05/07/11 (khóa đăng nhập là P0, đưa lên đợt 1 nếu có cách reset rate limit), AUTH-14/15/16/18, AUTH-23/25/29; CAT-02 → CAT-18; SITE-02/06/08/10/13/14/15/16; PROMO-01 → PROMO-09, PROMO-14; SET-03 → SET-10; CUST-05/06/08/09/13/15/19; ADM-06/09/11/15/16/20/23/24/28/30; MEDIA-03/04/05/07/08/09; I18N-01/03/08/12; RESP-01/02/04; A11Y-01.

**Đợt 4 – P2** còn lại, ưu tiên những case rẻ (mở trang, đọc header / meta).

### 4.2 Hook kiểm thử cần có

| Hook | Dùng cho | Hiện trạng / đề xuất |
|---|---|---|
| Đọc email từ Mailpit (`http://localhost:8025/api/v1/search`, `/api/v1/message/{id}`) | Mọi case có OTP, link xác nhận, reset, verify, email hủy / đóng / dời / biên nhận / trả lời | Đã có hàm `emailedCode()` trong `booking.spec.ts`: nên chuyển vào `e2e/helpers.ts` kèm hàm tìm link theo mẫu và đếm thư theo người nhận (cho PUB-20). Nên xóa hộp thư theo người nhận (email duy nhất mỗi test) thay vì xóa toàn bộ |
| Tạo dữ liệu qua API | Hầu hết case | Viết helper: `newCustomer()`, `newShopOwner()` (signup `SHOP_OWNER` + `PATCH /organization`), `activeWorkshop()`, `runningSession({startsInMinutes, cutoff, capacity})`, `publishedPage()` (như `ensureLandingPage()`), `guestBooking()` (OTP từ Mailpit), `closedSession()` (Pause → Close với lý do). Mọi lời gọi ghi phải có header `origin: APP` |
| "Du hành thời gian" | Session đã bắt đầu / kết thúc, auto-close, đánh giá sau khi kết thúc, OTP hết hạn (10 phút), token hết hạn (1 giờ / 14 ngày / `resetLinkHours`), khuyến mãi hết hạn, kết sổ tháng | Ứng dụng dùng giờ thật. Có thể làm một phần không cần hook: session bắt đầu sau vài phút với cut-off 0 (CUST-09). Cho phần còn lại cần **quyết định của người phụ trách**: (a) script SQL chỉ chạy trên database test để dời `starts_at` / `ends_at` / `expires_at` / ngày của khoản thanh toán rồi chờ job; hoặc (b) thêm đồng hồ cấu hình được chỉ ở môi trường test trong API. Cả hai đều chạm vào mã / hạ tầng nên phải được duyệt; (a) có thể cần thêm client PostgreSQL vào gói `e2e` (dependency mới: phải hỏi) |
| Chạy job của worker theo yêu cầu | Auto-close (`sessions.sweep` mỗi phút), sinh session (`sessions.generate`), kết sổ (`finance.close` mỗi giờ) | Hiện chỉ có lịch chạy; mỗi request của shop cũng tự đóng session hết giờ (REQ L1049). Đề xuất: lệnh dev / endpoint chỉ bật ở test để chạy một job ngay (cần duyệt) |
| Số dư ví cho test rút tiền | CUST-17, CUST-18, CUST-21, ADM-17 | Cần tháng đã kết sổ (D23). Phụ thuộc hook thời gian + `finance.close`, hoặc ghi `wallet_credits` trực tiếp trong database test (bảng chỉ thêm) |
| Chạy API với cờ khác | AUTH-18 (`REQUIRE_EMAIL_VERIFICATION=true`), MEDIA-06 (không có `R2_*`) | Một project Playwright riêng hoặc job CI riêng với API cấu hình khác |
| Rate limit trong bộ nhớ | AUTH-11, PUB-05, PUB-17, PUB-20, PUB-44 | Dùng email riêng mỗi test; giới hạn theo IP chỉ reset khi khởi động lại API. `X-Forwarded-For` chỉ được tin theo `TRUST_PROXY_HOPS` nên không giả IP được. Đặt các test này cuối lượt chạy |
| Trạng thái toàn nền tảng | AUTH-24/26, ADM-18/25/26/28/29, PUB-05, CUST-18 | Lưu giá trị cũ và trả lại trong `finally`; giữ `workers: 1` |
| Tên miền đã xác minh | SET-11 | Cần DNS thật, hoặc hook đặt `custom_domain_verified_at` trong database test + thêm tên miền vào `--host-resolver-rules` (proxy tra `GET /public/domains/{host}`, nhớ 60 giây) |
| Viewport điện thoại | RESP-* | Thêm project Chromium với viewport 390 × 844 trong `playwright.config.ts` (không cần dependency mới) |

## 5. Mâu thuẫn và điểm cần xác nhận phát hiện khi lập danh mục

| # | Mâu thuẫn | Vị trí | Ảnh hưởng tới test |
|---|---|---|---|
| C1 | Trạng thái dự án: "backend thật chưa làm", "giao diện web vẫn chạy bằng API mock" và "E2E chạy trên dữ liệu mẫu" mâu thuẫn với "web đã nối API thật cho mọi khu vực, dữ liệu mẫu đã gỡ" | REQ L6, L19, L20 (cùng ô có cả hai ý), L1326, L1382; WAI L3, L78 | Danh mục theo WAI (stack thật). REQ L20 còn ghi "10 test trên Chromium" trong khi hiện có 22 test |
| C2 | Hai quy tắc cùng mã **BR-20** (định dạng ngày và khu admin en + vi) | REQ L823, L824 | Case I18N-09, I18N-10 ghi kèm số dòng |
| C3 | Email khách **6 ngôn ngữ có tiếng Thái** trong khi nền tảng chỉ có 5 ngôn ngữ; BR-09 và theme còn nhắc ZH-TW dù A6 chỉ có một `zh` | REQ L42 (A6), L626, L627, L1298 (AC-04), L812 (BR-09), L337 | I18N-12 kiểm theo 6 ngôn ngữ của mã (`packages/shared/src/booking-emails.ts`); cần xác nhận |
| C4 | Phiên hết hạn sau **7 ngày** không hoạt động so với `SESSION_TTL_DAYS` = **14**; token xác minh email **24 giờ** so với `EMAIL_VERIFY_HOURS` = **48** | REQ L281, L278 so với L1222 | Không viết case về thời hạn cho tới khi chốt |
| C5 | Admin reset mật khẩu: **mật khẩu tạm 14 ký tự, hạn 3 ngày, sai 5 lần hủy link** so với **chỉ gửi link**, hạn `resetLinkHours` mặc định 24 giờ; web đã bỏ mật khẩu tạm | REQ L286, L692 so với L743, L1089; WAI L10, L12 | AUTH-29 theo bản thật (chỉ link) |
| C6 | "Không có chức năng hủy session" nhưng bảng API và milestone M2 vẫn có `POST /sessions/{id}/cancel` / "hủy session" | REQ L411, L864 so với L1037, L1350 | CAT-23 kiểm là không có |
| C7 | Booking chỉ có 4 trạng thái (BR-08) nhưng FR-SCHED-02 vẫn nhắc `LATE_RELEASED`, `SESSION_EXPIRED`, số chỗ tính từ `CONFIRMED, CHECKED_IN, COMPLETED` (bỏ `NOT_CONFIRMED`, trái BR-07); FR-PROMO-01 nhắc `SESSION_EXPIRED`; audit bắt buộc còn "late release, no-show" | REQ L811, L513 so với L405, L558, L810, L991, L1001 | Test theo BR-07 / BR-08 và máy trạng thái §6.1 |
| C8 | Uncheck-in về **`CONFIRMED`** (`UNDO_CHECK_IN: CHECKED_IN → CONFIRMED`) so với về **đúng trạng thái trước check-in** | REQ L405 so với L510, L849 | OPS-11 / OPS-12 theo §6.1 |
| C9 | Close từ `PAUSED` "kết thúc, không thể mở lại" so với Re-open; "3 CLOSED tối đa" trong data model so với "tối đa 4 lần đóng" | REQ L405 (hai chỗ trong cùng đoạn), L977 so với L405, L1046 | CAT-17, CAT-18 theo L1046 |
| C10 | Unpaid ghi "**refund entry**", `type PAYMENT / REFUND` so với "không có hoàn tiền, chỉ **REVERSAL**" | REQ L406, L524 so với L526, L987, L1050 | OPS-18, FIN-01 theo REVERSAL |
| C11 | Đăng ký / đăng nhập customer **ngay trên landing page** (email + mã, họ tên, quốc gia, ngày sinh, 3 category; tim cần đăng nhập) so với nút Register sang popup của nền tảng và **không còn nút tim** trên trang shop | REQ L285, L450, L455 so với L372; WAI L60 | PUB-49, PUB-50 để "tính năng chưa làm" |
| C12 | Ô M6 vừa liệt kê "báo cáo vi phạm, hộp thư, email hệ thống, Terms / Privacy, cài đặt" là **đã làm** vừa ghi "**Chưa:** báo cáo, hộp thư, email hệ thống, Terms / Privacy, cài đặt" | REQ L1325 | Danh mục coi là đã làm (có controller thật) |
| C13 | "Chưa có thẻ Income của trang Overview (`/dashboard/summary`)" so với `/dashboard/summary` đã trả `income` của tháng | REQ L533 so với L539 | FIN-10 cần xác nhận |
| C14 | Tìm workshop "không phân biệt dấu" so với "tìm kiếm tên chưa bỏ dấu tiếng Việt" ở backend | REQ L392 so với L1052 | CAT-09 |
| C15 | Backend "kiểm tra lại size và mime thật (magic bytes) khi complete" và endpoint `presign-upload` + `complete` so với bản thật `POST /media/presign` không có bước complete, 5 MB chỉ kiểm ở trình duyệt và số khai báo | REQ L377-378, L1034 so với WAI L87, L93; `media.controller.ts` | MEDIA-04, MEDIA-05: rủi ro bảo mật cần ghi nhận (người upload có thể PUT file khác loại / lớn hơn lên URL đã ký) |
| C16 | Log out của customer "chuyển về landing page của shop" so với "đăng xuất về trang chủ" | REQ L460 so với WAI L57 | CUST-23 theo WAI |
| C17 | Địa chỉ cũ `/shopowner/{mục}` phải về shop **trong phiên**, nhưng `proxy.ts` chuyển về shop demo cố định (`DEMO_SHOP_SLUG`, có TODO) | REQ L182 so với `apps/web/src/proxy.ts` L14 | SEC-15 dự kiến fail với shop khác `whiskladle` |
| C18 | Booking tay "nếu session còn `RUNNING`" so với "kể cả session `OPEN`" | REQ L505 so với L1050 | OPS-09 chỉ kiểm phần chắc chắn (đóng / hết giờ) |
| C19 | Link mời referral `{shop}.domain/?invite=CODE` (mở popup đăng ký trên trang shop) so với `{PLATFORM_DOMAIN}/?invite=CODE` | REQ L588-589 so với L593 | CUST-15 theo bản thật |
| C20 | Điểm workshop = "trung bình điểm shop đã có cộng các sao khách chấm" so với "trung bình các sao chưa bị gỡ" | REQ L472 so với L488 | ADM-21 / CUST-03 cần chốt công thức |
| C21 | Trạng thái workshop có `ARCHIVED` (và admin đổi "lưu trữ") so với "không có Archived, chỉ DRAFT và ACTIVE" | REQ L387, L703 so với L390 | CAT-04 / CAT-05 theo L390 |
| C22 | Contact quá lớn trả `413` so với `422 tooLong` | REQ L685 so với L754 | PUB-04 theo L754 |
| C23 | Bảng API dùng `/site/page`, `/site/page/publish` so với bản thật `/site/pages/{id}/…`; M3 còn "Submit review" dù không có duyệt | REQ L1032-1033, L1357 so với L1051, A3 | Không ảnh hưởng (theo bản thật) |
| C24 | Dấu vết gói trả phí: `enabled_locales` "(`FREE` mặc định)", sức chứa tối đa "trong `PLAN_LIMITS`" dù đã bỏ gói; `.env.example` còn `SESSION_SECRET` dù "không dùng" | REQ L937, L387 so với L910; L1235 so với L1222 | Không ảnh hưởng test |
| C25 | Tài liệu E2E lỗi thời: WAI nhắc `real-auth.spec.ts`, `real-booking.spec.ts`, `E2E_REAL_API=1`; chú thích đầu `auth.spec.ts` vẫn ghi "Skipped otherwise" dù test không bị bỏ qua | WAI L13, L21; `e2e/auth.spec.ts` L4-5 so với WAI L81 | Nên cập nhật chú thích khi viết test mới |
| C26 | Đề bài nhắc "withdrawals/wallet" của chủ shop, nhưng D22 chốt shop không có rút tiền | REQ L1457 | FIN-08 là case phủ định |
