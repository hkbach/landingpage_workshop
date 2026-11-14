# Nối `apps/web` với `apps/api`: hiện trạng và kế hoạch

> **Trạng thái (14/11/2026): ĐÃ XONG cả 7 lát (0–6).** `apps/web` chỉ còn chạy trên API thật (`API_URL` bắt buộc cho mọi trang cần dữ liệu); dữ liệu mẫu trong bộ nhớ và các route mock đã bị gỡ. Mục 0 ghi từng lát đã làm; các mục 1–5 là kế hoạch và số đo ban đầu, giữ lại để tra cứu.

## 0. Đã làm (lát 0 và 1)

- **Chế độ thật:** biến `API_URL` (địa chỉ API mà máy chủ web gọi tới). Khi đặt (lúc build và lúc chạy), `next.config.ts` chuyển `/api/v1/*` sang API (`beforeFiles`, thắng route mock; cookie đi cùng nên không cần CORS). Không đặt: route mock trả lời như cũ. API phải đặt `APP_URL` đúng địa chỉ trình duyệt dùng (kiểm tra Origin).
- **Phía máy chủ web:** `src/lib/api-server.ts` (`apiFetch` chuyển tiếp cookie, không ghi log; `getSession`, `requireArea`, `homeOf`); `proxy.ts` tra tên miền riêng bằng `GET /public/domains/{host}` (nhớ 60 giây).
- **Bảo vệ khu vực:** `/shopowner` (đúng shop của phiên), `/customer/{id}` (đúng tài khoản), `/systemadmin` (SUPER_ADMIN) cần phiên thật; không có phiên thì về `/login`, sai loại thì về khu của mình.
- **Form:** đăng nhập (kể cả `EMAIL_NOT_VERIFIED`), đăng ký (hộp đồng ý Terms/Privacy bắt buộc, gửi `locale`, ghi bằng chứng qua `POST /legal/consent`, trả 202 thì báo kiểm tra email), quên mật khẩu, đặt lại mật khẩu (**bỏ mật khẩu tạm**: link một lần là bằng chứng, đúng hợp đồng API), đăng xuất thật (`LogoutLink`), trang xác minh email, onboarding lấy shop từ phiên.
- **Đồng ý lại Terms/Privacy (D17):** `ConsentGate` hỏi `GET /legal/consent`; khi có bản mới, cửa sổ chặn khu vực cho đến khi đồng ý hoặc đăng xuất.
- **Còn dở theo thiết kế:** các trang bên trong khu vực vẫn đọc dữ liệu mẫu (lát 3–5). Shop mới đăng ký thật chưa có dữ liệu vào dashboard; wizard onboarding còn gọi `/onboarding` của mock (cần `PATCH /organization`, lát 3). Luồng admin reset mật khẩu bằng mật khẩu tạm chỉ còn trong mock.
- **Kiểm thử:** `e2e/real-auth.spec.ts` (3 test, chạy với `E2E_REAL_API=1`, xem `e2e/README.md`) pass trên stack thật (Postgres + API + web), không vi phạm CSP.

### Lát 2: trang công khai và đặt chỗ (13/11/2026)

- **Trang shop:** `src/lib/public-site.ts` (`loadPublicSite`) lấy `GET /public/sites/{slug}` rồi `.../workshops/{id}/availability` cho từng workshop (song song), ánh xạ về kiểu `PublicSite` sẵn có; `requireSite` thành async. Shop chưa công bố trang, chưa ACTIVE hoặc bị khóa thì 404. Khuyến mãi đang chạy lấy từ API. Canonical, hreflang, sitemap, robots dùng tên miền riêng đã xác minh (API trả thêm `shop.customDomain`).
- **Đặt chỗ:** khách **không cần phiên** (theo đề xuất ở mục 4). Bước 5 gọi `POST .../booking-otp` (mã gửi qua email, worker phải chạy); mã đi cùng yêu cầu đặt chỗ (`guest`, `consent`, `otp`, `locale`, `promotionIds`, `ref`), server kiểm tra cùng lúc; sai mã tính vào số lần thử, khóa thì báo khóa. Gợi ý mã demo chỉ hiện với dữ liệu mẫu.
- **Trang đặt chỗ / xác nhận:** tra cứu bằng mã **và** email (`POST .../bookings/lookup`), link xác nhận gọi `POST /public/bookings/confirm`, hủy bằng mã + email; Terms/Privacy lấy từ `GET /public/legal/{kind}`; Contact, báo cáo vi phạm, đếm click affiliate vẫn cùng đường dẫn.
- **Chưa làm ở lát này:** widget Turnstile thật (khung giữ chỗ vẫn hiện; API bỏ qua kiểm tra khi chưa có `TURNSTILE_SECRET_KEY`, production bắt buộc), `<html lang>` của trang shop, tạo tài khoản khi đặt chỗ (D2/D3) và yêu thích (lát 4), xác nhận bằng nút bấm thay vì mở link (đã có TODO).
- **Kiểm thử:** `e2e/real-booking.spec.ts` (2 test): đặt chỗ đủ 5 bước với mã đọc từ Mailpit (mã sai bị từ chối), xác nhận bằng link, tra cứu đúng/sai email, 404, sitemap, robots. Cần stack thật gồm cả **worker** (`pnpm --filter api dev:worker`) và `E2E_PASSWORD` của tài khoản seed (xem `e2e/README.md`).

### Nút Đăng nhập / Đăng ký trên trang shop (14/11/2026)

- `RenderContext.accountLinks` (`components/sections/context.ts`): trang public điền từ host đang phục vụ (`getAccountLinks` → `accountLinks(host)` trong `components/site/site-url.ts`), builder preview điền chuỗi rỗng (nút hiện, không bấm), khu khách hàng không điền (không hiện). `AccountButtons` (`frames/kit.tsx`) có mặt trong header của 9 layout và trong `HeaderMenu` cho màn hình hẹp.
- Hộp đăng ký của nền tảng nhận thêm `&only=customer`: `SignupForm` bỏ tab chủ shop (`data-testid="signup-customer-only"`); bấm sang Đăng nhập rồi quay lại vẫn chỉ khách hàng.
- Test: `site-url.test.ts` (địa chỉ theo host), `header-menu.test.ts` (nút, mọi layout), `e2e/auth.spec.ts` thêm 2 test (đăng ký khách thật từ trang shop, không có tab chủ shop, `/auth/me` trả CUSTOMER; nút Log in mở hộp đăng nhập).
- **Chưa làm:** sau khi đăng nhập/đăng ký từ trang shop, khách vào khu khách hàng chứ chưa quay lại trang shop (cần tham số `next` an toàn, chỉ chấp nhận host của nền tảng hoặc tên miền đã xác minh).

### Admin sửa landing page hộ shop (14/11/2026)

- **Lỗi gặp:** bấm Edit ở `/systemadmin/landing-pages` báo "The editor could not be opened." vì web gọi một route chưa từng có trong API (`POST /admin/landing-pages/{slug}/audit`), và các trang `/systemadmin/shops/{slug}/...` chỉ hiện thông báo "chưa hỗ trợ" (trình sửa của chủ shop đọc shop của *phiên đăng nhập*, admin không có).
- **API:** `AdminActionsController` thêm `GET site/pages`, `GET site/pages/:id`, `POST site/pages`, `PUT site/pages/:id/draft`, `GET workshops|sessions|promotions` dưới `admin/shops/:shopId/`; ghi và publish nhận lý do ở body hoặc header `X-Admin-Reason`. Dùng lại đúng các service của chủ shop nên cùng quy tắc.
- **Web:** `lib/site-api.ts` (`siteFetch`: đường API theo chế độ chủ shop hoặc admin, kèm lý do từ cookie của banner), `lib/admin-shop.ts` (`loadAdminShop` tìm shop theo slug; `shopPrefix`), `components/builder/site-views.tsx` (ba màn hình dùng chung `LandingPagesView`, `BuilderView`, `PreviewView`: trang của chủ shop và của admin đều dùng), prop `adminShopId` cho `SiteBuilder` và `LandingPageList`, layout `systemadmin/shops/[slug]` có banner và bộ chữ `adminEdit` (chữ của builder: khu admin trước đó chỉ nạp bộ `admin` nên chữ hiện ra là khóa thô).
- **Test:** `admin-actions.int.test.ts` (đọc, bắt buộc lý do, lưu nháp không đổi trang live, một dòng audit cho một đợt sửa, lý do mới được ghi, chỉ SUPER_ADMIN), `admin.spec.ts` (e2e: Edit → banner → sửa không lý do thì không lưu → có lý do thì lưu cho shop, version không đổi, audit có lý do).
- **Chưa làm:** sửa workshop và session của shop trong khu admin (trang có thông báo); email báo chủ shop khi admin lưu nháp (chỉ publish mới báo).

### Sửa lỗi: trang landing page lưu thiếu trường báo "Fix N sections marked as needing attention first" (14/11/2026)

- **Nguyên nhân:** API chấp nhận section chỉ có một vài trường (trang do script hoặc builder cũ ghi: hero không có `imageUrl`, footer là `{}`), còn builder yêu cầu đủ trường nên đánh dấu "cần sửa" và khóa Publish, dù chủ shop chưa làm gì sai. Trường hợp thực tế: trang "Main" bị hàm hỗ trợ của test e2e đặt chỗ ghi nội dung thiếu trường vào database dev.
- **Sửa:** `withDefaults` (`components/builder/server-pages.ts`) điền các trường còn thiếu từ mặc định của loại section khi tải bản nháp (trang sửa, xem trước, danh sách). Giá trị chủ shop đã lưu luôn thắng mặc định; dữ liệu đã lưu không bị đổi cho tới khi autosave. Hàm hỗ trợ e2e giờ ghi đủ trường.
- **Một quy tắc cho cả hai phía (đã làm):** `checkSectionProps` trong `packages/shared/src/section-props.ts` là nguồn duy nhất. Section phải có **đủ mọi trường** của loại đó với đúng dạng, và **không được có trường lạ**; ảnh `data:` chỉ builder nhận khi đang sửa (`allowDataImages`), API không bao giờ lưu. Trước đây API dùng `.partial()` (cho phép thiếu trường) còn builder bắt buộc đủ nên hai bên lệch nhau; builder cũng không cấm trường lạ như API. Trường video: chỉ dạng cũ (`videoId`, không có `videos`) được nâng cấp, danh sách `videos` được kiểm đúng như gửi (tối đa 5, id hợp lệ), không còn âm thầm cắt xuống 5.
  - API: `PUT /site/pages/{id}/draft` trả `422` kèm tên trường thiếu (ví dụ `content.sections.0.props.imageUrl: invalid`). `POST .../publish` kiểm lại nội dung đã lưu và trả `422 INCOMPLETE_PAGE` kèm các trường nếu bản nháp là bản cũ còn thiếu trường (không công khai trang thiếu dữ liệu).
  - Builder: `validateSection` dùng chính hàm đó (thiếu trường hoặc trường lạ thì section "cần sửa"); khi tải một bản nháp cũ thiếu trường, `withDefaults` điền từ mặc định để chủ shop sửa được; nút Publish của trang sửa và của danh sách luôn lưu bản nháp đầy đủ trước khi publish.
- **Test:** `section-props.test.ts` (shared), `server-pages.test.ts` (web: bản nháp cũ mở sạch, `validateSection` theo quy tắc của API), `site-pages.int.test.ts` (API: thiếu trường bị từ chối và nêu tên trường, publish bản nháp cũ bị `INCOMPLETE_PAGE` rồi publish được sau khi lưu đủ), `owner.spec.ts` (e2e: API từ chối trang thiếu trường, trang đủ trường mở sạch, sửa, autosave). Fixture API dùng `src/test/sections.ts` (`completeProps`).

### Lát 3: khu chủ shop (13/11/2026)

Khi đặt `API_URL`, mọi trang của `/shopowner/{slug}` đọc dữ liệu của **shop trong phiên** từ API (`lib/own-shop.ts`, `own-catalog.ts`, `own-ops.ts`, `own-finance.ts`, `own-site.ts`) và mọi thay đổi được gửi lên server.

| Trang | Cách nối |
|---|---|
| Khung, Settings, Onboarding | `GET/PATCH /organization`; liên hệ hỗ trợ `GET /support-contact` |
| Workshops | `GET /workshops` (kèm số session đang mở), `POST/PUT`, `POST .../status`; quy tắc lịch `GET/POST/PUT/DELETE .../schedule-rules` |
| Sessions, Bookings, Today, Customers | Lớp thao tác `useOpsState` cập nhật ngay trên màn hình, gửi API (`start/pause/close/reopen/complete/reschedule`, `check-in/uncheck-in/cancel/payment`, `POST /sessions`, `POST /bookings`), rồi đọc lại trang; server từ chối thì màn hình trở về dữ liệu của server |
| Landing pages, builder, preview | Danh sách, bản nháp (tự lưu `PUT .../draft`), công bố `POST .../publish`; trang mới bắt đầu từ mẫu trung tính (`starterDraft`), không dùng nội dung demo |
| Promotions, Ratings | Client đã gọi đúng đường dẫn API |
| Finance, Overview | `GET /finance/income` (365 ngày gần nhất, ghép các trang); Overview tính từ cùng dữ liệu |

**Quyết định đã áp dụng (vì API khác giao diện), cần chủ sản phẩm xác nhận:**
1. Thanh toán chỉ còn **Đã trả / Chưa trả** (toàn bộ số tiền); không trả một phần hay hoàn một phần theo số tiền.
2. **Chuyển booking sang session khác** bị tắt khi chạy với API (API chưa có route).
3. **Không đổi workshop của session** khi chạy với API (chỉ sức chứa, hạn đặt chỗ, ảnh).
4. **Xóa landing page** bị ẩn (API chưa có); đổi tên cũng chưa có.
5. Email báo khách khi đổi lịch / đóng session do **server tự gửi**; số khách trong thông báo trên màn hình là số booking đang giữ chỗ lúc thao tác.
6. Giảm giá của một booking hiển thị một dòng "discount" (API giữ tổng, chưa trả từng mã).

**Giới hạn đã biết:** danh sách được lấy **đủ** qua con trỏ (tối đa 2000 dòng mỗi loại, 100 dòng mỗi lần gọi) rồi lọc/tìm trên trình duyệt như trước. Shop có hơn 2000 booking sẽ thấy 2000 dòng đầu. Việc chuyển lọc và phân trang của Bookings và Customers sang server là cải tiến tiếp theo.

**Phát hiện và sửa khi nối:** trang Ratings của chủ shop hiển thị khóa dịch thô (`ratings.title`) vì dùng sai namespace (đã sửa thành `dashboard.ratings`).

### Lát 4: khu customer (14/11/2026)

- Khu `/customer/{id}` thuộc **nền tảng**, không thuộc một shop: giao diện trung tính, đăng xuất về trang chủ, không có liên kết "mở site của shop". Phiên thật xác thực; cổng "đăng nhập bằng email khách" của dữ liệu mẫu bị tắt.
- Profile, Today, Bookings, Referrals, Affiliate (liên kết, ví, rút tiền): trình duyệt gọi `/api/v1/customer/{id}/...`. API trả vài hình dạng khác dữ liệu mẫu (ví nhiều loại tiền, liên kết có tiêu đề nhiều ngôn ngữ, danh sách chương trình), nên `lib/customer-api.ts` có **bộ chuyển** về kiểu màn hình đang dùng (nhận cả hai hình dạng).
- Workshops, Favorites và tab Program của Affiliate: danh sách thẻ workshop từ `GET /customer/{id}/workshops`, mỗi shop lấy trang công khai (chủ đề, workshop, session, khuyến mãi) để mở form đặt chỗ. **Yêu thích lưu ở server** (`PUT/DELETE .../favorites/{workshopId}`).
- **Trang công khai của shop không còn nút tim khi chạy với API:** việc đăng nhập / tạo tài khoản ngay trên trang shop (D2/D3) chưa thiết kế lại; khách tạo tài khoản ở cửa sổ đăng ký chung, hoàn thiện hồ sơ trong Profile, rồi lưu yêu thích trong khu của mình.
- Ví hiển thị **một loại tiền** (loại tiền đầu tiên của ví; mặc định VND khi chưa có thu nhập), dù API giữ ví theo từng loại tiền. API `GET .../invites` trả thêm `bonusBps` (tỷ lệ thưởng mặc định).
- Sửa khi nối: thiếu nhãn `site.nav.promotions` ở 5 ngôn ngữ (trang shop có mục Khuyến mãi bị báo thiếu thông điệp).
- Kiểm thử: `e2e/real-customer.spec.ts` mở mọi trang của khu customer, lưu một yêu thích và tạo một liên kết affiliate trên server.

### Lát 5: khu admin (14/11/2026)

- Các danh sách admin (`useDirectory`) gọi đúng đường dẫn của API (shops → `/admin/organizations`, users, audit-logs có route riêng; còn lại `/admin/directory/{name}`) và `lib/admin-adapters.ts` đưa từng dòng về kiểu màn hình dùng (nhận cả hình dạng của dữ liệu mẫu). API `organizations` và `users` được bổ sung các trường màn hình cần (tên chủ shop, điện thoại, địa chỉ, ngôn ngữ, tên miền, đang hiển thị cho khách, số session / booking; tên shop và số booking của người dùng).
- **Terms / Privacy:** màn hình mới `LegalDrafts` cho quy trình **nháp → công bố → gỡ → lịch sử → khôi phục** (D17), có chọn "thay đổi lớn: mọi người phải đồng ý lại" và số người đã đồng ý. Dữ liệu mẫu vẫn dùng màn hình cũ (lưu là áp dụng ngay).
- **Chi tiết shop** (`/systemadmin/organizations/{id}`) đọc shop, audit, tỷ lệ phí và số liệu từ API; trang Reports lấy danh sách shop từ API.
- **Settings:** con số của nền tảng (`PUT /admin/settings`) và hạn mức rút tiền (`PUT /admin/settings/withdrawal-limits`, theo loại tiền, mặc định VND) được lưu bằng hai lời gọi.
- API được làm **rộng lượng hơn với màn hình** (không đổi hợp đồng cũ): trạng thái người dùng nhận `DEACTIVATED`, hiển thị shop nhận `show`, soạn email nhận `ONE` + `to` + `messageId` (trả lời tin nhắn liên hệ đánh dấu tin đã xử lý).
- Vô hiệu hóa người dùng **bắt buộc có lý do** (D15): màn hình hỏi lý do. Đóng / mở lại session của admin đi qua `/admin/shops/{shopId}/sessions/{id}/...`.
- **Chưa nối (khi chạy với API):** (1) sửa các trang của một shop thay chủ shop (`/systemadmin/shops/{slug}/...`): hiện báo chưa có, API có 5 hành động `/admin/shops/{id}/...` nhưng các trang của chủ shop đọc shop của phiên; (2) sửa hồ sơ người dùng (`PATCH /admin/users/{id}` chưa có); (3) Media (chờ khóa R2: danh sách rỗng); (4) kiểm tra landing page `POST /admin/landing-pages/{slug}/audit` (chưa có route); (5) lịch sử thay đổi của từng session trong chi tiết shop.
- Kiểm thử: `e2e/real-admin.spec.ts` (4 test): mở 19 trang admin không lỗi, soạn → công bố Terms → trang công khai hiển thị, vô hiệu hóa người dùng → đăng nhập bị từ chối, chi tiết shop và đổi hiển thị.

### Lát 6: gỡ dữ liệu mẫu (14/11/2026)

- **Đã xóa:** `apps/web/src/app/api/v1/**` (71 route mock và 45 test của chúng; các hành vi đó đã có test tích hợp trên PostgreSQL thật ở `apps/api`, 231 test) và toàn bộ `apps/web/src/lib/mock/**` (kho trong bộ nhớ, test của kho), cùng các helper chỉ phục vụ route mock. Các trang chỉ còn nhánh dùng API.
- **Giữ lại có chủ ý:** `lib/sample/` (nội dung mẫu **tĩnh**: shop demo, workshop, trang mẫu; chỉ còn dùng làm dữ liệu cho test đơn vị), các kiểu dữ liệu chuyển ra file riêng (`admin-types.ts`, `account-types.ts`, `income-types.ts`, `contact-types.ts`, `listing-types.ts`, `schedule-types.ts`, `rating-types.ts`).
- **Trang giới thiệu** (Home) lấy workshop nổi bật từ API mới `GET /public/workshops/featured` (ngẫu nhiên trong workshop `ACTIVE` của shop `ACTIVE` mà admin chọn hiển thị), thay cho dữ liệu mẫu.
- **E2E:** các spec chạy trên dữ liệu mẫu bị xóa; các spec thật đổi tên thành `auth`, `booking`, `owner`, `customer`, `admin` và không còn bị bỏ qua. CI (`e2e`) chạy trên PostgreSQL + Mailpit + API + worker thật; `docker-compose.prod.yml` đặt `API_URL=http://api:4000` cho web.
- **Lỗi thật tìm thấy khi chạy trên stack thật:** cửa sổ "đồng ý lại" và bước đồng ý lúc đăng ký gửi cả `terms` và `privacy`, nên **thất bại khi chỉ một văn bản đã công bố** (API từ chối văn bản chưa công bố); nay chỉ gửi các văn bản đã công bố (và, với cửa sổ đồng ý lại, chỉ những văn bản người dùng phải đồng ý). Test `customer.spec.ts` kiểm tra luồng này.
- **Còn lại (dọn dẹp, không ảnh hưởng chạy):** một số đường mã phía trình duyệt cũ của chế độ mẫu (`viaApi` mặc định `false`, kho `localStorage` của builder, cổng đăng nhập bằng email khách) không còn được gọi trong luồng thật; có thể gỡ dần. Một số chú thích trong mã còn nhắc "mock".

### Tải ảnh lên Cloudflare R2 (14/11/2026)

- API: `POST /api/v1/media/presign` `{purpose, contentType, size}` → URL PUT ký sẵn (AWS SigV4 viết bằng `node:crypto`, **không thêm dependency**; có test với vector chuẩn của tài liệu S3), hiệu lực 5 phút, chỉ một loại (`image/jpeg|png|webp`), vào `shops/{id}/{purpose}/{uuid}.{ext}`; trả `publicUrl`. Cần đủ 5 biến `R2_*`, thiếu thì `503 MEDIA_NOT_CONFIGURED`. Shop bị khóa không tải lên được. Bucket **công khai để đọc** (địa chỉ `r2.dev`, về sau có thể là tên miền riêng).
- Web: `mediaUploader` (kiểm tra loại thật từ byte đầu, thu nhỏ còn 1600 px, đổi sang WebP) → xin URL → PUT thẳng lên R2 → dùng `publicUrl`. Form workshop có ô tải ảnh bìa và nhiều ảnh gallery thật (trước đó chỉ là khung giữ chỗ); builder, ảnh session và ảnh khuyến mãi dùng cùng đường tải lên. Chưa cấu hình thì báo "chưa thiết lập" và vẫn dán được địa chỉ ảnh.
- CSP của web có thêm `MEDIA_UPLOAD_ORIGIN` trong `connect-src` (nếu quên, trình duyệt chặn việc PUT).
- Lệnh `pnpm --filter api r2:check` thử cấu hình thật (tải, đọc lại ở địa chỉ công khai, xóa) mà không in khóa.
- Đã kiểm với R2 thật (14/11/2026): `r2:check` đạt cả 4 bước (tải, đọc công khai, xóa, CORS) và test trình duyệt `e2e/media.spec.ts` đạt (form workshop → chọn ảnh → PUT 200 lên R2 → địa chỉ `r2.dev` trả ảnh, không vi phạm CSP). Test tự bỏ qua khi chưa cấu hình R2 (CI) và để lại một ảnh thử nhỏ trong bucket.
- **Trang Images của admin (14/11/2026):** `GET /api/v1/admin/media` hỏi thẳng bucket (ListObjectsV2 ký bằng SigV4, không thêm dependency) rồi đối chiếu với các cột có địa chỉ ảnh (workshop, session, khuyến mãi, ảnh đại diện khách, landing page gồm nháp, bản public và các phiên bản đã lưu) để gán `USED` / `UNUSED`; không cần bảng theo dõi ảnh. Web có hai tab (Đang sử dụng / Không còn sử dụng); tab thứ hai có chọn nhiều và **Xóa khỏi Cloudflare** (`POST /api/v1/admin/media/delete`, tối đa 100 ảnh mỗi lần, cần lý do, server tính lại ảnh nào đang dùng và bỏ qua ảnh đã được dùng lại, audit `media.delete`). Test: `media.int.test.ts` (bucket giả trong bộ nhớ), `e2e/media.spec.ts` (R2 thật).
- **Chưa làm:** xóa ảnh tự động theo thời gian; R2 không ép dung lượng của URL ký sẵn nên 5 MB chỉ được kiểm ở trình duyệt và ở số khai báo gửi lên API. Một khoảng hở nhỏ còn lại: ảnh vừa tải lên mà shop chưa lưu vào đâu thì nằm ở tab *Không còn sử dụng*.

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
