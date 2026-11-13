# REQUIREMENTS – Workshop Landing Page & Booking Platform (MVP)

> **Mục đích file:** Đây là tài liệu requirement dùng làm nguồn sự thật (source of truth) khi vibe code với Claude Code trong VS Code.
> Claude phải đọc file này trước khi code, làm theo từng milestone ở **Mục 13**, và tuân thủ các quy tắc ở **Mục 14**.
>
> - Phiên bản: **2.0-MVP** (bản frontend + mock; backend thật chưa làm)
> - Ngày: 11/11/2026 (v1.2: 31/10/2026)
> - Nguồn: WS-SaaS-BRS-SRS-001 v1.0 + định hướng sản phẩm mới (3 actor, shop tự đăng ký, landing page builder)
> - Ngôn ngữ tài liệu: tiếng Việt. **Code, tên biến, enum, commit message: tiếng Anh.**
> - Nguồn bổ sung của bản 2.0: các yêu cầu bổ sung trong quá trình làm bản frontend (khu vực customer, affiliate / referral, rút tiền, khu admin mở rộng, website công khai, tên miền riêng, đăng ký bằng popup...).

### Tình trạng triển khai (11/11/2026)

| Phần | Trạng thái |
|---|---|
| **Giao diện** (website công khai, khu shop owner, khu customer, khu admin) với **5 ngôn ngữ** (en, vi, ko, ja, zh; `/systemadmin` chỉ en + vi) | **Đã làm**, chạy bằng dữ liệu mẫu |
| **API mock** trong Next.js (`/api/v1/*`, xem 9.5), dữ liệu trong bộ nhớ, mất khi khởi động lại | **Đã làm** (cùng hợp đồng với backend thật) |
| **Test** (Vitest): luật nghiệp vụ trong `packages/shared`, API mock, giao diện, bản dịch đủ 5 ngôn ngữ | **Đã làm**, `pnpm lint`, `pnpm typecheck`, `pnpm test` phải xanh trước mỗi thay đổi |
| **Backend thật** (NestJS, PostgreSQL, Drizzle, pg-boss, session cookie, R2, Resend, Turnstile) | **Đang dựng** (từ 12/11/2026): `apps/api` có khung NestJS + Fastify, 7 bảng của M1 và 2 migration, **auth đầy đủ** (đăng ký, đăng nhập bằng cookie session, đăng xuất, xác minh email, quên / đặt lại mật khẩu), guard (Origin / CSRF, đăng nhập, tenant, admin), `GET /organization` và `GET /audit-logs` của shop, **workshop, schedule rule và session (M2, trừ ảnh R2)**, outbox + worker pg-boss gửi email (Mailpit / Resend), seed demo. **Chưa có:** booking, payment, media (R2), landing page builder, endpoint public và admin. **Giao diện web vẫn chạy bằng API mock**, chưa gọi backend thật. **Đây là bản POC: mã bảo mật chưa được người review, không đưa lên production khi chưa review** |
| **Hạ tầng** (Docker, Caddy, CI, backup, Sentry, E2E Playwright, Testcontainers) | **Một phần**: `infra/docker-compose.yml` chạy PostgreSQL 16 và Mailpit cho dev; workflow CI GitHub Actions (`.github/workflows/ci.yml`). **Đã có thêm (13/11/2026):** Dockerfile production cho API và web (nhiều giai đoạn, chạy bằng user không phải root, có healthcheck), `infra/docker-compose.prod.yml` (db, migrate, api, worker, web, caddy, backup), `infra/Caddyfile` (HTTPS theo nhu cầu có hỏi API trước), `infra/backup/` (backup / khôi phục mã hóa lên R2) và `docs/RUNBOOK.md`. **Playwright (13/11/2026):** `e2e/` + `playwright.config.ts` (`pnpm test:e2e`, job `e2e` trong CI): 10 test trên Chromium thật cho các luồng chính (đọc landing page, đổi ngôn ngữ, đặt chỗ 5 bước, đăng ký và đăng nhập, chủ shop duyệt dashboard và landing page, admin xem danh sách shop); mọi test fail khi có vi phạm CSP hoặc lỗi không bắt trong trang; chạy trên dữ liệu mẫu của web (chưa nối API thật). **Chưa có:** Sentry, Testcontainers; **nối web với API thật: xong lát 0–2 (xác thực, phiên, đồng ý lại Terms/Privacy, trang công khai và đặt chỗ), lát 3–6 chưa làm** (xem `docs/WEB_API_INTEGRATION.md`) |

Mọi chỗ trong tài liệu ghi **TODO(api)** là phần chờ backend thật. Các mục ghi "*Giới hạn MVP (mock)*" nói rõ chỗ mock chưa làm hết (ví dụ chỉ shop demo có đủ dữ liệu).

### Thay đổi của bản 2.0 so với 1.2

- **Bỏ:** hàng đợi duyệt shop (publish có hiệu lực ngay), gói trả phí FREE / PRO, chức năng hoàn tiền (chỉ còn khoản điều chỉnh giảm / reversal), chức năng admin bật / tắt template.
- **Thêm:** website công khai (Home, About Us, Contact, Terms, Privacy) và popup Log in / Sign up 2 tab; khu vực customer (Today, My Profile, My Booking với Check in / Completed (đánh giá) / Cancel, Favorites, Workshops, Affiliate, Referrals, rút tiền); tên miền riêng của shop; dùng khu admin để sửa shop, sửa landing page / workshop / session của shop ngay trong khu admin; vô hiệu hóa affiliate / referral; Settings của nền tảng; hộp thư hỗ trợ; email hệ thống; Terms & Privacy do admin soạn; chi tiết Income theo shop với kết sổ từng tháng; khuyến mãi; quản lý hình ảnh; audit log của mọi người dùng; liên hệ hỗ trợ của nền tảng; danh mục workshop và thuật toán sắp xếp công bằng giữa các shop.

---

## 0. Giả định đang áp dụng (cần PO xác nhận)

Các mục dưới đây là **giả định** để có thể bắt đầu code. Nếu thay đổi, cập nhật file này trước rồi mới sửa code.

| # | Giả định | Ảnh hưởng nếu đổi |
|---|---|---|
| A1 | Khách du lịch **thanh toán tại shop**. MVP không có thanh toán online và **không có hoàn tiền**. Hệ thống **kết sổ vào cuối tháng**, shop thanh toán phí nền tảng theo **invoice** hệ thống gửi (chức năng gửi invoice làm sau). | Lớn: thanh toán online cần Stripe Connect (hoặc tương đương), KYC, phí nền tảng |
| A2 | Mỗi shop có **tối đa 2 landing page, 1 page public tại một thời điểm** (FR-SITE-07), page public dùng địa chỉ của shop | Trung bình: schema đã chuẩn bị cho nhiều page |
| A3 | Shop tự đăng ký; **publish landing page có hiệu lực ngay, không cần admin duyệt** (không có hàng đợi duyệt) | Thấp |
| A4 | Tính phí shop **chưa làm**; **không có gói trả phí (plan FREE/PRO)**, đã loại bỏ hoàn toàn (cột `plan`, giới hạn theo gói) | Thấp |
| A5 | Chỉ có lịch **cố định** (fixed schedule) và **instant booking**. Request booking và lịch linh hoạt để phase sau | Trung bình |
| A6 | Ngôn ngữ hỗ trợ: EN (mặc định), VI, KO, JA, **ZH (tiếng Trung, một ngôn ngữ duy nhất; shop tự điền chữ giản thể hoặc phồn thể tùy ý)** *(v1.2: thêm tiếng Trung)*. Shop tự chọn bật ngôn ngữ nào. Mã locale trong URL: `/ja`, `/zh`. `hreflang`: `zh`. Dữ liệu cũ lưu dưới khóa `zh-TW` được tự gộp vào `zh`. Giao diện nền tảng (dashboard, modal đặt chỗ…) mới dịch EN và một phần VI/KO/JA; ZH tạm fallback EN, riêng chính sách đến trễ (BR-09) có đủ bản dịch | Thấp |
| A7 | Shop chỉ có 1 role là `OWNER` trong MVP. Schema vẫn hỗ trợ nhiều member/role | Thấp |
| A8 | Domain mặc định: `{shop}.{PLATFORM_DOMAIN}`. **Shop có thể gắn tên miền riêng** (Settings; admin cũng sửa được), mức mock: chưa kiểm tra DNS, chưa cấp chứng chỉ TLS (FR-ORG-02) | Trung bình: cần DNS check, Caddy on-demand TLS, cột `custom_domain` unique |
| A9 | Sinh session trước **60 ngày**, job chạy hằng ngày | Thấp |
| A11 | **Không có gói trả phí** (plan FREE / PRO) và **không có bước admin duyệt shop**; admin kiểm soát bằng khóa shop và xử lý báo cáo | Thấp |
| A12 | Customer có **tài khoản** (đăng ký bằng popup, email + mật khẩu) và khu vực riêng `/customer/{id}`; khách vãng lai vẫn đặt chỗ không cần tài khoản | Trung bình |
| A13 | Admin hệ thống chỉ có **một vai trò** (`SUPER_ADMIN`, giả lập); nhiều admin, phân quyền và nhật ký đăng nhập của admin để sau | Trung bình |
| A14 | Mock chỉ có đủ dữ liệu cho **shop demo** (Whisk & Ladle); shop đăng ký mới chỉ có trang chào mừng cho tới khi có backend | Lớn khi làm backend |
| A10 | Email provider: **Resend** (qua interface để thay được). Dev dùng Mailpit | Thấp |

`{PLATFORM_DOMAIN}` là placeholder, ví dụ `workshopkit.com`. Không hard-code trong code; đọc từ env.

---

## 1. Tổng quan sản phẩm

Nền tảng SaaS cho phép **shop owner** (xưởng gốm, trang sức, nến, nấu ăn…) tự tạo **landing page** giới thiệu workshop và nhận **booking** từ **khách du lịch**. Khách không cần tạo tài khoản.

Giá trị cốt lõi:

1. Shop có một landing page đẹp, đa ngôn ngữ trong vài phút, không cần dev.
2. Booking không bao giờ vượt quá số chỗ (no overbooking).
3. Shop quản lý booking, check-in và ghi nhận thanh toán tại chỗ trên cùng một dashboard.

### 1.1 Actor

| Actor | Mô tả | Khu vực |
|---|---|---|
| **Platform Admin** | Đội vận hành nền tảng | `app.{PLATFORM_DOMAIN}/systemadmin` |
| **Shop Owner** | Chủ shop; đăng ký, tạo landing page, quản lý workshop/lịch/booking | `app.{PLATFORM_DOMAIN}/shopowner` |
| **Traveler (Guest)** | Khách du lịch; xem landing page và đặt chỗ, không cần tài khoản | `{shop}.{PLATFORM_DOMAIN}` hoặc tên miền riêng của shop |
| **Customer** | Khách có tài khoản (đăng ký bằng popup): xem booking, check-in, đánh giá workshop, yêu thích, Affiliate, Referrals, rút tiền | `app.{PLATFORM_DOMAIN}/customer/{id}` |
| **Khách truy cập website nền tảng** | Xem Home, About Us, Contact, Terms, Privacy; Log in / Sign up bằng popup | `app.{PLATFORM_DOMAIN}` |

### 1.2 Trong phạm vi MVP

- **Website công khai của nền tảng:** Home (có 10 workshop ngẫu nhiên), About Us, Contact, Terms, Privacy; popup **Log in** và **Sign up** (tab customer: email + mật khẩu; tab shop owner: thêm tên shop để sinh slug); đa ngôn ngữ.
- Shop owner: đăng ký, đăng nhập, quên mật khẩu, onboarding (tên shop, slug sinh từ tên, timezone, currency, ngôn ngữ), Settings (kể cả **tên miền riêng**).
- Landing page builder theo **template + section** (không cho viết HTML / JS tùy ý), tối đa 2 landing page, preview theo từng ngôn ngữ, publish **có hiệu lực ngay, không qua duyệt**.
- Quản lý workshop (có danh mục 1 đến 3 loại), schedule rule, session, capacity; promotion; Income của shop (phí duy trì, phí dịch vụ).
- Trang public của shop: landing page, lịch còn chỗ, đặt chỗ instant, email xác nhận, khách tự hủy booking, báo cáo vi phạm; affiliate link và referral link.
- Dashboard shop: Overview, Today, danh sách booking, booking thủ công, check-in / uncheck-in, hủy có lý do, ghi nhận thanh toán (Confirm payment / Unpaid), customers, đóng / dời session.
- **Khu vực customer:** Today, My Profile, My Booking (Check in, **Rate this workshop = đánh giá workshop**, Cancel), Favorites, Workshops (xếp công bằng giữa các shop), Affiliate, Referrals, rút tiền; menu dạng ngăn kéo trên điện thoại.
- **Khu admin hệ thống** (`/systemadmin`, en + vi): Users, Shops (sửa thông tin, tên miền riêng), Customers, Workshops, Sessions, Bookings, Landing pages (sửa ngay trong khu admin), Images, Promotions, Income (chi tiết + kết sổ tháng), Withdrawals, Config fees, Affiliate, Referrals, Report management, Support inbox, Emails, Terms & Privacy, Settings, Support contact, Audit logs.
- Audit log ghi hành động của mọi người dùng; anti-spam: Cloudflare Turnstile và rate limit (mức mock: rate limit form Contact và báo cáo; Turnstile chỉ có chỗ giữ chỗ).

### 1.3 Ngoài phạm vi MVP (KHÔNG code)

- Thanh toán online, **hoàn tiền**, gói trả phí và billing; **gửi invoice** cho shop (sẽ làm sau; hiện chỉ có kết sổ tháng để xem).
- Request booking, lịch linh hoạt.
- Revision / rollback đầy đủ của landing page; nhiều hơn 2 landing page mỗi shop.
- Nhân viên shop (Manager / Staff), Product Order, Custom Order.
- Marketplace tổng hợp shop (khác với mục Workshops của khu customer), app mobile native.
- Nhiều admin và phân quyền admin; hộp thư hỗ trợ gộp yêu cầu của shop owner và customer; lịch sử phiên bản Terms / Privacy.

---

## 2. Tech stack (đã chốt cho MVP)

### 2.1 Ngôn ngữ

- **TypeScript** (strict mode) cho toàn bộ frontend, backend, shared packages.
- **SQL** (PostgreSQL) cho migration và các truy vấn cần lock.

### 2.2 Stack chi tiết

| Lớp | Công nghệ | Ghi chú |
|---|---|---|
| Runtime | Node.js **LTS hiện hành** | Ghi version trong `.nvmrc` và `engines` |
| Package manager / monorepo | **pnpm workspaces + Turborepo** | |
| Frontend (public + dashboard + admin) | **Next.js (App Router)** + React | SSR cho landing page public; dashboard dùng client components |
| UI | **Tailwind CSS** + **shadcn/ui** | Icon: lucide-react |
| Form | **react-hook-form** + **Zod** | |
| Data fetching (dashboard) | **TanStack Query** | |
| i18n | **next-intl** | Áp dụng cho cả UI dashboard và landing page |
| Drag & drop (builder) | **dnd-kit** | Sắp xếp section |
| Backend API | **NestJS** (adapter Fastify) | REST, module theo domain |
| ORM / query | **Drizzle ORM** + drizzle-kit | Viết SQL tường minh, hỗ trợ `SELECT ... FOR UPDATE` |
| Database | **PostgreSQL** (bản stable hiện hành) | Một database dùng chung, tenant-scoped bằng `organization_id` |
| Background jobs | **pg-boss** | Queue chạy trên Postgres; không cần Redis |
| Validation dùng chung | **Zod** trong `packages/shared` | Cùng schema cho frontend, backend và section registry |
| Auth | Tự xây: session cookie lưu DB + **argon2id** | Không dùng JWT cho dashboard |
| Object storage | **Cloudflare R2** qua `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` | Presigned PUT/GET |
| Email | **Resend** (qua `EmailProvider` interface); template bằng **React Email** | Dev: **Mailpit** |
| Anti-bot | **Cloudflare Turnstile** | Form đăng ký shop và form booking |
| Rate limit | `@nestjs/throttler` | In-memory là đủ cho 1 instance MVP |
| Ngày giờ | `date-fns` + `@date-fns/tz` | Lưu UTC, hiển thị theo timezone của shop |
| Logging | **pino** (JSON structured) | Không log secret, token, presigned URL |
| Error monitoring | **Sentry** (tùy chọn, bật qua env) | |
| Test | **Vitest** (unit/integration), **Testcontainers** (Postgres thật), **Playwright** (E2E) | |
| Lint/format | ESLint + Prettier + `tsc --noEmit` | |
| API docs | `@nestjs/swagger` → OpenAPI | Sinh type client từ OpenAPI nếu cần |
| Container | **Docker** + **Docker Compose** | |
| Reverse proxy / TLS | **Caddy** + **Cloudflare** (DNS proxy, wildcard `*.{PLATFORM_DOMAIN}`) | Cloudflare Origin CA cert, SSL mode Full (strict) |
| Hạ tầng MVP | 1 VPS 4 vCPU / 4 GB RAM | Nâng cấp theo monitoring |
| CI | GitHub Actions hoặc Azure DevOps Pipelines | lint, typecheck, test, build image |

### 2.3 Không dùng trong MVP

Microservices, Kubernetes, Redis, GraphQL, message broker riêng, SQLite, MongoDB, vector DB, AI. Chỉ thêm khi có lý do rõ ràng và đã cập nhật file này.

---

## 3. Kiến trúc

### 3.1 Sơ đồ logic

```
Traveler ──► {shop}.PLATFORM_DOMAIN ─┐
                                     │   Cloudflare (DNS, TLS, cache tĩnh)
Shop/Admin ─► app.PLATFORM_DOMAIN ───┤
                                     ▼
                                   Caddy
                                     │
                         ┌───────────┴───────────┐
                         ▼                       ▼
                 apps/web (Next.js)  ──/api/*──► apps/api (NestJS)
                 - resolve host                  - auth, RBAC, tenant guard
                 - render landing (SSR)          - business rules, transactions
                 - dashboard, admin              │
                                                 ├──► PostgreSQL (private network)
                 apps/api worker (pg-boss) ◄─────┤
                 - email, generate sessions      └──► Cloudflare R2 (media)
                 - outbox dispatcher                       ▲
                                                           │ presigned PUT/GET
Browser ───────────────────────────────────────────────────┘
```

### 3.2 Nguyên tắc

- **Modular monolith**: một API NestJS chia module theo domain, một app Next.js.
- Next.js **proxy `/api/*`** sang NestJS (rewrites) để dashboard và landing page dùng chung origin, tránh lỗi CORS và cookie cross-site.
- Next.js không truy cập database trực tiếp. Mọi dữ liệu đi qua API.
- Worker là một entrypoint riêng trong `apps/api` (`main.worker.ts`), chạy thành container riêng.
- PostgreSQL chỉ mở trong Docker network, **không public port**.

### 3.3 Định tuyến theo host (multi-tenant)

| Host | Xử lý |
|---|---|
| `app.{PLATFORM_DOMAIN}` | Khu vực quản lý của shop owner (`/shopowner/{slug}/*`, ví dụ `/shopowner/whiskladle/bookings`; `/shopowner` chuyển hướng tới `/shopowner/{slug}` của shop trong phiên; địa chỉ cũ `/shopowner/bookings` và `/dashboard/*` được chuyển hướng sang địa chỉ có slug; slug khác slug của shop trả 404; `/shopowner/onboarding` là wizard tạo shop nên chưa có slug), system admin (`/systemadmin/*`; đường dẫn cũ `/admin/*` được chuyển hướng sang `/systemadmin/*`), auth (`/login`, `/signup`…) |
| `{PLATFORM_DOMAIN}` | Trang marketing của nền tảng (đơn giản, tĩnh) |
| `{slug}.{PLATFORM_DOMAIN}` | Landing page của shop. Next.js middleware/proxy (tùy phiên bản Next.js) rewrite sang `/sites/[slug]/[[...locale]]` |
| `media.{PLATFORM_DOMAIN}` | R2 public bucket (custom domain của R2) |

- **Website công khai và khu quản lý (quyết định D21, TODO(api) / hạ tầng):** website công khai (Home, About Us, Contact, Terms, Privacy) đặt ở **`{PLATFORM_DOMAIN}`**; khu quản lý (shop owner, customer, admin) ở **`app.{PLATFORM_DOMAIN}`**. Bản frontend chạy cả hai cùng host `app.localtest.me` để dev; khi triển khai tách host và đặt cookie đăng nhập chỉ cho `app.`.
- **Tên miền riêng (quyết định D13, TODO(api)):** luôn kiểm tra DNS trước khi dùng, **kể cả khi admin gắn hộ** (admin không được bỏ qua); khi tên miền riêng đã xác minh, địa chỉ `{slug}.{PLATFORM_DOMAIN}` **chuyển hướng 301** sang tên miền riêng để tránh trùng nội dung (SEO). Bản mock chưa kiểm tra DNS và chưa chuyển hướng.
- Shop chưa ACTIVE hoặc page chưa PUBLISHED: trả về **404**.
- Shop SUSPENDED: trả về trang "Site unavailable" (HTTP 451 hoặc 404, chốt 404 cho MVP).

### 3.4 Cấu trúc thư mục

Bản hiện tại (frontend + mock):

```
/
├─ apps/
│  └─ web/                         # Next.js (giao diện + API mock)
│     ├─ src/app/
│     │  ├─ (marketing)/(site)/    # Home, About Us, Contact, Terms, Privacy (khung tối chung)
│     │  ├─ (auth)/                # /login, /signup chuyển về popup; forgot / reset password, verify email
│     │  ├─ shopowner/[slug]/      # khu shop owner (today, bookings, customers, workshops, sessions, finance, promotions, site, settings)
│     │  ├─ customer/[accountId]/  # khu customer (today, profile, bookings, favorites, workshops, affiliate, referrals)
│     │  ├─ systemadmin/           # khu admin; systemadmin/shops/[slug]/ = sửa landing page, session, workshop của shop
│     │  ├─ sites/[slug]/          # landing page public (SSR), sitemap, robots, booking, report
│     │  └─ api/v1/                # API mock (xem 9.5)
│     ├─ src/components/           # ui (shadcn), builder, sections, marketing, customer, admin, dashboard, ...
│     ├─ src/lib/mock/             # kho dữ liệu mẫu trong bộ nhớ (mỗi kho có test)
│     ├─ src/proxy.ts              # định tuyến theo host (subdomain, tên miền riêng)
│     └─ messages/{en,vi,ko,ja,zh}/ # chữ giao diện, mỗi khu vực một file JSON
├─ packages/
│  ├─ shared/                      # luật nghiệp vụ dùng chung (Zod, session, booking, phí, khuyến mãi, tên miền...), có test
│  └─ config/                      # chỗ dự phòng cho cấu hình dùng chung (trống)
├─ infra/                          # trống (chưa có Docker, Caddy, backup)
├─ docs/REQUIREMENTS.md            # file này
├─ CLAUDE.md
└─ .env.example
```

Cấu trúc đích khi có backend thật (chưa làm):

```
├─ apps/api/                       # NestJS: modules auth, organizations, sites, media, workshops, sessions, bookings,
│                                  #   customers, payments, notifications, admin, audit, reports, public; db (Drizzle); jobs (pg-boss)
├─ packages/email-templates/       # React Email
└─ infra/                          # docker-compose, Caddyfile, backup pg_dump -> R2
```

---

## 4. Multi-tenancy và phân quyền

### 4.1 Mô hình tenant

- Mỗi shop là một `organization` (tenant).
- Mọi bảng nghiệp vụ có cột `organization_id NOT NULL`.
- Tenant context được xác định **ở server**:
  - Dashboard: từ session của user + membership (`organization_members`). User chọn shop đang thao tác; API kiểm tra membership trên **mọi** request.
  - Public: từ `slug` của host, resolve thành `organization_id` ở backend.
- **Không bao giờ tin `organization_id`, giá, status, role do client gửi lên.**

### 4.2 Role

| Role | Phạm vi | Quyền |
|---|---|---|
| `SUPER_ADMIN` | Platform (`users.platform_role`) | Toàn quyền khu vực `/systemadmin`; không dùng cho thao tác trong shop |
| `OWNER` | Organization | Toàn quyền trong shop của mình |

- Phase sau sẽ thêm `MANAGER`, `STAFF`, `EDITOR`. Code permission dạng **action-based** ngay từ đầu (ví dụ `booking.check_in`, `site.publish`) và map `OWNER` sang tất cả quyền, để thêm role mới mà không phải sửa logic.
- Kiểm tra quyền ở **backend** bằng Guard. Ẩn nút ở frontend chỉ để cải thiện UX, không phải bảo mật.

### 4.3 Bắt buộc về tenant isolation

1. Mọi repository/query trên bảng tenant-scoped phải có điều kiện `organization_id = :currentOrgId`.
2. Tạo helper `tenantScope(table, orgId)` và dùng thống nhất; code review phải kiểm tra điểm này.
3. FK giữa các bảng cùng tenant dùng **composite FK `(organization_id, id)`** cho các quan hệ chính: bookings→workshop_sessions, bookings→customers, workshop_sessions→workshops.
4. Truy cập tài nguyên của tenant khác: trả về **404** (không tiết lộ tài nguyên có tồn tại).
5. Bắt buộc có integration test cho tenant isolation ở mọi module (xem Mục 12).

---

## 5. Yêu cầu chức năng

Định dạng: `ID – Tên` · Ưu tiên: **Must** (MVP bắt buộc) / **Should** (nên có nếu kịp).

### 5.1 Auth và onboarding shop

**FR-AUTH-01 – Đăng ký (Must)**
- **Log in và Sign up là popup (dialog) của website công khai, không phải trang riêng.** Nút Log in / Sign up trên thanh trên, chân trang và các nút "Create your shop" mở popup ngay trên trang đang xem. Địa chỉ `/?auth=login`, `/?auth=signup` (thêm `&tab=owner` hoặc `&tab=customer`) mở popup khi vào trang; `/login` và `/signup` chỉ chuyển hướng tới đó (nên link trong email và nút Log out vẫn đúng). Esc hoặc bấm ra ngoài thì đóng và bỏ `?auth`. Quên mật khẩu vẫn là trang `/forgot-password`.
- **Popup Sign up có 2 tab** (thông tin tối thiểu, không có họ tên, Terms checkbox hay Turnstile trong form; có dòng chữ "tạo tài khoản nghĩa là bạn đồng ý Terms và Privacy"):
  - **Customer** (khách cá nhân): **email, mật khẩu, nhập lại mật khẩu**. Tên hiển thị tạm là phần trước `@` của email; khách bổ sung hồ sơ (quốc gia, ngày sinh, danh mục yêu thích) trong My Profile.
  - **Shop owner**: **tên shop, email, mật khẩu, nhập lại mật khẩu**. **Slug của shop tự sinh từ tên shop** (FR-ORG-01: bỏ dấu, `-`, tối đa 32 ký tự; trùng hoặc reserved thì thêm `-2`, `-3`…), form xem trước địa chỉ `{slug}.{PLATFORM_DOMAIN}`. Tạo shop ở trạng thái `DRAFT` và tài khoản owner.
  - Mật khẩu 10–72 ký tự; nhập lại phải khớp; mọi chuỗi `trim()` (BR-16); lỗi hiện ngay dưới từng ô. Email đã có tài khoản: `409 EMAIL_TAKEN`, báo "đã có tài khoản, hãy đăng nhập".
  - **Quyết định sau rà soát (D1 đến D4; D2 và D3 chờ backend):** (D1) đăng ký bằng popup và đăng ký ở landing page của shop (FR-BOOK-05) **cùng tồn tại**; tài khoản tạo bằng popup chưa có ngày sinh nên trang **My Profile** hiện khung nhắc bổ sung hồ sơ cho tới khi khách lưu ngày sinh. (D2) bản mock **đăng nhập ngay** sau khi đăng ký, **chưa an toàn cho production**; backend bắt buộc xác minh email trước khi vào hệ thống (FR-AUTH-01). (D3) mock báo rõ "email đã có tài khoản" (409); backend trả **thông báo chung** dù email đã đăng ký hay chưa để không bị dò email. (D4) một email chỉ là **một** vai trò (customer hoặc shop owner); muốn dùng cả hai phải dùng hai email.
- **Đăng ký xong được đăng nhập luôn** và chuyển tới khu vực của mình: customer tới **Today** (`/customer/{id}/today`), shop owner tới `/shopowner/{slug}`. Shop mới chưa có dữ liệu mock nên khu vực owner của shop vừa tạo hiện **trang chào mừng** (tên shop, địa chỉ, email, ghi chú prototype) cho tới khi có backend; công cụ đầy đủ chỉ có ở shop demo.
- API `POST /auth/signup` `{type: CUSTOMER | SHOP_OWNER, email, password, confirmPassword, shopName?}` → `201` cùng dạng với login (`{type, id, email, slug | guestSlug}`), `422` kèm `fields` (`required | invalid | tooLong | weak | mismatch`), `409`. Audit `auth.signup` (không ghi mật khẩu). Shop mới hiện trong danh sách Shops và Users của admin.
- *Chưa làm (TODO(api)):* email xác minh một lần (token lưu hash, hết hạn 24 giờ) và chặn đăng nhập khi chưa xác minh, Turnstile, rate limit đăng ký, tạo `users` + `organizations` + `organization_members` trong một transaction. Trước khi có các mục này, đăng ký chưa an toàn cho production.

**FR-AUTH-02 – Đăng nhập, đăng xuất, quên mật khẩu (Must)**
- Session lưu bảng `auth_sessions`; cookie `httpOnly`, `Secure`, `SameSite=Lax`; hết hạn sau 7 ngày không hoạt động.
- Reset password: token một lần, lưu hash, hết hạn 1 giờ; reset xong thì xóa toàn bộ session cũ.
- Rate limit login: 5 lần sai / 15 phút / IP+email (mock: khóa theo cặp client + email, nên người khác sai mật khẩu từ nơi khác không khóa được chủ tài khoản). Địa chỉ client lấy từ mục **cuối** của `X-Forwarded-For` (do reverse proxy thêm vào), không tin mục đầu do client tự ghi; dùng chung cho rate limit của Contact và Report.
- **Đăng nhập trong popup Log in:** nhập email + mật khẩu; theo loại tài khoản hệ thống chuyển tới **Overview của shop owner** (`/shopowner/{slug}`) hoặc **Today của customer** (`/customer/{id}/today`).
- **Mọi tài khoản (shop owner và customer) đăng nhập bằng email + mật khẩu** (mật khẩu 10 đến 72 ký tự, lưu dạng hash có salt). Sai email hay sai mật khẩu đều trả cùng một thông báo; tài khoản bị vô hiệu hóa chỉ được báo sau khi nhập đúng mật khẩu. Sau khi đăng nhập: shop owner vào `/shopowner/{slug}`, customer vào `/customer/{id}`. Customer đăng ký trên popup của landing page (email, mật khẩu + xác nhận mật khẩu, họ tên, quốc gia, ngày sinh, 3 lĩnh vực yêu thích) và không còn đăng nhập bằng OTP; OTP chỉ còn ở bước 5 của booking modal.
- **Reset mật khẩu bởi quản trị viên (FR-ADM-08):** khi admin bấm Reset Password, tài khoản bị **deactivate** và hệ thống gửi email (6 ngôn ngữ) gồm **mật khẩu tạm thời** và **link** `/reset-password?token=…`. Trang link yêu cầu nhập mật khẩu tạm thời, mật khẩu mới và xác nhận mật khẩu mới; thành công thì tài khoản active lại. Mật khẩu tạm thời (14 ký tự ngẫu nhiên) và token chỉ nằm trong email, chỉ lưu hash; dùng được **một lần**, hết hạn sau **3 ngày**, nhập sai mật khẩu tạm thời 5 lần thì link bị hủy; admin activate/deactivate sau đó cũng hủy link; reset mới thay thế reset cũ. API không bao giờ trả mật khẩu tạm thời hay token.
- *Giả định cần xác nhận:* gửi mật khẩu tạm thời qua email là thiết kế do yêu cầu; rủi ro được giảm bằng hash, một lần, hết hạn, giới hạn số lần thử và việc tài khoản bị deactivate cho tới khi đổi mật khẩu. MVP frontend dùng mật khẩu demo chung cho các tài khoản mẫu cho đến khi người dùng đặt mật khẩu riêng (backend thật dùng identity provider).

**FR-ORG-01 – Tạo shop / onboarding (Must)**
- Sau khi xác minh email, user đi qua wizard: tên shop (**slug do hệ thống tự sinh từ tên shop, owner không nhập**; dùng làm subdomain và nằm trong địa chỉ quản lý `/shopowner/{slug}`), quốc gia, timezone (IANA), currency (ISO 4217), ngôn ngữ mặc định, các ngôn ngữ bật thêm, thông tin liên hệ (địa chỉ, phone/WhatsApp, email, Google Maps URL).
- Slug: `^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$`, unique toàn hệ thống, chặn danh sách reserved (`app, admin, api, www, mail, media, static, help, support, status, blog, docs, cdn, assets, dashboard, login, signup, shopowner, systemadmin, onboarding`; và tên các mục của khu shop owner: `today, bookings, customers, workshops, sessions, finance, promotions, ratings, site, settings`, vì `/shopowner/{mục}` là địa chỉ cũ không có slug).
- **Quy tắc sinh slug** (`generateShopSlug`): từ tên shop, chữ thường, bỏ dấu (`đ` thành `d`), mỗi cụm ký tự không phải chữ hoặc số thành một dấu `-`, bỏ `-` ở hai đầu, tối đa 32 ký tự. Tên không còn ký tự dùng được (ví dụ chỉ có chữ Hàn / Nhật / Trung) thành `shop`; tên quá ngắn (dưới 3 ký tự) thêm `-shop` (ví dụ `a-shop`). Slug reserved hoặc đã có shop khác dùng thì thêm `-2`, `-3`… cho tới khi còn trống (vẫn tối đa 32 ký tự). Wizard hiển thị slug đã sinh (địa chỉ landing page và địa chỉ quản lý) ở chế độ chỉ đọc kèm lưu ý không đổi được.
- Tạo `organizations` (status `DRAFT`) và `organization_members` (role `OWNER`).
- **Luồng hiện tại (quyết định D5):** shop được tạo ngay khi chủ shop đăng ký bằng popup (đã có **tên** và **slug**). Đăng ký xong, hệ thống đưa chủ shop vào **wizard `/shopowner/onboarding?shop={slug}`**, bắt đầu từ bước **Region** (tên và địa chỉ hiển thị cố định, không sửa): khu vực (quốc gia, timezone, currency), ngôn ngữ, liên hệ (email mặc định là email chủ shop), rồi **Save and continue**. API `POST /onboarding` `{slug, country, timezone, currency, defaultLocale, enabledLocales, contactEmail, contactPhone, whatsapp?, address, mapsUrl?}` → `200 {slug}`; `422` kèm `fields`; `404` với slug không phải shop vừa đăng ký (shop mẫu đã thiết lập sẵn); `409 ALREADY_DONE` khi làm lần hai. Audit `shop.onboarding`. Chưa làm xong wizard thì trang chào của shop (`/shopowner/{slug}`) có khung nhắc **Finish the setup**; đăng nhập lần sau vẫn vào trang chào. Không có wizard thì tên shop và slug vẫn nằm trong luồng đăng ký (wizard cũ không `?shop` là bản chạy riêng của phiên bản đầu, chỉ để xem thử). *Giới hạn MVP (mock):* shop mới chưa dùng được các công cụ khác (workshop, session, landing page, booking) vì mock chỉ có dữ liệu của shop mẫu; làm khi có backend (TODO(api)).
- AC: slug trùng hoặc reserved bị từ chối kèm thông báo rõ ràng.

**FR-ORG-02 – Cài đặt shop (Must)**
- Sửa thông tin shop, timezone, currency, ngôn ngữ.
- **Đổi currency hoặc timezone** khi đã có booking: hiển thị cảnh báo; không chuyển đổi dữ liệu cũ.
- **Tên miền riêng (custom domain):** ở Settings có thẻ **"Your own domain"** với ô **Domain** (tùy chọn). Khi shop nhập `www.studio-cua-ban.com`, **landing page được phục vụ tại tên miền đó** thay cho `{slug}.{PLATFORM_DOMAIN}` (địa chỉ hệ thống vẫn dùng được, không bị tắt).
  - Chuẩn hóa và kiểm tra (`checkCustomDomain` trong `packages/shared`, dùng chung ở form và server): `trim`, chữ thường, bỏ `https://`, đường dẫn, query, cổng, dấu chấm cuối (dán nguyên URL vẫn được); tên Unicode đổi sang punycode; từ chối IP, `localhost`, tên một nhãn, nhãn > 63 ký tự hoặc bắt đầu / kết thúc bằng `-`, tên > 253 ký tự, đuôi không phải chữ, và **tên miền của nền tảng cùng mọi subdomain** (`PLATFORM`). Để trống = bỏ tên miền riêng.
  - Mỗi tên miền chỉ thuộc **một shop** (`409 DOMAIN_TAKEN`). Nút Save theo BR-17; chuỗi được `trim()` (BR-16).
  - Form hiển thị hướng dẫn DNS: tạo bản ghi **CNAME trỏ tới `{slug}.{PLATFORM_DOMAIN}`**; tới khi tên miền hoạt động khách vẫn dùng địa chỉ hệ thống.
  - Proxy: host trùng tên miền riêng của một shop được viết lại thành `/sites/{slug}` (như subdomain), nên **chỉ có landing page của shop**; `/systemadmin`, `/shopowner`, `/customer`... trả 404 trên host đó. Canonical, hreflang, sitemap, robots, link xác nhận trong email booking, link affiliate / referral dùng tên miền riêng khi có.
  - API: `GET /shop/domain`, `PUT /shop/domain` `{domain}` (`422` kèm `fields.domain` = `invalid | platform | tooLong`). Ghi audit `shop.domain_set` / `shop.domain_remove` (`cũ -> mới`); admin sửa từ khu admin được ghi là System Admin.
  - *Triển khai thật (13/11/2026, `apps/api`):* cột `organizations.custom_domain` (duy nhất) và `custom_domain_verified_at`. `GET /shop/domain` → `{domain, verified, target}` (`target` = `{slug}.{PLATFORM_DOMAIN}`); `PUT /shop/domain` `{domain}` làm sạch và kiểm tra bằng `checkCustomDomain` (`422 fields.domain = invalid | platform | tooLong`, `409 DOMAIN_TAKEN`; trống = gỡ); `POST /shop/domain/verify` tra DNS (`CNAME` phải trỏ tới `target`, `verified` mới thành `true`; `409 NO_DOMAIN` khi shop chưa có tên miền). **Theo D13, tên miền chỉ có hiệu lực sau khi DNS đúng, kể cả khi admin gắn hộ**: đổi tên miền thì phải xác minh lại; shop không `ACTIVE` không được phục vụ; shop `SUSPENDED` không đổi được. `GET /public/domains/{host}` → `{slug}` cho proxy viết lại host và cho bước hỏi chứng chỉ của máy chủ phía trước (chỉ tên miền đã xác minh của shop `ACTIVE`, còn lại `404`). Audit `shop.domain_set` / `shop.domain_remove` (cũ -> mới) và `shop.domain_verify`. `PATCH /organization` (chủ shop) nhận tên, email và điện thoại liên hệ, WhatsApp, địa chỉ, Google Maps URL (https), quốc gia, múi giờ (IANA thật), tiền tệ (mã ISO thật), ngôn ngữ mặc định (phải nằm trong các ngôn ngữ bật) và ngôn ngữ bật; chỉ trường nào gửi mới đổi, `slug` và `status` trong body bị bỏ qua; đổi múi giờ / tiền tệ khi shop đã có booking vẫn được, **không chuyển đổi dữ liệu cũ** và trả `warnings` (`timezoneChangedWithBookings`, `currencyChangedWithBookings`); audit `shop.profile_update` **chỉ ghi tên các trường đã đổi**. **Chưa làm:** chuyển hướng 301 từ địa chỉ hệ thống sang tên miền riêng và cấp chứng chỉ TLS (hạ tầng; cần người duyệt trước khi bật ở production).
  - *Giới hạn MVP (mock):* chưa kiểm tra DNS thật, chưa cấp chứng chỉ TLS cho tên miền (TODO(api): Caddy on-demand TLS có hỏi trước tên miền nào được cấp, cột `organizations.custom_domain` unique, tùy chọn chuyển hướng `{slug}.{PLATFORM_DOMAIN}` sang tên miền riêng). Danh sách admin (Landing pages, Shops) vẫn hiện địa chỉ hệ thống. **Cần người duyệt** trước khi bật ở production vì ảnh hưởng hạ tầng (DNS, TLS, bảo mật host).
- **Slug không bao giờ đổi:** sau khi shop được tạo, slug **không thể thay đổi trong suốt quá trình sử dụng hệ thống, kể cả admin** (không có màn hình hay API đổi slug; backend từ chối mọi cập nhật `organizations.slug`, nên cũng không cần redirect slug cũ).

### 5.2 Landing page builder

**FR-SITE-01 – Chọn template (Must)**
- MVP có **10 template** do nền tảng định nghĩa trong code. **Template = bố cục trang riêng biệt (frame/layout: cấu trúc trang, điều hướng, nhóm section) + palette + font + bo góc/mật độ + bộ section, thứ tự và variant mặc định**; dùng chung 11 section type và bộ renderer. Shop chọn bằng cách nhìn wireframe trong builder và có thể **Preview** nội dung hiện tại với template khác trước khi áp dụng. 10 layout: `classic` (Classic Story: thanh menu sticky + section xếp dọc), `quicklinks` (Quick Links: một cột hẹp, nút lớn), `bookingrail` (Book Now Rail: thẻ đặt chỗ sticky bên phải, thanh đặt chỗ dưới cùng trên mobile), `floatingcards` (Floating Cards: header dạng viên thuốc, mỗi section là một thẻ nổi), `sidebar` (Side Menu: menu cố định bên trái), `journey` (Journey: timeline Discover/Choose/Visit/Book), `magazine` (Magazine: tiêu đề serif lớn, chương đánh số), `bento` (Bento Grid: lưới ô nhiều kích thước), `appstyle` (App Style: thanh tab, mỗi lần một nhóm section), `cinematic` (Cinematic: nền tối, panel toàn màn hình, chỉ báo chấm). Layout lưu trong `PageContent.layout`; giá trị thiếu/không hợp lệ dùng layout đầu tiên (`classic`). *(v1.2: đổi từ 2 lên 10 template theo yêu cầu PO; v1.3: template khác nhau về cấu trúc trang, không chỉ màu/variant.)*
- Đổi template giữ lại nội dung các section cùng type.

**FR-SITE-02 – Chỉnh section (Must)**
- Section registry nằm trong `packages/shared/src/sections/`. Mỗi section type có: `type`, `schemaVersion`, Zod schema cho props, giá trị mặc định, form editor, component renderer.
- Section type MVP:

| type | Nội dung | Ghi chú |
|---|---|---|
| `hero` | title, subtitle, ảnh nền, CTA text | CTA mở booking modal |
| `about` | heading, body (text thuần + xuống dòng), ảnh | |
| `workshops` | heading, chế độ hiển thị (grid/list) | **Tự lấy** workshop ACTIVE từ DB, không nhập tay |
| `gallery` | heading, tối đa 12 ảnh | |
| `team` | heading, danh sách (tên, vai trò, ảnh, mô tả ngắn) | Nghệ nhân / host |
| `testimonials` | heading, danh sách (tên, quốc gia, nội dung) | Shop chịu trách nhiệm tính xác thực; hiển thị ghi chú trong builder |
| `faq` | heading, danh sách Q&A | Mặc định có câu hỏi về chính sách đến trễ |
| `location` | heading, địa chỉ, giờ mở cửa, Google Maps URL | Chỉ cho phép link `google.com/maps` / `maps.app.goo.gl` |
| `contact` | heading, phone, WhatsApp, email, mạng xã hội | |
| `video` | heading, caption, **danh sách tối đa 5 link YouTube** (`videos: string[]`, schema v2; v1 lưu một `videoId` và được tự chuyển thành danh sách 1 phần tử) | Chỉ lưu **video ID** (trích từ link `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `youtube.com/embed/`); nhúng `youtube-nocookie.com`, tải khi khách bấm Play (facade). *(v1.2)* |
| `footer` | text, link mạng xã hội | Luôn có, không xóa được |

- Thao tác: thêm, xóa, bật/tắt, sắp xếp (dnd-kit), sửa props.
- **Nội dung hiển thị khi mở website builder (v1.2):** builder luôn nạp **bản nháp đã lưu gần nhất**. Nếu chưa có bản nháp nào nhưng trang **đã publish (đang public)** thì nạp **nội dung đã publish**. Chỉ shop chưa có cả hai mới bắt đầu từ nội dung mẫu của template. Thứ tự ưu tiên: bản nháp đã lưu > bản đã publish > template mẫu. Bản nháp có thay đổi chưa publish không bao giờ bị thay bằng nội dung publish cũ hơn; trang đã public không bao giờ mở ra trống hay bị reset về template. Publish sao chép bản nháp sang bản publish; chỉnh sửa sau đó chỉ là bản nháp và không làm đổi trang đang live. API: `GET /site/page` trả `draft_content` nếu có, nếu không thì `published_content`. Builder hiển thị rõ đang xem "bản nháp đã lưu gần nhất", "website đã publish" hay "template mẫu".
- **Thứ tự section (v1.2):** đổi thứ tự bằng kéo thả (dnd-kit) hoặc nút mũi tên lên/xuống (có bàn phím và thông báo cho trình đọc màn hình). **Hero luôn là section đầu tiên và Footer luôn là section cuối cùng; cả hai bị khóa vị trí** (không kéo, không có mũi tên, không section nào chen lên trước Hero hoặc xuống sau Footer). Quy tắc này được áp dụng ở mọi nơi tạo danh sách section: kéo thả, mũi tên, thêm section, đổi template và nạp bản nháp đã lưu.
- Theme: chọn palette có sẵn + 1 màu primary (hex, kiểm tra contrast tối thiểu 4.5:1 với text), font từ danh sách cho phép (tối đa 6 font, hỗ trợ đủ glyph VI/KO/JA/ZH/ZH-TW hoặc có fallback; thứ tự font CJK dự phòng phải theo ngôn ngữ của trang để chữ Hán dùng đúng dạng chữ vùng miền), logo, favicon.
- **Tùy chỉnh màu (v1.2):** ngoài theme token toàn trang (primary, nền, chữ, nút), mỗi section có thể ghi đè `style` gồm `background`, `text`, `accent` (hex). Chỉ nhận hex hợp lệ; builder cảnh báo khi contrast chữ/nền < 4.5:1 và chặn publish nếu không đạt. Màu render qua CSS variables, không nhận CSS tùy ý.
- **Ảnh (v1.2):** shop upload ảnh theo FR-MEDIA-01 (jpeg/png/webp, tối đa 5 MB) cho logo, favicon, hero, about, gallery, team. Builder tạm dùng bộ upload mock cho tới khi có API (M2).
- **Không** cho nhập HTML, CSS, JS, iframe tùy ý (ngoại lệ duy nhất: section `video`, trong đó hệ thống tự dựng iframe `youtube-nocookie.com` từ video ID đã kiểm tra; cần `frame-src https://www.youtube-nocookie.com` trong CSP của landing page). Text render dạng text thuần (React tự escape). Không dùng `dangerouslySetInnerHTML` với dữ liệu của shop.
- **Ngôn ngữ nhập liệu và hiển thị (v1.2):** mọi màn hình shop nhập hoặc hiển thị nội dung theo ngôn ngữ (builder, form workshop, danh sách, Today…) đều tuân theo cài đặt ngôn ngữ của shop (ngôn ngữ mặc định + các ngôn ngữ đã bật). Thanh chọn ngôn ngữ đặt phía trên khu vực nhập và **chỉ liệt kê ngôn ngữ đã bật**; form chỉ hiển thị ô nhập của **một ngôn ngữ đang chọn**. Lựa chọn được ghi nhớ và dùng chung giữa builder và form workshop. Chỉ ngôn ngữ mặc định là bắt buộc, các ngôn ngữ khác tùy chọn (thiếu thì fallback về ngôn ngữ mặc định). Ngôn ngữ đã tắt không bao giờ được hiển thị hay chỉnh sửa; nội dung đã nhập cho ngôn ngữ đó vẫn được giữ lại. Màn hình dashboard hiển thị nội dung của shop bằng ngôn ngữ giao diện của người dùng nếu shop đã bật ngôn ngữ đó, nếu không thì dùng ngôn ngữ mặc định.
- Mọi field dạng text hiển thị cho khách đều là **localized**: `{ en: "...", vi: "...", ... }`. Builder có tab chọn ngôn ngữ, hiển thị cảnh báo khi ngôn ngữ đã bật còn thiếu bản dịch. Thiếu bản dịch: fallback về ngôn ngữ mặc định của shop.
- Autosave bản nháp (debounce 2 giây) vào `site_pages.draft_content`.
- AC: props sai schema bị backend từ chối (422); bản nháp không ảnh hưởng trang đang live.

**FR-SITE-03 – Preview (Must)**
- Preview desktop/mobile, chọn ngôn ngữ, render bằng **cùng component** với trang public, dùng `draft_content`.
- URL preview chỉ truy cập được khi đã đăng nhập và là member của shop.

**FR-SITE-04 – Publish (Must)**
- **Không có bước duyệt của admin.** Shop bấm **"Publish"** thì landing page public ngay. Với shop chưa public (`DRAFT`), lần Publish đầu tiên chuyển `organizations.status` sang `ACTIVE` ngay trong cùng thao tác (`POST /site/publish`), ghi audit `shop.publish`.
- Điều kiện lần Publish đầu (shop `DRAFT`): có logo hoặc tên shop, hero, thông tin liên hệ, ít nhất 1 workshop ACTIVE có session sắp tới, không có section / màu cần sửa. Màn hình builder và trang tổng quan hiện checklist này; nút Publish bị khóa kèm lý do cho tới khi đủ điều kiện. Shop đã `ACTIVE` chỉ cần không có section / màu cần sửa.
- Shop `SUSPENDED` không publish được (`403 SUSPENDED`).
- Publish là thao tác **atomic**: copy `draft_content` sang `published_content`, ghi một dòng `site_page_versions`, tăng `version`.
- Should: rollback về một version trước đó.

**FR-SITE-07 – Danh sách landing page của shop (Should)**
- `/shopowner/site` là danh sách landing page của shop. Mỗi thẻ có **thumbnail của template đang áp dụng**, tên, trạng thái Published / Not published, template, ngày sửa; hành động Edit, Preview, **Publish**, Delete. Builder mở tại `/shopowner/site/{pageId}`.
- **Tối đa 2 landing page / shop** và **chỉ 1 landing page public tại một thời điểm** (backend phải kiểm tra, không chỉ UI). Đủ 2 page thì nút Create bị khóa kèm thông báo; xóa một page thì tạo lại được.
- Tạo mới chỉ cần nhập **Page Name** (1–60 ký tự). Page mới bắt đầu từ template Classic Story, đổi template trong editor.
- Page đang public được phục vụ ở **địa chỉ của shop** (`{shop-slug}.PLATFORM_DOMAIN`), nên page không có slug riêng.
- Nút **Publish** ngay trên danh sách, không cần vào editor; áp dụng cùng điều kiện như nút Publish trong editor (FR-SITE-04): shop phải `ACTIVE`, checklist đủ, không có section / màu cần sửa. Publish một page khi đã có page khác đang public thì hiện hộp xác nhận: page kia ngừng public (nội dung được giữ). Editor cũng cảnh báo điều này.
- Page main (tạo cùng shop) không xóa được. Xóa page cần xác nhận, xóa cả bản nháp và bản đã publish; xóa page đang public thì shop không còn page public cho tới khi publish page khác.
- MVP frontend: danh sách, nội dung và page đang public lưu trong localStorage; public site chỉ phục vụ dữ liệu mock. Việc phục vụ đúng page đang public chờ backend.

**FR-SITE-05 – Trang public (Must)**
- URL: `{slug}.{PLATFORM_DOMAIN}/` cho ngôn ngữ mặc định của shop; `/{locale}` cho ngôn ngữ khác (ví dụ `/ko`).
- Không tự redirect theo `Accept-Language`; có thể hiển thị banner gợi ý đổi ngôn ngữ. Có language switcher.
- SEO: `<title>`, meta description, Open Graph image (lấy từ hero), `hreflang` cho mỗi ngôn ngữ đã bật, `sitemap.xml` và `robots.txt` theo host, canonical URL.
- Cache: dùng ISR/revalidate theo tag; revalidate khi publish và khi workshop thay đổi. Dữ liệu chỗ còn trống **không cache** (lấy client-side hoặc `no-store`).
- Footer có link "Report this site" (FR-ADM-04) và link Privacy Policy.

### 5.3 Media

**FR-MEDIA-01 – Upload ảnh (Must)**
- Luồng: client gọi `POST /media/presign-upload` (gửi mime, size), nhận presigned PUT URL (hết hạn 5 phút), upload thẳng lên R2, rồi gọi `POST /media/{id}/complete`.
- Chỉ cho phép `image/jpeg`, `image/png`, `image/webp`; tối đa **5 MB**/ảnh. Backend kiểm tra lại size và mime thật (đọc magic bytes) khi complete.
- Object key: `org/{orgId}/{purpose}/{uuid}.{ext}`; purpose ∈ `site`, `workshop`, `branding`.
- Ảnh public phục vụ qua `media.{PLATFORM_DOMAIN}`. Dùng `next/image` (hoặc Cloudflare Image Resizing nếu có) để resize.
- Giới hạn dung lượng ảnh theo shop: giá trị cấu hình chung (chưa có gói trả phí).
- Ảnh không còn được tham chiếu sau 7 ngày: job dọn dẹp (Should).

### 5.4 Workshop, lịch và session

**FR-WS-01 – Workshop (Must)**
- Trường: title (localized), short description (localized), description (localized), duration (phút, 15–600), giá mỗi khách (`price_amount` minor units), currency (lấy theo shop, không sửa riêng), capacity mặc định mỗi session (1–50; giá trị tối đa đặt trong `PLAN_LIMITS`), số khách tối đa mỗi booking (mặc định 6), ảnh cover + tối đa 6 ảnh, những gì đã bao gồm (localized list), ghi chú/yêu cầu (localized), status `DRAFT | ACTIVE | ARCHIVED`, sort order.
- **Địa chỉ tổ chức (`address`) và ghi chú địa chỉ (`address_note`):** màn hình tạo / sửa workshop có khối **Location** gồm **hai phần**: một **textbox "Address"** (một dòng, tối đa 300 ký tự, được trim; **không bắt buộc**) **kèm nút "Google Maps" ngay bên cạnh**: bấm nút thì mở **Google Maps trong tab mới** (`rel="noopener noreferrer"`), tìm đúng địa chỉ đang nhập ở ô Address (link tìm kiếm `https://www.google.com/maps/search/?api=1&query=…`, địa chỉ được mã hóa URL và cắt khoảng trắng thừa; **ghi chú không đưa vào link**); ô Address còn trống thì nút bị vô hiệu (không có gì để mở), và nút không dùng địa chỉ của shop thay thế và một **text area "Note about the address"** (nhiều dòng, tối đa 500 ký tự, được trim, không bắt buộc; ví dụ tầng, lối vào, chỗ gửi xe). **Để trống thì workshop được tổ chức tại địa chỉ của shop** (dòng gợi ý dưới ô nêu địa chỉ shop). Khách luôn thấy địa chỉ áp dụng cho workshop (`workshopAddress`: địa chỉ riêng, hoặc địa chỉ shop) **kèm ghi chú của workshop (nếu có; ghi chú thuộc về workshop nên hiện cùng địa chỉ nào đang áp dụng, và không được dùng để tìm đường)** ở các nơi sau: **thẻ workshop** trên landing page và trên các trang Workshops / Favorites của khách (dòng có icon vị trí), **bước tóm tắt của popup đặt chỗ** (dòng "Where"), **trang xác nhận booking** (khối "Where to find us": địa chỉ của workshop đã đặt và đường đi), **email xác nhận / thông tin booking** (dòng "Where" và dòng "Address note" ở cả sáu ngôn ngữ) và **My Booking** (địa chỉ trên vé và nút Google Maps). Danh sách workshop của shop owner cũng hiện địa chỉ áp dụng dưới tên workshop. **Đường đi:** workshop dùng địa chỉ của shop thì dùng link bản đồ của shop; workshop có địa chỉ riêng thì mở tìm kiếm Google Maps theo địa chỉ đó (`https://www.google.com/maps/search/?api=1&query=…`, thuộc tên miền được phép). Địa chỉ và ghi chú không dịch (là nội dung của shop). Booking không lưu snapshot địa chỉ: workshop chỉ sửa được khi đang Draft nên địa chỉ không đổi khi đã có booking đang chạy.
- **Ngành nghề (category):** màn hình tạo / sửa workshop có phần **Categories bắt buộc**, hiển thị dạng các nút chọn (chip) như lúc customer đăng ký, cho phép **chọn từ 1 đến 3 loại** (chọn đủ 3 thì các loại còn lại bị khóa cho tới khi bỏ chọn bớt; có dòng "n of 3 chosen") để thống kê và để hiển thị workshop theo sở thích của khách: các lĩnh vực của `WORKSHOP_CATEGORIES` (Cooking, Baking & pastry, Coffee & tea, Drinks & cocktails, Pottery & ceramics, Candles & fragrance, Flowers & plants, Painting & drawing, Crafts & DIY, Jewelry & metalwork, Sewing & textiles, Photography & film, Music & dance, Wellness & mindfulness, Other; tên theo ngôn ngữ giao diện). Chưa chọn loại nào thì báo "Choose at least 1 category (up to 3)." và không lưu. Dữ liệu: `workshops.categories` (mảng 1 đến 3 giá trị khác nhau, thay cho `category` đơn). Các workshop được hiển thị theo ngành nghề khách yêu thích ở trang Workshops của customer (FR-CUST, thuật toán bên dưới).
- **Không xóa được workshop** (dù có booking hay chưa; không có nút Delete, không có `DELETE /workshops/{id}`). Muốn gỡ workshop khỏi landing page thì Deactivate ở danh sách. **Không có trạng thái Archived** và không có nút Archive: workshop chỉ có hai trạng thái `DRAFT` (deactivated) và `ACTIVE`.
- Đổi giá: chỉ áp dụng cho booking mới (booking cũ đã lưu snapshot giá).
- **Bộ lọc của danh sách workshop:** ô tìm kiếm theo **tên workshop** (khớp tên ở mọi ngôn ngữ, không phân biệt hoa thường và dấu, bỏ khoảng trắng thừa) và bộ lọc theo **trạng thái** (Tất cả / Draft / Active); hai bộ lọc dùng cùng lúc. Cột Workshop có thêm dòng **ngày tạo** (`created_at`, theo timezone của shop) ngay dưới dòng giá · thời lượng · sức chứa.
- **Cột của danh sách workshop:** Workshop (tên; ngay dưới là giá mỗi khách · thời lượng · sức chứa mặc định; rồi nhãn trạng thái; dưới cùng là **ảnh thumbnail** của workshop, lấy từ ảnh cover; không còn cột Status riêng), **Active sessions** (số session của workshop chưa Closed, kèm tổng số session của workshop), Promotions you can apply, Maximum discount, Actions. Lý do nút Deactivate / Edit chỉ đọc được **viết ngay dưới nút** (không chỉ là tooltip).
- **Danh sách workshop:** mỗi dòng có nút **Activate / Deactivate** và nút **Edit**. Workshop mới tạo luôn ở trạng thái Nháp (`DRAFT`, "deactivated"); Activate chuyển sang `ACTIVE` (hiện trên landing page, cho đặt chỗ), luôn cho phép với workshop Nháp. **Deactivate chỉ cho phép khi mọi session của workshop đều ở trạng thái Closed** (kể cả session tự đóng khi hết giờ và session admin đã đóng); còn session chưa đóng thì nút chỉ đọc kèm tooltip ghi số session còn lại, và backend từ chối `409 SESSIONS_OPEN`. Workshop chưa có session thì Deactivate được. **Chỉ workshop đã deactivate (Nháp) mới Edit được**; workshop đang Active thì nút Edit chỉ đọc kèm tooltip và trang sửa chỉ hiện thông báo. Trạng thái không còn đổi trong form sửa (chỉ hiển thị). API: `POST /workshops/{id}/status` `{status: ACTIVE | DRAFT}` (OWNER / MANAGER, ghi audit).
- **Thêm workshop** là popup trên trang danh sách (không còn trang riêng; địa chỉ cũ `/workshops/new` chuyển về danh sách); không có mục Hiển thị, lưu xong luôn là Nháp.
- **Sửa workshop cũng là popup** trên trang danh sách (nút Edit hoặc bấm tên workshop; tab Details và tab Schedule); không còn trang riêng, địa chỉ cũ `/workshops/{id}` chuyển về danh sách. Workshop đang Active mở popup chỉ thấy thông báo thay cho form Details (tab Schedule vẫn dùng được).

**FR-SCHED-01 – Schedule rule (Must)**
- Một workshop có nhiều rule. Rule gồm: các thứ trong tuần (`weekdays` 0–6), danh sách giờ bắt đầu (`HH:mm`, theo timezone của shop), `effective_from`, `effective_to` (tùy chọn), capacity override (tùy chọn), status.
- Job `generate-sessions` chạy hằng ngày lúc 02:00 (timezone của shop) và ngay khi rule được tạo/sửa: sinh session cho **60 ngày** tới. Phải **idempotent** (unique `(organization_id, workshop_id, starts_at)`).
- Sửa hoặc xóa rule: **không** sửa/xóa session đã có booking. Session tương lai chưa có booking thì xóa và sinh lại.

**FR-SCHED-02 – Session thủ công (Must)**
- Shop có thể thêm session lẻ (ngày giờ cụ thể) và sửa capacity của session (không được nhỏ hơn `reserved_count`).
- **Trạng thái session và vòng đời** (trang `/shopowner/{slug}/sessions`): `OPEN` (Open), `PAUSED` (Paused), `RUNNING` (Running), `CLOSED` (Closed), `COMPLETED` (Completed: session đã diễn ra và kết thúc, shop owner xác nhận hoàn thành; **trạng thái cuối**, không còn thao tác Start / Pause / Close / Edit / Re-schedule / Re-open, admin hệ thống cũng không đóng hay mở lại được). **Session mới tạo luôn ở `OPEN`** (đã tạo, chưa chạy, chưa nhận booking) và **chỉ có thể Start**. Nút **Start** chuyển `OPEN` sang `RUNNING` (chỉ session `RUNNING` khách mới đặt được và mới được tính là session sắp tới). **Một khi đã `RUNNING` thì chỉ có thể Pause** (không chuyển thẳng sang trạng thái nào khác). Nút **Pause** chuyển `RUNNING` sang `PAUSED` (ngừng nhận booking mới). Từ `PAUSED` có thể **Start lại** (về `RUNNING`) hoặc **Close** (sang `CLOSED`, kết thúc, không thể mở lại). `CLOSED` là trạng thái cuối, **trừ session do shop owner đóng khi chưa tới giờ bắt đầu: có nút "Re-open" đưa session về `OPEN`** (xóa lý do đóng; không áp dụng cho session đã bắt đầu hoặc do hệ thống tự đóng vì hết giờ). **Hệ thống không có chức năng hủy (cancel) session.** **Không tạo session trong quá khứ:** khi thêm hoặc clone session, ngày giờ bắt đầu phải **sau thời điểm hiện tại** (theo timezone của shop): ô ngày chặn các ngày đã qua (`min` = hôm nay), nếu ngày hôm nay mà giờ đã qua thì báo lỗi "The start cannot be in the past…"; backend cũng từ chối. Khi sửa (Edit) ngày giờ không đổi được, và Re-schedule cũng chỉ nhận ngày giờ trong tương lai. **Sửa session:** nút **Edit** (thay cho "Edit capacity"; **chỉ có ở session `OPEN` và `PAUSED`**: session `RUNNING` không hiển thị nút Edit, muốn sửa phải Pause trước; session `CLOSED` cũng không có) mở popup sửa session với các thông tin như lúc tạo (workshop, sức chứa, cut-off, ảnh) **trừ ngày giờ tổ chức** (hiển thị chỉ đọc; chỉ Re-schedule mới đổi được ngày giờ). Sức chứa không nhỏ hơn số chỗ đã đặt; **workshop không đổi được khi session đã có booking** (đổi workshop thì thời lượng theo workshop mới, giờ bắt đầu giữ nguyên). **Thêm / Edit / Clone session được phép trùng giờ bắt đầu với session khác (kể cả cùng workshop)**; riêng Re-schedule vẫn không cho chuyển sang đúng giờ bắt đầu của session khác cùng workshop. Nút Save chỉ bật khi có thay đổi (BR-17). **Mã booking của khách** có dạng `<mã session>-<3 số>` (ví dụ `SES-0003-042`): ba số là số thứ tự booking của session đó (001, 002…), nên mã cho biết khách đặt session nào; áp dụng cho cả booking online và booking thủ công (walk-in / phone). Trang xác nhận `/booking/{mã}` nhận mã dạng này kèm email. **Check-in theo session:** mọi thẻ session có nút **Check-in** (icon) mở popup danh sách các booking của session (mã booking, tên khách, số khách, trạng thái); mỗi dòng có nút **Check-in** (booking `CONFIRMED`, hoặc `LATE_RELEASED` nếu còn chỗ) hoặc **Uncheck-in** (booking `CHECKED_IN`: hoàn tác check-in nhầm, về `CONFIRMED`, không đổi số chỗ); các trạng thái khác chỉ hiển thị, không có nút. Popup hiển thị "X of Y guests checked in". Cột **Checked in at** ghi **ngày giờ check-in** (theo timezone của shop, `checked_in_at`; Uncheck-in xóa giờ này; dùng để theo dõi). **Session đã `CLOSED` vẫn xem được danh sách check-in nhưng chỉ đọc** (không có nút Check-in / Uncheck-in): mỗi booking hiển thị đúng trạng thái cuối cùng trước khi session đóng (ví dụ booking chưa check-in của session đã hết giờ là `SESSION_EXPIRED`), kèm giờ check-in nếu có. Booking **bị khách hủy** hiển thị trạng thái **"Canceled booking"**, **không có nút** Check-in / Uncheck-in, và cột **Reason** hiển thị lý do hủy (chức năng khách tự hủy booking sẽ phát triển sau; hiện lý do lấy từ `cancel_reason` của booking); booking hủy không tính vào số khách "Y". **Số chỗ của session tính từ các booking đang giữ chỗ** (`CONFIRMED`, `CHECKED_IN`, `COMPLETED`), nên khi một booking bị hủy số chỗ đã đặt giảm ngay (ví dụ 8 xuống 7 nếu khách hủy 1 chỗ), cả trong trang Sessions lẫn trên landing page. Dùng chung luật máy trạng thái booking (thêm hành động `UNDO_CHECK_IN`: `CHECKED_IN` → `CONFIRMED`). **Mã session:** mỗi session có một mã do hệ thống sinh khi tạo (`SES-0001`, `SES-0002`… tăng dần theo từng shop, không đổi) để shop owner quản lý; mã hiển thị ngay dưới tên workshop trên thẻ session. **Ảnh đại diện:** khi tạo (hoặc clone) session có thể upload **1 ảnh** (JPEG / PNG / WebP, cùng quy tắc ảnh khác, `POST /api/v1/media/sessions`, hoặc dán link https); khách thấy ảnh cạnh giờ của session trong form đặt chỗ trên landing page (và thẻ session cũng có ảnh nhỏ). **Clone:** mọi thẻ session (kể cả `CLOSED`) có nút **Clone** mở popup tạo session mới sao chép workshop (cố định), sức chứa, cut-off và ảnh từ session gốc; bắt buộc chọn ngày giờ mới; session mới ở trạng thái `OPEN`, có mã mới, và thẻ hiển thị ghi chú "Cloned from <mã session gốc> - <tên workshop>" (`cloned_from_session_id`). **Mỗi session được re-schedule tối đa 3 lần; shop owner bấm Close tối đa 4 lần, 3 lần đầu có thể Re-open, lần thứ 4 đóng hoàn toàn session (không còn Re-open, popup Close cảnh báo trước)** (tính theo số ghi chú lịch sử, không tính ghi chú của admin hệ thống): đủ giới hạn thì nút Re-schedule / Close vẫn hiển thị nhưng chỉ đọc (vô hiệu) kèm tooltip giải thích; backend từ chối lần vượt giới hạn. **Admin hệ thống (/systemadmin/organizations/{id}, mục Sessions) có thể Close (bắt buộc nhập lý do) và Open bất kỳ session nào chưa kết thúc, không giới hạn số lần**, kể cả session đã đóng hoàn toàn; session đã hết giờ vẫn tự động Closed. Thao tác của admin ghi vào lịch sử ghi chú kèm "(by system administrator)" và không tính vào giới hạn của shop owner (TODO(api): chỉ SUPER_ADMIN, ghi audit log). **Email cho khách:** khi session chuyển sang Closed (shop owner đóng, admin hệ thống đóng, hoặc hệ thống tự đóng khi hết giờ) hoặc khi session được re-schedule, hệ thống gửi email cho toàn bộ khách đã booking session đó (mọi trạng thái booking), **ngoại trừ khách đã tự cancel booking trước đó**; mỗi session tự đóng chỉ gửi một lần. Popup Edit session không có trường ngày và giờ (đổi giờ dùng Re-schedule). Danh sách check-in gộp họ tên khách, mã booking và số lượng khách vào một cột. **Re-schedule session (session `OPEN` và `PAUSED`; popup Re-schedule không có lý do "The workshop has been completed", backend từ chối lý do này):** nút "Re-schedule session" (icon lịch) mở popup chọn **ngày và giờ bắt đầu mới** (theo timezone của shop; thời lượng session giữ nguyên) và **lý do** giống popup Close (danh sách lý do cơ bản hoặc Other bắt buộc nhập text). Ngày giờ mới phải khác ngày giờ hiện tại, ở tương lai và không trùng giờ bắt đầu của session khác cùng workshop. Các booking `CONFIRMED` của session được chuyển sang giờ mới (session giữ trạng thái `PAUSED`); **mỗi khách có email trong danh sách booking nhận một email thông báo** (tạo outbox event cùng transaction với thay đổi, worker gửi theo ngôn ngữ ưa thích của khách, kèm giờ cũ, giờ mới, lý do và mã booking; khách walk-in không có email thì bỏ qua). Popup cho biết số booking sẽ nhận email; sau khi đổi lịch trang hiển thị số khách đã gửi email, và thẻ session ghi "Re-scheduled because: …". MVP frontend: email chỉ được ghi vào outbox mock (`POST /api/v1/sessions/{id}/reschedule`, xem `GET /api/v1/outbox`), chưa gửi email thật. **Lịch sử ghi chú (tracking):** mỗi lần shop owner **Close**, **Re-schedule** hoặc **Re-open** session, hệ thống **thêm một ghi chú mới** (`session_notes`: loại, thời điểm, lý do) và **không bao giờ xóa các ghi chú cũ** (kể cả khi Re-open); thẻ session liệt kê tất cả theo thứ tự thời gian (ví dụ "Nov 1, 2026 - Closed because: Not enough guests", "Nov 2, 2026 - Re-opened", "Nov 3, 2026 - Closed because: Schedule changed"). Số lần Re-schedule và Close được đếm từ các ghi chú này. **Mỗi dòng ghi chú có cả ngày và giờ** (ví dụ "Nov 3, 2026, 2:06 PM - Closed because: …"); **ghi chú tự đóng do hết giờ** ("Automatically closed because the session time has ended.", giờ = lúc session kết thúc) cũng là một dòng của lịch sử này, không tách riêng và không tính vào 3 lần Close của shop owner. **Các ghi chú Closed và Re-schedule trên thẻ session luôn bắt đầu bằng ngày**, ví dụ "Nov 12, 2026 - Closed because: Not enough guests", "Nov 12, 2026 - Re-scheduled because: Schedule changed" (ngày shop owner thực hiện, theo timezone của shop; lưu `closed_at`, `rescheduled_at`); ghi chú tự đóng dùng ngày session kết thúc: "Nov 12, 2026 - Automatically closed because the session time has ended.". **Close trước giờ bắt đầu cần lý do:** nút Close có màu cảnh báo (đỏ, cùng kiểu với nút Cancel đã bỏ) và mở popup chọn lý do: Not enough guests, Instructor is not available, Studio or venue problem, Schedule changed, **The workshop has been completed (chỉ chọn được khi session đang diễn ra, để kết thúc sớm; không cần giải thích thêm; email gửi khách nói buổi workshop đã hoàn thành và cảm ơn khách, thay vì "session sẽ không diễn ra")** hoặc **Other**; chọn Other thì **bắt buộc nhập text giải thích** (tối đa 300 ký tự, trim). Lý do được lưu vào session (`close_reason`, `close_reason_note`) và hiển thị trên thẻ session ("Closed because: …"). Mọi nút trên trang đều có icon. **Close theo thời gian:** trước giờ bắt đầu, shop owner Close (từ `PAUSED`) với lý do cơ bản hoặc Other; **trong lúc session đang diễn ra (đã bắt đầu, chưa kết thúc), Close được nhưng chỉ với lý do "The workshop has been completed" (kết thúc buổi sớm; popup chỉ có lý do này, đã chọn sẵn, kèm câu giải thích)**; lý do này **không** chọn được trước giờ bắt đầu và các lý do khác không chọn được trong lúc diễn ra. Backend kiểm tra lại theo thời gian của session và từ chối lý do không hợp. Khi hết giờ hệ thống tự đóng. Một lần Close lúc đang diễn ra cũng tính vào giới hạn 4 lần Close. **Tự động đóng:** session đã hết thời gian tổ chức (`ends_at` đã qua) mà chưa `CLOSED` được hệ thống tự chuyển sang `CLOSED` (từ bất kỳ trạng thái nào: Open, Running, Paused), thẻ session ghi chú "Automatically closed because the session time has ended."; session do shop owner tự Close thì không có ghi chú này (backend: job định kỳ đóng session quá hạn và đặt cờ `auto_closed`; frontend tính theo giờ hiện tại). Các nút không hợp lệ được **ẩn**; backend kiểm tra lại mọi chuyển trạng thái.
- **Completed áp dụng cho mọi session `CLOSED`, kể cả session shop owner đóng trước giờ (chưa từng diễn ra); Completed và Re-open loại trừ nhau.** **Mọi session `CLOSED`** (tự động đóng do hết giờ, shop owner hoặc admin đóng, kể cả đóng trước giờ) **không còn nút Check-in** (không check-in được sau khi đóng); thẻ session có ba nút **riêng biệt**: **View booking** (popup danh sách booking chỉ đọc, gồm cả booking đã hủy), **Confirm payment** và **Completed** (màu xanh lá). **Confirm payment** mở popup danh sách thanh toán, chỉ để xác nhận thanh toán, không đổi trạng thái session. **Completed** mở **cùng danh sách thanh toán đó** nhưng nút ở cuối popup là **Completed** (submit); bấm thì hiện popup xác nhận: "Session Completed: session, các booking và thanh toán của nó **không thể thay đổi nữa**; thông tin thanh toán sẽ được dùng để thống kê và xác nhận tổng số tiền phải thanh toán cho chi phí hệ thống". Xác nhận thì **session chuyển sang `COMPLETED`** (không về lại được). **Session `COMPLETED` chỉ hiển thị một nút: Completed** (không còn View booking; nút Completed lúc này chỉ mở danh sách thanh toán ở chế độ chỉ đọc; không còn Clone hay thao tác nào khác) và backend từ chối ghi thêm thanh toán cho booking của session này. Popup thanh toán liệt kê booking **chia ba phần: Checked in, Not checked in và Cancelled (booking đã hủy vẫn được liệt kê nhưng **không có Confirm payment / Unpaid, không có ô chọn** và không tính vào "X of Y bookings paid"; backend từ chối ghi thanh toán cho booking đã hủy)**; mỗi dòng có mã booking, khách, số khách, số tiền, badge Payment status và một nút: **Confirm payment** khi booking `UNPAID` (bấm thì booking chuyển sang `PAID`, ghi một payment entry tiền mặt cho phần còn thiếu, **gửi email biên nhận cho khách và đổi luôn trạng thái booking sang `CHECKED_IN`** nếu đang `NOT_CONFIRMED` hoặc `CONFIRMED` — lưu trạng thái trước đó và giờ check-in; booking `CANCELLED` giữ nguyên trạng thái; booking đã `CHECKED_IN` giữ nguyên; bấm **Unpaid** trên booking đang `CHECKED_IN` thì booking **quay về trạng thái trước khi check-in** (ví dụ Not confirmed → Paid → Checked in → Unpaid → Not confirmed; xóa giờ check-in), **kể cả booking do shop owner check-in tay** (không ghi nhận trạng thái trước đó thì về Confirmed)) hoặc **Unpaid** khi booking đã `PAID` (bấm để sửa nhầm, đưa booking về `UNPAID`, ghi một refund entry; các entry không bao giờ bị sửa hay xóa; không gửi email). Sau khi bấm Confirm payment, popup báo "đã gửi email" hoặc "khách không có email nên chưa gửi" hoặc lỗi gửi. **Email biên nhận** (`booking.paid`, đủ 6 ngôn ngữ như mọi email gửi khách) có mã booking, workshop, ngày giờ, số khách và số tiền đã thanh toán; số tiền do server tính từ booking, không nhận từ trình duyệt. Booking có tổng tiền 0 không có gì để thanh toán nên không có nút. Popup hiển thị "X of Y bookings paid". **Mọi thao tác trong hai popup (Confirm payment, Unpaid, Select all / Confirm payment (N)) chỉ là bản nháp**: booking hiển thị Paid / Unpaid kèm nhãn "Not saved yet" nhưng **chưa lưu thanh toán, chưa đổi trạng thái booking sang Checked in và chưa gửi email** cho đến khi shop owner bấm **Submit** (popup Confirm payment: nút Cancel và Submit, Submit chỉ bật khi có thay đổi) hoặc **Completed** (popup Complete session: sau popup xác nhận, bản nháp được áp dụng rồi session mới chuyển sang `COMPLETED`). Đóng popup (Cancel, X, Esc) thì bỏ bản nháp. Khi submit, mọi thay đổi được lưu một lần (payment / refund entry, đổi sang `CHECKED_IN` với booking vừa `PAID`) và màn hình báo "N payments saved. Emails sent: …. Without email: …. Failed: …". **Xác nhận hàng loạt theo từng phần** (popup Confirm payment và popup Complete session): mỗi dòng booking `UNPAID` có ô chọn; tiêu đề của từng phần (Checked in, Not checked in, Cancelled) có **Select all** (chọn / bỏ chọn mọi booking còn `UNPAID` của phần đó; trạng thái chọn một phần hiển thị dạng indeterminate) và nút **Confirm payment (N)** chỉ áp dụng cho các booking đã chọn của phần đó (vô hiệu khi chưa chọn). Mỗi booking được xác nhận như bấm Confirm payment ở từng dòng (ghi payment entry và gửi email biên nhận) và kết quả tóm tắt hiện dưới tiêu đề phần ("N bookings confirmed. Emails sent: …. Without email: …. Failed: …"). Booking đã `PAID` hoặc tổng tiền 0 không có ô chọn; session `COMPLETED` (chỉ đọc) không có ô chọn. MVP frontend: trạng thái session và thanh toán lưu ở state của màn hình (chưa lưu server); email được ghi vào outbox mock (`POST /api/v1/bookings/{id}/paid`). TODO(api): endpoint ghi payment entry và outbox event trong cùng transaction, kiểm tra quyền và `organization_id`, ghi audit log; endpoint chuyển session sang `COMPLETED` (chỉ từ `CLOSED`, không đổi được sau đó; số liệu thanh toán dùng cho thống kê và phí hệ thống).
- **Bộ lọc theo trạng thái** trên trang Sessions: Open, Paused, Running, Closed (thêm vào bộ lọc workshop và khoảng ngày), kèm chú thích các quy tắc trên. Trên landing page khách chỉ thấy session `RUNNING` (đặt được) và `CLOSED` (hiển thị mờ, không chọn được); session `OPEN` và `PAUSED` không hiển thị.
- MVP frontend: trạng thái session thay đổi ở màn hình Sessions chỉ lưu trong phiên làm việc (chưa lưu vào backend mock), nên chưa ảnh hưởng tới landing page.

**FR-SCHED-03 – Hủy session (đã bỏ)**
- Hệ thống **không có chức năng hủy session**: không có nút, hộp thoại hay API hủy; không có trạng thái `CANCELLED` cho session. Session không dùng nữa thì Pause rồi Close.

### 5.5 Booking (phía khách)

**FR-BOOK-01 – Xem lịch còn chỗ (Must)**
- `GET /public/sites/{slug}/workshops/{id}/availability?from=&to=` trả về các session `RUNNING`, `starts_at` > now + `booking_cutoff_minutes` **của chính session đó** (mặc định 120 phút, cấu hình khi tạo session), kèm `remaining = capacity - reserved_count`.
- Hiển thị giờ theo **timezone của shop**, ghi rõ tên timezone (ví dụ "Times shown in Asia/Ho_Chi_Minh"). Session hết chỗ hiển thị "Sold out".

**FR-BOOK-02 – Đặt chỗ instant (Must)**
- Booking modal gồm 5 bước: (1) **ngày và giờ** (gộp trong một bước) → (2) số khách (kèm khuyến mãi và bill) → (3) thông tin liên hệ → (4) xác nhận (hiển thị lại **bill chi tiết** như bước 2: tạm tính, từng khuyến mãi, tổng) → (5) **xác minh email bằng OTP**.
- **Bước 1:** chọn workshop; liệt kê **toàn bộ ngày có session** của workshop đó. Ngày mà mọi session đều không chọn được (đã qua, đã đóng, trong cutoff hoặc hết chỗ) hiển thị mờ, ghi "Not available" và **không chọn được**. Chọn ngày xong, **giờ của ngày đó hiện ngay bên dưới**; giờ đã bắt đầu / đã qua, trong cutoff, đã đóng hoặc hết chỗ vẫn hiển thị nhưng **không chọn được** (ghi lý do: Already started, Booking closed, Closed, Sold out).
- **Booking cut-off theo từng session:** cut-off **không còn là cấu hình của shop trong Settings** mà được đặt **cho từng session khi tạo session mới** (form Add session, trường "Booking cut-off (minutes before start)", số nguyên 0 đến 10080, mặc định 120; 0 = đóng đặt chỗ đúng giờ bắt đầu; mỗi session lưu `booking_cutoff_minutes`). Session có `starts_at` ≤ now + cut-off của chính nó hiển thị "Booking closed" và không chọn được; mỗi giờ trong danh sách ghi "Online booking closes N minutes before a session starts." theo cut-off của session đó, và thẻ session trong trang Sessions của shop owner cũng ghi cut-off. Vì khách có thể mở form lâu, **khi nhập đúng OTP hệ thống kiểm tra lại cut-off** của session (backend thật cũng kiểm tra khi tạo booking): nếu đã quá cut-off thì quay về bước 1, hiển thị thông báo và không tạo booking. Màn hình Settings không còn trường này. MVP frontend: cut-off chỉ đặt lúc tạo session (chưa có màn hình sửa).
- **Lưu ý trên nút Next:** ở các bước có nút Next (1 đến 3), ngay phía trên nút hiển thị câu lưu ý: khách phải chọn đúng workshop và điền đúng số lượng người; shop không chịu trách nhiệm khi thông tin booking hoặc số người sai lệch.
- **Bước 5 (OTP):** bấm Confirm booking thì hệ thống gửi mã **6 chữ số** tới email khách; khách nhập mã để hoàn tất (booking chỉ được tạo sau khi mã đúng). Sai tối đa **5 lần** (sau đó phải xác nhận lại để nhận mã mới); nút gửi lại mã có đếm ngược 30 giây. MVP frontend giả lập: chưa gửi email, mã demo `123456` hiển thị trong môi trường dev; backend thật gửi qua outbox + worker, chỉ lưu hash mã kèm hạn dùng, giới hạn số lần gửi và thử theo email và IP.
- Field: họ tên (bắt buộc), email (bắt buộc), quốc gia (bắt buộc, chọn từ danh sách ISO), phone/WhatsApp (**bắt buộc**), special request (tùy chọn, tối đa 500 ký tự), checkbox đồng ý chính sách (bao gồm chính sách đến trễ), Turnstile token.
- Request có header `Idempotency-Key` (UUID do client sinh khi mở form).
- Backend:
  1. Xác minh Turnstile.
  2. Resolve tenant từ slug; kiểm tra shop `ACTIVE`, workshop `ACTIVE`, session `RUNNING`, chưa qua cutoff.
  3. Kiểm tra quantity ≤ max mỗi booking.
  4. **Tính giá ở backend**: `total = price_amount × quantity`. Bỏ qua mọi giá client gửi.
  5. Transaction chống overbooking (Mục 7.1).
  6. Tìm customer theo `(organization_id, email_normalized)`: có rồi thì booking ghi vào customer đó (khách có tài khoản thì vào tài khoản), chưa có thì tạo customer không tài khoản; **không ghi đè** thông tin customer. **Mỗi booking lưu riêng họ tên khách nhập lúc đặt** (`guest_name`): email xác nhận, danh sách check-in và danh sách booking hiển thị tên của booking.
  7. Tạo booking **`NOT_CONFIRMED`** (chưa xác nhận), `payment_status = UNPAID`, `booking_code` (**`<mã session>-<3 số>`**, ví dụ `SES-0003-042`: 3 số đếm các booking của session đó theo thứ tự 001, 002…, tăng bên trong transaction giữ chỗ nên unique trong shop), snapshot giá.
  8. Ghi outbox event `booking.created`: **email cho người đặt, kèm thông tin booking và link xác nhận booking** (link chứa token bí mật; token lưu dạng hash, có hạn dùng) + email thông báo cho shop. Khách bấm link thì booking chuyển `CONFIRMED` (mở lại link: không đổi gì; booking đã hủy: báo không xác nhận được). Booking chiếm chỗ ngay từ lúc tạo, kể cả khi chưa xác nhận.
- Cùng `Idempotency-Key` gửi lại: trả về đúng booking đã tạo (HTTP 200), không tạo booking mới.
- Lỗi hết chỗ: HTTP 409, code `SESSION_FULL`, UI yêu cầu chọn giờ khác.
- AC: 2 khách tranh chỗ cuối cùng thì chỉ 1 người thành công (có test concurrency).

- **Nút Book trong trang xem trước của builder** (`/shopowner/{slug}/site/preview`): mở đúng popup đặt chỗ như khách thấy (cùng workshop, session, khuyến mãi); khi gửi chỉ hiện thông báo "Preview … No booking was made" và **không tạo booking** hay chuyển trang.

**FR-BOOK-03 – Trang xác nhận (Must)**
- Sau khi đặt: hiển thị booking code, workshop, ngày giờ (timezone của shop), số khách, tổng tiền ("Pay at the studio"), địa chỉ + link bản đồ, chính sách đến trễ, thông tin liên hệ shop.
- **Khách tự hủy booking** ngay trên trang này (trang tra cứu bằng **mã booking + email của booking**, cùng quy tắc không lộ thông tin: sai mã hay sai email đều trả lời giống nhau): nút **Cancel booking** mở popup xác nhận ("không hoàn tác được") và ô **lý do tùy chọn** (tối đa 300 ký tự). **Chỉ hủy được khi booking `NOT_CONFIRMED` hoặc `CONFIRMED`, session chưa bắt đầu và chưa đóng** (đã Checked in, session đã bắt đầu hoặc đã đóng thì không có nút; backend trả 409 `NOT_CANCELLABLE`). Hủy xong chỗ được nhả ngay, trang hiện "This booking has been cancelled" (hủy bởi khách, kèm lý do nếu có), `cancelled_by = GUEST`. **Hai bên đều nhận email**: khách nhận email xác nhận đã hủy (6 ngôn ngữ), shop nhận email thông báo (kèm tên, email, điện thoại khách, lý do). Booking đã hủy bởi shop hiển thị "The studio cancelled this booking" kèm lý do của shop.
- Khi không hủy được: "To change or cancel, please contact the studio."; khi hủy được thì hướng dẫn chỉ còn "To change the booking, please contact the studio." (đổi booking vẫn qua shop).
- MVP frontend: `POST /api/v1/public/sites/{slug}/bookings/cancel` (200 `{code, status}`; 404 `NOT_FOUND`; 409 `NOT_CANCELLABLE`). TODO(api): giới hạn tần suất, audit log, ghi trạng thái và hai email vào outbox trong cùng một transaction.

**FR-BOOK-05 – Tài khoản khách và gộp booking theo email (Should)**
- Khi khách **chưa đăng nhập** đặt chỗ, server tra email (trim + lowercase): đã có customer với email đó thì booking được ghi vào customer đó (khách có tài khoản thì vào tài khoản); chưa có thì tạo customer không tài khoản (BR-10). Server chấp nhận email có khoảng trắng hai đầu (trim).
- Khi khách **đăng ký tài khoản mới** (popup đăng nhập của landing page: email, mã xác nhận, rồi nếu email chưa có tài khoản thì bước **tạo tài khoản**: họ tên, quốc gia, ngày sinh; cả ba bắt buộc, ngày sinh không ở tương lai; **khách chọn đúng 3 ngành nghề workshop yêu thích** (trong `WORKSHOP_CATEGORIES`, 3 ngành khác nhau, bắt buộc; ô thứ tư bị khóa cho đến khi bỏ bớt một ô; server từ chối nếu không đúng 3, lưu vào `account.favoriteCategories`; sau này dùng để gợi ý và lọc workshop); **kèm ô đồng ý bắt buộc: khách đồng ý để shop lưu quốc gia và ngày sinh nhằm hiểu khách hàng và lên kế hoạch ưu đãi, có thể yêu cầu xóa; server từ chối khi thiếu đồng ý và lưu thời điểm đồng ý `consent_at`**), server tra email đã từng booking chưa: có thì **gộp mọi booking trước đó vào tài khoản mới** (customer cũ được gắn tài khoản và lấy tên đã đăng ký; bảng Customers của shop owner hiển thị quốc gia, ngày sinh... của tài khoản), không thì tạo customer mới có tài khoản. Màn hình cuối của popup báo "N earlier bookings made with this email were added to your account" (hoặc không có booking nào). Email đã có tài khoản thì chỉ đăng nhập.
- MVP frontend: `POST /api/v1/public/sites/{slug}/accounts/lookup` (đã đăng ký chưa, số booking) và `POST /api/v1/public/sites/{slug}/accounts` (tạo tài khoản, trả `merged`; 409 `ALREADY_REGISTERED`); bản xem thử trong builder chỉ đăng nhập. TODO(api): chỉ nhận email đã xác minh phía server, giới hạn tần suất, tạo tài khoản và gộp booking trong cùng một transaction, mọi truy vấn lọc theo `organization_id`.

**FR-BOOK-04 – Yêu thích workshop (Should)**
- Mỗi thẻ workshop trên landing page (mọi template và kiểu hiển thị, kể cả dạng danh sách rút gọn) có **icon trái tim "Add to favorites"** (nút bật / tắt, `aria-pressed`, có tên truy cập "Add {tên} to favorites" / "Remove {tên} from favorites"; trái tim đặc khi đã yêu thích).
- **Khách phải đăng nhập trước khi bấm lưu:** khi chưa đăng nhập, bấm trái tim mở popup đăng nhập (nhập email, rồi nhập mã xác nhận gửi về email đó; email được trim và đổi chữ thường, sai định dạng thì báo lỗi, nhập sai mã tối đa 5 lần); đăng nhập thành công thì popup đóng và **workshop vừa bấm được lưu luôn**. Hủy popup thì không lưu gì. Khi đã đăng nhập, bấm trái tim lưu hoặc bỏ lưu ngay, không hiện popup.
- Danh sách yêu thích thuộc về từng khách (theo email) và từng shop; shop owner không dịch nội dung này (tên workshop là nội dung động của shop). Mọi text tĩnh có đủ 5 ngôn ngữ (BR-18).
- MVP frontend: phiên khách và danh sách yêu thích lưu trong `localStorage` của trình duyệt (`lib/favorites.ts`), mã xác nhận demo dùng chung với form đặt chỗ; bản xem thử trong builder dùng cùng cơ chế. TODO(api): phiên khách là cookie, danh sách yêu thích là bảng riêng khóa theo khách + `organization_id` + workshop, mọi truy vấn lọc theo `organization_id` từ ngữ cảnh server.

**FR-BOOK-06 – Khu vực của khách `/customer/{account_id}` (Should)**
- Đường dẫn `/customer/{account_id}/...` (`account_id` là id của khách, ví dụ `cu-1`) là khu vực riêng của khách đã có tài khoản, với năm menu theo thứ tự: **My Profile** (`/profile`), **Today** (`/today`), **My Booking** (`/bookings`), **Favorites** (`/favorites`), **Workshops** (`/workshops`). `/customer/{account_id}` chuyển tới **Today**, và sau khi **đăng nhập** customer vào thẳng `/customer/{account_id}/today`; shop owner sau khi đăng nhập vào thẳng **Overview** (`/shopowner/{slug}`). Trang chạy trên host quản lý (`app.{PLATFORM_DOMAIN}`), có chọn ngôn ngữ giao diện (cùng cookie `ui_locale`), tên và ảnh khách, nút Log out; thanh trên **không hiển thị tên / logo shop** (khu vực này thuộc nền tảng, không thuộc riêng shop nào); nút **Log out** nằm ở **menu** (dưới các mục menu, trên khối "Need help?") và ở **trang My Profile** (cạnh nút Save); Log out quên phiên đăng nhập của trình duyệt và chuyển về landing page của shop. **Tối ưu cho điện thoại (mobile-first, đa số khách dùng mobile):** dưới 768px menu được **gom vào nút 3 sọc** ở góc trái thanh trên và mở thành ngăn kéo (drawer) từ bên trái, gồm ảnh + tên khách, các mục menu (vùng chạm cao 44px), Log out và khối "Need help?"; chọn một mục, bấm nền mờ hoặc Esc thì đóng; thanh trên hiện tên trang đang mở, đổi ngôn ngữ và ảnh khách; không có cuộn ngang ở bất kỳ trang nào (kiểm tra ở 390px); bộ lọc của My Booking gọn lại (From / To cạnh nhau). Từ 768px trở lên menu là cột bên trái như cũ. trang không được lập chỉ mục (`noindex`).
- **Giai đoạn chạy thử (hiện tại): không có form đăng nhập.** Trang mở thẳng bằng địa chỉ `/customer/{account_id}` và API trả lời chỉ theo id (id không tồn tại hoặc khách không có tài khoản vẫn là 404); không có nút Log out. Có một công tắc duy nhất (`lib/customer-access.ts`): đặt `CUSTOMER_LOGIN_REQUIRED=true` để bật lại đăng nhập; **ở môi trường production đăng nhập luôn bắt buộc**, bất kể biến này. Quy tắc dưới đây áp dụng khi đăng nhập được bật.
- **Ai được vào:** chỉ khách **đã đăng nhập đúng email của tài khoản đó** (cùng popup đăng nhập email + mã xác nhận của landing page). Chưa đăng nhập: hiện form đăng nhập. Id không tồn tại, khách không có tài khoản, hoặc email đăng nhập là của người khác: **cùng một câu trả lời** ("We could not open this account", nút đăng nhập bằng email khác), không lộ id có tồn tại hay không. Dữ liệu tài khoản chỉ được tải sau khi đăng nhập, không nằm trong HTML trả về lúc đầu.
- **My Profile:** xem và sửa họ tên (bắt buộc, tối đa 120), số điện thoại (tối đa 40), ngôn ngữ, quốc gia (bắt buộc), ngày sinh (bắt buộc, không ở tương lai), **ba ngành nghề yêu thích (bắt buộc, đúng 3)**, giới tính, thông tin mạng xã hội (10 nền tảng, mỗi ô tối đa 100) và liên kết ảnh đại diện (https, tối đa 500); **email chỉ đọc, không đổi được**. Mọi text được trim (BR-16); nút Save chỉ bật khi có thay đổi (BR-17); các ô để trống bị xóa khỏi hồ sơ (hồ sơ được thay thế toàn bộ); sự đồng ý khi đăng ký (`consentAt`) được giữ. Các booking cũ giữ tên khách đã nhập lúc đặt; shop owner thấy hồ sơ mới ở danh sách customer.
- **Workshops:** liệt kê workshop của **tất cả các shop được platform admin chọn** (cờ `showOnCustomerPage` của shop; chỉ shop `ACTIVE` mới hiện; chức năng cấu hình cờ này sẽ làm sau trong site admin, hiện là dữ liệu của mock) trong **một danh sách chung, không chia theo từng shop và không có liên kết "Visit the site"**. **Thứ tự hiển thị (thuật toán `rankWorkshops`, `packages/shared/src/workshop-ranking.ts`), làm riêng cho từng khách theo Favorite categories (3 loại khách đã chọn lúc đăng ký):** (1) **theo độ phù hợp**: workshop có nhiều categories trùng với favorite categories của khách nhất đứng đầu (3, rồi 2, rồi 1), workshop không trùng loại nào đứng cuối; (2) **trong mỗi nhóm các shop thay phiên nhau**: một workshop của shop thứ nhất, một của shop thứ hai… hết vòng thì sang vòng sau, nên shop có nhiều workshop không chiếm các vị trí đầu; (3) **shop đứng đầu, thứ tự các shop và workshop nào của mỗi shop được xếp trước đều LUÂN PHIÊN theo một hạt giống (seed) = số ngày + mã hóa của id khách**: đổi mỗi ngày và khác nhau giữa các khách, **không cố định theo ngày tạo** hay tên, để mọi shop đều có lúc đứng đầu (công bằng giữa các shop). Seed lấy một lần cho mỗi lượt xem nên trang không xáo trộn khi khách tìm kiếm hay thả tim; tìm kiếm chỉ lọc, không đổi thứ tự. Trang Favorites và tab Program của Affiliate giữ thứ tự theo từng shop. Mỗi thẻ có popup đặt chỗ và danh sách yêu thích của shop mình (thẻ của các shop khác nhau có thể đứng xen kẽ). Khách chưa có favorite categories thì mọi workshop cùng một nhóm và vẫn được chia đều cho các shop. Mỗi workshop là thẻ **đúng giao diện của landing page** của shop đó (theme riêng của shop; ảnh, tên, mô tả ngắn, thời lượng, giá, trái tim yêu thích, nút **Book** và **popup đặt chỗ** đặt tại shop đó, **nút Google Maps ngay cạnh nút Book** (cùng nút với ô Address của form workshop và với vé của My Booking: mở Google Maps trong tab mới tại địa chỉ của workshop; dùng link bản đồ của shop khi workshop dùng địa chỉ shop, tìm kiếm theo địa chỉ khi workshop có địa chỉ riêng), theo khuyến mãi đang chạy và số chỗ còn lại), kèm **ngay dưới tên workshop: dòng "Shop: <tên shop>" và số sao rating**. **Rating:** năm ngôi sao tô theo điểm trung bình từ 1 đến 5 (4,5 tô bốn sao rưỡi), kèm điểm và số lượt đánh giá trong ngoặc; workshop chưa có đánh giá hiện "No ratings yet"; có nhãn truy cập đọc được ("Rated 4.8 out of 5, 126 ratings"). **Tìm kiếm:** ô "Search workshops" lọc ngay khi gõ theo **tên workshop** (khớp tên ở mọi ngôn ngữ shop đã viết) **hoặc tên shop**, không phân biệt hoa thường và dấu; dưới ô có số workshop tìm thấy, không có kết quả thì hiện "No workshop matches “…”.". Mỗi shop có popup đặt chỗ và danh sách yêu thích riêng (thuộc từng shop, dùng chung cho các thẻ của shop); khách đang ở trong tài khoản nên trái tim không hỏi đăng nhập lại. **Popup đặt chỗ trong trang này lấy sẵn thông tin tài khoản của khách:** Họ tên, Email, Quốc gia và Số điện thoại (đã nhập lúc đăng ký / chỉnh ở My Profile); **Họ tên và Email chỉ đọc** (kèm dòng "From your account."), **Quốc gia và Số điện thoại sửa lại được** cho riêng lần đặt này (không đổi hồ sơ); các ô còn lại (yêu cầu đặc biệt, đồng ý) để trống. Chưa shop nào được chọn thì hiện "No workshops to show yet.". MVP frontend: `listedShops()` (`lib/mock/customer-listing.ts`) gom dữ liệu từ `getPublicSite`; mock có ba shop để xem giao diện: shop mẫu `whiskladle` (booking thật) cùng `brewbean` (Brew & Bean Coffee Lab, VND) và `greentable` (Green Table Vegan Kitchen, USD, múi giờ Singapore), mỗi shop 3 workshop `ACTIVE` + 1 nháp (mỗi workshop có category; rating là dữ liệu mock) và các session đủ tình huống (còn chỗ, hết chỗ, Paused, Open, Closed) trong `lib/mock/other-shops.ts`, tách khỏi dữ liệu của shop mẫu. **Với hai shop sau, popup đặt chỗ chạy đủ các bước nhưng không tạo booking** (mock chỉ giữ booking của shop mẫu; trang ghi chú các shop demo). TODO(api): danh sách workshop của nhiều shop, mỗi shop lọc theo `organization_id`, mọi shop đặt chỗ thật; rating tính từ các đánh giá thật.
- **Favorites:** **cùng giao diện trang Workshops** (thẻ workshop theo theme của shop, dòng "Shop: <tên shop>", rating, nút Book và popup đặt chỗ, ô tìm kiếm theo tên workshop hoặc shop) nhưng **chỉ hiện các workshop khách đã thả tim** (danh sách yêu thích của tài khoản này ở từng shop; chỉ shop được platform admin chọn mới hiện). Bỏ tim thì thẻ biến mất ngay; chưa có workshop yêu thích thì hiện "No favorite workshops yet. Tap the heart on a workshop to save it here.".
- **My Booking:** dựa trên trang Bookings của shop owner nhưng theo logic của khách:
  - **Dữ liệu:** chỉ các booking của chính khách (`GET /api/v1/customer/{id}/bookings`, cùng quy tắc truy cập và cùng câu trả lời 404 như hồ sơ; không có thanh toán nội bộ hay id của người khác; kèm giờ của server để tính "hôm nay", "còn N ngày").
  - **Tab và con số:** bốn ô **All / Upcoming / Past / Cancelled** vừa là con số vừa là bộ lọc (bấm để chỉ xem nhóm đó; con số đếm theo tìm kiếm và bộ lọc đang chọn). Booking đang diễn ra vẫn thuộc Upcoming; booking đã hủy luôn thuộc Cancelled.
  - **Tìm kiếm và lọc:** ô tìm theo mã booking, tên workshop (mọi ngôn ngữ shop đã viết) hoặc tên shop (không phân biệt hoa thường và dấu); lọc theo workshop và khoảng ngày (theo múi giờ của booking). Phân trang như các danh sách khác (10 / 20 / 50).
  - **Thứ tự:** booking sắp tới trước, gần nhất lên đầu và có nhãn **Next up**; sau đó booking đã qua / đã hủy, mới nhất trước.
  - **Mỗi booking có ba nút: Check in, Completed và Cancel** (booking chưa dùng được nút nào thì nút bị khóa và dòng chữ dưới nút nói lý do).
  - **Rate this workshop (đánh giá workshop):** nút **Rate this workshop** (trước đây tên "Completed", đổi để không nhầm với trạng thái `COMPLETED` của session) có trên **mọi** booking nhưng **chỉ đọc (khóa)** kèm dòng chú thích "Bạn đánh giá được workshop này sau khi đã check-in và session đã kết thúc" cho tới khi khách **đã check-in** booking (`CHECKED_IN`) **và session của booking đã kết thúc** (`ends_at` đã qua). Khi đủ hai điều kiện và chưa đánh giá, nút **bật** (nền xanh lam) và mở popup **Đánh giá workshop**: chọn **1 đến 5 sao** (bắt buộc, chọn được bằng bàn phím) và **nhận xét tùy chọn** (≤ 500 ký tự, `trim()` theo BR-16). Mỗi booking **chỉ đánh giá một lần và khách không sửa được**; sau khi gửi, nút lại chỉ đọc và hiện số sao khách đã chấm ("Bạn đã đánh giá 4/5"), có thông báo cảm ơn. Server kiểm tra lại: `POST /customer/{id}/bookings/{code}/rating` `{stars, comment?}` → `201`; `409 NOT_CHECKED_IN`, `409 NOT_ENDED`, `409 ALREADY_RATED`; `404` cho booking không phải của khách (cùng câu trả lời); `422` kèm `fields` khi sao không hợp lệ hoặc nhận xét quá dài. Booking trả về thêm `canRate` và `rating`. **Điểm của workshop** = trung bình của điểm shop đã có (kèm số lượt) cộng các sao khách chấm **chưa bị gỡ**, làm tròn 1 chữ số thập phân; hiển thị ở landing page, trang Workshops / Favorites của khách, mục Workshops của Home và khu admin.
  - **Nhận xét của khách (quyết định D7):** **shop owner xem** các đánh giá và nhận xét của workshop của mình ở trang **Ratings** (`/shopowner/{slug}/ratings`, chỉ đọc, `GET /ratings` -> `{items, average, count}`, không có đánh giá đã bị gỡ). **Admin xem** tất cả ở `/systemadmin/ratings` (FR-ADM-27) và **gỡ** được đánh giá vi phạm (bắt buộc lý do, đưa lại được). Nhận xét **chưa** hiển thị công khai trên landing page. Audit `booking.rate` (mã booking và số sao, **không ghi nhận xét**). TODO(api): bảng `workshop_ratings` (booking_id unique, `removed_at`, `removed_reason`), thông báo cho khách khi nhận xét bị gỡ.
  - **Màu nút:** khi bấm được, **Check in nền xanh lá** và **Cancel booking nền đỏ**; khi không bấm được, nút xám (khóa).
  - **Dữ liệu mẫu:** mỗi khi server khởi động, **mọi customer có tài khoản** đều có sẵn booking để thử hai nút: một booking check-in được ngay (session đang diễn ra hoặc bắt đầu trong vòng 1 giờ), một Confirmed và một Not confirmed còn hủy được, một booking đã tham dự và một booking khách đã hủy (kèm lý do cơ bản). Các booking này không thanh toán nên không đổi số liệu thu nhập, và không session nào vượt sức chứa.
  - **Check in (khách tự check-in):** bật khi booking **`CONFIRMED`** (đã mở link trong email xác nhận), **từ 60 phút trước giờ bắt đầu đến khi session kết thúc**, và session chưa đóng (server quyết định, `canCheckIn`; cũng kiểm tra lại khi bấm). Bấm xong booking thành `CHECKED_IN` (lưu giờ check-in và trạng thái trước đó là `CONFIRMED`, nên shop vẫn Uncheck-in được), danh sách cập nhật ngay và báo "You are checked in for booking …". Khóa kèm lý do: đã check-in, chưa tới giờ ("Check-in opens at <giờ>, an hour before…"), booking `NOT_CONFIRMED` ("Open the link in your confirmation email…"), workshop đã kết thúc, session đã đóng. Booking đã hủy thì nút khóa. Shop vẫn có thể check-in khách ở studio. API: `POST /customer/{id}/bookings/{code}/check-in` (404 nếu booking không phải của khách, 409 `NOT_CHECKABLE`).
  - **Hủy:** nút **Cancel booking** (cùng popup; **popup liệt kê các lý do cơ bản dạng lựa chọn: kế hoạch thay đổi, trùng lịch, tìm được workshop khác, không khỏe / việc đột xuất, đặt nhầm, và Other; chỉ khi chọn Other mới hiện ô text để điền lý do** (tối đa 300 ký tự); không chọn lý do nào cũng hủy được; lý do được gửi dạng văn bản theo ngôn ngữ của khách; cùng API `POST /public/sites/{slug}/bookings/cancel` như trang xác nhận; gửi email cho khách và shop) chỉ dùng được khi server cho phép hủy (còn lại nút bị khóa): booking `NOT_CONFIRMED` / `CONFIRMED`, session chưa đóng, chưa bắt đầu. Không hủy được thì ghi lý do ("the workshop has started", "a booking that is checked in cannot be cancelled", "session closed: contact the studio"). Hủy xong danh sách cập nhật ngay và báo "Booking … was cancelled." Booking đã hủy ghi ai hủy (khách hay shop) và lý do.
  - **Giao diện:** mỗi booking là một **thẻ kiểu vé**: ảnh workshop kèm ô ngày và chip "Today / Tomorrow / In N days / Happening now / Finished", trạng thái booking và thanh toán ("Pay at the studio" / "Paid"), giờ theo múi giờ của booking, số khách, ghi chú của khách, nút **Google Maps** giống nút ở ô Address của form workshop (booking sắp tới; mở Google Maps trong tab mới tại địa chỉ của workshop), và phần cuống vé có mã booking, tổng tiền và khuyến mãi đã dùng; banner đầu trang có "Next up". Chưa có booking nào thì hiện lời mời và nút "Browse workshops".
- **Today** (`/customer/{account_id}/today`, thiết kế ưu tiên điện thoại): trang tổng quan "hôm nay" của khách, dùng lại dữ liệu của các trang khác (không có API mới):
  - **Lời chào + ngày:** "Chào buổi sáng / chiều / tối, {tên}" (sáng đến 11:59, chiều đến 17:59, tối sau đó) và một câu tóm tắt: số workshop hôm nay, hoặc workshop sắp tới gần nhất, hoặc gợi ý tìm workshop khi 7 ngày tới trống.
  - **Workshop hôm nay:** theo ngày của múi giờ từng booking, không tính booking đã hủy, sớm nhất trước. Mỗi thẻ có giờ bắt đầu – kết thúc, nhãn (Đang diễn ra / Hôm nay / Finished), trạng thái booking, tên workshop, shop, số khách, địa chỉ, nút **Check in** (cùng quy tắc như My Booking: bật từ 1 giờ trước giờ bắt đầu cho tới khi kết thúc, kèm lý do khi tắt), nút Google Maps; đã check-in thì hiện giờ check-in; workshop đã kết thúc không hiện nút. Không có workshop hôm nay thì hiện lời nhắn và nút "Browse workshops".
  - **Cần bạn xử lý:** booking còn hiệu lực chưa xác nhận (mở liên kết trong email) hoặc đã xác nhận nhưng chưa thanh toán và số tiền > 0; khối chỉ hiện khi có.
  - **Sắp diễn ra trong tuần:** booking của 7 ngày tới (sau hôm nay), kèm "Tomorrow / In N days", giờ và shop; liên kết "See all bookings".
  - **Bốn số liệu** (chạm để tới trang tương ứng): booking sắp tới, workshop đã tham dự, số dư có thể rút của Affiliate và của Referrals.
  - **Danh mục yêu thích** (kèm nút Explore workshops) và **Mời bạn bè** (số bạn đã mời, thưởng đã nhận, nút tới Referrals).
  - Text i18n đủ 5 ngôn ngữ. Các hàm chọn dữ liệu là hàm thuần trong `apps/web/src/lib/customer-today.ts` (có test).
- MVP frontend: `GET` và `PATCH /api/v1/customer/{id}` nhận email của tài khoản trong header `x-guest-email` (sai email, id lạ hoặc khách không có tài khoản đều trả 404 như nhau; kiểm tra email trước khi kiểm tra dữ liệu). TODO(api): phiên khách là cookie do server kiểm tra, không gửi email từ trình duyệt; `organization_id` lấy từ server (tài khoản khách hiện thuộc từng shop, chưa có marketplace); bật liên kết tới khu vực này từ landing page.
- *Triển khai thật (13/11/2026, `apps/api`, tiền tố `/api/v1/customer/{id}`; `{id}` phải là tài khoản trong session, khác thì `404`):* **Hồ sơ:** `GET` và `PATCH /customer/{id}` (thay toàn bộ; `422` với `fields`: `fullName` `required | tooLong`, `country` `invalid`, `birthDate` `invalid | future`, `favoriteCategories` `count | invalid` (đúng 3 loại, khác nhau), `preferredLocale`, `gender`, `socials.*` `tooLong`, `avatarUrl` `invalid` (https)); họ tên và ngôn ngữ nằm trên tài khoản, phần còn lại ở `customer_profiles`; audit `customer.profile_update` **không ghi nội dung** (dữ liệu cá nhân). **Booking:** `GET /customer/{id}/bookings` trả các booking đặt bằng **email của tài khoản** ở mọi shop (khớp email không phân biệt hoa thường; chỉ an toàn khi email của tài khoản đã được xác minh, nên bật `REQUIRE_EMAIL_VERIFICATION` ở production), mỗi booking kèm `id`, `code`, `shop`, `workshop`, `session`, `status`, tiền, `discounts`, `canCheckIn` và `canCancel` (`{allowed, reason?, opensAt?}`), `canRate`, `rating`, cùng `now`; **không** có thanh toán nội bộ. **Booking được nhận diện bằng `id`** (mã booking chỉ duy nhất trong từng shop) nên check-in và đánh giá dùng `{bookingId}` thay cho `{code}` của bản mock. `POST /customer/{id}/bookings/{bookingId}/check-in`: booking `CONFIRMED`, từ 60 phút trước giờ bắt đầu đến khi session kết thúc, session chưa đóng; `409 NOT_CHECKABLE` kèm `details.reason` (`ALREADY_CHECKED_IN | CANCELLED | NOT_CONFIRMED | SESSION_CLOSED | ENDED | TOO_EARLY` và `opensAt`); lưu trạng thái trước đó nên shop vẫn Uncheck-in được; audit `booking.check_in`. Hủy dùng lại `POST /public/sites/{slug}/bookings/cancel`. `POST /customer/{id}/bookings/{bookingId}/rating` `{stars, comment?}` → `201`; `409 NOT_CHECKED_IN | NOT_ENDED | ALREADY_RATED`, `422` với `fields.stars = starsInvalid` hoặc `fields.comment = tooLong` (tối đa 500, trim); mỗi booking một lần, khách không sửa được; audit `booking.rate` (mã booking và số sao, **không ghi nhận xét**). **Workshops và Favorites:** `GET /customer/{id}/workshops?q=` (workshop `ACTIVE` của shop `ACTIVE` mà admin đã chọn, cờ `organizations.show_on_customer_page`; xếp bằng `rankWorkshops` với seed = số ngày + mã hóa của id khách; tìm theo tên workshop ở mọi ngôn ngữ hoặc tên shop, không phân biệt hoa thường và dấu; mỗi thẻ kèm `shop`, `rating {average, count}`, `favorite`), `GET /customer/{id}/favorites`, `PUT` và `DELETE /customer/{id}/favorites/{workshopId}` (`204`; lặp lại như một lần; workshop không active hoặc của shop không active: `404`). `POST /admin/organizations/{id}/visibility` `{showOnCustomerPage}` để admin chọn shop (audit `organization.visibility`). **Điểm rating** của workshop = trung bình các sao chưa bị gỡ, 1 chữ số thập phân (`GET /public/sites/{slug}` trả `rating` cho từng workshop). Shop owner xem `GET /ratings` (`{items, average, count}`, chỉ đọc, không có rating đã gỡ; shop khác không thấy). **Chưa làm:** số chỗ còn lại và khuyến mãi trên thẻ workshop của customer (lấy từ API của shop), thông báo cho khách khi nhận xét bị gỡ, đẩy hồ sơ mới vào danh sách customer của shop.

### 5.6 Vận hành booking (dashboard shop)

**FR-OPS-01 – Danh sách booking (Must)**
- **Khu vực tổng hợp theo Booking Status** (cùng kiểu các ô số liệu của màn hình Today) nằm giữa bộ lọc và bảng: một ô **All bookings** và một ô cho từng trạng thái (Not confirmed, Confirmed, Checked in, Cancelled), mỗi ô có **số booking** (chữ lớn) và **số khách** của các booking đó. Số liệu tính trên các booking thỏa bộ lọc **ngày, workshop, session và ô tìm kiếm**, nên các trạng thái luôn cộng lại bằng ô All bookings. **Mỗi ô là một nút bấm được (`aria-pressed`): bấm vào ô của một trạng thái thì bảng chỉ liệt kê các booking có trạng thái đó** (ô đang chọn được tô nổi; bấm lại ô đó, hoặc bấm ô All bookings, để xem tất cả). **Không còn bộ lọc Status dạng thả xuống**: trạng thái được lọc bằng chính các ô tổng hợp. **Cùng khu vực đó có thêm số liệu theo Payment status (Paid / Unpaid): mỗi ô có số booking, số khách và tổng số tiền; bấm vào ô thì lọc bảng theo Payment status (đồng bộ với bộ lọc Payment), và hai hàng số liệu lọc chéo nhau** (số theo booking status tính trên booking thỏa Payment đang chọn, số theo Payment tính trên booking thỏa booking status đang chọn). Các ô nhỏ gọn, mỗi ô có thanh màu theo trạng thái.
- **Cột Action (giữa cột Guest và Session) của danh sách booking:** mỗi dòng có **Check in / Undo check-in** và **Cancel booking** theo máy trạng thái (booking `NOT_CONFIRMED` / `CONFIRMED`: Check in và Cancel; `CHECKED_IN`: Undo check-in; `CANCELLED`: không có nút). Check-in và Undo check-in bị vô hiệu khi session đã đóng; Cancel hỏi lý do (bắt buộc) và gửi email cho khách như ở chi tiết booking (FR-OPS-06). Làm xong, trạng thái trên dòng, các ô tổng hợp và biểu đồ đổi ngay và thay đổi được server lưu.
- **Cột Khuyến mãi và tooltip ở cột Total của danh sách booking:** thêm cột **Promotion** (mã các khuyến mãi đã áp dụng cho booking, "—" nếu không dùng) đứng trước cột Total. Rê chuột hoặc focus bàn phím vào số tiền ở cột **Total** hiện tooltip: giá gốc của booking (đơn giá × số khách), từng khuyến mãi kèm số tiền đã giảm (mỗi khuyến mãi tính trên giá gốc) và tổng tiền sau giảm giá; booking không dùng khuyến mãi ghi "No promotion". Cùng thành phần tooltip với cột Amount của trang Income & expenses.
- Xem theo **khoảng ngày Từ (From) và Đến (To)** (mặc định từ 30 ngày trước đến 30 ngày sau hôm nay, theo timezone của shop; có nút chọn nhanh 3 tháng, 6 tháng, 1 năm gần nhất và All dates; bộ lọc Session chỉ liệt kê session trong khoảng), theo **Payment status** (bộ lọc thả xuống: tất cả / Paid / Unpaid; áp dụng cho cả danh sách lẫn các ô tổng hợp), theo **workshop** (bộ lọc thả xuống thay cho bộ lọc Status; chọn workshop thì danh sách session của bộ lọc Session chỉ còn các session của workshop đó), theo session; theo trạng thái bằng cách bấm vào các ô tổng hợp ở trên; tìm theo booking code, tên, email.
- **Biểu đồ tình hình booking theo thời gian** (nhỏ gọn, nằm giữa các ô tổng hợp và bảng): thống kê **theo khoảng From - To đang chọn** và đổi theo khoảng đó, cùng bộ lọc workshop / session / ô tìm kiếm như các ô số liệu (nên tổng của biểu đồ bằng số booking ở các ô tổng hợp). Cột chồng theo ngày của session: **khoảng ≤ 31 ngày vẽ theo ngày, ≤ 20 tuần (tuần bắt đầu thứ Hai) vẽ theo tuần, dài hơn vẽ theo tháng** (tối đa 36 tháng); có nút đổi cách xem **Booking status** (Checked in, Upcoming, Cancelled) hoặc **Payment status** (Paid, Unpaid), các số tổng dạng chip (booking, khách, checked in / tỷ lệ thanh toán, tỷ lệ hủy / unpaid), chú giải có số và tooltip trên từng cột. Biểu đồ không chịu bộ lọc Payment và các ô booking status (chính nó chia theo hai cách đó).
- View "Today": danh sách session hôm nay, mỗi session hiển thị danh sách khách để check-in nhanh (tối ưu cho tablet/mobile).
  - **Màn hình Today chỉ check-in / undo check-in cho khách: không có Cancel booking và không có nút ghi thanh toán** (hủy booking làm ở chi tiết booking, thanh toán xác nhận ở màn hình Sessions). Số liệu đầu trang: Sessions, Guests expected, Arrived, **Not confirmed** (số booking chưa xác nhận qua email) và **Paid** (số booking đã thanh toán / tổng số booking chưa hủy). Mỗi booking hiển thị trạng thái booking, Payment status (Paid / Unpaid) và **Total**; booking `NOT_CONFIRMED` ghi chú đang chờ khách xác nhận qua email. Session đã Closed / Completed không có nút Add walk-in và không có nút check-in (chỉ xem).

**FR-OPS-02 – Tạo booking thủ công (Must)**
- Shop tạo booking cho khách walk-in, điện thoại hoặc WhatsApp. `source ∈ ONLINE | WALK_IN | PHONE | OTHER`.
- Cùng logic chống overbooking. **Booking do shop tạo là `CONFIRMED` ngay** (shop đã xác nhận với khách tại chỗ), `payment_status = UNPAID`, giá do server tính (không khuyến mãi). Họ tên bắt buộc; email không bắt buộc với `WALK_IN` (khi đó không gửi email), bắt buộc với `PHONE` và `OTHER`.
- **Khách có email thì nhận email thông tin (đủ 6 ngôn ngữ, không có link xác nhận vì không cần xác nhận)**: mã booking, workshop, ngày giờ, số khách, tổng tiền trả tại studio. Customer tìm theo email như booking online (không ghi đè); booking lưu riêng tên đã nhập.
- Cho phép tạo cho session đã bắt đầu (walk-in) nếu session còn `RUNNING`, chưa hết giờ và còn chỗ; danh sách session của form không liệt kê session đã hết giờ.
- MVP frontend: `POST /api/v1/bookings` (201 `{id, code, emailed}`; 409 `SESSION_FULL` / `SESSION_CLOSED`; 422); trước đây form chỉ mô phỏng và không lưu. TODO(api): kiểm tra chỗ trong một bước khóa, ghi booking và outbox trong cùng transaction, audit log.

**FR-OPS-03 – Check-in (Must)**
- Shop owner bấm **Check-in**: `NOT_CONFIRMED | CONFIRMED → CHECKED_IN` (khách chưa bấm link xác nhận vẫn check-in được). Ghi `checked_in_at`, `checked_in_by` và **trạng thái trước khi check-in** (`status_before_check_in`).
- **Uncheck-in** hoàn tác check-in: `CHECKED_IN →` **đúng trạng thái trước đó** (`NOT_CONFIRMED` hoặc `CONFIRMED`), xóa `checked_in_at`; không đổi số chỗ. Nếu khách bấm link xác nhận trong lúc booking đang `CHECKED_IN`, trạng thái trước đó trở thành `CONFIRMED`.
- Session đã `CLOSED`: danh sách check-in chỉ đọc (không check-in, không uncheck-in). Màn hình check-in (Sessions) hiển thị trạng thái `Not confirmed / Confirmed / Checked in / Cancelled` và có ghi chú quy tắc này.
- Check-in (màn hình Today và Sessions, khi session chưa đóng) và thanh toán (popup Confirm payment ở Sessions, sau khi session đóng) là hai thao tác ở hai nơi, **nhưng đặt một booking `NOT_CONFIRMED` / `CONFIRMED` sang Paid sẽ đổi luôn booking sang `CHECKED_IN`**, và đặt lại Unpaid thì booking về trạng thái trước check-in (xem FR-PAY-01). Vì vậy với session đã đóng, trạng thái tham dự do shop owner xác nhận qua thanh toán.
- Các trạng thái và thao tác **Completed, Late released, No-show, Session expired** (hoàn tất, late release, no-show, tự hết hạn khi session kết thúc) **không còn**; khách đã đặt mà không đến chỉ ở nguyên trạng thái (`CONFIRMED` hoặc `NOT_CONFIRMED`).

**FR-OPS-06 – Hủy booking (Must)**
- Shop hủy: bắt buộc nhập lý do; `NOT_CONFIRMED | CONFIRMED → CANCELLED` (`cancelled_by = SHOP`); giảm `reserved_count`; **gửi email cho khách (nếu có email) kèm lý do của shop** (chỉ gửi một lần, không gửi lại khi hủy lần nữa); ghi audit. Khách cũng tự hủy được (FR-BOOK-03); booking do khách hủy hiển thị "Cancelled by the guest" kèm lý do trong chi tiết booking và danh sách check-in.

**FR-OPS-07 – Đổi session (Should)**
- Chuyển booking `NOT_CONFIRMED | CONFIRMED` sang session khác cùng workshop: transaction lock **cả hai** session (lock theo thứ tự `id` tăng dần để tránh deadlock), kiểm tra chỗ ở session mới, cập nhật `reserved_count` hai bên. Giữ nguyên snapshot giá. Gửi email cập nhật.

**FR-OPS-08 – (đã bỏ)** Không còn bước "hoàn tất" (`COMPLETED`): booking đã check-in giữ nguyên trạng thái `CHECKED_IN`.

**FR-PAY-01 – Ghi nhận thanh toán tại shop (Must)**
- **Thanh toán chỉ được ghi bằng Confirm payment / Unpaid ở popup của session đã đóng** (không còn màn hình nhập thủ công số tiền, phương thức hay hoàn tiền ở chi tiết booking): Confirm payment ghi một payment entry **tiền mặt** cho phần còn thiếu; Unpaid ghi một refund entry. Mỗi entry có amount, method (`CASH | CARD | BANK_TRANSFER | E_WALLET | OTHER`, hiện luôn `CASH`), type (`PAYMENT | REFUND`), note, `recorded_by`, `recorded_at`. Chi tiết booking chỉ xem danh sách entry.
- `bookings.payment_status` **chỉ có 2 giá trị: `UNPAID` (Unpaid) và `PAID` (Paid)**; mọi booking mới đều mặc định `UNPAID`. Trạng thái được **tính lại** từ tổng các payment entry trong cùng transaction: `PAID` khi số đã thu ròng (payment trừ refund) > 0 và ≥ tổng tiền của booking, còn lại là `UNPAID` (chưa thu, mới thu một phần, hoặc đã hoàn lại). Số tiền thu từng phần và hoàn tiền vẫn nằm trong các payment entry và trang Income & expenses, không có trạng thái riêng.
- Không sửa/xóa payment entry; ghi nhầm thì tạo **entry điều chỉnh giảm (reversal)** (shop bấm Unpaid). **Hệ thống không có chức năng hoàn tiền cho khách**: tiền khách trả tại shop do shop xử lý ngoài hệ thống; chỉ còn khoản điều chỉnh để sổ sách đúng. Trên giao diện khoản này gọi là **Reversal / Điều chỉnh giảm** (không còn chữ "refund"). Ghi audit.

**FR-PAY-02 – Thu nhập và lợi nhuận của shop (Could)**
- Menu `/shopowner/finance` "Income & expenses". **Chỉ thu thập và tính toán các booking có Payment status là `PAID`** (mọi payment và refund của các booking đó); booking `UNPAID` (chưa thu, mới thu một phần, hoặc đã thu rồi hoàn lại) không có mặt trong bảng và các số liệu (kể cả thẻ summary Income ở trang Overview); khi shop xác nhận thanh toán (Confirm payment ở màn hình Sessions) booking vào số liệu, khi bấm Unpaid thì ra khỏi số liệu. Backend mock lưu các payment entry do shop xác nhận (`PATCH /api/v1/bookings/{id}/payment`, số tiền do server tính từ booking). **Lợi nhuận = Tổng thu − Phí duy trì hệ thống − Phí dịch vụ.** Tổng thu = các payment entry của booking trừ refund entry (tự động, chỉ đọc; không còn khoản thu chi nhập tay). **Phí duy trì hệ thống và phí dịch vụ đều là một tỷ lệ % tính trên GIÁ GỐC của booking (đơn giá × số khách, trước khi áp dụng khuyến mãi), không tính trên số tiền khách trả sau khuyến mãi**: với từng payment / refund, cơ sở tính phí = số tiền × giá gốc ÷ giá sau khuyến mãi (nghĩa là cùng phần của giá gốc); booking không có khuyến mãi thì cơ sở chính là số tiền; booking không biết giá gốc hoặc giá sau khuyến mãi bằng 0 thì tính trên chính số tiền. Tổng thu vẫn là số tiền thực thu, nên khuyến mãi làm giảm thu nhập của shop chứ không làm giảm phí (lợi nhuận của một booking có thể âm khi khuyến mãi lớn). Refund trả lại phần phí tương ứng. Làm tròn từng khoản về minor unit.
- **Admin hệ thống cấu hình hai tỷ lệ cho TỪNG shop** tại `/systemadmin/organizations/{id}` (khung "Fees for this shop"; mỗi shop có tỷ lệ riêng, shop chưa cấu hình dùng mặc định; lưu `organization_fee_settings` dạng basis points, 1% = 100): mỗi tỷ lệ từ 0% đến 100%, tối đa 2 chữ số thập phân, hai tỷ lệ cộng lại không quá 100%. Nút Save chỉ bật khi có thay đổi (BR-17). Mặc định (mock): 10% duy trì, 10% dịch vụ. API: `GET/PUT /admin/organizations/{id}/finance-settings` (chỉ SUPER_ADMIN, ghi audit log).- Màn hình shop owner: công thức và tỷ lệ đang áp dụng; 4 thẻ Tổng thu, Phí duy trì, Phí dịch vụ, Lợi nhuận (hoặc Lỗ) theo **khoảng thời gian do shop owner chọn (Từ ngày - Đến ngày, tối đa 365 ngày mỗi lần, tính cả hai đầu; mặc định 180 ngày gần nhất; ngày tính theo timezone của shop)**; **biểu đồ cột thu - phí kèm đường lợi nhuận (theo ngày nếu khoảng ≤ 31 ngày, theo tháng nếu dài hơn)** (có bảng số liệu thay thế); tỷ trọng hai loại phí; bảng các khoản thanh toán / hoàn tiền kèm **cột Promotions applied (mã các khuyến mãi booking đã dùng tại thời điểm thanh toán)**, và **tooltip ở cột Amount** (rê chuột hoặc focus bàn phím vào số tiền): giá gốc của booking (đơn giá × số khách, trước khuyến mãi), từng khuyến mãi kèm số tiền đã giảm (mỗi khuyến mãi tính trên giá gốc, như lúc đặt), tổng tiền của booking sau giảm giá và, với khoản hoàn tiền hoặc thanh toán một phần, số tiền của riêng dòng đó, phí và lợi nhuận của từng khoản, lọc theo loại. Thẻ Income & expenses của trang Overview hiển thị thu, phí, lợi nhuận của tháng này. Biểu đồ vẽ bằng SVG, không thêm thư viện.
- MVP frontend: tỷ lệ phí lưu trong bộ nhớ của mock backend (mất khi khởi động lại server); backend cần bảng `organization_fee_settings` và tính tổng hợp ở server, lọc theo `organization_id`.

*Triển khai thật (12/11/2026, `apps/api`, tiền tố `/api/v1`):* `GET /finance/income?from=&to=&kind=PAYMENT|REVERSAL&limit=&cursor=` (shop của session; khoảng ngày theo múi giờ shop, mặc định 180 ngày gần nhất, tối đa 365 ngày; `422` với `fields.from|to` = `required | invalid | beforeFrom | tooLong`). Trả `rates`, `totals` (`income`, `maintenanceFee`, `serviceFee`, `fees`, `profit`), `series` (theo ngày nếu khoảng ≤ 31 ngày, theo tháng nếu dài hơn), `feeShares`, bảng khoản thanh toán có phân trang (mỗi dòng: `amount`, `originalPrice`, `promotions`, `maintenanceFee`, `serviceFee`, `profit`) và `nextCursor`. Quy tắc tính phí dùng đúng hàm của `packages/shared/src/finance.ts` (web và backend không thể lệch nhau): **chỉ booking `PAID`**, phí tính trên **giá gốc** (`snapshot.subtotalAmount`, hoặc đơn giá × số khách), tổng thu là số tiền thực thu; reversal ra số âm. **Giả định cần xác nhận:** tỷ lệ mặc định 10% / 10% / 10% / 10% (duy trì / dịch vụ / affiliate / referral bonus) chỉ là giá trị để chạy thử, tỷ lệ thật là quyết định kinh doanh; **mỗi khoản thanh toán dùng tỷ lệ có hiệu lực lúc nó được ghi** (D24): đổi tỷ lệ chỉ áp dụng cho khoản thanh toán sau đó, các khoản đã tính giữ nguyên tỷ lệ, kể cả trong tháng đang mở; khoản đảo ngược (Unpaid) dùng tỷ lệ của khoản thanh toán nó đảo. Trường `rates` của màn hình là tỷ lệ **hiện tại** (áp dụng cho khoản thanh toán từ bây giờ). Affiliate fee và Referral bonus do **nền tảng** chi trả (không trừ vào lợi nhuận của shop) và chỉ hiện ở màn hình của admin, xem FR-ADM-16 và FR-CUST-02. Chưa có: thẻ Income của trang Overview (`/dashboard/summary`).

**FR-PAY-03 – Tổng quan của shop owner / Overview (Could)**
- Trang `/shopowner` có: các số liệu chính (booking hôm nay, session sắp tới, booking chưa xác nhận, **chờ xác nhận thanh toán** và **sẽ thu tại studio**); **thẻ summary cho từng phần** của shop, mỗi thẻ dẫn tới trang tương ứng: Bookings (tháng này: số booking, số khách, tỷ lệ hủy), Workshops (active / draft), Sessions (sắp tới, tỷ lệ ghế đã đặt), Customers (tổng, khách quay lại), Income & expenses (thu, chi, lãi / lỗ của tháng này), Landing pages (số page / 2, page đang public); **biểu đồ tình hình booking** theo 1 tháng (theo ngày), 3 tháng, 6 tháng và 1 năm (theo tháng); và checklist chuẩn bị publish. **Cập nhật theo trạng thái mới:** KPI gồm booking hôm nay, session sắp tới, **booking chưa xác nhận (Not confirmed)** và **hai số cho booking Unpaid (không hủy, có tiền phải trả): "Awaiting payment confirmation" (booking của session đã đóng và chưa Completed: việc shop còn phải xác nhận, bấm vào mở màn hình Sessions) và "To pay at the studio" (booking của session sắp tới, khách trả tại studio)**; thẻ Sessions có thêm **Closed, to complete** (session đã đóng đang chờ shop owner bấm Completed) và **Completed**; biểu đồ booking theo thời gian dùng các nhóm Checked in / Upcoming / Cancelled (không còn no-show).
- Biểu đồ cột chồng theo kết quả: đã tham dự (`CHECKED_IN`), sắp tới (`NOT_CONFIRMED`, `CONFIRMED`), hủy (`CANCELLED`); booking tính theo ngày của session, theo timezone của shop. Kèm tổng booking, số khách, số đã tham dự, tỷ lệ hủy của kỳ. Có bảng số liệu thay thế; vẽ bằng SVG, không thêm thư viện.
- API dự kiến: `GET /dashboard/summary` và `GET /dashboard/booking-stats?period=1m|3m|6m|12m`, lọc theo `organization_id`, tổng hợp ở backend.
- *Triển khai thật (13/11/2026, `apps/api`):* `GET /dashboard/summary` trả `kpis` (`bookingsToday`, `upcomingSessions`, `notConfirmed`, `awaitingPaymentConfirmation {count, amount}`, `toPayAtStudio {count, amount}`), `cards` (`bookings` của tháng này, `workshops`, `sessions` kèm `seatRate`, `closedToComplete`, `completed`, `customers` kèm `returning` = khách có từ 2 booking không hủy, `income` tháng này (thu, phí duy trì + dịch vụ, lợi nhuận, cùng sổ cái với Income), `landingPages` (số page, tối đa 2, đang public)) và `today`; tính ở server theo múi giờ shop và `organization_id` của session, đóng các session đã hết giờ trước khi tính. `GET /dashboard/booking-stats?period=1m|3m|6m|12m` (mặc định `1m`, giá trị khác `422`): `series` theo ngày (30 ngày) hoặc theo tháng, mỗi điểm có `attended`, `upcoming`, `lost`, `total`, `guests`, và `totals` kèm `lostRate`; booking tính theo ngày của session. Dùng chung quy tắc của `packages/shared/src/booking-stats.ts`. Chưa làm: checklist chuẩn bị publish.

**FR-PROMO-01 – Quản lý khuyến mãi / Promotion management (Could)**
- Menu `/shopowner/promotions`. Shop owner tạo, sửa, tạm dừng / tiếp tục và xóa khuyến mãi: tiêu đề và mô tả theo từng ngôn ngữ (chỉ nhập ngôn ngữ đang chọn), loại giảm `PERCENT` (1–100) hoặc `FIXED_AMOUNT` (minor units), **mã khuyến mãi bắt buộc nhập** (3–20 ký tự, chỉ gồm chữ cái A–Z không dấu và chữ số 0–9; khoảng trắng ở hai đầu được trim khi submit; **không có khoảng trắng ở giữa, không có ký tự đặc biệt**; lưu dạng chữ hoa), áp dụng cho tất cả workshop hoặc một số workshop, ngày bắt đầu và ngày kết thúc (ngày nghiệp vụ theo timezone của shop, gồm cả hai ngày). Tối đa 20 khuyến mãi / shop.
- Trạng thái tính từ ngày hiện tại của shop: `SCHEDULED` (chưa tới ngày), `ACTIVE`, `EXPIRED` (quá ngày); `PAUSED` khi shop owner tạm dừng (ưu tiên hơn ngày). Trang quản lý có thẻ tổng hợp theo trạng thái (cũng là bộ lọc), ví dụ giá sau giảm khi nhập, xác nhận khi xóa.
- **Danh sách dạng bảng và tìm kiếm:** trang quản lý hiển thị khuyến mãi trong **bảng** (ảnh, tiêu đề + mã, mức giảm, thời gian áp dụng, workshop áp dụng, trạng thái, cách dùng trên booking, thao tác Edit / Pause-Resume / Delete). Tìm theo: **tiêu đề** (mọi ngôn ngữ, không phân biệt hoa thường và dấu), **thời gian áp dụng** (khoảng ngày giao với kỳ của khuyến mãi, có thể bỏ trống một đầu), **workshop đang được áp dụng** (khuyến mãi cho tất cả workshop áp dụng cho mọi workshop). Các điều kiện kết hợp với nhau; có nút xóa bộ lọc và số kết quả.
- **Thông báo bằng pop-up:** khi bị từ chối vì vượt giới hạn (tạo, sửa ngày hoặc Resume làm quá 5 khuyến mãi chạy cùng lúc, hoặc đủ 20 khuyến mãi) giao diện hiển thị **pop-up** (alert dialog) có nút OK thay vì dòng chữ ở đầu trang; form tạo / sửa vẫn mở bên dưới để đổi ngày. Dòng "Running now: n of 5" giữ nguyên trên trang.
- **Cảnh báo vượt ngân sách ("over budget"):** khi tạo hoặc sửa khuyến mãi, nếu với khuyến mãi này cùng các khuyến mãi khác đang bật và chạy **cùng ngày**, khách có thể được giảm **từ 80% giá trở lên** ở một workshop mà khuyến mãi áp dụng (`OVER_BUDGET_PERCENT = 80`), form hiển thị cảnh báo màu vàng kèm danh sách workshop và mức giảm tối đa, và khi bấm Save hiện pop-up xác nhận "Go back and change" / "Save anyway" (cảnh báo, không chặn). Mức giảm tối đa tính theo cách khách thực sự dùng được: gộp tất cả khuyến mãi `MULTIPLE` (cộng các phần trăm, mỗi phần trăm tính trên giá gốc, và các số tiền cố định; tối đa bằng giá), hoặc một khuyến mãi `SINGLE` dùng riêng, lấy mức cao hơn; xét từng ngày (khuyến mãi không bao giờ chạy cùng nhau thì không cộng). Khuyến mãi đang tạm dừng không bị cảnh báo.
- **Chặn khuyến mãi làm workshop miễn phí (100%):** khi tạo hoặc sửa, nếu với khuyến mãi này cùng các khuyến mãi khác đang bật và chạy **cùng ngày**, mức giảm tối đa của **bất kỳ workshop nào** khuyến mãi áp dụng đạt **100% giá** (`FULL_DISCOUNT_PERCENT = 100`, tính cùng cách với cảnh báo over budget: các phần trăm (mỗi phần trăm tính trên **giá gốc**) và các số tiền cố định kết hợp được cộng với nhau, nên chỉ cần tổng đạt 100% giá, ví dụ 60% + 40%, là bị chặn), thì form hiển thị thông báo đỏ nêu rõ các workshop sẽ miễn phí, bấm Save hiện pop-up và **không lưu**. Backend kiểm tra lại và từ chối (422 `FULL_DISCOUNT`, kèm `workshopIds`). Khuyến mãi đang tạm dừng được lưu nhưng **không thể Resume** nếu việc đó làm workshop miễn phí (cùng lỗi). Cảnh báo over budget chỉ hiện khi không bị chặn.
- **Cột khuyến mãi trong danh sách Workshop của shop owner (`/shopowner/workshops`):** thêm 2 cột. "Promotions you can apply" liệt kê các khuyến mãi đang chạy hôm nay và áp dụng cho workshop đó (tiêu đề, mức giảm, có kết hợp được hay không; **bên dưới mỗi khuyến mãi là thời gian áp dụng** "Applies {ngày bắt đầu} to {ngày kết thúc}"). "Maximum discount" (tính cho 1 khách) gồm hai phần: (1) **"All n promotions can be combined"**: tổng số tiền và tổng % trên giá gốc khi áp dụng **tất cả** các khuyến mãi kết hợp được (`MULTIPLE`) cùng nhau (cộng các % trên giá gốc và các số tiền cố định, tối đa bằng giá), kèm giá sau giảm; (2) **"Promotions used on their own"**: **từng** khuyến mãi "Only this promotion" (`SINGLE`) một dòng, mỗi dòng có tiêu đề cùng số tiền giảm và % giảm của riêng nó (không cộng với khuyến mãi khác). Phần nào không có khuyến mãi thì không hiển thị; không có khuyến mãi nào thì cột hiển thị dấu gạch. Không hiển thị danh sách "Using ...".
- **Section "Promotions" trên landing page** (loại section mới, tự lấy nội dung như section Workshops; layout `cards` hoặc `banner`; chỉ có tiêu đề section là nhập tay): hiển thị các khuyến mãi đang `ACTIVE` hôm nay gồm mức giảm, tiêu đề, mô tả, workshop áp dụng, hạn dùng và mã. Section tự ẩn (cùng link menu) khi không có khuyến mãi nào đang chạy. Có sẵn trong cả 10 template; shop owner có thể thêm / bớt / đổi thứ tự như các section khác.
- **Section trong Web builder:** section "Promotions" nằm trong danh sách section của builder, sắp xếp thứ tự (kéo thả hoặc mũi tên lên xuống), bật / tắt hiển thị, đổi layout, đổi tiêu đề, màu và nút Book như các section khác. Khi shop owner chọn section này, builder hiển thị thông báo rằng nội dung do **Promotion management** quản lý kèm nút "Go to Promotion management" (builder lưu bản nháp đang chờ trước khi chuyển trang). Bản nháp / bản đã publish lưu trước khi có section này được thêm section **một lần** (sau workshop) khi mở lại; nếu shop owner xóa thì không tự thêm lại.
- **Ảnh:** mỗi khuyến mãi có tối đa **1 ảnh** (upload JPEG / PNG / WebP, hoặc link https), hiển thị ở trang quản lý và ở section Promotions. Ảnh được kiểm tra magic bytes ở server, tối đa 1 MB sau khi thu nhỏ; ảnh bị thay hoặc khuyến mãi bị xóa thì ảnh cũng bị xóa. Ảnh do nền tảng phục vụ tại `/api/v1/media/promotions/{id}` (mock của presigned upload lên R2, FR-MEDIA-01).
- *Triển khai thật (13/11/2026, `apps/api`):* `GET /promotions` (mỗi khuyến mãi kèm `status` tính theo ngày hiện tại của shop, `heldByAdmin`; kèm `today`, `limit` 20, `maxConcurrent` 5), `POST /promotions` (201), `PUT /promotions/{id}`, `PATCH /promotions/{id}` `{enabled}`, `DELETE /promotions/{id}` (204). Body là đúng `promotionInputSchema` của `packages/shared`. Lỗi: `422 VALIDATION` với `fields` (`codeRequired`, `codeInvalid`, `codeTaken`, `percentTooHigh`, `valueInvalid`, `titleRequired`, `endBeforeStart`, `endInPast`, `workshopRequired`, `workshopUnknown`), `409 LIMIT_REACHED` (đủ 20), `409 CONCURRENT_LIMIT` (kèm `date`: quá 5 khuyến mãi chạy cùng lúc), `422 FULL_DISCOUNT` (kèm `workshopIds`: tạo, sửa hoặc Resume làm workshop miễn phí), `409 EDIT_NOT_ALLOWED` (chỉ sửa khuyến mãi đang tạm dừng hoặc hết hạn), `409 DELETE_NOT_ALLOWED` (chỉ xóa khi tạm dừng hoặc hết hạn), `409 PROMOTION_IN_USE` (đang dùng trong booking còn hiệu lực của session chưa kết thúc, kèm `bookingCodes`), `409 HELD_BY_ADMIN`; khuyến mãi của shop khác luôn là `404`. Mọi thay đổi chạy dưới **một khóa theo shop** nên hai yêu cầu cùng lúc không vượt được giới hạn; audit `promotion.create | update | pause | resume | delete`. **Giá booking do server tính:** `POST /public/sites/{slug}/bookings` nhận thêm `promotionIds` (id các khuyến mãi khách chọn); server chỉ nhận khuyến mãi đang chạy hôm nay và áp dụng cho workshop đó (`422 fields.promotionIds = unavailable`; không âm thầm bỏ qua) và kết hợp được với nhau (`notCombinable`), tính bằng `priceBooking` của `packages/shared` (mỗi % trên giá gốc, số tiền cố định trừ cả booking, không âm), rồi lưu `discountAmount`, `promotionIds` và `snapshot.discounts` (mã, số tiền, id) vào booking; **tổng tiền do client gửi không bao giờ được đọc**, sửa / xóa khuyến mãi sau đó không đổi booking cũ (BR-05). `GET /public/sites/{slug}` trả thêm `promotions` đang chạy hôm nay cho section Promotions và form đặt chỗ. **Chưa làm:** upload ảnh khuyến mãi (hiện chỉ link https; đợi cấu hình Cloudflare R2), khuyến mãi cho booking tay của shop.
- **Giới hạn chạy đồng thời:** tại **một thời điểm** chỉ có tối đa **5 khuyến mãi** chạy (`MAX_CONCURRENT_PROMOTIONS`). Tính trên các khuyến mãi đang bật, theo từng ngày từ hôm nay trở đi, kể cả khuyến mãi đã lên lịch trùng ngày; khuyến mãi tạm dừng và các ngày đã qua không tính. Tạo, sửa ngày hoặc **tiếp tục** một khuyến mãi làm vượt 5 ở bất kỳ ngày nào thì bị từ chối (409 `CONCURRENT_LIMIT`, kèm ngày đầu tiên vượt). Trang quản lý hiển thị "Running now: n of 5".
- **Cách dùng khuyến mãi trên booking (shop owner cấu hình cho TỪNG khuyến mãi, trường `stacking`):** `SINGLE` = khi khách dùng khuyến mãi này thì **không** được dùng thêm khuyến mãi nào khác trên booking đó (mặc định); `MULTIPLE` = **có thể kết hợp** với các khuyến mãi khác cũng là `MULTIPLE`. Tập khuyến mãi khách chọn hợp lệ khi chỉ có 1 khuyến mãi, hoặc khi mọi khuyến mãi trong tập đều là `MULTIPLE`. Trong form đặt chỗ, khách thấy các khuyến mãi đang chạy hôm nay và áp dụng cho workshop đã chọn (kèm ghi chú "Can be combined" / "Cannot be combined"), chọn bằng ô tick: chọn một khuyến mãi `SINGLE` thì thay thế toàn bộ lựa chọn khác; chọn một khuyến mãi `MULTIPLE` thì thay thế khuyến mãi `SINGLE` đang chọn (nếu có) và được cộng cùng các khuyến mãi `MULTIPLE` khác. Cách tính giá (backend tính lại, không tin giá từ client): tạm tính = đơn giá × số khách; **mọi khuyến mãi đều tính trên giá gốc (tạm tính)**: khuyến mãi theo phần trăm giảm đúng phần trăm đó của giá gốc và các phần trăm được **cộng** với nhau (ví dụ 20% và 15% giảm tổng cộng **35% giá gốc**, không phải giảm 20% rồi giảm tiếp 15% trên số tiền còn lại); số tiền cố định (`FIXED_AMOUNT`) tính cho **cả booking**; kết quả không phụ thuộc thứ tự khách chọn; tổng giảm không vượt quá giá gốc nên tổng tiền không bao giờ nhỏ hơn 0. Backend từ chối tập khuyến mãi không hợp lệ. Backend lưu snapshot các khuyến mãi và số tiền giảm vào booking. Mỗi khuyến mãi trên landing page ghi rõ có kết hợp được hay không.
- **Giải thích cho khách khi chọn khuyến mãi trong form đặt chỗ:** các khuyến mãi `MULTIPLE` được chọn cùng nhau, nhưng không bao giờ cùng một khuyến mãi `SINGLE` ("Only this promotion"). Khi khách tick một khuyến mãi `MULTIPLE` mà đang chọn một khuyến mãi `SINGLE` thì khuyến mãi `SINGLE` tự bị bỏ tick; khi khách tick một khuyến mãi `SINGLE` thì mọi lựa chọn khác tự bị bỏ tick và chỉ còn khuyến mãi đó. Ngay dưới danh sách có **chú thích** (vùng `role=status`, đọc được bằng trình đọc màn hình) nêu khuyến mãi nào đã bị bỏ tick và vì sao; khi đang chọn một khuyến mãi `SINGLE`, chú thích nhắc rằng nó không kết hợp được và cách đổi sang lựa chọn khác. Mỗi khuyến mãi luôn ghi "Can be combined" / "Cannot be combined". Backend vẫn từ chối tập khuyến mãi không hợp lệ.
- **Nút thao tác trong danh sách:** (1) khuyến mãi **mới thêm hoặc vừa sửa luôn được lưu ở trạng thái `PAUSED`** (form không còn ô "Active"; giao diện gửi `enabled=false`). Nút **Start** (chỉ hiện ở khuyến mãi `PAUSED`) bật khuyến mãi: nếu hôm nay nằm trong khoảng ngày bắt đầu đến ngày kết thúc thì chuyển sang `ACTIVE`, nếu ngày bắt đầu còn ở tương lai thì chuyển sang `SCHEDULED`; Start vẫn bị kiểm tra giới hạn 5 khuyến mãi chạy cùng lúc và chặn miễn phí 100%, và bị vô hiệu (422 `endInPast`) khi ngày cuối đã qua. Cảnh báo over budget / chặn 100% trong form tính như thể khuyến mãi sẽ chạy. Khuyến mãi `ACTIVE` và `SCHEDULED` có nút Pause. (2) **chỉ khuyến mãi `PAUSED` sửa được**: với `ACTIVE` và `SCHEDULED` **giao diện ẩn cả nút Edit lẫn Delete** (chỉ còn Pause), phải Pause trước (backend từ chối PUT bằng 409 `EDIT_NOT_ALLOWED`). (3) khuyến mãi `EXPIRED` **không có nút Edit và không có nút Start**; chỉ có Renew (mở popup sửa, lưu xong là `PAUSED`, rồi bấm Start) và Delete. (4) **Ngày cuối (Last day) không được nhỏ hơn ngày hiện tại** của shop khi thêm hoặc sửa (422, `fields.endDate = endInPast`; client cũng kiểm tra). (5) **Khung "Note" riêng** (tách khỏi khung tìm kiếm, nằm ngay bên dưới) giải thích cách dùng các nút Edit, Delete và Refresh (Renew), mỗi dòng có icon của nút.
- **Gia hạn khuyến mãi đã hết hạn:** dòng khuyến mãi `EXPIRED` có nút biểu tượng làm mới (Renew). Bấm vào mở popup sửa khuyến mãi (lưu xong là `PAUSED`), con trỏ nhảy vào ô **First day** (viền nổi bật) kèm gợi ý "Please choose the period in which this promotion applies."; gợi ý và viền mất khi shop owner đổi First day. Nút Save chỉ bật khi có thay đổi (BR-17). **Mã khuyến mãi của khuyến mãi đã xóa thành công có thể được dùng lại** (xem quy tắc mã bên dưới).
- **Quy tắc mã, tạm dừng và xóa:** (1) **Mã khuyến mãi là duy nhất trong từng shop** (không phân biệt hoa thường, tính cả khuyến mãi đang tạm dừng hoặc hết hạn; sửa khuyến mãi được giữ mã của chính nó); hai shop khác nhau được dùng cùng một mã; trùng mã bị từ chối 422 `VALIDATION` với `fields.code = codeTaken`. (2) **Không thể Pause** khuyến mãi đang được áp dụng trong booking còn hiệu lực (`CONFIRMED` hoặc `CHECKED_IN`, kể cả chưa check-in) của một session chưa kết thúc: backend trả 409 `PROMOTION_IN_USE` kèm số lượng và mã booking, giao diện hiển thị pop-up. Chỉ Pause được khi khách hủy booking hoặc session đã kết thúc; khi session kết thúc, booking chưa check-in tự chuyển sang `SESSION_EXPIRED`. Session đã hủy không chặn. (3) **Chỉ Delete được khi khuyến mãi đang `PAUSED` hoặc `EXPIRED`**; trạng thái khác bị từ chối 409 `DELETE_NOT_ALLOWED` và nút Delete bị vô hiệu kèm gợi ý. (4) Popup thêm / sửa: danh sách "Selected workshops" có tiêu đề cột **Name of workshop** và **Giá gốc**.
- **Ngoài phạm vi hiện tại:** trong MVP frontend, giá sau khuyến mãi chỉ là giá tạm tính trong form đặt chỗ (đặt chỗ vẫn là mô phỏng), chưa có kiểm tra backend và chưa ghi snapshot; mã khuyến mãi chỉ hiển thị cho khách nhắc lại tại shop, chưa nhập mã trong form. Thanh toán vẫn tại shop.
- API (mock trong frontend, hợp đồng theo backend thật): `GET/POST /promotions`, `PUT/PATCH/DELETE /promotions/{id}`, `POST /media/promotions` (upload ảnh) (chỉ OWNER / MANAGER, lọc theo `organization_id`, ghi audit); trang public đọc các khuyến mãi đang chạy của shop. Bảng `promotions` (`organization_id`, `title jsonb`, `description jsonb`, `discount_type`, `discount_value bigint`, `code`, `image_url`, `stacking`, `applies_to`, `workshop_ids`, `start_date date`, `end_date date`, `enabled`).

**FR-CUST-01 – Khách hàng (Must)**
- Danh sách customer của shop, chi tiết và lịch sử booking. Tìm theo tên/email.
- **Icon con mắt ở cuối mỗi dòng customer** mở **popup chi tiết customer** (không chuyển trang): email, điện thoại, quốc gia, ngày sinh, ngôn ngữ ưa thích, số booking (kèm ngày booking đầu tiên), tổng đã thu ròng và **danh sách mọi booking** của khách (mới nhất trước, kể cả đã hủy; mã booking là link tới booking). Bấm vào dòng vẫn mở nhanh danh sách booking ngay trong bảng.
- **Danh sách customer có cột Gender** (sau Date of birth; sắp xếp được; khách chưa khai giới tính hoặc không có tài khoản ghi "-") và bộ lọc: **ô tìm kiếm chỉ tìm theo tên và email** (không phân biệt hoa thường và dấu), cùng **hai bộ lọc thả xuống: Country** (các quốc gia của khách, xếp theo tên theo ngôn ngữ giao diện, kèm mục "Vãng lai" / "Guest" cho khách không có tài khoản) **và Gender** (Male / Female / Other / Not provided). Ba điều kiện dùng cùng lúc (và); mỗi bộ lọc có mục "tất cả". **Thứ tự mặc định của các booking là theo ngày booking (lúc khách đặt), booking mới đặt nhất ở trên cùng**, cả trong popup chi tiết lẫn dòng mở rộng; bảng booking có thêm cột **Booked on** (sắp xếp được). Cột Last booking và thứ tự mặc định của danh sách customer cũng theo ngày booking mới nhất, không theo ngày session.
- **Avatar của customer:** ảnh đại diện lấy từ tài khoản (`customer.account.avatar_url`) hiển thị cạnh tên trong danh sách và ở đầu popup chi tiết (khu vực avatar lớn); khách chỉ booking không có tài khoản (hoặc ảnh lỗi) hiện **chữ cái đầu** của tên thay cho ảnh. **Sắp xếp theo tiêu đề cột:** bảng Customers (tên, email, quốc gia, ngày sinh, số booking, booking gần nhất, đã thu ròng) và bảng booking trong popup / trong dòng mở rộng (mã, workshop, session, trạng thái, thanh toán, tổng tiền) đều bấm vào tiêu đề để sắp xếp: lần 1 tăng dần, lần 2 giảm dần, lần 3 về thứ tự mặc định (customer: booking gần nhất trước; booking: mới nhất trước). Chữ so theo ngôn ngữ giao diện (số trong chuỗi so như số: SES-0002 trước SES-0010; tiếng Việt theo bảng chữ cái), số so như số, trạng thái so theo chữ hiển thị; dòng không có giá trị (ví dụ khách vãng lai không có quốc gia / ngày sinh) luôn nằm cuối. Tiêu đề có `aria-sort`.
- **Popup chi tiết customer còn có Gender (giới tính) và Social information (thông tin mạng xã hội):** cũng lấy từ tài khoản khách đăng ký (`customer.account { gender?, socials? }`), đều không bắt buộc. Giới tính: Male / Female / Other. Mạng xã hội và ứng dụng nhắn tin liệt kê theo thứ tự: Zalo, WhatsApp, Facebook, Instagram, TikTok, LINE, KakaoTalk, WeChat, Telegram, X (mỗi nền tảng một tên tài khoản / số, hiển thị dạng "Nền tảng: tên tài khoản"; chỉ hiện nền tảng khách đã nhập). **Thiếu thông tin thì ghi "-"** (giới tính chưa khai, chưa có nền tảng nào, hoặc khách chỉ booking không có tài khoản).
- **Quốc gia và ngày sinh lấy từ tài khoản khách đăng ký:** danh sách customer có cột **Country** (tên quốc gia theo ngôn ngữ giao diện) và cột **Date of birth**. Khách **chỉ booking, không có tài khoản** thì shop không biết quốc gia cư trú và ngày sinh: cột Country ghi **"Vãng lai"** (Guest / 비회원 / ゲスト / 访客 theo ngôn ngữ), cột ngày sinh ghi **"-"**. Áp dụng cả ở trang chi tiết customer và chi tiết booking. Vì vậy form tạo booking thủ công của shop owner **không hỏi quốc gia** (dữ liệu: `customer.account { country, birth_date }` chỉ có khi khách đã đăng ký).
- **Danh sách customer lấy từ các booking:** chỉ hiển thị khách đã có ít nhất một booking (thông tin khách là thông tin nhập khi booking), sắp theo booking gần nhất; mỗi dòng có tên, email, quốc gia, số booking, booking gần nhất, tổng đã thu ròng. **Bấm vào một dòng (hoặc nút mũi tên ở đầu dòng) để mở danh sách mọi booking khách đó từng đặt** (kể cả booking đã hủy), mới nhất trước: mã booking (link tới booking), workshop, thời gian session, trạng thái, thanh toán, tổng tiền; bấm lần nữa để đóng, mở được nhiều khách cùng lúc; bàn phím dùng nút mũi tên (`aria-expanded`). Có link tới trang chi tiết customer.
- Customer thuộc riêng từng shop; không gộp giữa các shop.
- Should: export CSV; xóa/ẩn danh customer theo yêu cầu (quyền riêng tư).

### 5.7 Thông báo email


**FR-CUST-02 – Affiliate của customer (Should)** (`/customer/{id}/affiliate`, menu "Affiliate")
- Trang có hai **tab**. **Program**: danh sách các workshop **đang active** (workshop bị deactivate, hoặc của shop không còn hoạt động, bị ẩn khỏi danh sách này), cùng giao diện thẻ và ô tìm kiếm như trang Workshops nhưng **không có nút Book now và Google Maps**. Mỗi thẻ có nút **Register Affiliate**; sau khi bấm, nút bị thay bằng **Copy Affiliate link** (sao chép link gửi lời mời người khác tham gia booking workshop đó) và **không thể quay lại Register Affiliate** (không có thao tác hủy đăng ký). Mỗi cặp tài khoản + workshop có một link.
- Trang Affiliate có **3 tab: Program, Affiliate link và History** (History: xem FR-CUST-04); đầu trang là các số liệu tổng và nút **Rút tiền** (FR-CUST-04).
- **Affiliate link** (tab): danh sách các link đã tạo sau khi bấm Register Affiliate, có cột **Link** (kèm nút sao chép), **Paid bookings** (số booking đã thanh toán đến từ link đó), **Earned** (tổng Affiliate fee đã nhận trên link đó) và **Status**: **On-going** (workshop còn active) hoặc **Deactive** (workshop đã bị deactivate: link vẫn nằm trong danh sách nhưng không sao chép được và không còn dẫn tới đặt chỗ).
- **Khi workshop bị deactivate (`DRAFT`)**, các Affiliate link của workshop đó tự chuyển sang **Deactive** (và bật lại thành On-going khi workshop được Activate). Không đăng ký affiliate mới cho workshop không còn active (API trả `409 WORKSHOP_INACTIVE`; link đã có thì vẫn giữ). **Người truy cập vào link Deactive** vẫn vào **trang landing page của shop** tương ứng (không mở popup booking) và thấy **popup "Workshop đã kết thúc"** (có nút Close; text i18n đủ 5 ngôn ngữ, theo giao diện của shop); lượt mở link vẫn được đếm. Nếu cả shop bị deactivate thì landing page trả 404 như mọi trang của shop đó.
- **Link affiliate** = trang landing page của shop kèm `?ref=CODE&book=WORKSHOP_ID`: mở trang là **tự mở popup booking của đúng workshop** đó. Landing page nhớ `ref` (localStorage, theo shop) để booking đặt trong lượt truy cập gửi kèm mã; `ref` và `book` được bỏ khỏi địa chỉ sau khi đọc (reload không mở lại popup); lượt mở link được tính một lần mỗi lượt truy cập (`POST /public/sites/{slug}/referrals/click` `{code, count}`, trả `{workshopId, status: ON_GOING | DEACTIVE}`). Booking có mã chỉ được tính cho link khi **đúng workshop của link** và **không phải booking của chính người chia sẻ**; mã sai bị bỏ qua (booking vẫn được tạo).
- Mỗi thẻ hiển thị **Affiliate fee (% giá booking gốc) của shop đó** (do admin cấu hình, FR-ADM-17) và, khi đã đăng ký, phí đã nhận, số booking đã thanh toán và số lượt nhấp. Đầu trang là tổng Affiliate fee đã nhận (theo từng loại tiền). Customer **chỉ thấy Affiliate fee**, không thấy phí duy trì, phí dịch vụ hay lợi nhuận.
- API: `GET/POST /customer/{id}/referrals` (xác thực như các API `/customer/{id}`; GET trả thêm tỷ lệ affiliate của từng shop). Text i18n đủ 5 ngôn ngữ.
- *Triển khai thật (13/11/2026, `apps/api`):* `GET /customer/{id}/referrals?q=` trả `items` (các link của tài khoản: `code`, `link`, `clicks`, `bookings` = số booking đã thanh toán, `referralFee` = Affiliate fee đã kiếm, `referralBps`, `status` `ON_GOING | DEACTIVE`) và `programs` (workshop **đang active của shop đang active**, mỗi workshop kèm Affiliate fee của shop và `linkId` nếu đã đăng ký; tối đa 100, tìm theo tên workshop / shop; **không có** phí duy trì hay phí dịch vụ). `POST /customer/{id}/referrals` `{workshopId}`: `201` link mới, `200` link đã có (mỗi cặp tài khoản + workshop **một** link, không có hủy), `409 WORKSHOP_INACTIVE` (link đã có vẫn trả về), `404`. Link `{shop}.{PLATFORM_DOMAIN}/?ref=CODE&book=WORKSHOP_ID`, mã `A` + 8 ký tự (không có 0 O 1 I L), trigger chặn đổi mã / chủ / workshop. Link **Deactive** (workshop hoặc shop không active, hoặc admin đã tắt) **không trả địa chỉ** (`link: null`) và tự bật lại khi workshop active lại. `{id}` phải là tài khoản trong session, khác thì `404`. **Đếm lượt mở:** `POST /public/sites/{slug}/referrals/click` `{code, count}` (1 đến 20, mặc định 1) trả `{workshopId, status}`; link Deactive vẫn được đếm; sai shop hoặc sai mã là cùng một `404`; giới hạn 30 lần mỗi phút cho mỗi địa chỉ và mã (`429`). **Gắn vào booking:** `POST /public/sites/{slug}/bookings` nhận thêm `ref` tùy chọn; booking được tính cho link (`bookings.affiliate_link_id`, đặt lúc tạo và không đổi) chỉ khi mã đúng, **đúng workshop của link**, link đang bật, chủ link chưa bị vô hiệu hóa và email của khách **không phải email của chính người chia sẻ**; mã sai không bao giờ làm hỏng booking. **Cách tính:** Affiliate fee = tỷ lệ affiliate **có hiệu lực lúc booking được thanh toán** (lần thanh toán gần nhất) × giá gốc (đơn giá × số khách, trước khuyến mãi), chỉ booking **`PAID` và không hủy** (D24: đổi tỷ lệ không làm đổi khoản đã tính; `referralBps` của link là tỷ lệ **hiện tại**, cho các booking thanh toán từ bây giờ). Trong tháng chưa kết sổ, số này tính từ trạng thái booking hiện tại (đặt lại Unpaid thì thôi tính) và **chưa rút được**; khi tháng của shop được kết sổ, nó thành khoản cộng của ví và đóng băng (D23). Link bị admin tắt giữ nguyên khoản đã kiếm, chỉ ngừng tính booking mới. Chưa làm: danh sách workshop xếp công bằng giữa các shop (thuộc phần Workshops của customer).


**FR-CUST-03 – Referrals của customer: mời bạn bè đăng ký tài khoản (Should)** (`/customer/{id}/referrals`, menu "Referrals")
- *Khác với Affiliate (FR-CUST-02, link theo từng workshop):* Referrals là mời **bạn bè đăng ký tài khoản customer**. **Mỗi customer chỉ có MỘT link referrals duy nhất, không đổi** (`{shop}.domain/?invite=CODE`, mã `I` + 8 ký tự, tạo lần đầu khi customer mở trang rồi giữ mãi).
- Người được mời mở link: landing page nhớ mã (`localStorage`, theo shop), bỏ `invite` khỏi địa chỉ và, nếu chưa đăng nhập, **mở thẳng popup đăng ký** ở bước tạo tài khoản; khi đăng ký, mã được gửi kèm (`inviteCode`). Người đăng ký thành công thành **referral** của chủ link. Mã sai, tự mời chính mình, hoặc bạn đã là referral của người khác thì bị bỏ qua (tài khoản vẫn được tạo); mỗi người bạn chỉ thuộc một người mời.
- **Điều kiện được bonus:** người được mời đã đăng ký **và** có một booking **thanh toán thành công (Payment status `PAID`, booking không bị hủy) được đặt SAU khi đăng ký**. Khi đó **% hoa hồng của booking đó (tỷ lệ Referral bonus của shop × giá gốc của booking, trước khuyến mãi) được cộng vào phần Referrals của người mời.** **Chỉ tính MỘT LẦN cho mỗi referral, trên booking đầu tiên đã thanh toán**; các booking sau của cùng người bạn không được thưởng thêm; booking đã đặt trước khi đăng ký không được tính. Bonus được tính từ trạng thái booking hiện tại (booking bị đặt lại Unpaid thì thôi tính; booking đã thanh toán kế tiếp của người bạn đó thay thế).
- **Màn hình:** link của mình (kèm nút Copy), các số liệu tổng và nút **Rút tiền** (FR-CUST-04), và hai tab: **Referrals** (danh sách) và **History**. Tab Referrals có **danh sách referrals** (cột Friend gồm tên và email che bớt, ngày đăng ký, trạng thái *Registered, waiting for a paid booking* hoặc *Bonus earned* kèm mã booking, và số tiền bonus). **Dưới danh sách luôn có ghi chú (text) giải thích quy tắc: chỉ nhận bonus một lần cho mỗi referral, khi bạn bè đăng ký qua link và thanh toán booking đầu tiên.** Text i18n đủ 5 ngôn ngữ.
- API: `GET /customer/{id}/invites` → `{ code, link, bonusBps, currency, items, total }`; `POST /public/sites/{slug}/accounts` nhận thêm `inviteCode` tùy chọn.
- *Triển khai thật (13/11/2026, `apps/api`):* `GET /customer/{id}/invites` trả `{code, disabled, link, items, total, earned}`: mã `I` + 8 ký tự, tạo lần đầu và **không bao giờ đổi**, `link` = `{PLATFORM_DOMAIN}/?invite=CODE`; mỗi người bạn có tên, **email che** (`f***@example.com`), `registeredAt`, `status` `REGISTERED | EARNED`, `bonus`, `currency`, `bookingCode` và `paidAt`; `earned` là tổng bonus theo từng đồng tiền. `POST /auth/signup` (chỉ `CUSTOMER`) nhận thêm `inviteCode` tùy chọn: mã sai, định dạng sai hoặc đã bị tắt **bị bỏ qua mà không báo gì** (tài khoản vẫn được tạo, không lộ mã nào tồn tại); mỗi người bạn chỉ thuộc **một** người mời (ràng buộc duy nhất), không ai tự mời mình, `referrals` chỉ thêm (trigger chặn sửa / xóa). **Bonus** = tỷ lệ Referral bonus **có hiệu lực lúc booking được thanh toán** × giá gốc của **booking đầu tiên đã `PAID` và không hủy mà người bạn đặt sau khi đăng ký** (khớp theo email của tài khoản), **một lần** cho mỗi người bạn; booking đặt trước khi đăng ký không bao giờ được tính; booking đầu bị đặt lại Unpaid thì bonus chuyển sang booking đã thanh toán kế tiếp. Số này vào ví REFERRAL khi tháng của shop được kết sổ (D23); trước đó chỉ hiển thị là chờ kết sổ.

**Dữ liệu mẫu của Affiliate, Referrals và Rút tiền (mock):** đủ các trường hợp để xem từng trạng thái của từng trang (chạy mỗi lần server khởi động):
- *Affiliate:* link On-going có thu nhập (booking đã thanh toán của người khác), link có lượt nhấp nhưng chưa có booking, link vừa tạo chưa ai mở, link của shop khác, **link của workshop đã bị deactivate (Deactive)**; một customer có nhiều link (`cu-1`: 5 link, gồm link ở shop dùng tiền USD), và customer chưa có link nào (trang trống: `cu-9`, `cu-12`, `cu-14`, `cu-16` đến `cu-18`).
- *Referrals:* bạn bè **đã được thưởng** (có booking đã thanh toán sau khi đăng ký), bạn bè **đang chờ** booking đầu tiên, bạn bè **chỉ có booking thanh toán TRƯỚC khi đăng ký** (không tính, vẫn là "Registered"), customer có 4 bạn với trạng thái lẫn lộn (`cu-1`) và customer chưa mời ai.
- *Rút tiền:* đủ **Pending, Paid, Rejected (kèm lý do)** ở cả hai chương trình; `cu-1` có lịch sử dài, `cu-4` có mỗi loại một invoice, `cu-5` có invoice đang chờ và số dư Referrals **đã rút hết** (không còn gì để rút), customer khác chưa có invoice (History trống). Tổng các invoice không vượt số đã kiếm.

**FR-CUST-04 – Rút tiền từ Affiliate và Referrals (Should)** (nút **Rút tiền** ở trang Affiliate và trang Referrals của customer)
- **Giới hạn rút tiền (quyết định D6, D12; TODO(api)):** tài khoản customer **toàn nền tảng**; ví, phí và giới hạn rút tối thiểu / tối đa tính **theo từng đồng tiền** (VND, USD...), dùng chung cho Affiliate và Referrals. Bản mock hiện đặt giới hạn bằng một giá trị ở Settings (FR-ADM-20).
- Mỗi chương trình có **số dư riêng** (Affiliate: Affiliate fee của các link workshop; Referrals: bonus mời bạn bè). Mỗi trang có **3 khu số liệu tổng**: **Tổng tiền đã kiếm** (total earned), **Số tiền chờ xử lý** (pending: tổng các invoice đang chờ admin) và **Số tiền đã rút** (withdrawn: tổng các invoice đã thanh toán), kèm dòng **Có thể rút** (= đã kiếm − chờ xử lý − đã rút, không âm). Số liệu tính ở server từ booking hiện tại.
- **Nút Rút tiền** mở **popup** nhập số tiền muốn rút (BR-16 trim; số nguyên theo đơn vị của tiền tệ, chấp nhận dấu phân cách hàng nghìn; lớn hơn 0 và **không vượt quá số có thể rút**, kiểm tra cả ở client lẫn server `422 amount=exceeds`). Nút bị khóa khi không còn gì để rút. Sau khi submit, hệ thống tạo **invoice** (`WD-0001`, `WD-0002`…) trạng thái **Pending** và chuyển sang tab **History**.
- **Thông tin chuyển khoản (bổ sung 12/11/2026, D22):** popup Rút tiền có **ba ô nhập thêm**: **Tên ngân hàng**, **Số tài khoản** và **Tên chủ tài khoản** (bổ sung 13/11/2026), để admin thanh toán ngoài hệ thống (hệ thống không chuyển tiền). Cả bốn ô (số tiền, tên ngân hàng, số tài khoản, tên chủ tài khoản) đều **bắt buộc**, BR-16 trim; mọi ô sai được báo **cùng lúc**. Tên ngân hàng: 2 đến 100 ký tự, chữ của mọi ngôn ngữ, chữ số, dấu cách và `. , ' & ( ) / -`; khoảng trắng liên tiếp gộp thành một. Số tài khoản: 6 đến 34 chữ cái hoặc chữ số sau khi bỏ dấu cách và dấu gạch ngang (người dùng gõ `0123 4567-89` vẫn được), lưu in hoa và không có dấu cách. Tên chủ tài khoản: cùng quy tắc với tên ngân hàng (2 đến 100 ký tự), để admin đối chiếu với tài khoản nhận khi chuyển. **Không sửa được sau khi gửi** (database chặn), muốn đổi thì lập lệnh mới sau khi lệnh cũ bị từ chối. Quy tắc kiểm tra nằm ở `packages/shared/src/bank-details.ts`, popup và backend dùng chung. Text i18n đủ 5 ngôn ngữ (`customer.wallet`), phần admin en + vi.
- **Dữ liệu cá nhân (nhạy cảm):** thông tin ngân hàng chỉ hiển thị cho **chủ tài khoản (số tài khoản che, chỉ còn 4 ký tự cuối, ví dụ `****8901`)** và cho **admin hệ thống** đang xử lý (thấy đầy đủ để chuyển khoản). Không ghi vào audit log, không ghi log, không có trong email. Lệnh tạo trước khi có yêu cầu này (dữ liệu demo cũ) không có thông tin ngân hàng và hiển thị "chưa có". **Đã làm (13/11/2026):** cột số tài khoản được **mã hóa AES-256-GCM** ở tầng API (khóa suy ra từ `APP_SECRET`, giữ ngoài database; dạng lưu `enc:v1:...`); giá trị cũ còn ở dạng rõ vẫn đọc được và được mã hóa bằng `pnpm db:encrypt-bank` (chạy lại được; trigger chỉ cho đổi cách biểu diễn, không cho đổi thông tin ngân hàng). Mất `APP_SECRET` là mất số tài khoản đã mã hóa nên phải sao lưu cùng kho bí mật. **Còn cần xác nhận trước khi chạy thật:** thời hạn lưu (theo D18).
- **Chỉ rút được sau khi kết sổ (bổ sung 13/11/2026, D23):** customer chỉ rút được tiền đã kiếm trong những tháng của shop **đã kết sổ**; sau khi kết sổ, mọi khoản tiền của tháng đó đóng băng (không đổi dù booking bị sửa sau này, Unpaid bị chặn theo D10, tỷ lệ phí không đổi theo D24). Tiền của tháng chưa kết sổ hiển thị là `unsettled` ("chờ kết sổ") và không tính vào `available`; yêu cầu rút vượt `available` bị `422 fields.amount = exceeds`. **Thông báo cho người dùng** (text i18n đủ 5 ngôn ngữ, khóa `customer.wallet.closingNotice`) hiện ở phần số liệu của trang Affiliate / Referrals và trong popup Rút tiền: "Tiền kiếm được chỉ rút được sau khi tháng phát sinh đã được kết sổ. Tháng của mỗi shop được kết sổ vào cuối tháng; từ đó số tiền của tháng đó được chốt và không bao giờ thay đổi, kể cả khi booking bị sửa sau này." Bản mock web mới có thông báo, chưa mô phỏng logic kết sổ.
- **Tab History:** danh sách invoice của chương trình đó, mới nhất trước, cột Invoice, ngày yêu cầu, số tiền, **tình trạng thanh toán** (**Pending** chờ xử lý, **Paid** đã thanh toán, **Rejected** bị từ chối kèm **lý do**) và ngày xử lý.
- Invoice bị từ chối thì số tiền **quay lại số có thể rút**. Số tiền đã nằm trong invoice không thể rút lần nữa.
- API: `GET /customer/{id}/wallet?source=AFFILIATE|REFERRAL` (số liệu + invoice), `POST /customer/{id}/withdrawals` `{source, amount}` (minor units). Text i18n đủ 5 ngôn ngữ. *Giới hạn MVP:* chưa có email báo kết quả cho customer, chưa có hạn mức rút tối thiểu và việc chuyển tiền thật; số dư và invoice nằm trong bộ nhớ của mock.
- *Triển khai thật (12/11/2026, `apps/api`):* `GET /customer/{id}/wallet?source=AFFILIATE|REFERRAL` và `POST /customer/{id}/withdrawals` `{source, currency, amount, bankName, bankAccountNumber, bankAccountHolder}` (**`currency` bắt buộc** vì ví tính theo từng đồng tiền, D6). `{id}` phải là chính tài khoản trong session, khác thì `404` (không bao giờ xem được ví người khác). Ví trả theo từng cặp nguồn × đồng tiền: `earned` (đã kết sổ, đóng băng), `unsettled` (kiếm trong tháng chưa kết sổ: chỉ hiển thị, **chưa rút được**), `pending`, `withdrawn`, `available` (= `earned` − chờ − đã rút, không âm; invoice bị từ chối trả lại tiền) và `limits`; kèm danh sách invoice (`WD-0001`… lấy từ sequence của database, không trùng ngay cả khi hai yêu cầu cùng lúc). `422` với `fields.amount` = `invalid | exceeds | belowMin | aboveMax` (số nguyên > 0, không vượt số có thể rút, trong giới hạn của đồng tiền đó) và `fields.bankName` / `fields.bankAccountNumber` / `fields.bankAccountHolder` = `required | invalid | tooLong` (mọi trường sai được báo cùng lúc). Invoice trả về `bankName`, `bankAccountHolder` và `accountNumberMasked` (`****8901`), **không bao giờ** trả số tài khoản đầy đủ cho chủ tài khoản. Kiểm tra và ghi invoice trong **một transaction có khóa ví** (advisory lock), nên 8 yêu cầu cùng lúc cũng không rút quá số dư (đã test). `wallet_credits` **chỉ thêm** (trigger chặn sửa / xóa) và chỉ chứa các khoản **cộng tay** (điều chỉnh): **khi tháng (theo múi giờ shop) của một shop được kết sổ, Affiliate fee và Referral bonus kiếm trong tháng đó được ghi một lần thành khoản cộng của ví** (một dòng cho mỗi tài khoản × nguồn × tiền tệ × shop × tháng, kèm `organization_id` và `month`), từ đó không đổi nữa (FR-CUST-02, FR-CUST-03, D23). Audit `withdrawal.request`. Chưa có email báo kết quả cho customer.
**FR-MAIL-01 – Email (Must)**

| Event | Người nhận | Ngôn ngữ |
|---|---|---|
| Xác minh email, reset password | Shop owner | Ngôn ngữ UI của user (mặc định EN) |
| Shop được duyệt / bị từ chối / bị khóa | Shop owner | Như trên |
| `booking.confirmed` | Khách | Cả 6 ngôn ngữ trong cùng một email (xem bên dưới) |
| `booking.created` (thông báo booking mới; chưa xác nhận cho đến khi khách bấm link) | Email liên hệ của shop (`contact_email`) | Cả 6 ngôn ngữ trong cùng một email |
| `booking.created_by_shop` (walk-in / phone có email; thông tin, không cần xác nhận) | Khách | Cả 6 ngôn ngữ trong cùng một email |
| `booking.cancelled` (shop hủy: báo khách kèm lý do; khách tự hủy: xác nhận cho khách) | Khách | Cả 6 ngôn ngữ trong cùng một email |
| `booking.cancelled_by_guest` (khách tự hủy) | Email liên hệ của shop | Cả 6 ngôn ngữ trong cùng một email |
| `booking.rescheduled`, `session.closed` | Khách | Cả 6 ngôn ngữ trong cùng một email |
| `booking.paid` (shop xác nhận đã thanh toán; biên nhận) | Khách (nếu có email; khách walk-in không có email thì bỏ qua) | Cả 6 ngôn ngữ trong cùng một email |
| Nhắc lịch 24 giờ trước (Should) | Khách | Locale của khách |

- **Email gửi khách chứa cùng một nội dung bằng 6 ngôn ngữ, nối tiếp nhau: tiếng Anh, tiếng Việt, tiếng Thái, tiếng Trung, tiếng Hàn, tiếng Nhật.** Người đọc cuộn email để đọc phần ngôn ngữ của mình (đầu email có dòng giới thiệu sáu ngôn ngữ và các link nhảy tới từng phần). **Hệ thống không phát hiện quốc gia hay ngôn ngữ của khách** (không dùng quốc gia, ngôn ngữ trình duyệt hay ngôn ngữ đã lưu), nên mọi khách nhận cùng một email. Tiêu đề email gồm 6 tiêu đề ngăn bằng " | ". Ngày giờ và tiền được viết theo từng ngôn ngữ (tiếng Thái dùng năm dương lịch). Lý do đóng / đổi lịch do hệ thống định sẵn được dịch ra cả 6 ngôn ngữ; ô giải thích của lý do Other là chữ shop owner nhập nên giữ nguyên. Mọi giá trị chèn vào HTML đều được escape. (MVP frontend: `lib/email/templates.ts` là các hàm thuần, outbox mock lưu `subject`, `text`, `html`; trang xác nhận booking có link "view the email that was sent" mở `GET /api/v1/outbox/{id}`, chỉ có ở môi trường dev.)
- *Triển khai thật (13/11/2026, `apps/api`):* các renderer email về booking (xác nhận, booking do shop tạo, hủy, thông báo cho shop khi có booking mới hoặc khách hủy, đã nhận thanh toán, đóng / dời session) **chuyển từ `apps/web/src/lib/email` sang `packages/shared/src/booking-emails.ts`** để mock và backend dùng chung một bản; worker gửi đúng email 6 ngôn ngữ (en, vi, th, zh, ko, ja), tiêu đề gồm 6 tiêu đề ngăn bằng " | ", có mục lục nhảy tới từng ngôn ngữ, ngày giờ và tiền viết theo từng ngôn ngữ, lý do đóng / dời của hệ thống được dịch, chữ shop nhập giữ nguyên và được escape; email xác nhận và email booking do shop tạo có thêm **chính sách đến trễ (BR-09) bằng 6 ngôn ngữ**. Ngôn ngữ khách chọn ở form đặt chỗ vẫn được lưu trên booking (`bookings.locale`) nhưng **không chọn ngôn ngữ email**. Email về **tài khoản** (xác minh email, quên / đặt lại mật khẩu, đã đổi mật khẩu, tài khoản đã tồn tại, thông báo admin sửa hộ cho shop owner, lời chào của email do admin soạn) dùng **ngôn ngữ UI của người nhận** (`users.ui_locale`; đăng ký nhận `locale` tùy chọn `en | vi | ko | ja | zh`, mặc định `en`; ngôn ngữ khác `422 fields.locale = invalid`) với đủ 5 ngôn ngữ nền tảng trong `apps/api/src/email/messages.ts`; mã OTP của form đặt chỗ nhận `locale` tùy chọn (mặc định là ngôn ngữ mặc định của shop). Nội dung do admin soạn không được dịch. *Chưa làm:* email nhắc lịch 24 giờ, file `.ics`, email reset mật khẩu kèm mật khẩu tạm của admin (mock có, backend dùng link dùng một lần), Reply-To và tên shop ở From.
- Email gửi khách phải có: booking code, workshop, ngày giờ + timezone, địa chỉ, link bản đồ, tổng tiền "pay at studio", chính sách đến trễ (Mục 6, BR-09), liên hệ shop. Should: đính kèm file `.ics`.
- Gửi qua **outbox + worker**; không gửi trong request handler. Retry tối đa 5 lần (backoff lũy thừa); lỗi cuối cùng ghi log + `outbox_events.status = FAILED`.
- From: `"{Shop name} via {Platform}" <bookings@{PLATFORM_DOMAIN}>`, `Reply-To`: email của shop. Cấu hình SPF/DKIM/DMARC cho `{PLATFORM_DOMAIN}`.

### 5.8 Platform admin

**FR-ADM-01 – Danh sách shop (Must)**
- Lọc theo status; xem chi tiết (owner, ngày tạo, số workshop, số booking 30 ngày, link landing page).

**FR-ADM-02 – Duyệt shop (đã bỏ)**
- Chức năng hàng đợi duyệt (Review queue, `/systemadmin/reviews`), Approve / Reject đã **bỏ**: shop owner publish landing page thì public ngay (FR-SITE-04). Trạng thái `PENDING_REVIEW` không còn; admin vẫn kiểm soát qua khóa shop (FR-ADM-03) và xử lý báo cáo vi phạm (FR-ADM-04).

**FR-ADM-03 – Khóa / mở khóa shop (Must)**
- `ACTIVE ↔ SUSPENDED`, bắt buộc lý do. Shop bị khóa: landing page trả 404, dashboard chỉ đọc + banner thông báo, không nhận booking mới. Booking đã có vẫn giữ.

**FR-ADM-04 – Quản lý báo cáo vi phạm / Report management (Should)**
- Form public "Report this site": lý do (scam, phishing, nội dung không phù hợp, khác), mô tả (10–2000 ký tự), email (tùy chọn), Turnstile. Link ở footer của **mọi template** mở form dạng **popup** (dialog) ngay trên landing page; không có JS thì link dẫn tới trang `/report` có cùng form. Trong preview của builder, popup mở được nhưng không gửi báo cáo.
- Backend giới hạn 5 báo cáo được nhận / giờ / client (429 + `Retry-After`). Shop không tồn tại hoặc không `ACTIVE` trả 404.
- Trang admin `/systemadmin/reports` ("Report management"): thẻ tổng hợp theo trạng thái (cũng là bộ lọc), tìm kiếm (mô tả, email, shop), lọc theo lý do / shop, sắp xếp mới nhất / cũ nhất, xem chi tiết, **Resolve** hoặc **Dismiss** (ghi chú tùy chọn, ≤ 500 ký tự). Danh sách tự làm mới. Nội dung do khách nhập chỉ hiển thị dạng text thuần. Xử lý (`OPEN → RESOLVED | DISMISSED`) chỉ áp dụng cho báo cáo đang `OPEN`, báo cáo đã xử lý trả 409.
- API (mock trong frontend, hợp đồng theo backend thật): `POST /public/sites/{slug}/reports`; `GET /admin/reports`, `PATCH /admin/reports/{id}` (chỉ `SUPER_ADMIN`; mock hiện chưa kiểm tra quyền).
- Ngoài phạm vi hiện tại: shop owner xem báo cáo về shop của mình; thông báo email cho admin.
- *Triển khai thật (13/11/2026, `apps/api`):* `POST /public/sites/{slug}/reports` `{reason, description, email?, turnstileToken?}` → `201 {id}` (`422` với `fields`: `reason`, `description` = `descriptionShort | tooLong`, `email`; `429` 5 báo cáo / giờ / client; shop không tồn tại hoặc không `ACTIVE` là cùng một `404`; audit `report.submit` **không ghi mô tả**). `GET /admin/reports?status=&reason=&shop=&q=&sort=newest|oldest` (kèm `counts` của mọi trạng thái, không đổi theo bộ lọc, và `shops`), `PATCH /admin/reports/{id}` `{status: RESOLVED | DISMISSED, note?}` (ghi chú ≤ 500; báo cáo không còn `OPEN` trả `409 INVALID_TRANSITION`; audit `report.resolve` / `report.dismiss` kèm shop). Chỉ `SUPER_ADMIN`.

**FR-ADM-05 – Audit log (Must)**
- Audit log **ghi lại hành động của mọi người dùng** trên hệ thống để theo dõi (tracking) và truy vết khi cần hỗ trợ: **Customer**, **Shop Owner**, **khách chưa đăng nhập (Guest)**, **System Admin** và **hệ thống** (tác vụ tự động, ví dụ tự đóng session hết giờ). Chỉ ghi, không sửa, không xóa; chỉ `SUPER_ADMIN` xem. Shop owner xem audit log của shop mình (Should).
- Mỗi dòng gồm: **ai** (tên, **email**, vai trò `CUSTOMER | SHOP_OWNER | GUEST | SYSTEM_ADMIN | SYSTEM`), **làm gì** (`action`, ví dụ `booking.create`), trên **bản ghi nào** (`entity_type`, `entity_id`), thuộc **Organization (shop)** nào, **email người bị tác động** (khi admin sửa / reset / khóa tài khoản của ai đó), **chi tiết ngắn** (≤ 200 ký tự) và **thời điểm**. **Không bao giờ ghi bí mật**: mật khẩu, token, link có bí mật, số thẻ.
- Các hành động được ghi:
  - **Customer:** đăng nhập (thành công / thất bại), hoàn tất đặt lại mật khẩu, đăng ký tài khoản, sửa hồ sơ, check-in, đăng ký affiliate, yêu cầu rút tiền.
  - **Guest:** tạo booking, xác nhận booking, hủy booking, gửi báo cáo vi phạm.
  - **Shop Owner:** đăng nhập, tạo booking thủ công, đổi trạng thái booking (check-in, hủy bởi shop), đánh dấu đã thanh toán, đổi trạng thái workshop (Activate / Deactivate), đóng / dời session, tạo / sửa / tạm dừng / tiếp tục / xóa promotion, tải ảnh lên, **publish landing page** (`shop.publish`).
  - **System Admin:** đổi trạng thái / sửa / reset mật khẩu tài khoản, khóa / mở khóa shop, bật / tắt hiển thị shop, đổi tỉ lệ phí, đóng session, xử lý landing page, xử lý báo cáo vi phạm, duyệt / từ chối yêu cầu rút tiền.
  - **Hệ thống:** tự đóng session hết giờ (`session.auto_close`).
- Trang `/systemadmin/audit-logs`: **tìm theo email của người dùng** (khớp email người thực hiện **hoặc** email người bị tác động; không phân biệt hoa thường, khớp một phần) và **tìm theo Organization** (tên, slug hoặc id của shop); có thêm lọc theo vai trò, hành động, loại bản ghi và khoảng ngày; mới nhất ở trên; xem chi tiết một dòng. API: `GET /admin/directory/audit-logs?email=&org=&role=&action=&entity=&from=&to=`.
- Ghi chú mock: chưa có session thật nên người thực hiện ở các route của shop owner là chủ shop demo, route của customer lấy theo id trong đường dẫn, route public chỉ biết email khách nhập. Builder lưu bản nháp ở trình duyệt nên chỉ thao tác **publish** của landing page được ghi vào audit log. TODO(api): người thực hiện lấy từ session, kèm IP, ghi trong cùng transaction.

**FR-ADM-06 – Template (đã bỏ)**
- Template định nghĩa trong code (`packages/shared`). **Đã bỏ chức năng admin bật/tắt template**: mọi shop dùng chung danh sách template; không có màn hình quản lý template trong khu admin.

**FR-ADM-07 – Thông tin liên hệ hỗ trợ của nền tảng (Should)**
- Admin cấu hình các kênh hỗ trợ của nền tảng: **WhatsApp, Phone, Zalo, Email** (giá trị toàn nền tảng, không theo shop; lưu trong `platform_settings`).
- Đây là kênh để **shop owner liên hệ admin hệ thống khi cần hỗ trợ**. Hoàn toàn **không liên quan đến thông tin liên hệ của shop** (`contact_email`, `contact_phone`, `whatsapp` của organization, section `contact`) và **không bao giờ hiển thị trên landing page của shop** hay bất kỳ trang public nào; chỉ hiển thị trong khu vực `/shopowner` **và khu vực `/customer`** (khách hàng cũng liên hệ được đội ngũ nền tảng).
- **Customer** thấy cùng các kênh này trong khối **"Need help?" ở cuối menu bên trái của khu vực `/customer`** (dưới các mục My Profile, Today, My Booking, Favorites, Workshops, Affiliate, Referrals; trên màn hình nhỏ khối nằm dưới thanh menu); liên kết dựng và kiểm tra bằng cùng hàm như phía shop owner, chỉ hiện kênh đã nhập, text i18n đủ 5 ngôn ngữ.
- **Menu trái của shop owner có nút Log out** (dưới các mục menu, trên khối hỗ trợ), ngoài mục Log out trong menu tài khoản ở thanh trên.
- Shop owner thấy các kênh này trong khung **Publish** của trình dựng trang ("Need help?") và ở **cuối menu bên trái, dưới mục Settings** (cùng dữ liệu, dạng cột hẹp không có đoạn mô tả), ở mọi trạng thái shop. Chỉ hiển thị kênh đã nhập; liên kết được dựng ở phía ứng dụng sau khi kiểm tra định dạng (`wa.me`, `tel:`, `zalo.me`, `mailto:`), giá trị sai bị bỏ qua.
- **Trang admin `/systemadmin/support-contact` ("Support contact" trong menu):** form 4 ô WhatsApp, Phone, Zalo, Email; để trống một ô thì kênh đó bị ẩn (không còn kênh nào thì khối "Need help?" ẩn). Giá trị được `trim()` (BR-16); nút Save chỉ bật khi có thay đổi (BR-17). Kiểm tra: số điện thoại gồm 7 đến 15 chữ số (chỉ số, khoảng trắng, `+ ( ) . -`), email hợp lệ; sai thì báo lỗi ngay dưới ô và không lưu gì. Có khung xem trước các kênh đang hiển thị. Lưu xong, shop owner và customer thấy ngay (cùng hàm dựng liên kết ở trên).
- API: `GET /admin/support-contact` và `PUT /admin/support-contact` `{whatsapp, phone, zalo, email}` (chuỗi rỗng = xóa kênh; `422` kèm `fields` khi sai; chỉ `SUPER_ADMIN`, mock chưa kiểm tra quyền). Mỗi lần đổi ghi audit `platform.support_contact_update` với danh sách kênh đã đổi (không ghi giá trị).
- Mock: dữ liệu khởi đầu và kho lưu trong bộ nhớ tại `apps/web/src/lib/mock/platform.ts`. TODO(api): bảng `platform_settings`.
- *Triển khai thật (13/11/2026, `apps/api`):* `GET` / `PUT /admin/support-contact` (bảng `platform_settings`; sai thì `422 fields.{whatsapp|phone|zalo|email} = invalid`; audit `platform.support_contact_update` chỉ ghi **tên các kênh đã đổi**, không ghi giá trị) và `GET /support-contact` cho người **đã đăng nhập** (shop owner, customer; khách vãng lai `401`: không bao giờ hiện ở trang public).


**Khu vực quản trị `/systemadmin` (FR-ADM-08 đến FR-ADM-26).** Mỗi danh mục là một trang riêng trong menu bên trái; mọi danh sách có ô tìm kiếm (không phân biệt hoa thường và dấu), phân trang 10/20/50 dòng và xem chi tiết. Chỉ en + vi. Các hành động của admin (sửa, đổi trạng thái, reset mật khẩu, đóng/mở session, đổi phí, sửa landing page) được ghi vào audit log (FR-ADM-05) với actor "Platform Admin", không bao giờ ghi mật khẩu hay token. MVP frontend: API mock trong Next (`/api/v1/admin/*`), chưa kiểm tra quyền; backend thật chỉ cho `SUPER_ADMIN`.

**Website công khai của nền tảng (Home, About Us, Contact).** Ba trang giới thiệu nền tảng ở host chính, dùng chung thanh trên tối (tên nền tảng, Home / About Us / Contact, chọn ngôn ngữ, Log in, Sign up; điện thoại gom vào nút 3 sọc) và chân trang (Explore, Account, Legal). Phong cách hero tối có ánh sáng xanh lam / tím và nền sao, tiêu đề lớn với từ khóa màu xanh có gạch chân và phần còn lại chữ nghiêng nhạt, nút CTA tròn xanh nhạt; Privacy và Terms giữ bố cục đơn giản cũ.
- **Home** (`/`): hero (tiêu đề "Turn Your Workshops into Full Classrooms", CTA **Create your shop** → `/signup`, nút xem cách hoạt động), ba số liệu thật của sản phẩm (5 ngôn ngữ, 0 session bị đặt quá chỗ, trang đặt chỗ 24/7), **Vì sao chọn nền tảng** (6 lợi ích cho shop: trang tự bán, booking không bao giờ vượt chỗ, đa ngôn ngữ, theo dõi thanh toán, khách quay lại, tăng trưởng qua affiliate / referral), **Cách hoạt động** (3 bước, publish không cần duyệt), **Dành cho khách** (đặt chỗ nhanh, trang Today, workshop theo danh mục yêu thích và luân phiên công bằng giữa các shop, thưởng khi chia sẻ), **FAQ** (5 câu, dạng `details`), dải CTA cuối trang.
- **Mục Workshops của trang Home** (`#workshops`, cũng có liên kết **Workshops** trên thanh trên và chân trang): hiển thị **10 workshop ngẫu nhiên** từ các shop mà nền tảng đang liệt kê (shop `ACTIVE` được admin chọn `showOnCustomerPage`; chỉ workshop `ACTIVE`, không có bản nháp), mỗi lần tải trang là một lượt chọn mới (Fisher-Yates; ít hơn 10 thì hiện tất cả). Mỗi thẻ: **ảnh đại diện của workshop trong khối hình tròn** (viền gradient xanh lam / tím, phát sáng nhẹ, phóng to khi rê chuột; không có ảnh thì hiện biểu tượng), tên workshop theo ngôn ngữ đang xem (không có thì theo ngôn ngữ của shop), tên shop, giá mỗi khách, thời lượng, điểm đánh giá nếu có; bấm thẻ mở landing page của shop. Lưới 2 cột trên điện thoại, 3 cột ở màn hình vừa, 5 cột ở màn hình lớn (2 hàng). Hàm chọn `pickRandom` / `featuredWorkshops` ở `apps/web/src/lib/mock/showcase.ts` (có test). TODO(api): `GET /public/workshops/featured?limit=10`, cache ngắn.
- **Tối ưu cho điện thoại:** mọi phần tử bấm được cao tối thiểu 40–44px (logo, nút ngôn ngữ, nút 3 sọc 44px, mục menu 48px, liên kết chân trang, toàn bộ dòng câu hỏi FAQ); nút CTA của hero và dải CTA rộng hết chiều ngang; menu mở ra có Log in / Sign up chia đôi hàng; chân trang 2 cột; không có cuộn ngang (kiểm tra ở 390px); tiêu đề hero có line-height chặt (1.1) để không rời rạc khi xuống dòng.
- **About Us** (`/about`): hero, sứ mệnh, 4 giá trị (tôn trọng nghề, tin cậy, đơn giản, công bằng với mọi shop), 3 điểm khác biệt, CTA.
- **Contact** (`/contact`): form tên, email, chủ đề (câu hỏi chung / xem hướng dẫn / cần hỗ trợ tài khoản / hợp tác hoặc báo chí) và nội dung (10–2000 ký tự); mọi chuỗi được `trim()` (BR-16); báo lỗi ngay dưới từng ô; gửi xong hiện lời cảm ơn kèm email. Khung bên cạnh hướng dẫn shop owner dùng khối "Need help?" trong dashboard và khách liên hệ thẳng studio. **Không hiển thị thông tin liên hệ hỗ trợ của nền tảng (FR-ADM-07) trên trang công khai.** API `POST /public/contact` `{name, email, topic, message, website?}`: `201 {id}`, `422` kèm `fields` (`required | invalid | tooShort | tooLong`), `429 RATE_LIMITED` + `Retry-After` (tối đa 5 tin / giờ / client; chỉ tin được nhận mới tính), `413` khi quá lớn; ô ẩn `website` là bẫy robot (trả 201 và bỏ tin). Audit ghi `contact.submit` (người gửi, chủ đề, **không ghi nội dung**). Mock lưu trong bộ nhớ; tin được quản lý ở Support inbox của admin (FR-ADM-21); TODO(api): bảng `contact_messages`, email cho đội nền tảng, Turnstile.
- **Nội dung** viết thật, không bịa số liệu, tên khách hàng hay cam kết thương mại; chỉ nêu những gì sản phẩm làm được. Text i18n đủ 5 ngôn ngữ (`marketing.json`), tiêu đề hero dùng thẻ `<hl>` / `<em>`; tiêu đề và mô tả SEO có trong `marketing.meta`.

**Bố cục khu admin tối ưu cho PC.** Menu trái rộng 256–288px, cố định theo chiều cao màn hình, cuộn riêng, chia 3 nhóm có tiêu đề (**Vận hành**: Shops, Users, Customers, Workshops, Sessions, Bookings, Landing pages; **Tài chính**: Income, Withdrawals, Config fees, Affiliate, Referrals; **Nền tảng**: Report management, Support contact, Audit logs); ngôn ngữ ở trên, Log out ghim ở cuối. Vùng nội dung rộng tối đa 1600px, thanh tìm kiếm / lọc nằm trong một khung riêng, bảng có tiêu đề in hoa nhỏ nền nhạt và hàng gọn hơn trên màn hình lớn. Trên điện thoại menu vẫn là một hàng cuộn ngang, không có tiêu đề nhóm.

**FR-ADM-08 – Người dùng (Must)** (`/systemadmin/users`)
- Danh sách mọi tài khoản: **shop owner** (email của chủ shop) và **customer** có tài khoản, có cột **Loại tài khoản** (Customer / Shop owner), lọc theo loại và trạng thái; tìm theo tên, email, số điện thoại, id hoặc tên shop.
- Xem chi tiết; **Edit** chỉ sửa tên và số điện thoại (không sửa email và loại; BR-16 trim, BR-17 Save chỉ bật khi có thay đổi); **Activate / Deactivate** (tài khoản deactivated không đăng nhập và không dùng được khu vực của mình); **Reset Password**: tài khoản bị deactivate, người dùng nhận email (6 ngôn ngữ) có mật khẩu tạm thời và link; mở link, nhập mật khẩu tạm thời + mật khẩu mới + xác nhận để active lại (chi tiết ở 5.1).
- API: `GET /admin/directory/users`, `GET/PATCH /admin/users/{id}`, `POST /admin/users/{id}/status`, `POST /admin/users/{id}/reset-password`.

**FR-ADM-09 – Shop (Must, mở rộng FR-ADM-01 và FR-ADM-03)** (`/systemadmin/organizations`)
- **Sửa thông tin shop (admin):** nút **Edit** trên mỗi shop mở form: tên, email và điện thoại liên hệ, WhatsApp (tùy chọn), địa chỉ, Google Maps URL (https), quốc gia, múi giờ, tiền tệ, ngôn ngữ mặc định và các ngôn ngữ bật, **tên miền riêng**. **Slug không sửa được, kể cả admin (BR-21)** (ô chỉ đọc). Quy tắc: `trim()` (BR-16), Save chỉ bật khi có thay đổi (BR-17), múi giờ phải là IANA hợp lệ, tiền tệ phải là mã ISO có thật, ngôn ngữ mặc định phải nằm trong các ngôn ngữ bật; đổi múi giờ / tiền tệ khi shop đã có booking thì hiện cảnh báo và **không chuyển đổi dữ liệu cũ**. Thay đổi hiện ngay ở landing page công khai, trang Settings của shop và các danh sách admin. API `PATCH /admin/organizations/{id}` (`422` kèm `fields`, `409 DOMAIN_TAKEN`, `404`). Audit `shop.profile_update` (chỉ tên các trường đã đổi, không ghi giá trị) và `shop.domain_set` / `shop.domain_remove` (`cũ -> mới`).
- **Tên miền riêng trong quản lý shop:** danh sách Shops có cột **Own domain**, chi tiết shop hiện tên miền và liên kết landing page dùng tên miền đó (cũng áp dụng ở danh sách Landing pages). Admin **gắn, sửa hoặc gỡ** tên miền trong form Edit (khi có tranh chấp hoặc vi phạm); một tên miền chỉ thuộc một shop (`409`); trống = gỡ. Quy tắc kiểm tra như FR-ORG-02.
- Tìm theo tên (hoặc slug) shop **và email của shop owner**, lọc theo status; xem chi tiết; **Activate / Deactivate** (`SUSPENDED` ↔ `ACTIVE`, deactivate bắt buộc lý do; shop `DRAFT` lên `ACTIVE` khi chủ shop publish landing page, admin không kích hoạt thay); bật/tắt hiển thị workshops của shop trên trang Workshops của customer (`show_on_customer_page`).
- Trạng thái shop do admin đổi được lưu ở mock backend: danh sách của khách (Workshops, Favorites) đọc theo trạng thái này.
- *Triển khai thật (13/11/2026, `apps/api`):* `PATCH /admin/organizations/{id}` (chỉ `SUPER_ADMIN`) nhận cùng các trường và quy tắc như `PATCH /organization`, thêm `customDomain` (làm sạch, `409 DOMAIN_TAKEN`, trống = gỡ, vẫn phải xác minh DNS) và `reason` tùy chọn (≤ 300). **Slug không đổi được** (bị bỏ qua). Khi admin sửa, **chủ shop nhận email** nêu các trường đã đổi (không nêu giá trị mới) và lý do (D14, D15); chủ shop tự sửa thì không có email; audit `shop.profile_update` kèm `by: ADMIN`. `POST /admin/organizations/{id}/visibility` `{showOnCustomerPage}` xem FR-CUST-01. **Chưa làm:** sửa hộ landing page, workshop và session với lý do bắt buộc (D15), mở lại session không giới hạn.

**FR-ADM-10 – Workshops (Should)** (`/systemadmin/workshops`): workshops của mọi shop; tìm theo tên workshop (mọi ngôn ngữ) hoặc tên shop; xem chi tiết (giá, thời lượng, sức chứa, địa chỉ, đánh giá, số session và booking). **Edit** mở trang Workshops của shop **ngay trong khu admin** tại `/systemadmin/shops/{slug}/workshops`: bản sao giao diện và chức năng của trang Workshops của shop owner (thêm, sửa, Activate / Deactivate...), có banner admin và nút quay lại; thao tác được ghi audit là do System Admin. *Giới hạn MVP:* chỉ shop demo có dữ liệu để sửa nên chỉ dòng của shop đó có nút Edit.
*Triển khai thật (13/11/2026, `apps/api`):* `GET /admin/directory/workshops?q=&status=&limit=&cursor=` (tên workshop ở mọi ngôn ngữ hoặc tên shop; mỗi workshop kèm giá, thời lượng, sức chứa, địa chỉ, `rating {average, count}`, số session và số booking). Đổi trạng thái hộ (nháp, công bố, lưu trữ): `POST /admin/shops/{shopId}/workshops/{id}/status` `{status, reason}` theo D15 (xem FR-ADM-13).

**FR-ADM-11 – Bookings (Should)** (`/systemadmin/bookings`): tìm theo mã booking, workshop, shop, **email hoặc id người dùng** (id customer, trùng id tài khoản khi có); lọc theo **ngày đặt booking** (ngày tạo booking theo múi giờ shop, gồm cả hai đầu; ngày đầu sau ngày cuối bị từ chối); xem chi tiết (khách, session, giá, giảm giá, thanh toán, check-in). *Giả định:* "ngày booking" là ngày khách đặt, không phải ngày diễn ra session.
*Triển khai thật (13/11/2026):* `GET /admin/directory/bookings?q=&from=&to=` (mã booking, workshop, shop, email hoặc tên khách, **id customer hoặc id tài khoản**; `from` / `to` là **ngày tạo booking theo múi giờ của shop**, gồm cả hai đầu; `422 fields.to = beforeFrom`, `fields.from | to = invalid`); mỗi booking kèm khách, session, giá, giảm giá, `paidAmount` (đã thu ròng), check-in và `accountId`.

**FR-ADM-12 – Customers (Should)** (`/systemadmin/customers`): danh sách email đã booking (giống màn hình Customers của shop owner nhưng toàn nền tảng, kèm email chỉ có tài khoản); tìm theo email, tên hoặc **tên shop mà email đã booking**.
*Triển khai thật (13/11/2026):* `GET /admin/directory/customers?q=` mỗi email một dòng (các shop đã booking, số booking, booking đầu và gần nhất, `hasAccount`, `accountId`) cùng các tài khoản chưa từng booking; tìm theo email, tên hoặc tên shop.

**FR-ADM-13 – Sessions (Should)** (`/systemadmin/sessions`): session của mọi shop; tìm theo thông tin session (mã, workshop, ngày YYYY-MM-DD, trạng thái, ghi chú) hoặc tên shop; lọc trạng thái; xem lịch sử; **Close** (bắt buộc lý do, khách đã đặt được báo email) và **Open lại** không bị giới hạn của shop owner (3 lần dời lịch, 4 lần đóng, lần thứ 4 là đóng vĩnh viễn), nên session đã bị owner đóng quá 3 lần mở lại được; bộ lọc "chỉ session đã đóng vĩnh viễn". **Edit** (trên mỗi dòng) mở trang Sessions của shop **ngay trong khu admin** tại `/systemadmin/shops/{slug}/sessions`: bản sao giao diện và chức năng của trang Sessions của shop owner (tạo, sửa, dời lịch, đóng, nhân bản, sức chứa...), có banner admin và nút quay lại; thao tác được ghi audit là do System Admin. *Giới hạn MVP:* mock chỉ có dữ liệu của shop demo nên chỉ dòng của shop đó có nút Edit.
*Triển khai thật (13/11/2026):* `GET /admin/directory/sessions?q=&status=&forGood=` (mã, workshop, ngày `YYYY-MM-DD` theo múi giờ shop, trạng thái, nội dung lịch sử, shop; `forGood=true` chỉ session đã đóng vĩnh viễn, tức đã đóng từ 4 lần; mỗi session kèm `history`). Đóng, mở lại và dời hộ: `POST /admin/shops/{shopId}/sessions/{id}/close | reopen | reschedule` `{reason, newStartsAt?}` theo D15, **không giới hạn số lần mở lại** (giới hạn 4 lần chỉ áp dụng cho shop; mỗi lần đều ghi audit).

**Lý do và thông báo khi admin sửa hộ shop (quyết định D14, D15):** trên mọi trang `/systemadmin/shops/{slug}/...` (landing page, workshops, sessions) có ô **Lý do cho các thay đổi** (bắt buộc, ≤ 300 ký tự). Mock giữ lý do trong cookie `admin_edit_reason` (hết khi rời trang shop) và các route dùng chung với shop owner đọc nó. Không có lý do thì các thao tác ghi (**publish landing page, Activate / Deactivate workshop, đóng và dời session**) bị từ chối `422 ADMIN_REASON_REQUIRED` và không thay đổi gì. Có lý do thì thay đổi được thực hiện, ghi audit (người làm là System Admin, kèm dòng `admin_edit.reason` có lý do) và **gửi email cho chủ shop** (người nhận, thay đổi gì, lý do). Chủ shop tự sửa thì không cần lý do và không nhận email. Khi cả admin và chủ shop cùng sửa, **bản lưu mới nhất thắng** (D14). TODO(api): lý do gửi trong body của endpoint admin, email vào outbox cùng transaction với thay đổi, các thao tác sửa nội dung workshop / session khác khi có backend.

**FR-ADM-14 – Landing pages (Should)** (`/systemadmin/landing-pages`): tìm theo tên shop; **Edit** mở danh sách landing page và trình dựng của shop **ngay trong khu admin** tại `/systemadmin/shops/{slug}/site` (giao diện và chức năng y như trang của shop owner: danh sách, builder, preview, publish), **không chuyển sang `/shopowner`**, vẫn trong khung menu admin; đầu trang có banner "bạn đang sửa {shop} với tư cách admin hệ thống" kèm nút quay lại danh sách. Audit log ghi `landing_page.edit` khi mở và mọi thao tác ghi sau đó (publish, ...) được ghi là do **System Admin** (không phải shop owner). *Giới hạn MVP:* mock chỉ có dữ liệu builder của shop demo, các shop khác hiển thị "chưa có trang để sửa".
*Triển khai thật (13/11/2026):* `GET /admin/directory/landing-pages?q=` mỗi shop kèm các page (`isLive`, `version`, `templateKey`, `publishedAt`), tên miền riêng, `ownDomainVerified` và `liveUrl` (tên miền riêng khi đã xác minh, địa chỉ hệ thống nếu chưa). Chỉ đọc.

**FR-ADM-15 – Affiliate (Should)** (`/systemadmin/affiliate`)
- **Vô hiệu hóa affiliate link (trang `/systemadmin/affiliate`):** cột **Status** và nút **Switch off** (bắt buộc lý do) / **Switch on** cho từng link. Link đã tắt: landing page báo link bị vô hiệu như workshop đã kết thúc, **không tính thêm booking** cho link, customer thấy trạng thái **Deactive**; khoản đã kiếm trước đó giữ nguyên. API `POST /admin/affiliate/{id}` `{disabled, reason?}`; audit `affiliate.disable` / `affiliate.enable`.
- Affiliate (còn gọi referral) là cách thu hút người dùng: customer có tài khoản thấy danh sách workshops, bấm **Register Affiliate** để lấy link (`{shop}.domain/?ref=CODE&book=WORKSHOP_ID`, mỗi cặp tài khoản + workshop một link; chỉ workshop của shop `ACTIVE`; xem FR-CUST-02). API khách: `GET/POST /customer/{id}/referrals`. Trong giao diện, menu admin là **Affiliate** (`/systemadmin/affiliate`) và khoản phí trả cho customer là **Affiliate fee**. Danh sách referral (mời bạn bè) là mục **Referrals** riêng (FR-ADM-18).
- Admin xem danh sách link: tìm theo **email của người đăng ký tài khoản** (hoặc mã, workshop, shop), lọc theo ngày tạo; mỗi link có lượt nhấp, số booking đã thanh toán và phí referral đã tạo ra.
- **Phí referral = tỷ lệ referral của shop × giá booking gốc** (giá gốc = đơn giá × số lượng, trước khuyến mãi; cùng cơ sở tính với phí duy trì và phí dịch vụ). Chỉ booking đã thanh toán và đến từ link mới có phí referral.
- Phía customer: menu **Affiliate** (`/customer/{id}/affiliate`, xem FR-CUST-02). Booking đặt qua link được ghi nhận thật (mã `ref` gửi kèm booking). Ngoài ra, để có số liệu xem thử, mock gán mỗi booking thứ hai của workshop đã được chia sẻ (không phải của chính người chia sẻ) cho link **đã có lượt nhấp** (bỏ khi có backend).
- *Triển khai thật (13/11/2026, `apps/api`, chỉ `SUPER_ADMIN`):* `GET /admin/directory/affiliate?q=&from=&to=&limit=&cursor=` (tìm theo email chủ link, mã, workshop, shop; lọc theo ngày tạo; mỗi link: chủ, workshop, shop, `clicks`, `bookings`, `referralFee`, `status`, `disabled`, `disabledReason`) và `POST /admin/affiliate/{id}` `{disabled, reason?}` (tắt **bắt buộc lý do** `422 fields.reason=required`; trạng thái đã đúng rồi thì `409 STATUS`; audit `affiliate.disable` / `affiliate.enable` kèm shop bị ảnh hưởng). Link bị tắt: không tính booking mới, người truy cập thấy "workshop đã kết thúc", khoản đã kiếm giữ nguyên.

**FR-ADM-16 – Income của nền tảng (Should)** (`/systemadmin/income`): **Income của admin = Maintenance Fee + Service Fee** thu từ booking của từng shop (giá gốc × Maintenance Fee + giá gốc × Service Fee). **Lợi nhuận của hệ thống = Income của admin − Affiliate fee − Referral bonus = (giá gốc × Maintenance Fee + giá gốc × Service Fee) − giá gốc × Affiliate fee (chỉ booking đến từ link affiliate) − Referral bonus (một lần cho mỗi bạn bè được mời, FR-CUST-03)**. Bảng có cột doanh thu của shop (số shop đã nhận từ khách), giá gốc của các booking đã thanh toán, phí duy trì, phí dịch vụ, **Income của admin**, Affiliate fee, **Referral bonus** và lợi nhuận; mọi phí đều tính trên giá gốc theo đúng quy tắc của FR-PAY-02. Lọc theo khoảng ngày thanh toán (múi giờ shop). Tổng theo từng loại tiền (không cộng lẫn tiền tệ).
*Triển khai thật (13/11/2026):* `GET /admin/income` và `GET /admin/income/{shopId}` (FR-ADM-24) đã tính **Affiliate fee** và **Referral bonus** thật: với mỗi khoản thanh toán của booking đến từ link affiliate, Affiliate fee = tỷ lệ × giá gốc (cùng cơ sở với phí duy trì và dịch vụ, reversal ra số âm); khoản thanh toán của booking nhận bonus (booking đầu tiên đã thanh toán của một người bạn) mang Referral bonus. **Lợi nhuận của nền tảng = Income của admin − Affiliate fee − Referral bonus** (`profit`, `platformProfit` của từng tháng); chi tiết shop trả thêm `platform: {affiliateFee, referralBonus, adminIncome, profit}`. **Lợi nhuận và invoice của shop không đổi**: màn hình của shop owner **không có** hai khoản này. Mỗi khoản dùng tỷ lệ có hiệu lực lúc thanh toán (D24), nên số liệu của tháng đã kết không đổi khi đổi tỷ lệ; kết sổ lưu thêm các tỷ lệ đang áp dụng lúc kết (`finance_month_closings.affiliate_bps`, `invite_bonus_bps`, chỉ để tham khảo).

**FR-ADM-17 – Config Fee (Must, mở rộng FR-PAY-02)** (`/systemadmin/fees`): cấu hình **phí duy trì, phí dịch vụ, Affiliate fee (link của workshop) và Referral bonus (mời bạn bè đăng ký)** theo phần trăm (0–100, tối đa 2 số lẻ, nhập được dấu phẩy; duy trì + dịch vụ không quá 100%; lưu bằng basis points). Đặt cho **từng shop** (mỗi dòng có Save, chỉ bật khi có thay đổi) hoặc **bulk action áp dụng cùng tỷ lệ cho tất cả shop** (có xác nhận, tất cả hoặc không gì cả). Mọi tỷ lệ là phần trăm của **giá booking gốc**. Mặc định (giá trị tròn để thử giao diện): 10% / 10% / 10% / 10% (duy trì / dịch vụ / affiliate / referral bonus). Referral bonus là tỷ lệ của shop nơi người bạn thanh toán booking đầu tiên; bulk action áp dụng cả bốn tỷ lệ. Hệ thống không chặn tỷ lệ referral lớn hơn tổng hai phí còn lại (lợi nhuận có thể âm, hiển thị đúng như tính). API: `GET /admin/fees`, `PUT /admin/fees/{id}`, `POST /admin/fees/bulk` (trường `referralBps` là Affiliate fee, `inviteBonusBps` là Referral bonus); form phí theo shop trong chi tiết shop vẫn dùng `PUT /admin/organizations/{id}/finance-settings`.

**FR-ADM-18 – Referrals (Should)** (`/systemadmin/referrals`): danh sách **link referrals** (mỗi customer một link) với số bạn bè đã đăng ký, số bạn có booking đã thanh toán và tổng bonus đã nhận; **tìm theo email của customer (hoặc mã link, hoặc email/tên của một người bạn)**, lọc theo ngày bạn bè đăng ký; chi tiết liệt kê từng người bạn (ngày đăng ký, trạng thái, mã booking và bonus). Bonus do nền tảng chi trả và **trừ vào lợi nhuận của nền tảng** (FR-ADM-16). API: `GET /admin/directory/referrals`; danh sách affiliate chuyển sang `GET /admin/directory/affiliate`.
- **Vô hiệu hóa link giới thiệu (referral) của customer:** mỗi dòng có cột **Status** (On / Off, rê chuột xem lý do) và nút **Switch off** (bắt buộc nhập lý do) / **Switch on**. Link mời đã tắt: bạn bè đăng ký bằng link đó **không được tính** nữa; bạn bè và thưởng đã có trước đó vẫn giữ; customer thấy cảnh báo trong trang Referrals. API `POST /admin/referrals/{accountId}` `{disabled, reason?}`; audit `referral.disable` / `referral.enable`.
- *Triển khai thật (13/11/2026, `apps/api`, chỉ `SUPER_ADMIN`):* `GET /admin/directory/referrals?q=&from=&to=&limit=&cursor=` (mỗi link mời: chủ, mã, `friends`, `paidFriends`, `earned` theo từng đồng tiền, `disabled`, và danh sách bạn kèm trạng thái, bonus, mã booking; tìm theo email chủ, mã, email hoặc tên của một người bạn; ngày lọc theo lúc bạn đăng ký) và `POST /admin/referrals/{accountId}` `{disabled, reason?}` (tắt bắt buộc lý do; `404` nếu tài khoản chưa có link; `409 STATUS`; audit `referral.disable` / `referral.enable`). Bạn đăng ký bằng link đã tắt không được tính; bạn và bonus đã có trước đó giữ nguyên.

**FR-ADM-19 – Withdrawals: xử lý rút tiền của customer (Should)** (`/systemadmin/withdrawals`): danh sách invoice rút tiền của cả hai chương trình, **invoice đang chờ xếp trước**; tìm theo số invoice hoặc email/tên customer, lọc theo trạng thái, chương trình và ngày yêu cầu; ba ô tổng (đang chờ thanh toán, đã thanh toán, số invoice bị từ chối). Với invoice **Pending**: **Mark as paid** (xác nhận đã chuyển tiền) hoặc **Reject** (**bắt buộc lý do**, customer thấy lý do, số tiền quay lại số có thể rút). **Mỗi invoice chỉ xử lý một lần** (`409 NOT_PENDING`). Ghi audit log `withdrawal.pay` / `withdrawal.reject` (không chứa thông tin nhạy cảm). Affiliate fee và Referral bonus đã được trừ vào lợi nhuận khi phát sinh (FR-ADM-16) nên việc thanh toán invoice **không đổi lợi nhuận**. API: `GET /admin/directory/withdrawals`, `POST /admin/withdrawals/{id}` `{action: "pay" | "reject", reason?}`.

*Triển khai thật (12/11/2026, `apps/api`, chỉ `SUPER_ADMIN`):* `GET /admin/directory/withdrawals?q=&status=&source=&from=&to=&limit=&cursor=` (mỗi invoice kèm `bankName`, `bankAccountHolder` và `accountNumber` **đầy đủ** để chuyển khoản, màn hình hiện cột "Chuyển đến" và hộp xác nhận Mark as paid nêu ngân hàng và số tài khoản; invoice đang chờ xếp trước, mới nhất trước; tìm theo số invoice hoặc email / tên customer; `totals` của **toàn bộ** invoice: tiền đang chờ và đã trả theo từng đồng tiền, số invoice bị từ chối) và `POST /admin/withdrawals/{id}` `{action: "pay" | "reject", reason?}` (`reject` bắt buộc lý do `422 fields.reason=required`; mỗi invoice xử lý **một lần**, lần hai `409 NOT_PENDING`, kể cả khi hai admin bấm cùng lúc). Trigger của database giữ invoice đã xử lý nguyên vẹn (không đổi trạng thái, số tiền hay chủ, không xóa). Audit `withdrawal.pay` / `withdrawal.reject` (người thực hiện: admin).

**FR-ADM-20 – Cài đặt nền tảng / Settings (Must)** (`/systemadmin/settings`, nhóm Nền tảng trong menu): giá trị áp dụng cho toàn nền tảng, có hiệu lực ngay, ghi audit `platform.settings_update` (tên giá trị, cũ -> mới).
- **Rút tiền:** số tiền **tối thiểu** và **tối đa** cho một lần rút (đơn vị tiền của nền tảng; **0 = không giới hạn**). Customer thấy giới hạn trong popup Rút tiền, vượt giới hạn bị từ chối (`422`, `fields.amount` = `belowMin | aboveMax`). Tối đa không được nhỏ hơn tối thiểu. Mặc định: không giới hạn.
  - *Triển khai thật (12/11/2026):* theo D12 giới hạn tính **theo từng đồng tiền**: `GET /admin/settings/withdrawal-limits` và `PUT /admin/settings/withdrawal-limits` `{currency, minAmount, maxAmount}` (0 = không giới hạn; `422 fields.maxAmount = belowMin` khi tối đa nhỏ hơn tối thiểu), audit `platform.settings_update`. Các giá trị khác của FR-ADM-20 xem bản triển khai ngày 13/11/2026 bên dưới (`GET` / `PUT /admin/settings`).
- **Link đặt lại mật khẩu (admin gửi):** hiệu lực **24 giờ kể từ lúc gửi** (mặc định, chỉnh được 1 đến 168 giờ). Link dùng một lần; quá hạn thì báo không còn hiệu lực.
- **Form Contact:** **5 tin mỗi giờ** cho một người truy cập (mặc định, chỉnh được 1 đến 100); vượt quá trả `429` kèm `Retry-After`.
- API `GET` / `PUT /admin/settings` (`422` kèm `fields`). Mock lưu trong bộ nhớ (`apps/web/src/lib/mock/app-settings-store.ts`); TODO(api): bảng `platform_settings`.
- *Triển khai thật (13/11/2026, `apps/api`):* `GET` / `PUT /admin/settings` `{resetLinkHours, contactPerHour, contactRetentionMonths?, emailRetentionDays?}` (1 đến 168, 1 đến 100, **số tháng lưu tin Contact 1 đến 120 (mặc định 12)** và **số ngày lưu email đã gửi 7 đến 730 (mặc định 90)**, theo D18; giá trị bỏ trống giữ nguyên; `422 fields.* = range`; có hiệu lực ngay; audit `platform.settings_update` kèm tên, giá trị cũ và mới). Link đặt lại mật khẩu do admin gửi dùng `resetLinkHours` (mặc định 24) thay cho biến môi trường; form Contact dùng `contactPerHour`. Giới hạn rút tiền: xem FR-ADM-19 (`/admin/settings/withdrawal-limits`, theo từng đồng tiền).

**FR-ADM-21 – Hộp thư hỗ trợ / Support inbox (Should)** (`/systemadmin/messages`): quản lý nội dung các tin nhắn gửi từ form **Contact** của website công khai.
- **Lưu trữ (quyết định D18, đề xuất cần pháp chế xác nhận):** tin nhắn Contact lưu **12 tháng** rồi xóa; admin xóa được theo yêu cầu của người gửi; số tháng cấu hình được ở Settings (FR-ADM-20). Backend thật đã có tác vụ xóa định kỳ và xóa theo yêu cầu (xem bản triển khai bên dưới); mock chưa có.
- Danh sách (mới nhất trước): thời điểm nhận, người gửi (tên, email), chủ đề (câu hỏi chung / xem hướng dẫn / hỗ trợ tài khoản / hợp tác hoặc báo chí), trích nội dung, **trạng thái** (`NEW` Mới, `IN_PROGRESS` Đang xử lý, `DONE` Đã xong). Tìm theo tên, email, chủ đề hoặc nội dung; lọc theo trạng thái và chủ đề.
- Mở một tin: đọc đủ nội dung; đổi trạng thái; **ghi chú nội bộ** (≤ 2000 ký tự, chỉ admin thấy, không bao giờ gửi cho người gửi); **trả lời bằng email** ngay trong hộp thoại (gửi qua mục Email hệ thống, tin chuyển sang `DONE`); **xóa hẳn** tin (dữ liệu cá nhân, có xác nhận, không hoàn tác).
- Audit ghi `message.set_status`, `message.set_note`, `message.delete`; **không ghi nội dung tin hay ghi chú**. API `PATCH` / `DELETE /admin/messages/{id}`; danh sách qua `GET /admin/directory/messages`.
- *Chưa làm:* hộp thư gộp yêu cầu của shop owner và customer (hiện chỉ có tin từ form Contact, trường nguồn chưa cần); gửi email báo cho đội nền tảng khi có tin mới; thời hạn lưu tự động. TODO(api): bảng `contact_messages`, Turnstile.
- *Triển khai thật (13/11/2026, `apps/api`):* `POST /public/contact` `{name, email, topic: general | demo | support | partnership, message (10 đến 2000), website?, turnstileToken?}` → `201 {id}` (`422` với `fields`: `required | invalid | tooShort | tooLong`; `429 RATE_LIMITED` theo `contactPerHour`, chỉ tin được nhận mới tính; ô ẩn `website` được trả `201` và bỏ tin; giới hạn thân request chung 1 MB nên tin quá lớn trả `422 tooLong` thay vì `413`; audit `contact.submit` chỉ ghi chủ đề). `GET /admin/directory/messages?q=&status=&topic=` (kèm `counts` theo trạng thái), `PATCH /admin/messages/{id}` `{status?, note?}` (ghi chú ≤ 2000, chỉ admin thấy), `POST /admin/messages/{id}/reply` `{subject?, body}` (gửi email qua Email hệ thống, tin chuyển `DONE`, **không bao giờ gửi ghi chú**), `DELETE /admin/messages/{id}` (`204`, xóa hẳn). Audit `message.set_status`, `message.set_note`, `message.reply`, `message.delete`, **không ghi nội dung tin hay ghi chú**. **Lưu trữ (D18):** tác vụ hằng ngày của worker (`maintenance.purge`) xóa tin Contact và email đã gửi quá hạn lưu; **số tháng / số ngày lưu cấu hình được** ở Settings (`contactRetentionMonths`, `emailRetentionDays`, áp dụng từ lần chạy kế tiếp).

**FR-ADM-22 – Email hệ thống (Should)** (`/systemadmin/emails`): quản lý và gửi email của nền tảng.
- **Phạm vi email hàng loạt (quyết định D16, đề xuất cần pháp chế xác nhận):** email admin gửi chỉ dành cho **thông báo vận hành** (bảo trì, thay đổi điều khoản, thay đổi liên quan tài khoản); **chưa có email marketing**, nên chưa cần ô đồng ý nhận tin và liên kết hủy đăng ký. Dòng đồng ý khi đăng ký phải nói rõ loại thông báo này. Email đã gửi lưu **90 ngày** (D18). Khi muốn gửi marketing phải bổ sung đồng ý riêng và liên kết unsubscribe trong mọi email.
- **Danh sách (outbox):** mọi email hệ thống đã gửi hoặc cố gửi: ngày, người nhận, tiêu đề, loại (xác nhận booking, booking do shop tạo, hủy booking, thông báo cho shop, đã nhận thanh toán, đóng / dời session, đặt lại mật khẩu, do admin soạn), **trạng thái giao** (`SENT` / `FAILED`), số lần thử, lý do lỗi. Tìm theo địa chỉ, tiêu đề, loại; lọc theo loại và trạng thái.
- **Gửi lại** email gửi lỗi (chỉ khi đang `FAILED`, `409 NOT_FAILED` nếu đã tới nơi). Mock không có máy chủ mail: địa chỉ kết thúc `.invalid` hoặc `@fail.example` giả lập gửi lỗi.
- **Soạn email:** gửi tới một địa chỉ, hoặc **thông báo tới mọi shop owner / mọi customer** có tài khoản đang hoạt động (mỗi người một email riêng, tối đa 500, người nhận không thấy địa chỉ của nhau). Tiêu đề 1–200 ký tự, nội dung 1–10000 ký tự, văn bản thuần (dòng trống = đoạn mới, không dùng HTML; ký tự đặc biệt được escape). API `POST /admin/emails` (`422` kèm `fields`).
- **Bảo mật:** nội dung email của hệ thống **không bao giờ hiển thị** vì chứa link bí mật (xác nhận booking) hoặc mật khẩu tạm (reset); admin chỉ thấy ai nhận, khi nào, kết quả. Chỉ email do admin soạn mới đọc được nội dung. Audit `email.send` (đối tượng, số người nhận, số lỗi, tiêu đề; **không ghi nội dung**) và `email.resend`.
- *Triển khai thật (13/11/2026, `apps/api`):* mỗi email ghi `recipient`, `template` và `subject` trên `outbox_events` (không ghi nội dung: gửi xong thì nội dung bị xóa, vì có thể chứa link bí mật; chỉ email do admin soạn giữ nội dung để đọc lại). `GET /admin/directory/emails?q=&type=&status=SENT|FAILED|PENDING` (ngày, người nhận, tiêu đề, loại, trạng thái, số lần thử, lý do lỗi), `GET /admin/emails/{id}` (`content` chỉ có với email do admin soạn, còn lại `null`), `POST /admin/emails/{id}/resend` (chỉ khi `FAILED`, `409 NOT_FAILED`; thử lại từ đầu), `POST /admin/emails` `{audience: ADDRESS | SHOP_OWNERS | CUSTOMERS, address?, subject (1 đến 200, không xuống dòng), body (1 đến 10000)}` → `201 {queued}`: văn bản thuần (escape khi gửi, `<script>` không bao giờ chạy), **mỗi người một email riêng**, tối đa 500 người (`422 fields.audience = tooMany | noRecipients`). Audit `email.send` (đối tượng, số người nhận, tiêu đề) và `email.resend`, **không ghi nội dung**.

**FR-ADM-23 – Nội dung Terms và Privacy (Must)** (`/systemadmin/legal`): admin soạn **Điều khoản dịch vụ** và **Chính sách quyền riêng tư** cho từng ngôn ngữ trong 5 ngôn ngữ (en, vi, ko, ja, zh), thay cho trang "đang chờ pháp chế" (Q6).
- **Phiên bản và đồng ý (quyết định D17, đề xuất cần pháp chế xác nhận; TODO(api)):** mỗi lần sửa có **bản nháp** và bước **công bố** (người có thẩm quyền, ví dụ pháp chế, duyệt trước khi công bố); lưu **lịch sử phiên bản**; lưu **phiên bản mà từng người dùng đã đồng ý** (thời điểm, phiên bản, ngôn ngữ); khi thay đổi lớn, bắt người dùng **đồng ý lại**. Bản mock hiện sửa là có hiệu lực ngay; backend thật đã có đủ các bước (xem bản triển khai bên dưới).
- Hai tab (Terms / Privacy), chọn ngôn ngữ (dấu tích ở ngôn ngữ đã có nội dung), ô soạn văn bản (≤ 50000 ký tự). Định dạng văn bản thuần: dòng trống = đoạn mới, dòng bắt đầu `# ` = tiêu đề, dòng bắt đầu `- ` = mục danh sách; **không dùng HTML**, mọi thứ gõ vào chỉ hiển thị dạng chữ. Nội dung `trim()` (BR-16), Save chỉ bật khi có thay đổi (BR-17); lưu nội dung rỗng thì gỡ ngôn ngữ đó.
- **Phiên bản:** mỗi lần nội dung đổi, số phiên bản của tài liệu tăng 1; hiển thị phiên bản, ngày và người lưu.
- Trang công khai `/terms` và `/privacy` (dùng khung tối của website, nằm trong khung Home / About / Contact) hiển thị nội dung **ngay khi lưu**, kèm "cập nhật lần cuối" và phiên bản. Ngôn ngữ chưa có nội dung hiện **bản tiếng Anh** kèm ghi chú; chưa có gì thì hiện thông báo nội dung sắp có.
- API `GET` / `PUT /admin/legal/{terms|privacy}` `{locale, content}`. Audit `legal.update` (`ngôn ngữ: version N`, không ghi nội dung). Backend thật: xem bản triển khai bên dưới.
- *Triển khai thật (13/11/2026, `apps/api`):* `GET /admin/legal/{terms|privacy}` (mọi ngôn ngữ đã có nội dung kèm `version`, `updatedAt`, `updatedBy`), `PUT` `{locale, content}` (văn bản thuần ≤ 50000 ký tự, trim; nội dung giống bản cũ thì không tăng phiên bản; nội dung rỗng gỡ ngôn ngữ đó; `422 fields.locale = invalid`, `fields.content = tooLong`; audit `legal.update` ghi ngôn ngữ và phiên bản, **không ghi nội dung**). `GET /public/legal/{terms|privacy}?locale=` cho trang `/terms` và `/privacy`: ngôn ngữ chưa có nội dung trả bản tiếng Anh kèm `fallback: true`, chưa có gì thì `available: false`; nội dung trả nguyên văn dạng text (trang chỉ hiển thị dạng chữ, không bao giờ là HTML). Bảng `legal_documents`. **Đã nâng cấp (13/11/2026, D17):** `PUT /admin/legal/{kind}` `{locale, content}` giờ chỉ lưu **bản nháp** của một ngôn ngữ (mỗi ngôn ngữ một nháp, nội dung rỗng bỏ nháp; chưa có hiệu lực); `POST /admin/legal/{kind}/publish` `{locale, major?}` công bố nháp thành phiên bản kế tiếp (`409 NO_DRAFT` khi không có nháp; người công bố được ghi lại để người có thẩm quyền duyệt nháp trước); `major: true` tăng `epoch` của tài liệu nên **mọi người dùng phải đồng ý lại**. `GET /admin/legal/{kind}` trả `documents` (đang hiệu lực), `drafts`, `epoch` và `consents {agreed, activeUsers}`. Lịch sử: `GET /admin/legal/{kind}/versions?locale=`, `GET .../versions/{n}?locale=`, `POST .../versions/{n}/restore` `{locale}` (đưa bản đã công bố về thành nháp mới; `409 NOT_PUBLISHED` với nháp), `DELETE /admin/legal/{kind}/{locale}` (gỡ ngôn ngữ khỏi trang công khai, lịch sử còn nguyên). Bảng `legal_versions`: trigger không cho sửa hay xóa phiên bản đã công bố. Đồng ý: `GET /legal/consent?locale=` (mỗi tài liệu: bản đang hiệu lực, lần đồng ý gần nhất, `mustAccept`) và `POST /legal/consent` `{kinds, locale}` (bảng `legal_consents` chỉ thêm, trigger chặn sửa / xóa; đồng ý lần hai không đổi gì; `409 NOT_PUBLISHED` nếu tài liệu chưa công bố). Audit `legal.draft_save`, `legal.draft_delete`, `legal.publish`, `legal.unpublish`, `legal.restore`, `legal.consent`, **không ghi nội dung**. *Chưa làm:* giao diện `apps/web` gọi các API này và bắt đồng ý lại ở client; ô đồng ý trong form đăng ký.

**FR-ADM-24 – Chi tiết Income của shop (Should)** (nút **Details** ở mỗi shop trong `/systemadmin/income`, mở hộp thoại; bổ sung FR-ADM-16):
- **Kết sổ và Unpaid (quyết định D10, D11; TODO(api)):** cuối mỗi tháng hệ thống **tự động kết sổ** và **khóa dữ liệu tháng đã chốt**: shop không đặt Unpaid hay sửa thanh toán của tháng đã khóa (trả `409`); các điều chỉnh sau đó ghi vào tháng hiện tại. Khoản Unpaid trong tháng chưa khóa vẫn tạo dòng điều chỉnh giảm (reversal). Bản mock hiện chỉ có bảng xem kết sổ, chưa khóa.
- **Kết sổ từng tháng** (tháng theo múi giờ của shop, mới nhất trước): số khoản thanh toán, tiền khách đã trả, phí duy trì, phí dịch vụ, **Invoice (phí) = phí duy trì + phí dịch vụ** (số tiền shop phải thanh toán theo invoice hệ thống gửi), phí affiliate, thưởng referral, lợi nhuận của nền tảng. **Hệ thống kết sổ vào cuối tháng; shop chỉ thanh toán theo invoice do hệ thống gửi. Chức năng gửi invoice sẽ làm sau** (chưa có nút gửi, chưa có trạng thái đã thanh toán invoice).
- **Từng khoản thanh toán** (mới nhất trước, có phân trang): ngày, mã booking, loại (**Payment** / **Reversal**), tiền khách đã trả, giá gốc của booking, phí duy trì, phí dịch vụ, phí affiliate (khi booking đến từ affiliate link), lợi nhuận của dòng. Có lọc khoảng ngày như trang Income. Tổng các dòng và các tháng **khớp** số liệu của trang Income.
- **Không có hoàn tiền**: khoản trả lại không được tính; chỉ có reversal (đã nêu ở FR-PAY-01). API `GET /admin/income/{shopId}?from&to` (`404`, `422`). Mock chỉ có dữ liệu thanh toán của shop demo.

**FR-ADM-25 – Promotions (Should)** (`/systemadmin/promotions`): các **khuyến mãi** của mọi shop; shop owner vẫn tự tạo và quản lý khuyến mãi ở trang Promotions (FR-PROMO-01).
- Danh sách: mã, tên, shop, mức giảm (% hoặc số tiền), thời gian chạy, áp dụng cho (mọi workshop / một số), trạng thái (**Running, Scheduled, Paused, Over**), **số booking đã dùng** và **tổng tiền đã giảm**. Tìm theo mã, tên (mọi ngôn ngữ), shop; lọc trạng thái.
- **Tạm dừng** khuyến mãi vi phạm (bắt buộc lý do): khuyến mãi ngừng được áp dụng ngay; shop owner thấy "tạm dừng bởi nền tảng" kèm lý do và **không tự bật lại được** (`409 HELD_BY_ADMIN`); booking đã dùng khuyến mãi **giữ nguyên mức giảm**. **Bật lại** chỉ admin làm được (khuyến mãi chạy lại nếu trước đó đang chạy và chưa hết hạn). Audit `promotion.pause` / `promotion.resume`. API `POST /admin/promotions/{id}` `{hold, reason?}`.
- *Chưa làm:* admin tạo khuyến mãi toàn nền tảng; sửa nội dung khuyến mãi của shop. Mock chỉ có khuyến mãi của shop demo.
- *Triển khai thật (13/11/2026, `apps/api`, chỉ `SUPER_ADMIN`):* `GET /admin/directory/promotions?q=&status=&limit=&cursor=` (mã, tên, shop, mức giảm, thời gian, áp dụng cho, `status`, `usedBookings` và `discountTotal` tính từ `snapshot.discounts` của các booking không hủy, `heldByAdmin`) và `POST /admin/promotions/{id}` `{hold, reason?}` (tạm dừng bắt buộc lý do `422 fields.reason = required`; `409 ALREADY_HELD` / `NOT_HELD`; **không bị chặn** bởi booking đang dùng; bật lại thì chạy lại nếu trước đó đang chạy, chưa hết hạn và không vi phạm quy tắc miễn phí / quá 5; audit `promotion.pause` / `promotion.resume`).

**FR-ADM-26 – Quản lý hình ảnh theo shop (Should)** (`/systemadmin/media`):
- Danh sách ảnh theo shop: xem trước (thumbnail), shop, dùng cho (khuyến mãi / session / ảnh bìa workshop), ảnh nào đang hiển thị ở đâu (mã khuyến mãi, mã session, tên workshop), **nơi lưu** (**Uploaded file**: file nền tảng giữ, sau này trên **Cloudflare R2**; **From a link**: ảnh trỏ tới bằng địa chỉ), loại file và dung lượng, ngày tải lên. Tìm theo shop hoặc nơi hiển thị; lọc theo mục đích và nơi lưu.
- **Xóa file** đã tải lên khi vi phạm (bắt buộc lý do): file bị xóa hẳn, khuyến mãi đang dùng ảnh đó không còn ảnh; session đang dùng ảnh lưu trong trình duyệt của shop hiện ảnh trống tới khi shop owner chọn ảnh khác. Ảnh hiển thị từ liên kết chỉ xem, không xóa (không phải file của nền tảng). Audit `media.remove` (loại, lý do). API `POST /admin/media/{id}` `{reason}` (`404`, `422`).
- *Chưa làm (TODO(api)):* đối tượng trong R2 và cache CDN thật, thông báo email cho shop khi ảnh bị xóa, quản lý ảnh landing page (hiện nằm trong trình duyệt của shop), dung lượng đã dùng theo shop.

**FR-ADM-27 – Ratings (Should)** (`/systemadmin/ratings`, nhóm Dữ liệu trong menu): các **đánh giá và nhận xét** khách gửi cho workshop (FR-CUST-01, nút Rate this workshop).
- Danh sách: workshop, shop, mã booking, khách (tên, email), số sao, nhận xét (hiển thị dạng text thuần), ngày, trạng thái **Shown / Removed**; tìm theo nhận xét, workshop, shop, mã booking hoặc khách; lọc theo trạng thái và số sao. API `GET /admin/directory/ratings`.
- **Gỡ** đánh giá vi phạm (bắt buộc lý do ≤ 300 ký tự): đánh giá **thôi được tính** vào điểm của workshop và shop owner **không còn thấy**; **Đưa lại** (không cần lý do) khôi phục. Khách không đánh giá lại được booking đó. API `POST /admin/ratings/{id}` `{removed, reason?}` → `200`; `422` thiếu lý do, `404`, `409 ALREADY_REMOVED | NOT_REMOVED`. Audit `rating.remove` / `rating.restore` (mã booking và lý do, **không ghi nhận xét**).
- *Chưa làm (TODO(api)):* thông báo cho khách và shop khi gỡ, báo cáo nhận xét vi phạm từ phía shop.
- *Triển khai thật (13/11/2026, chỉ `SUPER_ADMIN`):* `GET /admin/directory/ratings?q=&status=SHOWN|REMOVED&stars=&limit=&cursor=` và `POST /admin/ratings/{id}` `{removed, reason?}` đúng như trên (`422 fields.reason = required`, `404`, `409 ALREADY_REMOVED | NOT_REMOVED`; audit `rating.remove` / `rating.restore` kèm mã booking và lý do, **không ghi nhận xét**).

---

## 6. Quy tắc nghiệp vụ

| ID | Quy tắc |
|---|---|
| BR-01 | Dữ liệu nghiệp vụ thuộc đúng một organization; không truy cập chéo tenant. |
| BR-02 | Slug shop unique toàn hệ thống, không thuộc danh sách reserved và không bao giờ đổi (BR-21). |
| BR-03 | Không được vượt capacity, kể cả khi có request đồng thời; kiểm tra bằng transaction + row lock. |
| BR-04 | Backend tính giá; không tin giá/discount/status từ client. |
| BR-05 | Booking lưu snapshot: `unit_price_amount`, `quantity`, `total_amount`, `currency`, tên workshop, `starts_at`, timezone. Lịch sử không bị tính lại khi workshop đổi giá. |
| BR-06 | `booking.status` và `payment_status` độc lập; `CONFIRMED` (khách đã bấm link trong email) không có nghĩa là đã trả tiền. |
| BR-07 | Mọi booking chiếm chỗ (`NOT_CONFIRMED`, `CONFIRMED`, `CHECKED_IN`) trừ `CANCELLED`: chuyển sang `CANCELLED` thì giải phóng chỗ; check-in và uncheck-in không đổi chỗ. |
| BR-08 | (đã bỏ) Không còn late release / no-show; booking chỉ có 4 trạng thái `NOT_CONFIRMED`, `CONFIRMED`, `CHECKED_IN`, `CANCELLED`. |
| BR-09 | Thông báo chính sách đến trễ (hiển thị ở booking modal, trang xác nhận, email): *"Please arrive on time for your workshop. If you arrive more than 30 minutes late, your booking may be released and your reserved spot may be offered to walk-in guests. If there are still available spots when you arrive, you may still be able to join."* Cần bản dịch VI/KO/JA/ZH/ZH-TW trong `messages/*.json`. |
| BR-10 | Customer nhận diện bằng `email_normalized` (trim + lowercase) trong một organization; không tự gộp theo tên/phone. **Khách chưa đăng nhập đặt chỗ:** hệ thống tra email; email đã từng booking thì booking được ghi vào customer đó (không tạo customer mới, giữ tên cũ); email đã đăng ký tài khoản thì booking tính vào tài khoản đó. **Khách đăng ký tài khoản mới:** hệ thống tra email đăng ký; nếu email đã từng booking thì customer đó trở thành tài khoản và **toàn bộ booking trước đó của email được gộp vào tài khoản** (số booking được báo cho khách); email chưa từng booking thì tạo customer mới có tài khoản; email đã có tài khoản thì không đăng ký lại (đăng nhập). |
| BR-11 | Khách tự hủy được booking của mình (mã booking + email) cho đến khi session bắt đầu, lý do tùy chọn; shop hủy thì bắt buộc lý do; mọi thao tác đổi lịch do shop thực hiện. Server kiểm tra máy trạng thái của booking: check-in / bỏ check-in chỉ khi session chưa đóng, hủy chỉ từ Not confirmed / Confirmed, booking đã hủy không quay lại trạng thái khác (ghế có thể đã có người đặt). |
| BR-12 | Token (verify, reset) dùng một lần, lưu hash (SHA-256), có hạn. |
| BR-13 | Shop public được ngay khi owner publish landing page lần đầu (đủ checklist); **không có bước admin duyệt**. Admin chỉ khóa shop hoặc xử lý báo cáo khi có vi phạm. |
| BR-14 | Tiền lưu bằng `BIGINT` minor units + `currency`. Số chữ số thập phân lấy theo ISO 4217 (VND = 0, USD = 2, JPY = 0, KRW = 0). Không dùng float. |
| BR-15 | Mọi timestamp lưu `timestamptz` (UTC). Giờ hiển thị và giờ trong schedule rule hiểu theo timezone IANA của shop. |
| BR-16 | **Nhập liệu:** mọi ô nhập văn bản trong hệ thống cho phép người dùng gõ khoảng trắng ở **hai đầu**; khi bấm nút submit, mọi chuỗi được `trim()` rồi mới kiểm tra và lưu (trong builder, "submit" là Publish / Submit for review). Backend cũng trim lại và không tin client. Ngoại lệ: **mật khẩu không bị trim** (khoảng trắng ở hai đầu là một phần của mật khẩu). Khoảng trắng ở giữa chuỗi được giữ nguyên, trừ các trường có quy tắc riêng (mã khuyến mãi, slug không cho khoảng trắng ở giữa). |
| BR-17 | **Nút Save của form thêm / sửa:** nút Save (hoặc Add / Create) của các form thêm / sửa trong khu vực shop owner (khuyến mãi, workshop, session, quy tắc lịch, booking thủ công, trang landing, thu chi, cài đặt shop) bị vô hiệu (disabled) và **chỉ được bật khi dữ liệu trong form khác với lúc mở form**; đưa dữ liệu về giá trị ban đầu thì nút lại bị vô hiệu. Sau khi lưu thành công, dữ liệu vừa lưu là mốc so sánh mới. Các hộp thoại xác nhận (hủy, check-in, ghi nhận thanh toán, đổi lịch) không thuộc quy tắc này. |
| BR-18 | **Đa ngôn ngữ cho text tĩnh:** mọi text và label tĩnh của hệ thống (dashboard, landing page, form đặt chỗ, email, thông báo lỗi...) phải có đủ 5 ngôn ngữ: **tiếng Anh, tiếng Việt, tiếng Hàn, tiếng Nhật và tiếng Trung (giản thể)** trong `messages/<locale>/*.json` (trừ khu vực system admin, xem BR-20), cùng key và cùng tham số ICU. Khi làm form mới hoặc đổi text phải thêm / sửa đủ 5 ngôn ngữ trong cùng một thay đổi; test `messages-parity.test.ts` kiểm tra. **Không áp dụng** cho nội dung động do shop owner tạo (tên workshop, tiêu đề / mô tả khuyến mãi, nội dung trang...). |
| BR-19 | **Căn hàng field:** các field cùng một hàng (bộ lọc, form) phải ngang hàng: nhãn cùng một dòng và ô nhập cùng một dòng, kể cả khi một field có chú thích bên dưới (ví dụ "Giờ hiển thị theo …"). Component field dùng `content-start` để chú thích không làm giãn các field còn lại. |
| BR-20 | **Ngày tháng theo ngôn ngữ hiển thị:** mọi ngày hiển thị (Intl theo ngôn ngữ giao diện) và mọi ô nhập ngày đều theo ngôn ngữ đang chọn, không theo trình duyệt / hệ điều hành: en `MM/DD/YYYY`, vi `DD/MM/YYYY`, ko `YYYY. MM. DD.`, ja và zh `YYYY/MM/DD`. Ô nhập ngày là component `DateInput` (gõ tay hoặc chọn trên lịch; chấp nhận mọi dấu phân cách và 8 chữ số liền; giá trị lưu `YYYY-MM-DD`; ngày ngoài `min` / `max` bị mờ trên lịch, gõ tay thì bị từ chối hoặc form báo lý do). |
| BR-20 | **Khu vực system admin (`/systemadmin`) chỉ có 2 ngôn ngữ: tiếng Anh và tiếng Việt.** Có nút chọn ngôn ngữ (English / Tiếng Việt) trong thanh bên; cookie ngôn ngữ giao diện là ko / ja / zh thì khu vực này dùng tiếng Anh. Khu vực shop owner và landing page vẫn đủ 5 ngôn ngữ; `messages/{ko,ja,zh}/admin.json` không tồn tại và `messages-parity.test.ts` chỉ yêu cầu `admin.json` cho en và vi. API vẫn là `/api/v1/admin/*`. |
| BR-22 | **Phân trang cho mọi danh sách dạng bảng (và danh sách session):** Bookings, Customers (và bảng booking của khách), Workshops, Sessions, Income & expenses (bảng thu chi; các số tổng và biểu đồ vẫn tính trên cả khoảng ngày), Promotions, chi tiết customer và booking, và ở khu vực system admin: Organizations, Sessions của shop, Audit logs, audit của một organization. Mỗi trang **10 dòng mặc định**, chọn được 10 / 20 / 50; thanh phân trang dưới danh sách có "Showing a–b of N", "Rows per page", "Page x of y" và nút Previous / Next; **thanh chỉ hiện khi danh sách có hơn 10 dòng**. Đổi bộ lọc, tìm kiếm, cách sắp xếp hoặc số dòng mỗi trang thì quay về trang 1. Text trong `common.pagination` có đủ 5 ngôn ngữ (BR-18). MVP frontend: cắt trang ở client; TODO(api): endpoint danh sách nhận `page` / `pageSize` (hoặc cursor) và trả `total`. |
| BR-21 | **Slug shop:** do hệ thống tự sinh từ tên shop khi đăng ký (FR-ORG-01), unique toàn hệ thống, **không đổi được trong suốt vòng đời shop, kể cả SUPER_ADMIN**. Địa chỉ khu vực quản lý của shop là `/shopowner/{slug}/*`. |

### 6.1 State machine booking

```
  (khách đặt thành công, qua OTP)
        │
        ▼
  NOT_CONFIRMED ──(khách bấm link trong email)──► CONFIRMED
        │                                            │
        └──────────────(shop check-in)───────────────┤
                                                     ▼
                                              CHECKED_IN ──(shop uncheck-in)──► về trạng thái trước check-in
  NOT_CONFIRMED | CONFIRMED ──(shop hủy, có lý do)──► CANCELLED   [giải phóng chỗ]
```

Chuyển trạng thái hợp lệ (mọi chuyển khác → HTTP 409 `INVALID_TRANSITION`):

| Từ | Sang | Điều kiện |
|---|---|---|
| (tạo) | NOT_CONFIRMED | Khách đặt thành công sau khi nhập đúng OTP; email có link xác nhận gửi cho người đặt |
| NOT_CONFIRMED | CONFIRMED | **Khách bấm link xác nhận** trong email (mở lại link: không đổi gì) |
| NOT_CONFIRMED, CONFIRMED | CHECKED_IN | Shop check-in; session chưa `CLOSED`; lưu trạng thái trước đó |
| CHECKED_IN | NOT_CONFIRMED hoặc CONFIRMED | Shop uncheck-in: về **đúng trạng thái trước khi check-in**; session chưa `CLOSED`; không đổi số chỗ |
| NOT_CONFIRMED, CONFIRMED | CHECKED_IN | Shop đặt booking sang Paid ở popup Confirm payment (cả khi session đã đóng, chưa Completed); lưu trạng thái trước đó |
| CHECKED_IN | NOT_CONFIRMED hoặc CONFIRMED | Shop đặt lại Unpaid: về đúng trạng thái trước check-in (kể cả booking check-in tay) |
| NOT_CONFIRMED, CONFIRMED | CANCELLED | Shop hủy (bắt buộc lý do), hoặc **khách hủy** (lý do tùy chọn) khi session chưa bắt đầu |

Ghi chú: booking `NOT_CONFIRMED` **giữ chỗ cho đến khi session hết thời gian tổ chức** (không tự hủy; shop có thể hủy tay). Booking của khách vắng (không check-in) giữ nguyên `CONFIRMED` / `NOT_CONFIRMED` kể cả sau khi session `COMPLETED` (không có trạng thái no-show).

Implement state machine trong **một chỗ** (`bookings/booking-state.ts`) và có unit test đầy đủ.

### 6.2 State organization

`DRAFT → ACTIVE ↔ SUSPENDED`. `DRAFT → ACTIVE` xảy ra khi owner publish landing page lần đầu (không qua duyệt); `ACTIVE ↔ SUSPENDED` do admin.

### 6.3 State session

`OPEN → RUNNING ↔ PAUSED → CLOSED → COMPLETED` (chi tiết ở mục 5.4). Session mới tạo là `OPEN`; Start đưa sang `RUNNING` (chỉ lúc này khách mới đặt được); `RUNNING` chỉ có thể Pause; `PAUSED` Start lại hoặc Close; session hết giờ tự động `CLOSED`; shop owner đánh dấu `COMPLETED` từ `CLOSED` (trạng thái cuối, không đổi được nữa). Session đóng trước giờ bắt đầu (do shop owner) có thể Re-open về `OPEN`, nhưng Re-open và Completed loại trừ nhau (đã `COMPLETED` thì không mở lại). **Hệ thống không có chức năng hủy session.**

---

## 7. Yêu cầu kỹ thuật quan trọng

### 7.1 Chống overbooking (bắt buộc đúng mẫu này)

```sql
BEGIN;

SELECT id, capacity, reserved_count, status, starts_at
FROM workshop_sessions
WHERE id = :session_id AND organization_id = :org_id
FOR UPDATE;

-- validate: status = 'RUNNING', starts_at > now() + booking_cutoff_minutes của session (với booking online),
--           reserved_count + :qty <= capacity

INSERT INTO bookings (...) VALUES (...);

UPDATE workshop_sessions
SET reserved_count = reserved_count + :qty, updated_at = now()
WHERE id = :session_id AND organization_id = :org_id;

INSERT INTO outbox_events (...) VALUES (...);

COMMIT;
```

- Thêm `CHECK (reserved_count >= 0 AND reserved_count <= capacity)` trên `workshop_sessions` làm lớp bảo vệ cuối.
- Mọi thao tác thay đổi `reserved_count` (tạo, hủy, đổi session) phải đi qua `SessionCapacityService` và dùng mẫu lock trên.
- Job đối soát hằng ngày (Should): so sánh `reserved_count` với tổng quantity của các booking đang chiếm chỗ; lệch thì log cảnh báo.

### 7.2 Idempotency

- `POST /public/sites/{slug}/bookings` và `POST /dashboard/bookings` bắt buộc có header `Idempotency-Key`.
- Lưu `idempotency_key` trên booking, `UNIQUE (organization_id, idempotency_key)`. Gặp lỗi unique violation thì trả về booking đã có.

### 7.3 Outbox

- Ghi `outbox_events` trong cùng transaction với thay đổi nghiệp vụ.
- Worker poll mỗi 5 giây (`SELECT ... FOR UPDATE SKIP LOCKED LIMIT 20`), dispatch sang pg-boss job, đánh dấu `DISPATCHED`.

### 7.4 Plan limits (đã loại bỏ)

**Không có gói thanh toán (FREE / PRO).** Shop không có cột `plan`, không có giới hạn theo gói và không có lỗi `PLAN_LIMIT_REACHED`; mọi shop dùng cùng một bộ giới hạn chung do hệ thống đặt. Nếu sau này cần billing sẽ thiết kế lại (câu hỏi Q3 đã đóng).

### 7.5 Chuẩn API

- REST, JSON, prefix `/api/v1`.
- Lỗi theo dạng:
  ```json
  { "error": { "code": "SESSION_FULL", "message": "Human readable", "details": {} } }
  ```
- Validate body bằng Zod (dùng chung schema từ `packages/shared`), lỗi validate trả 422.
- Phân trang: cursor-based (`?cursor=&limit=`, limit tối đa 100).
- Mutating endpoints của dashboard: kiểm tra header `Origin` khớp `app.{PLATFORM_DOMAIN}` (chống CSRF) ngoài `SameSite=Lax`.

---

## 8. Data model (PostgreSQL)

Quy ước: PK `uuid` (UUIDv7 sinh ở app nếu có, không thì `gen_random_uuid()`); `created_at`, `updated_at` dạng `timestamptz`; tên bảng/cột `snake_case`; enum dùng PostgreSQL enum hoặc `text` + `CHECK`. Viết bằng Drizzle schema trong `apps/api/src/db/schema/`.

### 8.1 Identity và tenant

**users**: `id`, `email` (unique, lowercase), `password_hash`, `full_name`, `status` (`UNVERIFIED|ACTIVE|DISABLED`), `platform_role` (`SUPER_ADMIN` | null), `ui_locale`, `email_verified_at`, `last_login_at`.

**auth_sessions**: `id`, `user_id`, `token_hash` (unique), `active_organization_id` (nullable), `ip`, `user_agent`, `expires_at`, `last_seen_at`.

**user_tokens**: `id`, `user_id`, `type` (`EMAIL_VERIFY|PASSWORD_RESET`), `token_hash` (unique), `expires_at`, `used_at`.

**organizations**: `id`, `name`, `slug` (unique, **bất biến**: trigger / API từ chối mọi cập nhật, kể cả admin), `status` (`DRAFT|ACTIVE|SUSPENDED`), `status_reason`, `country`, `timezone`, `currency`, `default_locale`, `enabled_locales text[]` (`FREE` mặc định), `contact_email`, `contact_phone`, `whatsapp`, `address`, `maps_url`, (mặc định 120), `approved_at`, `approved_by`.

**organization_members**: `organization_id`, `user_id`, `role` (`OWNER`), `status`. PK `(organization_id, user_id)`.

*Ghi chú triển khai (12/11/2026):* schema thật nằm ở `apps/api/src/db/schema/`. So với mô tả trên, bảng `organizations` **không có** `approved_at`, `approved_by` và cột plan (đã bỏ ở bản 2.0: không duyệt shop, không gói trả phí); thêm các ràng buộc `CHECK` (email người dùng viết thường, slug đúng định dạng, ngôn ngữ thuộc 5 ngôn ngữ và ngôn ngữ mặc định phải được bật) và trigger: slug bất biến (BR-21), audit log chỉ ghi thêm (cấm UPDATE, DELETE, TRUNCATE).

### 8.2 Site

**site_pages**: `id`, `organization_id`, `slug` (MVP luôn là `home`), `template_key`, `theme jsonb`, `draft_content jsonb`, `published_content jsonb` (nullable), `version int`, `published_at`, `published_by`. `UNIQUE (organization_id, slug)`.

**site_page_versions**: `id`, `organization_id`, `page_id`, `version`, `content jsonb`, `theme jsonb`, `published_by`, `published_at`. `UNIQUE (page_id, version)`.

Cấu trúc `content` (validate bằng Zod):

```ts
type PageContent = {
  schemaVersion: 1;
  sections: Array<{
    id: string;          // uuid
    type: SectionType;   // 'hero' | 'about' | ...
    enabled: boolean;
    props: unknown;      // validate theo registry[type].schema
  }>;
  seo: { title: Localized; description: Localized };
};
type Localized = Partial<Record<'en' | 'vi' | 'ko' | 'ja' | 'zh', string>>;
```

Khi `schemaVersion` của một section type thay đổi, viết hàm migrate trong registry; không sửa trực tiếp JSON trong DB bằng tay.

### 8.3 Media

**media_assets**: `id`, `organization_id`, `object_key` (unique), `purpose`, `mime`, `size_bytes`, `width`, `height`, `status` (`PENDING|READY|DELETED`), `uploaded_by`.

### 8.4 Workshop và lịch

**workshops**: `id`, `organization_id`, `title jsonb`, `short_description jsonb`, `description jsonb`, `includes jsonb`, `notes jsonb`, `duration_minutes`, `price_amount bigint`, `currency`, `default_capacity`, `max_per_booking`, `cover_media_id`, `gallery_media_ids uuid[]`, `status`, `sort_order`. `UNIQUE (organization_id, id)`.

**schedule_rules**: `id`, `organization_id`, `workshop_id`, `weekdays smallint[]`, `start_times text[]` (`HH:mm`), `effective_from date`, `effective_to date` (nullable), `capacity_override` (nullable), `status` (`ACTIVE|INACTIVE`).

**workshop_sessions**: `id`, `organization_id`, `workshop_id`, `schedule_rule_id` (nullable), `starts_at timestamptz`, `ends_at timestamptz`, `capacity`, `reserved_count` (mặc định 0), `status` (`OPEN|PAUSED|RUNNING|CLOSED|COMPLETED`, mặc định `OPEN`), `auto_closed boolean` (true khi hệ thống tự đóng do hết giờ), `code` (unique theo shop, `SES-0001`…, bất biến), `image_url`, `cloned_from_session_id` (nullable), `session_notes` (lịch sử: loại `CLOSED|RESCHEDULED|REOPENED|AUTO_CLOSED`, thời điểm, lý do; tối đa 3 `RESCHEDULED` và 3 `CLOSED` mỗi session), `booking_cutoff_minutes int` (mặc định 120, 0 đến 10080), `UNIQUE (organization_id, workshop_id, starts_at)`; `CHECK (reserved_count BETWEEN 0 AND capacity)`; index `(organization_id, starts_at, status)`.

### 8.5 Customer, booking, payment

**customers**: `id`, `organization_id`, `email_normalized` (nullable, cho walk-in), `full_name`, `country`, `phone`, `preferred_locale`, `anonymized_at`. Partial unique `(organization_id, email_normalized) WHERE email_normalized IS NOT NULL`.

**bookings**: `id`, `organization_id`, `booking_code` (unique), `session_id`, `workshop_id`, `customer_id`, `source`, `quantity`, `status`, `payment_status`, `unit_price_amount bigint`, `total_amount bigint`, `currency`, `snapshot jsonb` (tên workshop theo locale, starts_at, ends_at, timezone, địa chỉ), `locale`, `special_request`, `idempotency_key`, `cancel_reason`, `checked_in_at`, `checked_in_by`, `status_changed_at`, `status_changed_by`, `created_by` (nullable: null = khách online).
- Composite FK `(organization_id, session_id)` → `workshop_sessions (organization_id, id)`; tương tự cho `customer_id`.
- `UNIQUE (organization_id, idempotency_key)`; index `(organization_id, session_id, status)`, `(organization_id, created_at DESC)`.

**payments**: `id`, `organization_id`, `booking_id`, `type` (`PAYMENT|REVERSAL`: khoản điều chỉnh giảm, không phải hoàn tiền), `amount bigint` (luôn dương), `currency`, `method`, `note`, `recorded_by`, `recorded_at`.

### 8.6 Hệ thống

**audit_logs**: `id`, `organization_id` (nullable cho thao tác platform), `actor_user_id` (nullable cho hệ thống), `action` (ví dụ `booking.late_release`), `entity_type`, `entity_id`, `before jsonb`, `after jsonb`, `ip`, `created_at`. Index `(organization_id, created_at DESC)`. Chỉ insert, không update/delete.

**outbox_events**: `id`, `organization_id`, `type`, `payload jsonb`, `status` (`PENDING|DISPATCHED|FAILED`), `attempts`, `last_error`, `available_at`, `created_at`.

**abuse_reports**: `id`, `organization_id`, `reason`, `description`, `reporter_email`, `status`, `resolved_by`, `resolved_at`.

pg-boss tự tạo schema riêng `pgboss`.

### 8.7 Audit bắt buộc

Ghi audit cho các action: đăng nhập thất bại nhiều lần, tạo/duyệt/từ chối/khóa shop, publish page, tạo/sửa/kích hoạt/ngừng kích hoạt workshop, đổi giá, hủy session, tạo booking thủ công, check-in, late release, no-show, hủy booking, đổi session, ghi nhận payment/refund, xóa/ẩn danh customer.

---

## 9. API endpoints (MVP)

Prefix `/api/v1`. Auth: cookie session. `{org}` lấy từ session (active organization), **không** truyền trên URL.

### 9.1 Auth
| Method | Path | Mô tả |
|---|---|---|
| POST | `/auth/signup` | Đăng ký |
| POST | `/auth/verify-email` | Xác minh email |
| POST | `/auth/login` · `/auth/logout` | |
| POST | `/auth/forgot-password` · `/auth/reset-password` | |
| GET | `/auth/me` | User + danh sách membership |
| POST | `/auth/resend-verification` | Gửi lại email xác minh (luôn 202, không lộ email nào có tài khoản) |
| POST | `/auth/switch-organization` | Đổi active organization (**chưa làm**: mỗi tài khoản một shop) |

*Triển khai thật (12/11/2026, `apps/api`, tiền tố `/api/v1`):*
- `POST /auth/signup` `{type: CUSTOMER|SHOP_OWNER, email, password, confirmPassword, shopName?, turnstileToken?}`: bật `REQUIRE_EMAIL_VERIFICATION` thì luôn `202 {status: CHECK_EMAIL}` (email đã có tài khoản cũng vậy, chủ hộp thư nhận email báo, D3); tắt (dev) thì `201` kèm cookie và `409 EMAIL_TAKEN` khi trùng. Chủ shop tạo shop `DRAFT` với slug sinh từ tên (BR-21) và `OWNER`, trong một transaction cùng audit.
- `POST /auth/login` `{email, password}` → `200 {type, id, email, fullName, uiLocale, organization?}` + cookie `wsp_sid` (`HttpOnly`, `SameSite=Lax`, `Secure` khi https). `401 INVALID_CREDENTIALS` (cùng câu trả lời và cùng thời gian cho email lạ và sai mật khẩu), `403 DEACTIVATED`, `403 EMAIL_NOT_VERIFIED`, `429 RATE_LIMITED` (5 lần sai / 15 phút theo cặp IP + email).
- `POST /auth/logout`, `GET /auth/me`, `POST /auth/verify-email {token}` (`400 TOKEN_INVALID`, token dùng một lần), `POST /auth/forgot-password {email}` (luôn `202`), `POST /auth/reset-password {token, password, confirmPassword}` (đăng xuất mọi thiết bị, gửi email báo đổi mật khẩu).
- `GET /organization` và `GET /audit-logs?limit=&cursor=` (shop của **session**, `403 NO_ORGANIZATION` cho khách, `401` khi chưa đăng nhập). Tenant luôn lấy từ session, không bao giờ từ body, query hay path.
- `GET /health`, `GET /ready` (ngoài tiền tố `/api/v1`).

### 9.2 Dashboard (shop owner)
| Method | Path |
|---|---|
| POST | `/organizations` (onboarding) · GET/PATCH `/organization` |
| GET | `/organization/slug-availability?slug=` |
| GET/PUT | `/site/page` (draft) · POST `/site/page/publish` (mock: `POST /site/publish`, public ngay, không có bước duyệt) |
| GET | `/site/page/versions` · POST `/site/page/rollback/{version}` (Should) |
| POST | `/media/presign-upload` · POST `/media/{id}/complete` · GET `/media` · DELETE `/media/{id}` |
| GET, POST, PUT (không có DELETE: workshop không xóa được) | `/workshops` · POST `/workshops/{id}/status` |
| CRUD | `/workshops/{id}/schedule-rules` |
| GET | `/sessions?from=&to=&workshopId=` · POST `/sessions` · PATCH `/sessions/{id}` · POST `/sessions/{id}/cancel` |
| GET | `/bookings?date=&sessionId=&status=&q=` · GET `/bookings/{id}` · POST `/bookings` (thủ công) |
| POST | `/bookings/{id}/check-in` · `/uncheck-in` · `/cancel` · `/reschedule` |
| POST | `/bookings/{id}/payments` |
| GET | `/customers` · GET `/customers/{id}` |
| GET | `/audit-logs` (Should) |

*Triển khai thật (12/11/2026, `apps/api`, tiền tố `/api/v1`, mọi endpoint dưới đây cần session và shop của session; id của shop khác hay id sai định dạng đều trả `404`; shop `SUSPENDED` chỉ đọc, ghi trả `403 SHOP_SUSPENDED`):*
- **Workshops:** `GET /workshops?q=&status=&limit=&cursor=` (tìm theo tên mọi ngôn ngữ, không phân biệt hoa thường; sắp theo `sort_order`; kèm `sessions: {open, total}`), `POST /workshops` (luôn `DRAFT`, tiền tệ theo shop), `GET /workshops/{id}`, `PUT /workshops/{id}` (chỉ khi `DRAFT`, `409 NOT_EDITABLE`), `POST /workshops/{id}/status {status}` (`409 STATUS`, `409 SESSIONS_OPEN` kèm `details.open`). **Không có DELETE.** Lỗi `422` kèm `details.fields` (ví dụ `title.en: required`, `description.ko: notEnabled`, `priceAmount: priceInvalid`, `categories: categoriesRequired`, `coverUrl: urlInvalid`). Audit `workshop.create|update|activate|deactivate` (giá và trạng thái trước / sau).
- **Sessions:** `GET /sessions?workshopId=&status=&from=&to=&limit=&cursor=` (theo giờ bắt đầu), `POST /sessions` `{workshopId, startsAt (có offset), capacity?, bookingCutoffMinutes?, imageUrl?}` → `OPEN`, mã `SES-0001` của shop (cấp bằng một `UPDATE ... RETURNING`, bất biến nhờ trigger), `GET /sessions/{id}`, `PATCH /sessions/{id}` (chỉ `OPEN` / `PAUSED`; sức chứa không nhỏ hơn `reserved_count`), `POST /sessions/{id}/start|pause|close|reopen|reschedule|complete`. Dùng đúng luật của `packages/shared`: đóng cần lý do hợp thời điểm (OTHER cần ghi chú), tối đa 4 lần đóng (lần 4 là vĩnh viễn), mở lại chỉ khi chưa bắt đầu và không phải hệ thống đóng, dời tối đa 3 lần, vào tương lai, không trùng giờ session khác của workshop. **Không có API hủy session** (FR-SCHED-03). Giờ phải có offset (`Z` hoặc `+07:00`), lưu UTC.
- **Schedule rules:** `GET|POST /workshops/{id}/schedule-rules`, `PUT|DELETE /schedule-rules/{id}`. Tạo hoặc sửa rule sinh session cho **60 ngày** tới theo múi giờ của shop; sửa hoặc xóa rule thì xóa các session tương lai **chưa ai đụng tới** (`OPEN`, `reserved_count = 0`, chưa có ghi chú) rồi sinh lại, còn session đã có booking, đã dời, đã bắt đầu thì giữ nguyên.
- **Sinh session idempotent:** mỗi session nhớ ô lịch gốc `origin_starts_at` (không đổi khi dời), unique theo `(shop, workshop, origin_starts_at)` và `(shop, workshop, starts_at)`, nên chạy hai lần hay hai tiến trình cùng lúc không tạo trùng và session đã dời không bị sinh lại ở ô cũ. Giờ không tồn tại (giờ nhảy khi chuyển giờ mùa hè) bị bỏ qua, giờ lặp lấy lần đầu.
- **Worker (pg-boss):** `outbox.dispatch` (gửi email), `sessions.sweep` mỗi phút (tự đóng session hết giờ, ghi ghi chú `AUTO_CLOSED` và audit `session.auto_close`), `sessions.generate` mỗi giờ và lúc khởi động (sinh session theo rule cho mọi shop không bị khóa; chạy dày hơn 1 lần/ngày vẫn an toàn vì idempotent). Mỗi request của một shop cũng tự đóng các session hết giờ của shop đó trước khi đọc.
- **Bookings và customers (M5):** `GET /bookings?date=&sessionId=&status=&paymentStatus=&q=&limit=&cursor=` (`date` là ngày của **session** theo múi giờ shop; tìm theo mã, tên, email, điện thoại), `GET /bookings/{id}` (kèm `payments`, `paidAmount` và `actions` được phép), `POST /bookings` (đặt tay cho khách đến trực tiếp hoặc gọi điện; header `Idempotency-Key` bắt buộc; `CONFIRMED` ngay; giá do server tính; có email thì khách nhận thư thông tin; được đặt cả vào session đang diễn ra còn chỗ, kể cả session `OPEN`, chỉ cấm session đã đóng hoặc đã hết giờ), `POST /bookings/{id}/check-in | uncheck-in | cancel {reason bắt buộc} | payment {paid, method?, note?}`. Máy trạng thái là của `packages/shared` (`409 INVALID_TRANSITION`): uncheck-in về **đúng** trạng thái trước check-in, hủy nhả chỗ và báo email cho khách, booking đã hủy không quay lại. Thanh toán: `paid: true` ghi một `PAYMENT` bằng số còn thiếu, booking thành `PAID` và `CHECKED_IN` (giữ trạng thái trước đó); `paid: false` ghi một `REVERSAL` bằng số đã trả (**không phải hoàn tiền**) và đưa booking về trạng thái trước check-in; gọi lại khi không có gì đổi thì không ghi thêm; booking đã hủy hay tổng 0 là `409 INVALID_STATE`, session `COMPLETED` là `409 SESSION_COMPLETED`; bảng `payments` chỉ ghi thêm. TODO(D10, D11): chặn đổi thanh toán của tháng đã kết sổ. `GET /customers?q=` (kèm số booking và lần đặt gần nhất) và `GET /customers/{id}` (kèm các booking). Booking hay khách của shop khác luôn là `404`; shop `SUSPENDED` chỉ đọc.
- **Landing page (M3):** `GET|POST /site/pages` (tối đa **2** trang mỗi shop, kể cả khi tạo đồng thời: `409 LIMIT`; tên trim, ≤ 60 ký tự), `GET /site/pages/{id}` (mở ra **bản nháp** nếu có, không thì **bản đã publish**, không thì rỗng để builder dùng mẫu của template), `PUT /site/pages/{id}/draft` (autosave; **chỉ đổi bản nháp, trang đang public không đổi**), `POST /site/pages/{id}/publish`, `GET /site/pages/{id}/versions`, `POST /site/pages/{id}/rollback/{version}` (đưa phiên bản cũ về làm bản nháp), `DELETE /site/pages/{id}` (không xóa được trang đang public). Backend kiểm tra **cấu trúc** của trang: loại section hợp lệ, Hero luôn đầu và Footer luôn cuối mỗi loại đúng một lần, id không trùng, tối đa 40 section và 200 KB, chữ ≤ 5000 ký tự, độ sâu ≤ 6, màu chỉ nhận hex, cấm khóa kiểu `html`, `script`, `css`, `dangerouslySetInnerHTML`, `__proto__` (`422` kèm `fields`, ví dụ `content.sections.0: heroFirst`). **Chưa kiểm schema props của từng loại section** với **cùng schema với editor** (đã chuyển sang `packages/shared/src/section-props.ts`, web dùng lại): độ dài, link `https`, link Google Maps, id YouTube, email, ảnh là link https hoặc ảnh của nền tảng (ảnh `data:` tải lên chỉ editor dùng khi đang soạn, **không bao giờ lưu**); trường có thể bỏ trống nhưng trường không thuộc loại section đó bị từ chối (`422 fields.content.sections.N.props.X = unknownField`), mã lỗi ngắn `tooLong | tooMany | invalid | https_url | maps_url | youtube_id | email`; `variant` phải thuộc loại section (`invalid`), `showBook` không được bật cho footer, `layout` phải là một trong 10 layout; **`variant`, `showBook` và `layout` được lưu** (trước đây bị bỏ mất); section video cũ (`videoId`) được nâng lên danh sách `videos` (tối đa 5). Publish: lần đầu của shop `DRAFT` phải đủ danh sách (`409 CHECKLIST` kèm `details.missing`: `HERO`, `SHOP_NAME`, `CONTACT`, `WORKSHOP_WITH_SESSION` = có workshop `ACTIVE` với session sắp tới chưa đóng), đủ thì shop thành `ACTIVE` ngay, **không có bước duyệt** (BR-13); publish một trang sẽ đưa trang đang public khác về offline (mỗi shop một trang public, có unique index một phần), ghi một phiên bản mới (`site_page_versions`) và audit `shop.publish`; shop `SUSPENDED` không publish hay lưu được (`403`). `GET /public/sites/{slug}` trả thêm `page` (template, theme, nội dung đã publish, phiên bản) hoặc `null`.
- *Khác bản mô tả ban đầu / chưa làm:* ảnh cover và gallery của workshop và ảnh session đang là **link https** (chưa có tải lên R2, `media_assets` và presign chưa làm); tìm kiếm tên chưa bỏ dấu tiếng Việt; email báo khách khi session bị đóng hoặc dời **đã làm (13/11/2026)**: mỗi booking còn hiệu lực (`NOT_CONFIRMED` / `CONFIRMED`) nhận một email riêng (template `session-notice`: loại `CLOSED` / `RESCHEDULED`, lý do, giờ cũ nếu dời, mã booking để tra hoặc hủy) ghi vào outbox **trong cùng transaction** với việc đóng / dời; admin đóng / dời hộ cũng báo khách; `reserved_count` chỉ đổi qua `SessionCapacityService` (M4).

### 9.3 Public (không cần auth, có rate limit)
| Method | Path |
|---|---|
| GET | `/public/sites/{slug}?locale=` (published content + shop info + workshops ACTIVE) |
| GET | `/public/sites/{slug}/workshops/{id}/availability?from=&to=` |
| POST | `/public/sites/{slug}/bookings` (Idempotency-Key + Turnstile) |
| GET | `/public/sites/{slug}/bookings/{bookingCode}?email=` (trang xác nhận; yêu cầu khớp email) |
| POST | `/public/sites/{slug}/reports` |

Rate limit public: availability 60 req/phút/IP; tạo booking 10 req/phút/IP; report 5 req/giờ/IP.

*Triển khai thật (12/11/2026, `apps/api`, tiền tố `/api/v1/public`, đánh dấu `@PublicRoute()`: không đọc cookie session nên không áp kiểm tra `Origin`, vì mỗi shop và mỗi tên miền riêng là một origin khác; vẫn có Turnstile và rate limit). Shop không `ACTIVE`, slug lạ, workshop nháp hay session của shop khác đều trả cùng một `404`:*
- `GET /public/sites/{slug}` (thông tin shop và các workshop `ACTIVE`, không lộ id nội bộ của shop), `GET /public/sites/{slug}/workshops/{id}/availability?from=&to=` (session `RUNNING` và `CLOSED`, kèm `remaining`, `bookable` và `reason`: `BOOKING_CLOSED | SOLD_OUT | STARTED | CLOSED`; session `OPEN` và `PAUSED` không hiện).
- `POST /public/sites/{slug}/booking-otp {email, turnstileToken?}` → `202` luôn như nhau: gửi mã **6 chữ số** qua outbox, **chỉ lưu hash**, hạn 10 phút, cách nhau 30 giây, tối đa 5 mã / giờ / email và 20 / giờ / IP; sai tối đa **5 lần** (`422 OTP_INVALID` kèm `attemptsLeft`, sau đó `429 OTP_LOCKED`).
- `POST /public/sites/{slug}/bookings` (header bắt buộc `Idempotency-Key`): body `{sessionId, quantity, guest{fullName, email, country, phone, specialRequest?}, consent: true, otp, locale?, turnstileToken?}`. **Giá do server tính** (`đơn giá × số lượng`; mọi giá, trạng thái hay shop id từ client bị bỏ qua). `201` booking `NOT_CONFIRMED` (mã `SES-0003-001`...), hoặc `200` cùng booking khi lặp `Idempotency-Key` (kể cả hai request đồng thời). `409 SESSION_FULL` (kèm `remaining`), `409 NOT_BOOKABLE`, `409 BOOKING_CLOSED` (quá cut-off), `422` kèm `fields` (`quantityRange` > `max_per_booking`, `consentRequired`, `sessionId: unknown`...).
- **Chống đặt vượt chỗ:** chỉ `SessionCapacityService` ghi `reserved_count` (test quét mã nguồn để chắc chắn): khóa hàng session bằng `SELECT ... FOR UPDATE`, kiểm tra `RUNNING`, cut-off và số chỗ khi đang giữ khóa, rồi ghi booking, số chỗ, link xác nhận, email và audit trong **một transaction**. Số thứ tự booking (`-001`, `-002`...) cấp dưới cùng khóa nên không trùng và không hở. Test: 25 khách tranh 10 chỗ thì đúng 10 người thành công; hai khách tranh chỗ cuối thì đúng một người; các nhóm 1 đến 4 người không bao giờ vượt sức chứa.
- Khách và booking: khách tra theo `(shop, email đã trim + lowercase)`, có rồi thì booking ghi vào khách đó và **không ghi đè** thông tin khách; mỗi booking giữ riêng tên, email, điện thoại, quốc gia khách nhập (BR-10). Trigger giữ nguyên mã, số lượng, giá và snapshot của booking (BR-05); bảng `payments` chỉ ghi thêm.
- `POST /public/bookings/confirm {token}` (`200 {code, status, changed}`; mở lại link không đổi gì; `409 BOOKING_CANCELLED`; `400 TOKEN_INVALID` khi hết hạn 14 ngày hoặc sai), `POST /public/sites/{slug}/bookings/lookup {code, email}` và `.../cancel {code, email, reason?}` (sai mã và sai email cùng một `404`; chỉ hủy được khi `NOT_CONFIRMED` / `CONFIRMED`, session chưa bắt đầu và chưa đóng, nếu không `409 NOT_CANCELLABLE`; hủy xong chỗ được nhả ngay, cả khách và shop nhận email).
- *Chưa làm trong bản này:* khuyến mãi khi tính giá (bảng và API khuyến mãi làm sau; booking hiện chưa có giảm giá), mã OTP đã có khóa bí mật (13/11/2026): hash là HMAC-SHA256 với khóa suy ra từ `APP_SECRET`, nên bản sao database một mình không đủ để thử 1.000.000 mã; vẫn giữ hạn 10 phút và giới hạn 5 lần thử.


### 9.4 Admin (`SUPER_ADMIN`)
| Method | Path |
|---|---|
| GET | `/admin/organizations?status=` · GET `/admin/organizations/{id}` |
| POST | `/admin/organizations/{id}/suspend` · `/reactivate` |
| GET | `/admin/organizations/{id}/preview` |
| GET/PATCH | `/admin/reports` |
| GET | `/admin/audit-logs` |
| GET | `/admin/directory/{users,shops,workshops,bookings,customers,sessions,landing-pages,referrals}?q=` |
| GET/PATCH/POST | `/admin/users/{id}` · `/status` · `/reset-password` |
| POST | `/admin/organizations/{id}/status` · `/visibility` · `/admin/landing-pages/{slug}/audit` |
| GET/POST | `/admin/directory/withdrawals` · `/admin/withdrawals/{id}` |
| GET/PUT/POST | `/admin/fees` · `/admin/fees/{id}` · `/admin/fees/bulk` · GET `/admin/income` |

*Triển khai thật (12/11/2026, `apps/api`, tiền tố `/api/v1/admin`, chỉ `SUPER_ADMIN` qua `PlatformAdminGuard`: khách vãng lai `401`, shop owner và customer `403` ở mọi endpoint):* `GET /admin/organizations?q=&status=&limit=&cursor=` (kèm email chủ shop, số workshop, số booking 30 ngày) và `GET /admin/organizations/{id}` (kèm số liệu và danh sách chủ shop); `POST /admin/organizations/{id}/status {active, reason}` (khóa shop `ACTIVE` **bắt buộc lý do**, mở khóa shop `SUSPENDED`; `409 STATUS` ở trạng thái khác; shop bị khóa biến mất khỏi trang public và chỉ còn đọc được); `GET /admin/users?q=&type=&status=` (không bao giờ trả mật khẩu hay hash; `type` suy ra: `SUPER_ADMIN`, `SHOP_OWNER` khi là thành viên shop, còn lại `CUSTOMER`), `POST /admin/users/{id}/status {status, reason}` (vô hiệu hóa **bắt buộc lý do**, kết thúc mọi session ngay, không tự vô hiệu hóa chính mình `409 SELF`), `POST /admin/users/{id}/reset-password` (`202`, gửi **email chứa link** tới chủ tài khoản, admin không thấy link, token hay mật khẩu; đặt lại xong thì mọi thiết bị bị đăng xuất); `GET /admin/audit-logs?email=&org=&action=&entityType=&from=&to=&limit=&cursor=` (lọc theo email người thực hiện, shop theo tên / slug / id, hành động, loại bản ghi, khoảng thời gian; dòng của hệ thống có `actor: SYSTEM`). **Không có endpoint nào đổi slug của shop** (BR-21; trigger của cơ sở dữ liệu cũng từ chối). Mọi thay đổi của admin ghi audit với người thực hiện là admin và shop bị tác động. *Chưa làm trong backend:* sửa hộ thông tin shop và nội dung của shop kèm lý do và email báo (D14, D15), cấu hình phí, Income và rút tiền, báo cáo vi phạm, hộp thư hỗ trợ, email hệ thống, Terms và Privacy, cài đặt nền tảng, quản lý hình ảnh.

*Triển khai thật (12/11/2026, `apps/api`, chỉ `SUPER_ADMIN`; khách `401`, shop owner và customer `403`):* **Phí (FR-ADM-17):** `GET /admin/fees?q=&limit=&cursor=` (mỗi shop kèm `custom`: có tỷ lệ riêng hay đang dùng mặc định; kèm `defaults`), `PUT /admin/fees/{shopId}` (đủ 4 trường `maintenanceBps`, `serviceBps`, `referralBps` = Affiliate fee, `inviteBonusBps` = Referral bonus), `POST /admin/fees/bulk` (cùng 4 tỷ lệ cho **mọi** shop, tất cả hoặc không gì cả), `GET` / `PUT /admin/organizations/{id}/finance-settings` (form của một shop: chỉ cần 2 phí, hai tỷ lệ còn lại giữ nguyên). Lưu basis points trong `organization_fee_settings` (tỷ lệ hiện tại, cho màn hình); **mỗi lần đổi còn ghi thêm một dòng vào lịch sử `organization_fee_rates`** (hiệu lực từ lúc lưu, chỉ thêm, không sửa / xóa; không ghi nếu tỷ lệ không đổi): **tỷ lệ mới chỉ áp dụng cho khoản thanh toán sau lúc đó, mọi khoản đã tính trước giữ nguyên tỷ lệ** (D24); khoản đảo ngược dùng tỷ lệ của khoản thanh toán nó đảo; mỗi tỷ lệ 0 đến 10 000 và duy trì + dịch vụ ≤ 10 000 (`422`, `fields.*` = `required | invalid | totalTooHigh`); ghi audit `fees.update` / `fees.bulk_update` (giá trị cũ → mới, mỗi shop một dòng). **Income (FR-ADM-16, FR-ADM-24):** `GET /admin/income?from=&to=` (mỗi shop có thanh toán trong khoảng: số khoản, tiền khách trả, giá gốc, phí duy trì, phí dịch vụ, Income của admin, affiliate fee và referral bonus (nền tảng chi trả, trừ vào lợi nhuận), lợi nhuận; tổng **theo từng loại tiền**, không cộng lẫn) và `GET /admin/income/{shopId}?from=&to=&kind=&limit=&cursor=` (các tháng của shop: `closed`, `closedAt`, tỷ lệ, số khoản, tiền thu, phí, **invoice = phí duy trì + phí dịch vụ**; cùng bảng thanh toán như màn hình shop). **Kết sổ (D10, D11):** worker chạy mỗi giờ (`finance.close`) và kết sổ mọi tháng đã qua của mọi shop theo múi giờ shop có thanh toán; ghi `finance_month_closings` (tổng, tiền tệ và tỷ lệ lúc kết sổ; **bảng chỉ thêm, trigger chặn sửa / xóa**) và audit `finance.month_close` (người thực hiện: hệ thống). Cùng lúc, tiền affiliate / referral của các tháng đã kết sổ được ghi thành khoản cộng cố định của ví customer (`wallet_credits`, chạy lại không ghi hai lần; D23). Chạy lại không kết sổ lần hai. Sau khi kết sổ, **Unpaid** một booking có khoản thanh toán thuộc tháng đó trả `409 MONTH_CLOSED` (booking của tháng đang mở vẫn Unpaid được). Chưa có gửi invoice phí cho shop (làm sau, theo A1). Rút tiền của customer: xem FR-ADM-19.

### 9.5 Danh sách API mock đang có trong bản frontend

Các route dưới đây chạy **trong Next.js** (`apps/web/src/app/api/v1/**`) với dữ liệu trong bộ nhớ, **cùng hợp đồng** (đường dẫn, body, mã lỗi) mà backend thật phải giữ. Bảng được sinh từ mã nguồn; chi tiết từng API nằm trong mô tả của FR tương ứng và trong chú thích đầu mỗi file `route.ts`. Mục 9.1 đến 9.4 là thiết kế đích của backend thật.

**Tài khoản** (3 route)

| Method | Path |
|---|---|
| POST | `/auth/login` |
| GET · POST | `/auth/reset-password` |
| POST | `/auth/signup` |

**Public (không cần đăng nhập)** (8 route)

| Method | Path |
|---|---|
| POST | `/public/contact` |
| POST | `/public/sites/{slug}/accounts/lookup` |
| POST | `/public/sites/{slug}/accounts` |
| POST | `/public/sites/{slug}/bookings/cancel` |
| POST | `/public/sites/{slug}/bookings/confirm` |
| POST | `/public/sites/{slug}/bookings` |
| POST | `/public/sites/{slug}/referrals/click` |
| POST | `/public/sites/{slug}/reports` |

**Khu vực customer `/customer/{id}` (cần email của tài khoản trong header `x-guest-email` khi bật đăng nhập)** (8 route)

| Method | Path |
|---|---|
| POST | `/customer/{id}/bookings/{code}/check-in` |
| POST | `/customer/{id}/bookings/{code}/rating` |
| GET | `/customer/{id}/bookings` |
| GET | `/customer/{id}/invites` |
| GET · POST | `/customer/{id}/referrals` |
| GET · PATCH | `/customer/{id}` |
| GET | `/customer/{id}/wallet` |
| POST | `/customer/{id}/withdrawals` |

**Shop owner và dùng chung** (20 route)

| Method | Path |
|---|---|
| POST | `/bookings/{id}/paid` |
| PATCH | `/bookings/{id}/payment` |
| PATCH | `/bookings/{id}/status` |
| POST | `/bookings` |
| GET | `/media/promotions/{id}` |
| POST | `/media/promotions` |
| GET | `/media/sessions/{id}` |
| POST | `/media/sessions` |
| GET | `/outbox/{id}` |
| POST | `/onboarding` |
| GET | `/outbox` |
| PUT · PATCH · DELETE | `/promotions/{id}` |
| GET · POST | `/promotions` |
| GET | `/ratings` |
| POST | `/sessions/{id}/closed` |
| POST | `/sessions/{id}/reschedule` |
| POST | `/sessions/auto-closed` |
| GET · PUT | `/shop/domain` |
| POST | `/site/publish` |
| POST | `/workshops/{id}/status` |

**Admin hệ thống (`SUPER_ADMIN`, mock chưa kiểm tra quyền)** (31 route)

| Method | Path |
|---|---|
| POST | `/admin/affiliate/{id}` |
| GET | `/admin/directory/{name}` |
| POST | `/admin/emails/{id}/resend` |
| GET | `/admin/emails/{id}` |
| POST | `/admin/emails` |
| PUT | `/admin/fees/{id}` |
| POST | `/admin/fees/bulk` |
| GET | `/admin/fees` |
| GET | `/admin/income/{shopId}` |
| GET | `/admin/income` |
| POST | `/admin/landing-pages/{slug}/audit` |
| GET · PUT | `/admin/legal/{kind}` |
| POST | `/admin/media/{id}` |
| PATCH · DELETE | `/admin/messages/{id}` |
| GET · PUT | `/admin/organizations/{id}/finance-settings` |
| PATCH | `/admin/organizations/{id}` |
| POST | `/admin/organizations/{id}/status` |
| POST | `/admin/organizations/{id}/visibility` |
| POST | `/admin/referrals/{accountId}` |
| PATCH | `/admin/reports/{id}` |
| GET | `/admin/reports` |
| POST | `/admin/sessions/{id}` |
| GET | `/admin/sessions` |
| GET · PUT | `/admin/settings` |
| GET · PUT | `/admin/support-contact` |
| POST | `/admin/users/{id}/reset-password` |
| GET · PATCH | `/admin/users/{id}` |
| POST | `/admin/users/{id}/status` |
| POST | `/admin/promotions/{id}` |
| POST | `/admin/ratings/{id}` |
| POST | `/admin/withdrawals/{id}` |

---

## 10. Yêu cầu phi chức năng

| ID | Yêu cầu |
|---|---|
| NFR-SEC-01 | HTTPS toàn bộ; HSTS; secrets chỉ trong env server, không commit; `.env.example` không chứa giá trị thật. |
| NFR-SEC-02 | Mật khẩu hash bằng argon2id; token lưu hash; cookie httpOnly/Secure/SameSite. |
| NFR-SEC-03 | Validate mọi input bằng Zod; query qua Drizzle (parameterized); không ghép chuỗi SQL. |
| NFR-SEC-04 | Header bảo mật: CSP (không `unsafe-inline` script ở landing page nếu khả thi), `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'` cho dashboard. |
| NFR-SEC-05 | Không log password, token, cookie, presigned URL; email khách trong log phải được mask. |
| NFR-PRIV-01 | Có Privacy Policy và Terms (nội dung do pháp chế cung cấp). Chỉ thu thập dữ liệu tối thiểu. Cần xác nhận nghĩa vụ theo GDPR (khách EU), PIPA (Hàn), APPI (Nhật) và luật bảo vệ dữ liệu cá nhân Việt Nam trước khi go-live. |
| NFR-PERF-01 | API p95 < 500 ms cho request thông thường (không tính email/upload) trên VPS MVP. |
| NFR-PERF-02 | Landing page: mục tiêu LCP < 2.5 s trên mobile 4G; ảnh dùng WebP và responsive sizes. |
| NFR-REL-01 | Không overbooking trong mọi trường hợp (Mục 7.1). |
| NFR-REL-02 | Backup `pg_dump` hằng ngày, đẩy ra bucket R2 riêng (không public), giữ 14 bản; diễn tập restore mỗi tháng. RPO/RTO chính thức cần PO chốt. *Triển khai (13/11/2026):* mã hóa trước khi đẩy lên, thời gian giữ cấu hình được (mặc định 30 ngày), chỉ khôi phục vào database trống; RPO hiện là 24 giờ. |
| NFR-OPS-01 | Endpoint `/health` (liveness) và `/ready` (kiểm tra DB) cho api và web. |
| NFR-OPS-02 | Log JSON (pino) có `requestId`, `organizationId`, `userId`. |
| NFR-OPS-03 | Cảnh báo: CPU/RAM > 80% kéo dài, disk > 80%, backup thất bại, outbox FAILED tăng, tỷ lệ lỗi 5xx tăng. |
| NFR-I18N-01 | UTF-8; font hiển thị đúng tiếng Việt/Hàn/Nhật; không hard-code text UI, tất cả qua `messages/*.json`. |
| NFR-A11Y-01 | Landing page và booking modal: dùng được bằng bàn phím, có label cho form, contrast ≥ 4.5:1 (mục tiêu WCAG 2.1 AA). |
| NFR-UX-01 | Landing page và view "Today" của dashboard tối ưu cho mobile trước (mobile-first). |
| NFR-MAINT-01 | TypeScript strict; module theo domain; migration có version và kế hoạch rollback; OpenAPI luôn được cập nhật. |

---

## 11. Môi trường và cấu hình

### 11.1 Biến môi trường (`.env.example`)

*Biến của `apps/api` (12/11/2026; đặt trong `apps/api/.env`, không commit):* `DATABASE_URL`, `TEST_DATABASE_URL` (test tích hợp), `API_PORT` (4000), `LOG_LEVEL`, `APP_URL` (origin của web: dùng cho kiểm tra CSRF và link trong email), `SESSION_COOKIE_NAME` (`wsp_sid`), `SESSION_TTL_DAYS` (14), `TRUST_PROXY_HOPS` (0), `REQUIRE_EMAIL_VERIFICATION` (dev: `false`; **production bắt buộc `true`**), `EMAIL_VERIFY_HOURS` (48), `RESET_LINK_HOURS` (24), `EMAIL_PROVIDER` (`mailpit` | `resend`), `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` (**bắt buộc ở production**; trống khi dev thì bỏ qua kiểm tra), `APP_SECRET` (≥ 32 ký tự ngẫu nhiên; pepper của OTP và khóa mã hóa cột số tài khoản; dev có giá trị mặc định, **production bắt buộc đặt riêng** và API từ chối khởi động nếu thiếu), `JOBS_ENABLED`, `SEED_PASSWORD` (chỉ cho seed). Không dùng `SESSION_SECRET`: token session là 256 bit ngẫu nhiên và chỉ lưu hash SHA-256 nên không cần khóa. Production không khởi động nếu thiếu `TURNSTILE_SECRET_KEY`, `REQUIRE_EMAIL_VERIFICATION=true` hoặc `APP_URL` không phải https.

*Giới hạn của bản POC (ghi nhận):* rate limit nằm trong bộ nhớ (đủ cho 1 instance, cần chuyển vào database khi chạy nhiều instance); email viết bằng hàm thuần (chưa dùng React Email), email booking 6 ngôn ngữ và email tài khoản theo ngôn ngữ UI (xem FR-MAIL-01); payload của sự kiện outbox chứa link có token nên bị **xóa ngay sau khi gửi thành công**; một người chỉ có một shop; chưa có kiểm tra CSRF theo từng origin của shop (chỉ `APP_URL`).


```
NODE_ENV=development
PLATFORM_DOMAIN=localtest.me          # *.localtest.me trỏ về 127.0.0.1, dùng để test subdomain khi dev
APP_URL=http://app.localtest.me:3000
API_INTERNAL_URL=http://localhost:4000

DATABASE_URL=postgres://app:app@localhost:5432/workshop
SESSION_COOKIE_NAME=wsp_sid
SESSION_SECRET=change-me

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_PUBLIC=
R2_PUBLIC_BASE_URL=
R2_BUCKET_BACKUP=

EMAIL_PROVIDER=mailpit                # mailpit | resend
RESEND_API_KEY=
EMAIL_FROM=bookings@localtest.me
SMTP_HOST=localhost
SMTP_PORT=1025

TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

# >= 32 ky tu ngau nhien; bat buoc o production (vi du: openssl rand -base64 48)
APP_SECRET=

SENTRY_DSN=
```

### 11.2 Dev local

- `docker compose -f infra/docker-compose.yml --env-file infra/.env up -d` chạy postgres + mailpit (xem thư ở http://127.0.0.1:8025).
- API: `pnpm dev:api`; worker (gửi email): `pnpm --filter api dev:worker`; tạo bảng: `pnpm db:migrate`; dữ liệu demo: `pnpm db:seed` (3 shop ở 3 trạng thái, workshop, lịch, session, booking, thanh toán, khách; mật khẩu do bạn đặt qua `SEED_PASSWORD` hoặc được sinh ngẫu nhiên và ghi vào `apps/api/.seed-credentials`, không có mật khẩu mặc định trong mã).
- `pnpm dev` chạy web (3000) + api (4000) + worker.
- Test subdomain: `http://{slug}.localtest.me:3000`.
- Seed: 1 super admin, 2 shop mẫu (1 ACTIVE có workshop, schedule và booking mẫu; 1 DRAFT).

### 11.3 Production (VPS)

- Docker Compose: `caddy`, `web`, `api`, `worker`, `postgres`. Postgres dùng volume, không expose port ra ngoài.
- Cloudflare: DNS `*.{PLATFORM_DOMAIN}` và `app`, `{PLATFORM_DOMAIN}` bật proxy; Caddy dùng Cloudflare Origin CA cert; firewall VPS chỉ mở 80/443 (từ IP Cloudflare) và SSH (key-only).
- Gợi ý giới hạn bộ nhớ: postgres ~1.5 GB (`shared_buffers` khoảng 512 MB), web ~768 MB, api ~512 MB, worker ~256 MB. Theo dõi và điều chỉnh.
- Migration chạy như một bước riêng trong deploy (`pnpm db:migrate`), không chạy tự động khi app khởi động.
- Deploy production cần **người duyệt** (human approval) theo quy định của tổ chức.

---

## 12. Kiểm thử và nghiệm thu

**Dữ liệu demo của Shop Owner (mock):** `apps/web/src/lib/mock/data.ts` có **vài bản ghi (≥ 3) cho mỗi trường hợp** để thử mọi màn hình, và test `data-coverage.test.ts` giữ điều đó: booking theo từng trạng thái (Not confirmed, Confirmed, Checked in, Cancelled) và từng Payment status (Paid, Unpaid), mọi cặp hợp lệ giữa hai loại này, từng nguồn (Online, Walk-in, Phone, Other), từng phương thức thanh toán, khuyến mãi (cả nhiều khuyến mãi), thanh toán một phần, hoàn tiền, hủy kèm lý do; session ở đủ trạng thái (Open, Paused, Running, Closed, Completed), session Completed có khách đã check-in và đã thanh toán, session Closed chờ Completed có đủ ba phần của danh sách thanh toán (Checked in, Not checked in, Cancelled); 3 workshop đang bán và 2 workshop nháp; khách hàng đủ 5 ngôn ngữ, có và không có tài khoản, có và không có email, đủ giới tính (và không khai báo).

### 12.1 Test bắt buộc

| Loại | Phạm vi |
|---|---|
| Unit (Vitest) | Booking state machine; tính giá; tính payment_status; validate slug; Zod schema của section; sinh session từ rule (bao gồm timezone); localization fallback |
| Integration (Vitest + Testcontainers Postgres) | **Concurrency**: 20 request đồng thời tranh 1 chỗ cuối → đúng 1 thành công, `reserved_count` không vượt capacity; idempotency (gửi lại cùng key); check-in / uncheck-in; Close và đổi lịch session kèm email cho khách; **tenant isolation**: shop A gọi API với id tài nguyên của shop B → 404 cho mọi module |
| E2E (Playwright) | Shop đăng ký → onboarding → tạo workshop + rule → chỉnh landing → publish (public ngay); khách mở landing → đặt chỗ → thấy trang xác nhận; email xuất hiện trong Mailpit; shop check-in + ghi nhận thanh toán |

Mục tiêu coverage: ≥ 80% cho `bookings`, `sessions`, `payments`, `auth`; các module khác ưu tiên test hành vi quan trọng thay vì chạy theo con số.

### 12.2 Acceptance criteria MVP

| ID | Tiêu chí |
|---|---|
| AC-01 | Shop tự đăng ký, xác minh email, hoàn tất onboarding và có subdomain riêng. |
| AC-02 | Shop tạo landing page từ template, chỉnh section, preview đa ngôn ngữ mà không cần deploy code. |
| AC-03 | Landing page public ngay khi shop publish (không cần admin duyệt); shop bị khóa thì landing page trả 404. |
| AC-04 | Khách đặt chỗ không cần tài khoản; nhận email có đủ 6 ngôn ngữ (Anh, Việt, Thái, Trung, Hàn, Nhật) trong cùng một email, không phụ thuộc quốc gia của khách. |
| AC-05 | Không overbooking khi có request đồng thời (có test chứng minh). |
| AC-06 | Giá do backend tính; booking giữ snapshot khi workshop đổi giá. |
| AC-07 | Shop tạo booking walk-in, check-in / uncheck-in, hủy, xác nhận thanh toán (Confirm payment); tất cả có audit log. Khách đặt thành công nhận email có link xác nhận; bấm link thì booking `CONFIRMED`. |
| AC-08 | Close hoặc đổi lịch session thì mọi khách đã đặt (trừ khách đã hủy) nhận email; hệ thống không có chức năng hủy session. Khách tự hủy booking được đến lúc session bắt đầu và cả hai bên nhận email. |
| AC-09 | Dữ liệu và quyền được cô lập giữa các shop (có test cho mọi module). |
| AC-10 | Landing page có hreflang, sitemap, meta/OG đúng theo từng ngôn ngữ. |
| AC-11 | Backup chạy hằng ngày ra ngoài VPS và đã restore thử thành công. |

---

## 13. Lộ trình triển khai (làm theo thứ tự)

Mỗi milestone: code → test → `pnpm lint && pnpm typecheck && pnpm test` pass → cập nhật checklist này → commit.

### Tình trạng từng milestone (11/11/2026)

Các ô `[ ]` bên dưới là việc của **backend và hạ tầng thật**, nên vẫn chưa tick. Phần giao diện và API mock của từng milestone đã làm, tóm tắt ở đây:

| Milestone | Giao diện + mock | Backend / hạ tầng thật |
|---|---|---|
| M0 Khởi tạo | Monorepo pnpm + Turborepo, `apps/web`, `packages/shared`, test, lint, typecheck, i18n 5 ngôn ngữ | Đã (12/11/2026): `apps/api` (NestJS + Fastify), Docker compose (PostgreSQL, Mailpit), Drizzle + migration, `/health` `/ready`, lỗi chuẩn, request id, `.nvmrc`, build bằng esbuild. Chưa: pino riêng (đang dùng logger của Fastify, đã che cookie và authorization), CI |
| M1 Auth và tenant | Đăng ký (popup 2 tab), đăng nhập (chuyển theo loại tài khoản), quên / đặt lại mật khẩu, onboarding, slug sinh từ tên, audit log | **Backend đã làm (12/11/2026, POC):** 7 bảng; signup / login / logout / me / verify-email / resend-verification / forgot-password / reset-password; argon2id; session cookie lưu DB (chỉ lưu hash); `OriginGuard` (CSRF), `AuthGuard`, `TenantGuard`, `PlatformAdminGuard`, `@CurrentOrg()`, `tenantScope`; Turnstile (bỏ qua khi dev); outbox + worker pg-boss + `EmailProvider` (Mailpit / Resend); test cách ly dữ liệu giữa các shop. **Chưa:** `POST /auth/switch-organization` (mỗi người một shop trong MVP), `POST /organizations` onboarding (wizard vẫn chạy bằng mock), React Email và email đa ngôn ngữ (hiện chỉ tiếng Anh), giao diện gọi backend thật |
| M2 Workshop và lịch | CRUD workshop (danh mục, địa chỉ, ảnh), schedule rule, session (thêm, đóng, dời, sức chứa), tải ảnh (mock) | **Backend đã làm (12/11/2026, POC):** CRUD workshop, rule, session (vòng đời, đóng, mở lại, dời, sức chứa), job sinh session và tự đóng session hết giờ, test cách ly giữa các shop. **Chưa:** tải ảnh lên R2 (presign), email báo khách (chờ M4), giao diện gọi backend thật |
| M3 Landing page builder | Section registry, template, theme, builder, preview, autosave (trình duyệt), publish ngay, tối đa 2 page | **Backend đã làm (12/11/2026, POC):** trang, bản nháp, publish có checklist, một trang public, phiên bản và rollback, kiểm cấu trúc, cách ly giữa các shop, test. **Chưa:** tải ảnh R2, giao diện gọi backend thật |
| M4 Trang public và booking | Host / proxy, renderer, SEO (meta, OG, hreflang, sitemap, robots), lịch còn chỗ, booking, trang xác nhận, tên miền riêng | **Backend đã làm (12/11/2026, POC): đặt chỗ công khai** (OTP, booking, idempotency, xác nhận, tra cứu, khách tự hủy, chống đặt vượt chỗ bằng khóa hàng, có test đồng thời). **Chưa:** landing page / renderer / SEO / tên miền riêng phía backend, khuyến mãi, giao diện gọi backend thật |
| M5 Vận hành booking | Booking list, Today, thủ công, check-in, hủy, thanh toán, customers, đổi session | **Backend đã làm (12 và 13/11/2026, POC):** Overview (`/dashboard/summary`, `/dashboard/booking-stats`), khuyến mãi (CRUD, giá booking do server tính, giới hạn 20 / 5 / không miễn phí), danh sách và chi tiết booking, đặt tay, check-in / uncheck-in, hủy có lý do, thanh toán (PAYMENT / REVERSAL), **Income và phí của shop, kết kỳ tháng (12/11/2026)**, khách hàng, cách ly giữa các shop, test. **Chưa:** giao diện gọi backend thật |
| M6 Admin | Đầy đủ các màn hình ở FR-ADM-01 đến FR-ADM-27 (mock) | **Backend đã làm một phần lõi (12/11/2026, POC):** danh sách và chi tiết shop, khóa / mở khóa, danh sách người dùng, vô hiệu hóa, gửi link đặt lại mật khẩu, audit log toàn hệ thống, **affiliate và referral (link, đếm lượt mở, gắn vào booking, tính Affiliate fee và Referral bonus, tắt / bật link), sửa thông tin shop và tên miền riêng, danh sách workshop / session / booking / customer / landing page, báo cáo vi phạm, hộp thư hỗ trợ (Contact), email hệ thống, Terms / Privacy, cài đặt nền tảng, kênh hỗ trợ, ratings (gỡ / đưa lại), chọn shop hiện trên trang Workshops của customer, tạm dừng / bật lại khuyến mãi vi phạm, xử lý rút tiền của customer, giới hạn rút theo đồng tiền, cấu hình phí (từng shop và hàng loạt), Income của nền tảng và của từng shop**, phân quyền, test. **Chưa:** báo cáo, hộp thư, email hệ thống, Terms / Privacy, cài đặt (trừ giới hạn rút tiền đã làm), hình ảnh, sửa hộ shop, giao diện gọi backend thật **Thêm (13/11/2026, POC):** sửa hộ shop / workshop / session / landing page có lý do bắt buộc và email báo chủ shop (D14, D15), mở lại session không giới hạn, cài đặt thời hạn lưu tin Contact và email (D18), Terms / Privacy có nháp, công bố, lịch sử và đồng ý (D17). **Chưa:** 301 và TLS cho tên miền riêng (hạ tầng, xem `docs/PRODUCTION_CHECKLIST.md`) |
| M7 Hardening và deploy | Một phần | **Một phần:** header bảo mật cho web (`X-Content-Type-Options`, `Referrer-Policy`, HSTS khi production, chặn nhúng iframe khu quản lý) và cho API (`nosniff`, `no-referrer`, CSP `frame-ancestors 'none'`, `cache-control: no-store`, HSTS khi production), kiểm tra `Origin` chống CSRF, rate limit trong bộ nhớ, giới hạn đọc body, workflow CI (`.github/workflows/ci.yml`: lint, typecheck, test với PostgreSQL thật, build API). **Đã làm thêm (13/11/2026):** CSP đầy đủ cho web (mỗi request một nonce, `strict-dynamic`, không `unsafe-inline` cho script, chỉ cho phép Turnstile và player YouTube nhúng; `lib/csp.ts`, `proxy.ts`), che log (mọi dòng log chỉ có method và đường dẫn, không query string hay token trên đường dẫn; lỗi 500 được che giá trị câu truy vấn, chuỗi kết nối, email, token và giá trị mã hóa; `common/log-scrub.ts`), Dockerfile, docker-compose và Caddyfile production, backup / khôi phục (xem `docs/RUNBOOK.md`). **Chưa:** Sentry, nối web với API thật (E2E chạy trên dữ liệu mẫu), rà soát bảo mật bởi người |

Các tính năng làm thêm ngoài danh sách milestone gốc (đã có ở bản mock): khu vực customer, affiliate / referral, rút tiền, khuyến mãi, tên miền riêng, website công khai, hộp thư hỗ trợ, email hệ thống, settings, Terms & Privacy.

### M0 – Khởi tạo
- [ ] Monorepo pnpm + Turborepo, `packages/config` (tsconfig strict, eslint, prettier)
- [ ] `apps/web` (Next.js + Tailwind + shadcn + next-intl), `apps/api` (NestJS Fastify), `packages/shared`
- [ ] Docker compose dev (postgres, mailpit), `.env.example`, `.nvmrc`
- [ ] Drizzle setup + migration đầu tiên; pino logger; `/health`, `/ready`
- [ ] Format lỗi chuẩn (exception filter), Zod validation pipe, request id
- [ ] CI: lint, typecheck, test

### M1 – Auth và tenant
- [ ] Bảng users, auth_sessions, user_tokens, organizations, organization_members, audit_logs, outbox_events
- [ ] Signup + Turnstile + verify email, login/logout, forgot/reset password
- [ ] `TenantGuard`, `PermissionGuard`, decorator `@CurrentOrg()`, helper `tenantScope`
- [ ] Onboarding wizard + kiểm tra slug
- [ ] Worker + pg-boss + outbox dispatcher + EmailProvider (Mailpit/Resend) + React Email templates
- [ ] Test tenant isolation khung chung

### M2 – Workshop và lịch
- [ ] Media presign upload + complete
- [ ] CRUD workshop (localized fields)
- [ ] Schedule rules + job generate-sessions (idempotent, đúng timezone)
- [ ] Quản lý session: thêm lẻ, đóng, sửa capacity, hủy session

### M3 – Landing page builder
- [ ] Section registry trong `packages/shared` (11 section type gồm `video`, Zod schema, defaults)
- [ ] 10 template (layout variant), theme (palette, primary color, font, logo), ghi đè màu theo section
- [ ] Builder UI: danh sách section, dnd-kit, form editor theo schema, tab ngôn ngữ, autosave
- [ ] Preview desktop/mobile theo ngôn ngữ
- [ ] Submit review / publish atomic / site_page_versions

### M4 – Trang public và booking
- [ ] Host middleware/proxy → `/sites/[slug]/[[...locale]]`
- [ ] Renderer SSR, SEO (meta, OG, hreflang, sitemap, robots), ISR + revalidate
- [ ] Availability API + UI lịch
- [ ] Booking modal + Turnstile + Idempotency-Key
- [ ] `SessionCapacityService` + transaction lock + **test concurrency**
- [ ] Trang xác nhận + email xác nhận (khách + shop)

### M5 – Vận hành booking
- [ ] Danh sách booking, view "Today"
- [ ] Booking thủ công (walk-in/phone)
- [ ] State machine: check-in / uncheck-in, xác nhận qua email, hủy (shop và khách), Paid / Unpaid kéo theo check-in
- [ ] Xác nhận thanh toán (Confirm payment / Unpaid) + tính payment_status
- [ ] Customers list/detail
- [ ] (Should) Đổi session, email nhắc lịch 24h, file .ics

### M6 – Admin
- [ ] Danh sách shop, suspend/reactivate + email (không có hàng đợi duyệt)
- [ ] Audit log viewer
- [ ] (Should) Abuse reports

### M7 – Hardening và deploy
- [x] Security headers, CSP, rate limits, mask log (13/11/2026; rate limit vẫn trong bộ nhớ, đủ cho một instance)
- [x] E2E Playwright cho luồng chính (13/11/2026; chạy trên dữ liệu mẫu của web, xem `e2e/README.md`)
- [x] Dockerfile production (multi-stage), docker-compose prod, Caddyfile (13/11/2026; đã chạy thử image API và migrate / worker với database tạm; **chưa triển khai**, cần người duyệt)
- [x] Backup script `pg_dump` → R2 + hướng dẫn restore (`infra/backup/`, `docs/RUNBOOK.md`; đã thử backup / khôi phục với database tạm và thư mục thay cho R2; chưa thử với R2 thật)
- [ ] Monitoring/alert cơ bản, Sentry
- [ ] Rà soát lại toàn bộ AC ở Mục 12.2

---

## 14. Quy tắc dành cho Claude khi code

1. **Đọc file này trước** mỗi phiên làm việc. Chỉ làm milestone/task được yêu cầu; không tự mở rộng phạm vi.
2. Gặp điểm chưa rõ hoặc mâu thuẫn trong requirement: **dừng lại và hỏi**, không tự bịa yêu cầu. Nếu buộc phải giả định, ghi rõ giả định vào Mục 0.
3. Không thêm thư viện ngoài danh sách ở Mục 2 nếu chưa nêu lý do và được đồng ý.
4. Mọi query trên bảng tenant-scoped phải lọc theo `organization_id` lấy từ server context. Viết test tenant isolation cho mỗi endpoint mới.
5. Mọi thay đổi `reserved_count` phải đi qua `SessionCapacityService` với `SELECT ... FOR UPDATE`.
6. Không tin dữ liệu client về `organization_id`, giá, status, role.
7. Tiền dùng `bigint` minor units; thời gian dùng `timestamptz` UTC; dùng helper format theo currency/timezone của shop.
8. Schema thay đổi thì tạo migration mới bằng drizzle-kit; **không sửa migration đã merge**.
9. Text hiển thị cho người dùng phải qua i18n (`messages/*.json`), có đủ key và bản dịch ở cả 5 ngôn ngữ EN / VI / KO / JA / ZH (BR-18).
10. Không dùng `dangerouslySetInnerHTML` với dữ liệu do shop hoặc khách nhập.
11. Không log secret, token, password, presigned URL, cookie.
12. Mỗi task kết thúc phải pass `pnpm lint`, `pnpm typecheck`, `pnpm test`. Commit nhỏ, message theo Conventional Commits (tiếng Anh).
13. Không tự chạy lệnh phá hủy dữ liệu (drop database, xóa volume, force push) và không deploy production khi chưa có người duyệt.
14. Code do AI sinh ra phải được người review trước khi merge.

---

## 15. Câu hỏi còn mở

| # | Câu hỏi | Mặc định đang dùng |
|---|---|---|
| Q1 | Thanh toán online ở phase nào? Mô hình (Stripe Connect, cổng nội địa…)? | Chưa làm (A1) |
| Q2 | Tên nền tảng và domain chính thức? | Tên hiển thị tạm: **Workshop Platform**; domain `{PLATFORM_DOMAIN}` |
| Q3 | Giá trị plan limits và giá gói? | **Đã đóng**: loại bỏ gói thanh toán |
| Q4 | Booking cutoff mặc định (2 giờ) có phù hợp? | 120 phút mặc định; **cấu hình theo từng session khi tạo session** (không còn theo shop) |
| Q5 | Số khách tối đa mỗi booking mặc định? | 6 |
| Q6 | Nội dung Terms, Privacy Policy và nghĩa vụ pháp lý về dữ liệu cá nhân? | Pháp chế cung cấp Admin soạn nội dung Terms và Privacy trong khu admin (FR-ADM-23); nội dung pháp lý do pháp chế cung cấp |
| Q7 | RPO/RTO chính thức? | Backup daily, giữ 14 bản |
| Q8 | Có cần request booking / lịch linh hoạt ở phase 2 không? | Phase 2 |
| Q9 | Email nhắc lịch 24h có bắt buộc ở MVP? | Should |
| Q10 | Shop có được đổi slug sau khi publish? | **Không** (đã chốt): slug do hệ thống sinh và không đổi, kể cả admin |

### 15.2 Rà soát mã nguồn (11/11/2026)

Các lỗi được sửa sau đợt review toàn bộ mã nguồn (đã có test): uncheck-in chỉ quay về đúng trạng thái trước check-in và server tự giữ trạng thái đó (BR-04); shop hủy booking bắt buộc lý do (BR-11, `422`); khuyến mãi bị admin tạm dừng không bật lại được bằng cách sửa (`HELD_BY_ADMIN`), admin bật lại vẫn theo luật số khuyến mãi chạy cùng lúc và không miễn phí 100%; phí của booking cũ tính theo số tiền giảm lưu trên booking, không tính lại theo khuyến mãi hiện tại (BR-05); danh sách khuyến mãi của admin tính đúng phần giảm của từng khuyến mãi và dùng cùng trạng thái với shop owner; shop bị khóa không nhận booking; `PATCH /bookings/{id}/payment` trả `409 INVALID_STATE` cho booking không nhận thanh toán và chỉ ghi audit khi trạng thái thật sự đổi; ngày giờ của session phải có múi giờ và được lưu dạng UTC ISO, không dời session về quá khứ; audit `session.auto_close` một lần cho mỗi session, có audit khi tải ảnh session và khi trả lời tin hỗ trợ, `entity_type` thống nhất dạng snake_case; giao diện: nút đóng của popup và tiêu đề trang theo ngôn ngữ, các mã (nguồn booking, phương thức thanh toán, loại ghi chú session, loại bản ghi) của khu admin có bản dịch en + vi, giờ session trong khu admin theo múi giờ của shop, tải ảnh trong builder không ghi đè chỉnh sửa khác.

*Chưa sửa (ghi nhận):* key theo vị trí (index) của danh sách trong builder (cần id ổn định cho từng mục trong dữ liệu landing page); landing page của shop vẫn mở được qua `app.{PLATFORM_DOMAIN}/sites/{slug}` (cần chuyển hướng khi tách host, D21); CSP đầy đủ.

### 15.1 Quyết định sau đợt rà soát mâu thuẫn (11/11/2026)

Các quyết định dưới đây do chủ sản phẩm chọn khi rà soát toàn bộ tài liệu. Cột "Triển khai" cho biết phần nào đã làm trong bản frontend (mock) và phần nào chờ backend (**TODO(api)**). Các mục liên quan pháp lý và dữ liệu cá nhân (D16, D17, D18) là **đề xuất của TECHVIFY, cần pháp chế / người có thẩm quyền xác nhận** trước khi dùng cho khách hàng thật.

| # | Chủ đề | Quyết định | Triển khai |
|---|---|---|---|
| D1 | Hai đường đăng ký customer | Giữ cả hai: popup chỉ email + mật khẩu; khách bổ sung hồ sơ (họ tên, quốc gia, ngày sinh, đồng ý dữ liệu) ở lần dùng đầu qua banner trong My Profile | Frontend (đã làm: khung nhắc trong My Profile) |
| D2 | Xác minh email | Bản mock vẫn đăng nhập ngay sau đăng ký (**chưa an toàn cho production**); backend bắt buộc xác minh email (FR-AUTH-01) | TODO(api) |
| D3 | Chống dò email | Mock báo rõ "email đã có tài khoản"; backend trả thông báo chung và xác minh qua email | TODO(api) |
| D4 | Vai trò của một email | Một email chỉ một vai trò (customer **hoặc** shop owner) | Đã đúng |
| D5 | Onboarding shop mới | Sau khi đăng ký bằng popup, chủ shop vào wizard `/shopowner/onboarding?shop={slug}` để điền khu vực, ngôn ngữ, liên hệ; dữ liệu đầy đủ cho nhiều shop làm khi có backend | Frontend (đã làm wizard và `POST /onboarding`); TODO(api) cho mock đa shop |
| D6 | Phạm vi tài khoản customer | **Toàn nền tảng** (đặt chỗ ở mọi shop, ví chung); ví, phí và giới hạn rút tiền tính **theo từng đồng tiền** | TODO(api) cho ví nhiều đồng tiền |
| D7 | Nhận xét của khách | Shop owner và admin **xem được**; admin **gỡ** được nhận xét vi phạm | Frontend (đã làm: trang Ratings của shop, FR-ADM-27) |
| D8 | Khi nào được đánh giá | Chỉ **sau khi session kết thúc** (và đã check-in); mỗi booking một lần, khách không sửa | Frontend |
| D9 | Tên nút đánh giá | Đổi "Completed" thành **"Rate this workshop"** (tránh nhầm với trạng thái `COMPLETED` của session) | Frontend |
| D10 | Unpaid sau khi thanh toán | Giữ khoản điều chỉnh giảm (reversal); **chặn Unpaid** khi tháng của khoản thanh toán đã kết sổ | Kiểm tra theo tháng đã chốt: TODO(api) |
| D11 | Kết sổ cuối tháng | Tự động vào cuối tháng và **khóa dữ liệu tháng đã chốt** | TODO(api) |
| D12 | Giới hạn rút tiền | Min / max theo từng đồng tiền, chung cho Affiliate và Referrals | TODO(api) |
| D13 | Tên miền riêng | Luôn kiểm tra DNS, kể cả khi admin gắn hộ; địa chỉ hệ thống chuyển hướng 301 sang tên miền riêng khi đã xác minh | TODO(api) (backend 13/11/2026: lưu, xác minh DNS, tra host; 301 và chứng chỉ TLS là hạ tầng, nằm trong `docs/PRODUCTION_CHECKLIST.md`, cần người duyệt trước khi bật) |
| D14 | Admin và shop cùng sửa shop | **Bản lưu mới nhất thắng**; ghi audit; email báo shop khi admin sửa | Frontend (audit và email qua D15) |
| D15 | Admin sửa hộ landing page / workshop / session | Bắt buộc nhập **lý do**; shop owner nhận **thông báo email**; ghi audit | Frontend; backend 13/11/2026 đã làm: sửa thông tin shop, đổi trạng thái workshop, đóng / mở lại / dời session, công bố landing page; tất cả bắt buộc `reason` (`422 ADMIN_REASON_REQUIRED`), ghi audit (không ghi nội dung) và gửi email báo chủ shop |
| D16 | Email hàng loạt của admin | Chỉ **thông báo vận hành** (bảo trì, đổi điều khoản...), ghi rõ trong dòng đồng ý khi đăng ký; chưa có marketing | Đề xuất, cần pháp chế |
| D17 | Terms và Privacy | Có bước **nháp / công bố**, lịch sử phiên bản, lưu phiên bản mỗi người dùng đã đồng ý, bắt đồng ý lại khi đổi lớn; pháp chế duyệt trước khi công bố | Backend 13/11/2026: nháp, công bố, lịch sử, đồng ý, đồng ý lại (client đã nối ở form đăng ký và cửa sổ đồng ý lại khi chạy với `API_URL`); đề xuất, cần pháp chế |
| D18 | Lưu trữ dữ liệu cá nhân | Tin Contact **12 tháng**, email hệ thống **90 ngày**, có chức năng **xóa theo yêu cầu** người dùng; số ngày cấu hình được | Backend 13/11/2026: xóa định kỳ, số tháng / ngày cấu hình ở Settings; đề xuất, cần pháp chế |
| D19 | Tên gọi | **Promotions** ở mọi nơi (shop owner, admin, customer) thay cho "Promotions" | Frontend |
| D20 | Số FR | FR-ADM-15 là Affiliate, FR-ADM-18 là Referrals; các khối FR-ADM xếp theo số thứ tự | Tài liệu |
| D21 | Tên miền gốc | Website công khai ở `{PLATFORM_DOMAIN}`, khu quản lý (shop owner, customer, admin) ở `app.{PLATFORM_DOMAIN}` | TODO(api) / hạ tầng |
| D22 | Rút tiền | **Giữ** lệnh rút tiền của **customer** (Affiliate fee và Referral bonus; FR-CUST-04, FR-ADM-19, giới hạn ở FR-ADM-20) vì đó là tiền nền tảng trả cho customer. Khách thanh toán booking bằng tiền mặt tại shop nên **shop không có rút tiền**. Hệ thống **không chuyển tiền thật**: admin chuyển ngoài hệ thống rồi bấm Mark as paid. Khi lập lệnh, customer **nhập tên ngân hàng, số tài khoản và tên chủ tài khoản** (bổ sung 12/11/2026, thêm tên chủ tài khoản 13/11/2026) để admin biết chuyển đến đâu | Chủ sản phẩm chọn phương án này 12/11/2026 (thay cho bản ghi trước đó đã bỏ rút tiền). Backend đã làm; số dư lấy từ `wallet_credits` do chương trình affiliate / referral ghi (chưa có trong backend) |
| D23 | Rút tiền affiliate / referral: chỉ sau kết sổ, đóng băng theo tháng | Customer **chỉ rút được tiền đã kiếm trong những tháng (theo múi giờ shop) đã kết sổ**: khi kết sổ, Affiliate fee và Referral bonus của tháng đó được ghi **một lần** thành khoản cộng của ví và **đóng băng** (không đổi nữa dù booking bị sửa sau đó); tiền của tháng chưa kết sổ chỉ hiển thị là "chờ kết sổ". Cùng với D10 (chặn Unpaid sau kết sổ) và D24 (tỷ lệ cố định theo thời điểm), mọi khoản tiền của tháng đã kết sổ được đóng băng. Có **thông báo cho người dùng** (`customer.wallet.closingNotice`, 5 ngôn ngữ) | 13/11/2026, theo yêu cầu của chủ sản phẩm (thay cho phương án tính lại theo trạng thái booking và cho rủi ro rút nhiều hơn số kiếm được). Giới hạn: một khoản kiếm xuất hiện trong tháng đã kết sổ và đã có khoản cộng cùng tài khoản / nguồn / tiền tệ / shop / tháng thì không được cộng thêm (tháng đã kết sổ không đổi) |
| D24 | Đổi tỷ lệ phí chỉ áp dụng cho tương lai | Mỗi lần admin đổi tỷ lệ (phí duy trì, phí dịch vụ, Affiliate fee, Referral bonus; từng shop hoặc hàng loạt) tạo một **phiên bản tỷ lệ có hiệu lực từ lúc lưu**. Một khoản được tính bằng tỷ lệ có hiệu lực **lúc khoản thanh toán được ghi** (khoản đảo ngược / Unpaid dùng tỷ lệ của khoản thanh toán nó đảo, nên hai dòng triệt tiêu nhau); mọi khoản đã tính trước đó **giữ nguyên tỷ lệ đã tính**, không đổi theo cấu hình mới | 13/11/2026, theo yêu cầu của chủ sản phẩm. Lịch sử tỷ lệ `organization_fee_rates` **chỉ thêm** (trigger chặn sửa / xóa). Dữ liệu có từ trước: tỷ lệ đang có lúc triển khai là phiên bản đầu, hiệu lực từ lần lưu cuối của shop; trước đó áp dụng mặc định |

---

## Phụ lục A – Gợi ý `CLAUDE.md` đặt ở root repo

```md
# CLAUDE.md

Project: Workshop Landing Page & Booking Platform (MVP).
Source of truth: docs/REQUIREMENTS.md — read it before any change.

## Stack
TypeScript strict · pnpm + Turborepo · Next.js (App Router) · NestJS (Fastify) · Drizzle ORM · PostgreSQL · pg-boss · Zod · Tailwind + shadcn/ui · next-intl · Cloudflare R2 · Resend.

## Commands
- pnpm dev · pnpm lint · pnpm typecheck · pnpm test · pnpm test:e2e
- pnpm db:generate · pnpm db:migrate · pnpm db:seed

## Non-negotiables
- Every tenant-scoped query filters by organization_id from server context.
- Seat changes only via SessionCapacityService (SELECT ... FOR UPDATE).
- Backend computes prices; never trust client price/status/org id.
- Money = bigint minor units; time = timestamptz UTC.
- No new dependencies without asking. Never edit merged migrations.
- All user-facing text through i18n messages.
- Run lint + typecheck + test before declaring a task done.

## Workflow
Work milestone by milestone (REQUIREMENTS.md §13). Ask when requirements are unclear.
```
