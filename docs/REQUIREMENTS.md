# REQUIREMENTS – Workshop Landing Page & Booking Platform (MVP)

> **Mục đích file:** Đây là tài liệu requirement dùng làm nguồn sự thật (source of truth) khi vibe code với Claude Code trong VS Code.
> Claude phải đọc file này trước khi code, làm theo từng milestone ở **Mục 13**, và tuân thủ các quy tắc ở **Mục 14**.
>
> - Phiên bản: 1.2-MVP (draft)
> - Ngày: 31/10/2026
> - Nguồn: WS-SaaS-BRS-SRS-001 v1.0 + định hướng sản phẩm mới (3 actor, shop tự đăng ký, landing page builder)
> - Ngôn ngữ tài liệu: tiếng Việt. **Code, tên biến, enum, commit message: tiếng Anh.**

---

## 0. Giả định đang áp dụng (cần PO xác nhận)

Các mục dưới đây là **giả định** để có thể bắt đầu code. Nếu thay đổi, cập nhật file này trước rồi mới sửa code.

| # | Giả định | Ảnh hưởng nếu đổi |
|---|---|---|
| A1 | Khách du lịch **thanh toán tại shop**. MVP không có thanh toán online. | Lớn: thanh toán online cần Stripe Connect (hoặc tương đương), KYC, refund, phí nền tảng |
| A2 | Mỗi shop có **tối đa 2 landing page, 1 page public tại một thời điểm** (FR-SITE-07), page public dùng địa chỉ của shop | Trung bình: schema đã chuẩn bị cho nhiều page |
| A3 | Shop tự đăng ký; **lần publish đầu tiên cần admin duyệt** | Thấp |
| A4 | Tính phí shop **chưa làm**, chỉ có cột `plan` và giới hạn theo gói trong code | Thấp |
| A5 | Chỉ có lịch **cố định** (fixed schedule) và **instant booking**. Request booking và lịch linh hoạt để phase sau | Trung bình |
| A6 | Ngôn ngữ hỗ trợ: EN (mặc định), VI, KO, JA, **ZH (tiếng Trung, một ngôn ngữ duy nhất; shop tự điền chữ giản thể hoặc phồn thể tùy ý)** *(v1.2: thêm tiếng Trung)*. Shop tự chọn bật ngôn ngữ nào. Mã locale trong URL: `/ja`, `/zh`. `hreflang`: `zh`. Dữ liệu cũ lưu dưới khóa `zh-TW` được tự gộp vào `zh`. Giao diện nền tảng (dashboard, modal đặt chỗ…) mới dịch EN và một phần VI/KO/JA; ZH tạm fallback EN, riêng chính sách đến trễ (BR-09) có đủ bản dịch | Thấp |
| A7 | Shop chỉ có 1 role là `OWNER` trong MVP. Schema vẫn hỗ trợ nhiều member/role | Thấp |
| A8 | Domain: `{shop}.{PLATFORM_DOMAIN}`. Custom domain để phase sau | Trung bình |
| A9 | Sinh session trước **60 ngày**, job chạy hằng ngày | Thấp |
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
| **Traveler (Guest)** | Khách du lịch; xem landing page và đặt chỗ, không có tài khoản | `{shop}.{PLATFORM_DOMAIN}` |

### 1.2 Trong phạm vi MVP

- Shop đăng ký, xác minh email, đăng nhập, quên mật khẩu.
- Onboarding: tên shop, subdomain, timezone, currency, ngôn ngữ.
- Landing page builder theo **template + section** (không cho viết HTML/JS tùy ý), preview desktop/mobile theo từng ngôn ngữ, gửi duyệt, publish.
- Quản lý workshop, schedule rule (lịch cố định), session, capacity.
- Trang public: render landing page, xem lịch còn chỗ, đặt chỗ instant, email xác nhận.
- Dashboard shop: danh sách booking, tạo booking thủ công (walk-in/điện thoại), check-in / uncheck-in, hủy có lý do, đổi session, ghi nhận thanh toán, hủy session hàng loạt.
- Admin: duyệt/khóa shop, xem danh sách shop, xử lý báo cáo vi phạm, audit log.
- Anti-spam: Cloudflare Turnstile và rate limit.

### 1.3 Ngoài phạm vi MVP (KHÔNG code)

- Thanh toán online, refund online, tính phí shop (billing).
- Request booking, lịch linh hoạt, promotion/khuyến mãi.
- Nhiều page/shop, revision/rollback đầy đủ, custom domain.
- Nhân viên shop (Manager/Staff), Product Order, Custom Order.
- Marketplace tổng hợp shop, tài khoản khách, app mobile native.
- Khách tự hủy booking.

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
| `app.{PLATFORM_DOMAIN}` | Khu vực quản lý của shop owner (`/shopowner/{slug}/*`, ví dụ `/shopowner/clayco/bookings`; `/shopowner` chuyển hướng tới `/shopowner/{slug}` của shop trong phiên; địa chỉ cũ `/shopowner/bookings` và `/dashboard/*` được chuyển hướng sang địa chỉ có slug; slug khác slug của shop trả 404; `/shopowner/onboarding` là wizard tạo shop nên chưa có slug), system admin (`/systemadmin/*`; đường dẫn cũ `/admin/*` được chuyển hướng sang `/systemadmin/*`), auth (`/login`, `/signup`…) |
| `{PLATFORM_DOMAIN}` | Trang marketing của nền tảng (đơn giản, tĩnh) |
| `{slug}.{PLATFORM_DOMAIN}` | Landing page của shop. Next.js middleware/proxy (tùy phiên bản Next.js) rewrite sang `/sites/[slug]/[[...locale]]` |
| `media.{PLATFORM_DOMAIN}` | R2 public bucket (custom domain của R2) |

- Shop chưa ACTIVE hoặc page chưa PUBLISHED: trả về **404**.
- Shop SUSPENDED: trả về trang "Site unavailable" (HTTP 451 hoặc 404, chốt 404 cho MVP).

### 3.4 Cấu trúc thư mục

```
/
├─ apps/
│  ├─ web/                      # Next.js
│  │  ├─ src/app/
│  │  │  ├─ (marketing)/        # trang chủ nền tảng
│  │  │  ├─ (auth)/             # login, signup, verify, reset
│  │  │  ├─ shopowner/          # shop owner (trước đây: dashboard/)
│  │  │  ├─ admin/              # platform admin
│  │  │  └─ sites/[slug]/       # landing page public (SSR)
│  │  ├─ src/components/
│  │  │  ├─ ui/                 # shadcn
│  │  │  ├─ builder/            # page builder
│  │  │  └─ sections/           # renderer cho từng section type
│  │  ├─ src/lib/               # api client, i18n, utils
│  │  └─ messages/              # en.json, vi.json, ko.json, ja.json
│  └─ api/                      # NestJS
│     ├─ src/modules/
│     │  ├─ auth/  organizations/  members/  sites/  media/
│     │  ├─ workshops/  schedules/  sessions/  bookings/
│     │  ├─ customers/  payments/  notifications/  admin/
│     │  ├─ audit/  reports/  public/
│     ├─ src/common/            # guards, interceptors, filters, tenant context
│     ├─ src/db/                # drizzle schema, migrations, client
│     ├─ src/jobs/              # pg-boss handlers
│     ├─ src/main.ts
│     └─ src/main.worker.ts
├─ packages/
│  ├─ shared/                   # Zod schemas, enums, section registry, types
│  ├─ email-templates/          # React Email
│  └─ config/                   # eslint, tsconfig, prettier dùng chung
├─ infra/
│  ├─ docker-compose.yml        # production
│  ├─ docker-compose.dev.yml    # postgres, mailpit
│  ├─ Caddyfile
│  └─ backup/                   # script pg_dump → R2
├─ docs/
│  └─ REQUIREMENTS.md           # file này
├─ CLAUDE.md
└─ .env.example
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

**FR-AUTH-01 – Đăng ký shop owner (Must)**
- Form: email, mật khẩu (tối thiểu 10 ký tự), họ tên, đồng ý Terms và Privacy Policy, Turnstile.
- Tạo `users` với status `UNVERIFIED` và gửi email xác minh (token một lần, lưu **hash**, hết hạn sau 24 giờ).
- Email đã tồn tại: trả về thông báo chung, không tiết lộ email đã đăng ký.
- AC: user chưa xác minh không đăng nhập được dashboard; link xác minh dùng lần hai báo hết hiệu lực.

**FR-AUTH-02 – Đăng nhập, đăng xuất, quên mật khẩu (Must)**
- Session lưu bảng `auth_sessions`; cookie `httpOnly`, `Secure`, `SameSite=Lax`; hết hạn sau 7 ngày không hoạt động.
- Reset password: token một lần, lưu hash, hết hạn 1 giờ; reset xong thì xóa toàn bộ session cũ.
- Rate limit login: 5 lần sai / 15 phút / IP+email.

**FR-ORG-01 – Tạo shop / onboarding (Must)**
- Sau khi xác minh email, user đi qua wizard: tên shop (**slug do hệ thống tự sinh từ tên shop, owner không nhập**; dùng làm subdomain và nằm trong địa chỉ quản lý `/shopowner/{slug}`), quốc gia, timezone (IANA), currency (ISO 4217), ngôn ngữ mặc định, các ngôn ngữ bật thêm, thông tin liên hệ (địa chỉ, phone/WhatsApp, email, Google Maps URL).
- Slug: `^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$`, unique toàn hệ thống, chặn danh sách reserved (`app, admin, api, www, mail, media, static, help, support, status, blog, docs, cdn, assets, dashboard, login, signup, shopowner, systemadmin, onboarding`).
- **Quy tắc sinh slug** (`generateShopSlug`): từ tên shop, chữ thường, bỏ dấu (`đ` thành `d`), mỗi cụm ký tự không phải chữ hoặc số thành một dấu `-`, bỏ `-` ở hai đầu, tối đa 32 ký tự. Tên không còn ký tự dùng được (ví dụ chỉ có chữ Hàn / Nhật / Trung) thành `shop`; tên quá ngắn (dưới 3 ký tự) thêm `-shop` (ví dụ `a-shop`). Slug reserved hoặc đã có shop khác dùng thì thêm `-2`, `-3`… cho tới khi còn trống (vẫn tối đa 32 ký tự). Wizard hiển thị slug đã sinh (địa chỉ landing page và địa chỉ quản lý) ở chế độ chỉ đọc kèm lưu ý không đổi được.
- Tạo `organizations` (status `DRAFT`) và `organization_members` (role `OWNER`).
- AC: slug trùng hoặc reserved bị từ chối kèm thông báo rõ ràng.

**FR-ORG-02 – Cài đặt shop (Must)**
- Sửa thông tin shop, timezone, currency, ngôn ngữ.
- **Đổi currency hoặc timezone** khi đã có booking: hiển thị cảnh báo; không chuyển đổi dữ liệu cũ.
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

**FR-SITE-04 – Gửi duyệt và publish (Must)**
- Lần đầu: shop bấm **"Submit for review"**. `organizations.status` chuyển sang `PENDING_REVIEW`. Admin duyệt thì chuyển sang `ACTIVE` và publish bản nháp tại thời điểm duyệt.
- Điều kiện submit: có logo hoặc tên shop, hero, thông tin liên hệ, ít nhất 1 workshop ACTIVE có session sắp tới.
- Từ lần thứ hai (shop đã ACTIVE): bấm **"Publish"** thì có hiệu lực ngay. Publish là thao tác **atomic**: copy `draft_content` sang `published_content`, ghi một dòng `site_page_versions`, tăng `version`.
- Admin từ chối: lưu lý do, gửi email cho shop, status về `DRAFT`.
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
- Giới hạn dung lượng theo plan (ví dụ FREE: 200 MB/shop). Đặt trong `PLAN_LIMITS`.
- Ảnh không còn được tham chiếu sau 7 ngày: job dọn dẹp (Should).

### 5.4 Workshop, lịch và session

**FR-WS-01 – Workshop (Must)**
- Trường: title (localized), short description (localized), description (localized), duration (phút, 15–600), giá mỗi khách (`price_amount` minor units), currency (lấy theo shop, không sửa riêng), capacity mặc định mỗi session (1–50; giá trị tối đa đặt trong `PLAN_LIMITS`), số khách tối đa mỗi booking (mặc định 6), ảnh cover + tối đa 6 ảnh, những gì đã bao gồm (localized list), ghi chú/yêu cầu (localized), status `DRAFT | ACTIVE | ARCHIVED`, sort order.
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
- Không có nút hủy. Hướng dẫn: "To change or cancel, please contact the studio."

**FR-BOOK-05 – Tài khoản khách và gộp booking theo email (Should)**
- Khi khách **chưa đăng nhập** đặt chỗ, server tra email (trim + lowercase): đã có customer với email đó thì booking được ghi vào customer đó (khách có tài khoản thì vào tài khoản); chưa có thì tạo customer không tài khoản (BR-10). Server chấp nhận email có khoảng trắng hai đầu (trim).
- Khi khách **đăng ký tài khoản mới** (popup đăng nhập của landing page: email, mã xác nhận, rồi nếu email chưa có tài khoản thì bước **tạo tài khoản**: họ tên, quốc gia, ngày sinh; cả ba bắt buộc, ngày sinh không ở tương lai), server tra email đã từng booking chưa: có thì **gộp mọi booking trước đó vào tài khoản mới** (customer cũ được gắn tài khoản và lấy tên đã đăng ký; bảng Customers của shop owner hiển thị quốc gia, ngày sinh... của tài khoản), không thì tạo customer mới có tài khoản. Màn hình cuối của popup báo "N earlier bookings made with this email were added to your account" (hoặc không có booking nào). Email đã có tài khoản thì chỉ đăng nhập.
- MVP frontend: `POST /api/v1/public/sites/{slug}/accounts/lookup` (đã đăng ký chưa, số booking) và `POST /api/v1/public/sites/{slug}/accounts` (tạo tài khoản, trả `merged`; 409 `ALREADY_REGISTERED`); bản xem thử trong builder chỉ đăng nhập. TODO(api): chỉ nhận email đã xác minh phía server, giới hạn tần suất, tạo tài khoản và gộp booking trong cùng một transaction, mọi truy vấn lọc theo `organization_id`.

**FR-BOOK-04 – Yêu thích workshop (Should)**
- Mỗi thẻ workshop trên landing page (mọi template và kiểu hiển thị, kể cả dạng danh sách rút gọn) có **icon trái tim "Add to favorites"** (nút bật / tắt, `aria-pressed`, có tên truy cập "Add {tên} to favorites" / "Remove {tên} from favorites"; trái tim đặc khi đã yêu thích).
- **Khách phải đăng nhập trước khi bấm lưu:** khi chưa đăng nhập, bấm trái tim mở popup đăng nhập (nhập email, rồi nhập mã xác nhận gửi về email đó; email được trim và đổi chữ thường, sai định dạng thì báo lỗi, nhập sai mã tối đa 5 lần); đăng nhập thành công thì popup đóng và **workshop vừa bấm được lưu luôn**. Hủy popup thì không lưu gì. Khi đã đăng nhập, bấm trái tim lưu hoặc bỏ lưu ngay, không hiện popup.
- Danh sách yêu thích thuộc về từng khách (theo email) và từng shop; shop owner không dịch nội dung này (tên workshop là nội dung động của shop). Mọi text tĩnh có đủ 5 ngôn ngữ (BR-18).
- MVP frontend: phiên khách và danh sách yêu thích lưu trong `localStorage` của trình duyệt (`lib/favorites.ts`), mã xác nhận demo dùng chung với form đặt chỗ; bản xem thử trong builder dùng cùng cơ chế. TODO(api): phiên khách là cookie, danh sách yêu thích là bảng riêng khóa theo khách + `organization_id` + workshop, mọi truy vấn lọc theo `organization_id` từ ngữ cảnh server.

### 5.6 Vận hành booking (dashboard shop)

**FR-OPS-01 – Danh sách booking (Must)**
- **Khu vực tổng hợp theo Booking Status** (cùng kiểu các ô số liệu của màn hình Today) nằm giữa bộ lọc và bảng: một ô **All bookings** và một ô cho từng trạng thái (Not confirmed, Confirmed, Checked in, Cancelled), mỗi ô có **số booking** (chữ lớn) và **số khách** của các booking đó. Số liệu tính trên các booking thỏa bộ lọc **ngày, workshop, session và ô tìm kiếm**, nên các trạng thái luôn cộng lại bằng ô All bookings. **Mỗi ô là một nút bấm được (`aria-pressed`): bấm vào ô của một trạng thái thì bảng chỉ liệt kê các booking có trạng thái đó** (ô đang chọn được tô nổi; bấm lại ô đó, hoặc bấm ô All bookings, để xem tất cả). **Không còn bộ lọc Status dạng thả xuống**: trạng thái được lọc bằng chính các ô tổng hợp. **Cùng khu vực đó có thêm số liệu theo Payment status (Paid / Unpaid): mỗi ô có số booking, số khách và tổng số tiền; bấm vào ô thì lọc bảng theo Payment status (đồng bộ với bộ lọc Payment), và hai hàng số liệu lọc chéo nhau** (số theo booking status tính trên booking thỏa Payment đang chọn, số theo Payment tính trên booking thỏa booking status đang chọn). Các ô nhỏ gọn, mỗi ô có thanh màu theo trạng thái.
- **Cột Voucher và tooltip ở cột Total của danh sách booking:** thêm cột **Voucher** (mã các voucher / khuyến mãi đã áp dụng cho booking, "—" nếu không dùng) đứng trước cột Total. Rê chuột hoặc focus bàn phím vào số tiền ở cột **Total** hiện tooltip: giá gốc của booking (đơn giá × số khách), từng voucher kèm số tiền đã giảm (mỗi voucher tính trên giá gốc) và tổng tiền sau giảm giá; booking không dùng voucher ghi "No voucher". Cùng thành phần tooltip với cột Amount của trang Income & expenses.
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
- Shop hủy: bắt buộc nhập lý do; `NOT_CONFIRMED | CONFIRMED → CANCELLED`; giảm `reserved_count`; gửi email cho khách (nếu có email); ghi audit.

**FR-OPS-07 – Đổi session (Should)**
- Chuyển booking `NOT_CONFIRMED | CONFIRMED` sang session khác cùng workshop: transaction lock **cả hai** session (lock theo thứ tự `id` tăng dần để tránh deadlock), kiểm tra chỗ ở session mới, cập nhật `reserved_count` hai bên. Giữ nguyên snapshot giá. Gửi email cập nhật.

**FR-OPS-08 – (đã bỏ)** Không còn bước "hoàn tất" (`COMPLETED`): booking đã check-in giữ nguyên trạng thái `CHECKED_IN`.

**FR-PAY-01 – Ghi nhận thanh toán tại shop (Must)**
- **Thanh toán chỉ được ghi bằng Confirm payment / Unpaid ở popup của session đã đóng** (không còn màn hình nhập thủ công số tiền, phương thức hay hoàn tiền ở chi tiết booking): Confirm payment ghi một payment entry **tiền mặt** cho phần còn thiếu; Unpaid ghi một refund entry. Mỗi entry có amount, method (`CASH | CARD | BANK_TRANSFER | E_WALLET | OTHER`, hiện luôn `CASH`), type (`PAYMENT | REFUND`), note, `recorded_by`, `recorded_at`. Chi tiết booking chỉ xem danh sách entry.
- `bookings.payment_status` **chỉ có 2 giá trị: `UNPAID` (Unpaid) và `PAID` (Paid)**; mọi booking mới đều mặc định `UNPAID`. Trạng thái được **tính lại** từ tổng các payment entry trong cùng transaction: `PAID` khi số đã thu ròng (payment trừ refund) > 0 và ≥ tổng tiền của booking, còn lại là `UNPAID` (chưa thu, mới thu một phần, hoặc đã hoàn lại). Số tiền thu từng phần và hoàn tiền vẫn nằm trong các payment entry và trang Income & expenses, không có trạng thái riêng.
- Không sửa/xóa payment entry; sai thì tạo entry điều chỉnh (refund). Ghi audit.

**FR-PAY-02 – Thu nhập và lợi nhuận của shop (Could)**
- Menu `/shopowner/finance` "Income & expenses". **Chỉ thu thập và tính toán các booking có Payment status là `PAID`** (mọi payment và refund của các booking đó); booking `UNPAID` (chưa thu, mới thu một phần, hoặc đã thu rồi hoàn lại) không có mặt trong bảng và các số liệu (kể cả thẻ summary Income ở trang Overview); khi shop xác nhận thanh toán (Confirm payment ở màn hình Sessions) booking vào số liệu, khi bấm Unpaid thì ra khỏi số liệu. Backend mock lưu các payment entry do shop xác nhận (`PATCH /api/v1/bookings/{id}/payment`, số tiền do server tính từ booking). **Lợi nhuận = Tổng thu − Phí duy trì hệ thống − Phí dịch vụ.** Tổng thu = các payment entry của booking trừ refund entry (tự động, chỉ đọc; không còn khoản thu chi nhập tay). Phí duy trì hệ thống = một tỷ lệ % tính trên từng booking (từng payment / refund); phí dịch vụ = một tỷ lệ % tính trên cùng khoản thu. Refund trả lại phần phí tương ứng. Làm tròn từng khoản về minor unit.
- **Admin hệ thống cấu hình hai tỷ lệ cho TỪNG shop** tại `/systemadmin/organizations/{id}` (khung "Fees for this shop"; mỗi shop có tỷ lệ riêng, shop chưa cấu hình dùng mặc định; lưu `organization_fee_settings` dạng basis points, 1% = 100): mỗi tỷ lệ từ 0% đến 100%, tối đa 2 chữ số thập phân, hai tỷ lệ cộng lại không quá 100%. Nút Save chỉ bật khi có thay đổi (BR-17). Mặc định (mock): 2% duy trì, 3% dịch vụ. API: `GET/PUT /admin/organizations/{id}/finance-settings` (chỉ SUPER_ADMIN, ghi audit log).- Màn hình shop owner: công thức và tỷ lệ đang áp dụng; 4 thẻ Tổng thu, Phí duy trì, Phí dịch vụ, Lợi nhuận (hoặc Lỗ) theo **khoảng thời gian do shop owner chọn (Từ ngày - Đến ngày, tối đa 365 ngày mỗi lần, tính cả hai đầu; mặc định 180 ngày gần nhất; ngày tính theo timezone của shop)**; **biểu đồ cột thu - phí kèm đường lợi nhuận (theo ngày nếu khoảng ≤ 31 ngày, theo tháng nếu dài hơn)** (có bảng số liệu thay thế); tỷ trọng hai loại phí; bảng các khoản thanh toán / hoàn tiền kèm **cột Vouchers applied (mã các voucher / khuyến mãi booking đã dùng tại thời điểm thanh toán)**, và **tooltip ở cột Amount** (rê chuột hoặc focus bàn phím vào số tiền): giá gốc của booking (đơn giá × số khách, trước voucher), từng voucher kèm số tiền đã giảm (mỗi voucher tính trên giá gốc, như lúc đặt), tổng tiền của booking sau giảm giá và, với khoản hoàn tiền hoặc thanh toán một phần, số tiền của riêng dòng đó, phí và lợi nhuận của từng khoản, lọc theo loại. Thẻ Income & expenses của trang Overview hiển thị thu, phí, lợi nhuận của tháng này. Biểu đồ vẽ bằng SVG, không thêm thư viện.
- MVP frontend: tỷ lệ phí lưu trong bộ nhớ của mock backend (mất khi khởi động lại server); backend cần bảng `organization_fee_settings` và tính tổng hợp ở server, lọc theo `organization_id`.

**FR-PAY-03 – Tổng quan của shop owner / Overview (Could)**
- Trang `/shopowner` có: các số liệu chính (booking hôm nay, session sắp tới, booking chưa thanh toán); **thẻ summary cho từng phần** của shop, mỗi thẻ dẫn tới trang tương ứng: Bookings (tháng này: số booking, số khách, tỷ lệ hủy), Workshops (active / draft), Sessions (sắp tới, tỷ lệ ghế đã đặt), Customers (tổng, khách quay lại), Income & expenses (thu, chi, lãi / lỗ của tháng này), Landing pages (số page / 2, page đang public); **biểu đồ tình hình booking** theo 1 tháng (theo ngày), 3 tháng, 6 tháng và 1 năm (theo tháng); và checklist chuẩn bị publish. **Cập nhật theo trạng thái mới:** KPI gồm booking hôm nay, session sắp tới, **booking chưa xác nhận (Not confirmed)** và booking chưa thanh toán (Unpaid); thẻ Sessions có thêm **Closed, to complete** (session đã đóng đang chờ shop owner bấm Completed) và **Completed**; biểu đồ booking theo thời gian dùng các nhóm Checked in / Upcoming / Cancelled (không còn no-show).
- Biểu đồ cột chồng theo kết quả: đã tham dự (`CHECKED_IN`), sắp tới (`NOT_CONFIRMED`, `CONFIRMED`), hủy (`CANCELLED`); booking tính theo ngày của session, theo timezone của shop. Kèm tổng booking, số khách, số đã tham dự, tỷ lệ hủy của kỳ. Có bảng số liệu thay thế; vẽ bằng SVG, không thêm thư viện.
- API dự kiến: `GET /dashboard/summary` và `GET /dashboard/booking-stats?period=1m|3m|6m|12m`, lọc theo `organization_id`, tổng hợp ở backend.

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

**FR-MAIL-01 – Email (Must)**

| Event | Người nhận | Ngôn ngữ |
|---|---|---|
| Xác minh email, reset password | Shop owner | Ngôn ngữ UI của user (mặc định EN) |
| Shop được duyệt / bị từ chối / bị khóa | Shop owner | Như trên |
| `booking.confirmed` | Khách | Cả 6 ngôn ngữ trong cùng một email (xem bên dưới) |
| `booking.confirmed` (thông báo booking mới) | Email của shop | Ngôn ngữ của shop |
| `booking.created_by_shop` (walk-in / phone có email; thông tin, không cần xác nhận) | Khách | Cả 6 ngôn ngữ trong cùng một email |
| `booking.cancelled`, `booking.rescheduled`, `session.closed` | Khách | Cả 6 ngôn ngữ trong cùng một email |
| `booking.paid` (shop xác nhận đã thanh toán; biên nhận) | Khách (nếu có email; khách walk-in không có email thì bỏ qua) | Cả 6 ngôn ngữ trong cùng một email |
| Nhắc lịch 24 giờ trước (Should) | Khách | Locale của khách |

- **Email gửi khách chứa cùng một nội dung bằng 6 ngôn ngữ, nối tiếp nhau: tiếng Anh, tiếng Việt, tiếng Thái, tiếng Trung, tiếng Hàn, tiếng Nhật.** Người đọc cuộn email để đọc phần ngôn ngữ của mình (đầu email có dòng giới thiệu sáu ngôn ngữ và các link nhảy tới từng phần). **Hệ thống không phát hiện quốc gia hay ngôn ngữ của khách** (không dùng quốc gia, ngôn ngữ trình duyệt hay ngôn ngữ đã lưu), nên mọi khách nhận cùng một email. Tiêu đề email gồm 6 tiêu đề ngăn bằng " | ". Ngày giờ và tiền được viết theo từng ngôn ngữ (tiếng Thái dùng năm dương lịch). Lý do đóng / đổi lịch do hệ thống định sẵn được dịch ra cả 6 ngôn ngữ; ô giải thích của lý do Other là chữ shop owner nhập nên giữ nguyên. Mọi giá trị chèn vào HTML đều được escape. (MVP frontend: `lib/email/templates.ts` là các hàm thuần, outbox mock lưu `subject`, `text`, `html`; trang xác nhận booking có link "view the email that was sent" mở `GET /api/v1/outbox/{id}`, chỉ có ở môi trường dev.)
- Email gửi khách phải có: booking code, workshop, ngày giờ + timezone, địa chỉ, link bản đồ, tổng tiền "pay at studio", chính sách đến trễ (Mục 6, BR-09), liên hệ shop. Should: đính kèm file `.ics`.
- Gửi qua **outbox + worker**; không gửi trong request handler. Retry tối đa 5 lần (backoff lũy thừa); lỗi cuối cùng ghi log + `outbox_events.status = FAILED`.
- From: `"{Shop name} via {Platform}" <bookings@{PLATFORM_DOMAIN}>`, `Reply-To`: email của shop. Cấu hình SPF/DKIM/DMARC cho `{PLATFORM_DOMAIN}`.

### 5.8 Platform admin

**FR-ADM-01 – Danh sách shop (Must)**
- Lọc theo status; xem chi tiết (owner, ngày tạo, số workshop, số booking 30 ngày, link landing page).

**FR-ADM-02 – Duyệt shop (Must)**
- Hàng đợi `PENDING_REVIEW`. Admin xem preview bản nháp, chọn **Approve** hoặc **Reject** (bắt buộc lý do).

**FR-ADM-03 – Khóa / mở khóa shop (Must)**
- `ACTIVE ↔ SUSPENDED`, bắt buộc lý do. Shop bị khóa: landing page trả 404, dashboard chỉ đọc + banner thông báo, không nhận booking mới. Booking đã có vẫn giữ.

**FR-ADM-04 – Quản lý báo cáo vi phạm / Report management (Should)**
- Form public "Report this site": lý do (scam, phishing, nội dung không phù hợp, khác), mô tả (10–2000 ký tự), email (tùy chọn), Turnstile. Link ở footer của **mọi template** mở form dạng **popup** (dialog) ngay trên landing page; không có JS thì link dẫn tới trang `/report` có cùng form. Trong preview của builder, popup mở được nhưng không gửi báo cáo.
- Backend giới hạn 5 báo cáo được nhận / giờ / client (429 + `Retry-After`). Shop không tồn tại hoặc không `ACTIVE` trả 404.
- Trang admin `/systemadmin/reports` ("Report management"): thẻ tổng hợp theo trạng thái (cũng là bộ lọc), tìm kiếm (mô tả, email, shop), lọc theo lý do / shop, sắp xếp mới nhất / cũ nhất, xem chi tiết, **Resolve** hoặc **Dismiss** (ghi chú tùy chọn, ≤ 500 ký tự). Danh sách tự làm mới. Nội dung do khách nhập chỉ hiển thị dạng text thuần. Xử lý (`OPEN → RESOLVED | DISMISSED`) chỉ áp dụng cho báo cáo đang `OPEN`, báo cáo đã xử lý trả 409.
- API (mock trong frontend, hợp đồng theo backend thật): `POST /public/sites/{slug}/reports`; `GET /admin/reports`, `PATCH /admin/reports/{id}` (chỉ `SUPER_ADMIN`; mock hiện chưa kiểm tra quyền).
- Ngoài phạm vi hiện tại: shop owner xem báo cáo về shop của mình; thông báo email cho admin.

**FR-ADM-05 – Audit log (Must)**
- Admin xem audit log toàn hệ thống; shop owner xem audit log của shop mình (Should).

**FR-ADM-06 – Template (Should)**
- MVP: template định nghĩa trong code (`packages/shared`). Admin chỉ bật/tắt template.

**FR-ADM-07 – Thông tin liên hệ hỗ trợ của nền tảng (Should, phát triển sau)**
- Admin cấu hình các kênh hỗ trợ của nền tảng: **WhatsApp, Phone, Zalo, Email** (giá trị toàn nền tảng, không theo shop; lưu trong `platform_settings`).
- Đây là kênh để **shop owner liên hệ admin hệ thống khi cần hỗ trợ**. Hoàn toàn **không liên quan đến thông tin liên hệ của shop** (`contact_email`, `contact_phone`, `whatsapp` của organization, section `contact`) và **không bao giờ hiển thị trên landing page của shop** hay bất kỳ trang public nào; chỉ hiển thị trong khu vực `/shopowner`.
- Shop owner thấy các kênh này trong khung **Publish** của trình dựng trang ("Need help?") và ở **cuối menu bên trái, dưới mục Settings** (cùng dữ liệu, dạng cột hẹp không có đoạn mô tả), ở mọi trạng thái shop. Chỉ hiển thị kênh đã nhập; liên kết được dựng ở phía ứng dụng sau khi kiểm tra định dạng (`wa.me`, `tel:`, `zalo.me`, `mailto:`), giá trị sai bị bỏ qua.
- Hiện tại (MVP, chưa có trang admin này) dùng dữ liệu mock tại `apps/web/src/lib/mock/platform.ts`.

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
| BR-11 | Khách không tự hủy; mọi thao tác hủy/đổi do shop thực hiện và ghi lý do. |
| BR-12 | Token (verify, reset) dùng một lần, lưu hash (SHA-256), có hạn. |
| BR-13 | Shop chỉ public được sau khi admin duyệt lần đầu. |
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

`DRAFT → PENDING_REVIEW → ACTIVE ↔ SUSPENDED`; `PENDING_REVIEW → DRAFT` (bị từ chối).

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

### 7.4 Plan limits (chuẩn bị cho billing)

```ts
// packages/shared/src/plans.ts
export const PLAN_LIMITS = {
  FREE: { maxWorkshops: 3, maxSessionCapacity: 20, storageMb: 200, enabledLocales: 2 },
  PRO:  { maxWorkshops: 50, maxSessionCapacity: 50, storageMb: 5000, enabledLocales: 6 },
} as const;
```

Các con số là **placeholder**, cần PO chốt. Backend kiểm tra giới hạn tại service layer, trả HTTP 402/403 với code `PLAN_LIMIT_REACHED`.

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

**organizations**: `id`, `name`, `slug` (unique, **bất biến**: trigger / API từ chối mọi cập nhật, kể cả admin), `status` (`DRAFT|PENDING_REVIEW|ACTIVE|SUSPENDED`), `status_reason`, `country`, `timezone`, `currency`, `default_locale`, `enabled_locales text[]`, `plan` (`FREE` mặc định), `contact_email`, `contact_phone`, `whatsapp`, `address`, `maps_url`, (mặc định 120), `approved_at`, `approved_by`.

**organization_members**: `organization_id`, `user_id`, `role` (`OWNER`), `status`. PK `(organization_id, user_id)`.

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

**payments**: `id`, `organization_id`, `booking_id`, `type` (`PAYMENT|REFUND`), `amount bigint` (luôn dương), `currency`, `method`, `note`, `recorded_by`, `recorded_at`.

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
| POST | `/auth/switch-organization` | Đổi active organization |

### 9.2 Dashboard (shop owner)
| Method | Path |
|---|---|
| POST | `/organizations` (onboarding) · GET/PATCH `/organization` |
| GET | `/organization/slug-availability?slug=` |
| GET/PUT | `/site/page` (draft) · POST `/site/page/submit-review` · POST `/site/page/publish` |
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

### 9.3 Public (không cần auth, có rate limit)
| Method | Path |
|---|---|
| GET | `/public/sites/{slug}?locale=` (published content + shop info + workshops ACTIVE) |
| GET | `/public/sites/{slug}/workshops/{id}/availability?from=&to=` |
| POST | `/public/sites/{slug}/bookings` (Idempotency-Key + Turnstile) |
| GET | `/public/sites/{slug}/bookings/{bookingCode}?email=` (trang xác nhận; yêu cầu khớp email) |
| POST | `/public/sites/{slug}/reports` |

Rate limit public: availability 60 req/phút/IP; tạo booking 10 req/phút/IP; report 5 req/giờ/IP.

### 9.4 Admin (`SUPER_ADMIN`)
| Method | Path |
|---|---|
| GET | `/admin/organizations?status=` · GET `/admin/organizations/{id}` |
| POST | `/admin/organizations/{id}/approve` · `/reject` · `/suspend` · `/reactivate` |
| GET | `/admin/organizations/{id}/preview` |
| GET/PATCH | `/admin/reports` |
| GET | `/admin/audit-logs` |

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
| NFR-REL-02 | Backup `pg_dump` hằng ngày, đẩy ra bucket R2 riêng (không public), giữ 14 bản; diễn tập restore mỗi tháng. RPO/RTO chính thức cần PO chốt. |
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

SENTRY_DSN=
```

### 11.2 Dev local

- `docker compose -f infra/docker-compose.dev.yml up -d` chạy postgres + mailpit.
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

**Dữ liệu demo của Shop Owner (mock):** `apps/web/src/lib/mock/data.ts` có **vài bản ghi (≥ 3) cho mỗi trường hợp** để thử mọi màn hình, và test `data-coverage.test.ts` giữ điều đó: booking theo từng trạng thái (Not confirmed, Confirmed, Checked in, Cancelled) và từng Payment status (Paid, Unpaid), mọi cặp hợp lệ giữa hai loại này, từng nguồn (Online, Walk-in, Phone, Other), từng phương thức thanh toán, voucher (cả nhiều voucher), thanh toán một phần, hoàn tiền, hủy kèm lý do; session ở đủ trạng thái (Open, Paused, Running, Closed, Completed), session Completed có khách đã check-in và đã thanh toán, session Closed chờ Completed có đủ ba phần của danh sách thanh toán (Checked in, Not checked in, Cancelled); 3 workshop đang bán và 2 workshop nháp; khách hàng đủ 5 ngôn ngữ, có và không có tài khoản, có và không có email, đủ giới tính (và không khai báo).

### 12.1 Test bắt buộc

| Loại | Phạm vi |
|---|---|
| Unit (Vitest) | Booking state machine; tính giá; tính payment_status; validate slug; Zod schema của section; sinh session từ rule (bao gồm timezone); localization fallback |
| Integration (Vitest + Testcontainers Postgres) | **Concurrency**: 20 request đồng thời tranh 1 chỗ cuối → đúng 1 thành công, `reserved_count` không vượt capacity; idempotency (gửi lại cùng key); check-in / uncheck-in; Close và đổi lịch session kèm email cho khách; **tenant isolation**: shop A gọi API với id tài nguyên của shop B → 404 cho mọi module |
| E2E (Playwright) | Shop đăng ký → onboarding → tạo workshop + rule → chỉnh landing → submit; admin duyệt; khách mở landing → đặt chỗ → thấy trang xác nhận; email xuất hiện trong Mailpit; shop check-in + ghi nhận thanh toán |

Mục tiêu coverage: ≥ 80% cho `bookings`, `sessions`, `payments`, `auth`; các module khác ưu tiên test hành vi quan trọng thay vì chạy theo con số.

### 12.2 Acceptance criteria MVP

| ID | Tiêu chí |
|---|---|
| AC-01 | Shop tự đăng ký, xác minh email, hoàn tất onboarding và có subdomain riêng. |
| AC-02 | Shop tạo landing page từ template, chỉnh section, preview đa ngôn ngữ mà không cần deploy code. |
| AC-03 | Landing page chỉ public sau khi admin duyệt; shop bị khóa thì landing page trả 404. |
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
- [ ] Danh sách shop, hàng đợi duyệt, approve/reject/suspend/reactivate + email
- [ ] Audit log viewer
- [ ] (Should) Abuse reports

### M7 – Hardening và deploy
- [ ] Security headers, CSP, rate limits, mask log
- [ ] E2E Playwright cho luồng chính
- [ ] Dockerfile production (multi-stage), docker-compose prod, Caddyfile
- [ ] Backup script `pg_dump` → R2 + hướng dẫn restore (runbook trong `docs/`)
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
| Q2 | Tên nền tảng và domain chính thức? | `{PLATFORM_DOMAIN}` |
| Q3 | Giá trị plan limits và giá gói? | Placeholder Mục 7.4 |
| Q4 | Booking cutoff mặc định (2 giờ) có phù hợp? | 120 phút mặc định; **cấu hình theo từng session khi tạo session** (không còn theo shop) |
| Q5 | Số khách tối đa mỗi booking mặc định? | 6 |
| Q6 | Nội dung Terms, Privacy Policy và nghĩa vụ pháp lý về dữ liệu cá nhân? | Pháp chế cung cấp |
| Q7 | RPO/RTO chính thức? | Backup daily, giữ 14 bản |
| Q8 | Có cần request booking / lịch linh hoạt ở phase 2 không? | Phase 2 |
| Q9 | Email nhắc lịch 24h có bắt buộc ở MVP? | Should |
| Q10 | Shop có được đổi slug sau khi publish? | **Không** (đã chốt): slug do hệ thống sinh và không đổi, kể cả admin |

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
