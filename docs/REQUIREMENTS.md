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
| **Platform Admin** | Đội vận hành nền tảng | `app.{PLATFORM_DOMAIN}/admin` |
| **Shop Owner** | Chủ shop; đăng ký, tạo landing page, quản lý workshop/lịch/booking | `app.{PLATFORM_DOMAIN}/shopowner` |
| **Traveler (Guest)** | Khách du lịch; xem landing page và đặt chỗ, không có tài khoản | `{shop}.{PLATFORM_DOMAIN}` |

### 1.2 Trong phạm vi MVP

- Shop đăng ký, xác minh email, đăng nhập, quên mật khẩu.
- Onboarding: tên shop, subdomain, timezone, currency, ngôn ngữ.
- Landing page builder theo **template + section** (không cho viết HTML/JS tùy ý), preview desktop/mobile theo từng ngôn ngữ, gửi duyệt, publish.
- Quản lý workshop, schedule rule (lịch cố định), session, capacity.
- Trang public: render landing page, xem lịch còn chỗ, đặt chỗ instant, email xác nhận.
- Dashboard shop: danh sách booking, tạo booking thủ công (walk-in/điện thoại), check-in, late release, no-show, hủy có lý do, đổi session, ghi nhận thanh toán, hủy session hàng loạt.
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
| `app.{PLATFORM_DOMAIN}` | Khu vực quản lý của shop owner (`/shopowner/*`; đường dẫn cũ `/dashboard/*` được chuyển hướng sang `/shopowner/*`), admin (`/admin/*`), auth (`/login`, `/signup`…) |
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
| `SUPER_ADMIN` | Platform (`users.platform_role`) | Toàn quyền khu vực `/admin`; không dùng cho thao tác trong shop |
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
- Sau khi xác minh email, user đi qua wizard: tên shop, **slug** (dùng làm subdomain), quốc gia, timezone (IANA), currency (ISO 4217), ngôn ngữ mặc định, các ngôn ngữ bật thêm, thông tin liên hệ (địa chỉ, phone/WhatsApp, email, Google Maps URL).
- Slug: `^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$`, unique toàn hệ thống, chặn danh sách reserved (`app, admin, api, www, mail, media, static, help, support, status, blog, docs, cdn, assets, dashboard, login, signup`).
- Tạo `organizations` (status `DRAFT`) và `organization_members` (role `OWNER`).
- AC: slug trùng hoặc reserved bị từ chối kèm thông báo rõ ràng.

**FR-ORG-02 – Cài đặt shop (Must)**
- Sửa thông tin shop, timezone, currency, ngôn ngữ.
- **Đổi currency hoặc timezone** khi đã có booking: hiển thị cảnh báo; không chuyển đổi dữ liệu cũ.
- Đổi slug: Should; nếu làm thì lưu slug cũ để redirect 301.

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
- Workshop đã có booking: không cho xóa, chỉ cho archive.
- Đổi giá: chỉ áp dụng cho booking mới (booking cũ đã lưu snapshot giá).

**FR-SCHED-01 – Schedule rule (Must)**
- Một workshop có nhiều rule. Rule gồm: các thứ trong tuần (`weekdays` 0–6), danh sách giờ bắt đầu (`HH:mm`, theo timezone của shop), `effective_from`, `effective_to` (tùy chọn), capacity override (tùy chọn), status.
- Job `generate-sessions` chạy hằng ngày lúc 02:00 (timezone của shop) và ngay khi rule được tạo/sửa: sinh session cho **60 ngày** tới. Phải **idempotent** (unique `(organization_id, workshop_id, starts_at)`).
- Sửa hoặc xóa rule: **không** sửa/xóa session đã có booking. Session tương lai chưa có booking thì xóa và sinh lại.

**FR-SCHED-02 – Session thủ công (Must)**
- Shop có thể thêm session lẻ (ngày giờ cụ thể), đóng session (`CLOSED`: ngừng nhận booking online), sửa capacity của session (không được nhỏ hơn `reserved_count`).

**FR-SCHED-03 – Hủy session (Must)**
- Shop hủy session: nhập lý do. Toàn bộ booking `CONFIRMED` của session chuyển sang `CANCELLED` (reason = lý do hủy session), gửi email cho từng khách theo ngôn ngữ của họ (kèm thông tin liên hệ shop để sắp xếp lại).
- Thực hiện trong một transaction; email đi qua outbox.

### 5.5 Booking (phía khách)

**FR-BOOK-01 – Xem lịch còn chỗ (Must)**
- `GET /public/sites/{slug}/workshops/{id}/availability?from=&to=` trả về các session `OPEN`, `starts_at` > now + `booking_cutoff` (mặc định 2 giờ, cấu hình theo shop), kèm `remaining = capacity - reserved_count`.
- Hiển thị giờ theo **timezone của shop**, ghi rõ tên timezone (ví dụ "Times shown in Asia/Ho_Chi_Minh"). Session hết chỗ hiển thị "Sold out".

**FR-BOOK-02 – Đặt chỗ instant (Must)**
- Booking modal gồm các bước: chọn ngày → chọn giờ → số khách → thông tin liên hệ → xác nhận.
- Field: họ tên (bắt buộc), email (bắt buộc), quốc gia (bắt buộc, chọn từ danh sách ISO), phone/WhatsApp (tùy chọn), special request (tùy chọn, tối đa 500 ký tự), checkbox đồng ý chính sách (bao gồm chính sách đến trễ), Turnstile token.
- Request có header `Idempotency-Key` (UUID do client sinh khi mở form).
- Backend:
  1. Xác minh Turnstile.
  2. Resolve tenant từ slug; kiểm tra shop `ACTIVE`, workshop `ACTIVE`, session `OPEN`, chưa qua cutoff.
  3. Kiểm tra quantity ≤ max mỗi booking.
  4. **Tính giá ở backend**: `total = price_amount × quantity`. Bỏ qua mọi giá client gửi.
  5. Transaction chống overbooking (Mục 7.1).
  6. Upsert customer theo `(organization_id, email_normalized)`. Khách cũ đặt lại: cập nhật name/phone/country/locale theo lần đặt mới nhất.
  7. Tạo booking `CONFIRMED`, `payment_status = UNPAID`, `booking_code` (8 ký tự Crockford Base32, unique), snapshot giá.
  8. Ghi outbox event `booking.confirmed` (email cho khách + email thông báo cho shop).
- Cùng `Idempotency-Key` gửi lại: trả về đúng booking đã tạo (HTTP 200), không tạo booking mới.
- Lỗi hết chỗ: HTTP 409, code `SESSION_FULL`, UI yêu cầu chọn giờ khác.
- AC: 2 khách tranh chỗ cuối cùng thì chỉ 1 người thành công (có test concurrency).

**FR-BOOK-03 – Trang xác nhận (Must)**
- Sau khi đặt: hiển thị booking code, workshop, ngày giờ (timezone của shop), số khách, tổng tiền ("Pay at the studio"), địa chỉ + link bản đồ, chính sách đến trễ, thông tin liên hệ shop.
- Không có nút hủy. Hướng dẫn: "To change or cancel, please contact the studio."

### 5.6 Vận hành booking (dashboard shop)

**FR-OPS-01 – Danh sách booking (Must)**
- Xem theo ngày (mặc định hôm nay), theo session, theo trạng thái; tìm theo booking code, tên, email.
- View "Today": danh sách session hôm nay, mỗi session hiển thị danh sách khách để check-in nhanh (tối ưu cho tablet/mobile).

**FR-OPS-02 – Tạo booking thủ công (Must)**
- Shop tạo booking cho khách walk-in, điện thoại hoặc WhatsApp. `source ∈ ONLINE | WALK_IN | PHONE | OTHER`.
- Cùng logic chống overbooking. Không bắt buộc email với `WALK_IN` (khi đó customer không có email; không gửi email).
- Cho phép tạo cho session đã bắt đầu (walk-in) nếu còn chỗ.

**FR-OPS-03 – Check-in (Must)**
- `CONFIRMED → CHECKED_IN`. Ghi `checked_in_at`, `checked_in_by`.
- Check-in và thanh toán là **hai thao tác riêng**.

**FR-OPS-04 – Late release (Must)**
- Chỉ cho phép khi `now ≥ session.starts_at + 30 phút` và booking đang `CONFIRMED`.
- `CONFIRMED → LATE_RELEASED`; giảm `reserved_count` theo quantity; bắt buộc ghi audit.
- **Không có job tự động** late release.
- Khách đến trễ sau khi đã bị release: nếu session còn đủ chỗ thì cho phép `LATE_RELEASED → CHECKED_IN` (tăng lại `reserved_count` trong transaction có lock); nếu hết chỗ thì từ chối và hiển thị thông báo.

**FR-OPS-05 – No-show (Must)**
- Sau khi session kết thúc, shop đánh dấu `CONFIRMED → NO_SHOW`. Không thay đổi `reserved_count` (session đã qua).

**FR-OPS-06 – Hủy booking (Must)**
- Shop hủy: bắt buộc nhập lý do; `CONFIRMED → CANCELLED`; giảm `reserved_count`; gửi email cho khách (nếu có email); ghi audit.

**FR-OPS-07 – Đổi session (Should)**
- Chuyển booking `CONFIRMED` sang session khác cùng workshop: transaction lock **cả hai** session (lock theo thứ tự `id` tăng dần để tránh deadlock), kiểm tra chỗ ở session mới, cập nhật `reserved_count` hai bên. Giữ nguyên snapshot giá. Gửi email cập nhật.

**FR-OPS-08 – Hoàn tất (Must)**
- Shop có thể đánh dấu `CHECKED_IN → COMPLETED` thủ công hoặc hàng loạt cho cả session. Should: job tự chuyển `CHECKED_IN → COMPLETED` sau khi session kết thúc 12 giờ.

**FR-PAY-01 – Ghi nhận thanh toán tại shop (Must)**
- Thêm payment entry: amount, method (`CASH | CARD | BANK_TRANSFER | E_WALLET | OTHER`), type (`PAYMENT | REFUND`), note. Ghi `recorded_by`, `recorded_at`.
- `bookings.payment_status` được **tính lại** từ tổng các payment entry trong cùng transaction: `UNPAID` (0), `PARTIALLY_PAID` (0 < net < total), `PAID` (net ≥ total), `REFUNDED` (có refund và net ≤ 0), `PARTIALLY_REFUNDED` (có refund và 0 < net < tổng đã trả).
- Không sửa/xóa payment entry; sai thì tạo entry điều chỉnh (refund). Ghi audit.

**FR-PAY-02 – Quản lý thu chi của shop (Could)**
- Menu `/shopowner/finance` "Income & expenses". Thu = các payment entry của booking (tự động, chỉ đọc); chi hoàn tiền = refund entry (tự động, chỉ đọc). Shop owner tự thêm / sửa / xóa các khoản thu chi khác (type `INCOME | EXPENSE`, category, số tiền bigint minor units > 0, ngày, ghi chú ≤ 200 ký tự). Danh mục thu: Sales, Other income; danh mục chi: Rent, Materials, Salaries, Marketing, Utilities, Equipment, Other expenses.
- Báo cáo theo kỳ (3 / 6 / 12 tháng gần nhất, tháng tính theo timezone của shop): tổng thu, tổng chi, lãi / lỗ; **biểu đồ cột thu - chi theo tháng kèm đường kết quả ròng** (có bảng số liệu thay thế cho trình đọc màn hình); tỷ trọng chi / thu theo danh mục; bảng các khoản có lọc theo loại và danh mục.
- Ngày nhập là ngày nghiệp vụ, lưu `occurred_at` lúc 12:00 UTC của ngày đó. Biểu đồ vẽ bằng SVG, không thêm thư viện.
- MVP frontend: khoản nhập tay lưu trong localStorage; backend cần bảng `finance_entries` (`organization_id`, `type`, `category`, `amount bigint`, `currency`, `occurred_at timestamptz`, `note`, `created_by`), lọc theo `organization_id` và ghi audit khi thêm / sửa / xóa. Chưa phân quyền theo vai trò (nên giới hạn cho OWNER).

**FR-PAY-03 – Tổng quan của shop owner / Overview (Could)**
- Trang `/shopowner` có: các số liệu chính (booking hôm nay, session sắp tới, booking chưa thanh toán); **thẻ summary cho từng phần** của shop, mỗi thẻ dẫn tới trang tương ứng: Bookings (tháng này: số booking, số khách, tỷ lệ hủy / no-show), Workshops (active / draft), Sessions (sắp tới, tỷ lệ ghế đã đặt), Customers (tổng, khách quay lại), Income & expenses (thu, chi, lãi / lỗ của tháng này), Landing pages (số page / 2, page đang public); **biểu đồ tình hình booking** theo 1 tháng (theo ngày), 3 tháng, 6 tháng và 1 năm (theo tháng); và checklist chuẩn bị publish.
- Biểu đồ cột chồng theo kết quả: đã tham dự (`CHECKED_IN`, `COMPLETED`), sắp tới (`CONFIRMED`), hủy / no-show (`CANCELLED`, `NO_SHOW`, `LATE_RELEASED`); booking tính theo ngày của session, theo timezone của shop. Kèm tổng booking, số khách, số đã tham dự, tỷ lệ hủy / no-show của kỳ. Có bảng số liệu thay thế; vẽ bằng SVG, không thêm thư viện.
- API dự kiến: `GET /dashboard/summary` và `GET /dashboard/booking-stats?period=1m|3m|6m|12m`, lọc theo `organization_id`, tổng hợp ở backend.

**FR-PROMO-01 – Quản lý khuyến mãi / Promotion management (Could)**
- Menu `/shopowner/promotions`. Shop owner tạo, sửa, tạm dừng / tiếp tục và xóa khuyến mãi: tiêu đề và mô tả theo từng ngôn ngữ (chỉ nhập ngôn ngữ đang chọn), loại giảm `PERCENT` (1–100) hoặc `FIXED_AMOUNT` (minor units), **mã khuyến mãi bắt buộc nhập** (3–20 ký tự, chỉ gồm chữ cái A–Z không dấu và chữ số 0–9; **không có khoảng trắng, không có ký tự đặc biệt**; lưu dạng chữ hoa), áp dụng cho tất cả workshop hoặc một số workshop, ngày bắt đầu và ngày kết thúc (ngày nghiệp vụ theo timezone của shop, gồm cả hai ngày). Tối đa 20 khuyến mãi / shop.
- Trạng thái tính từ ngày hiện tại của shop: `SCHEDULED` (chưa tới ngày), `ACTIVE`, `EXPIRED` (quá ngày); `PAUSED` khi shop owner tạm dừng (ưu tiên hơn ngày). Trang quản lý có thẻ tổng hợp theo trạng thái (cũng là bộ lọc), ví dụ giá sau giảm khi nhập, xác nhận khi xóa.
- **Danh sách dạng bảng và tìm kiếm:** trang quản lý hiển thị khuyến mãi trong **bảng** (ảnh, tiêu đề + mã, mức giảm, thời gian áp dụng, workshop áp dụng, trạng thái, cách dùng trên booking, thao tác Edit / Pause-Resume / Delete). Tìm theo: **tiêu đề** (mọi ngôn ngữ, không phân biệt hoa thường và dấu), **thời gian áp dụng** (khoảng ngày giao với kỳ của khuyến mãi, có thể bỏ trống một đầu), **trạng thái** (cùng bộ lọc với các thẻ đếm trạng thái) và **workshop đang được áp dụng** (khuyến mãi cho tất cả workshop áp dụng cho mọi workshop). Các điều kiện kết hợp với nhau; có nút xóa bộ lọc và số kết quả.
- **Thông báo bằng pop-up:** khi bị từ chối vì vượt giới hạn (tạo, sửa ngày hoặc Resume làm quá 5 khuyến mãi chạy cùng lúc, hoặc đủ 20 khuyến mãi) giao diện hiển thị **pop-up** (alert dialog) có nút OK thay vì dòng chữ ở đầu trang; form tạo / sửa vẫn mở bên dưới để đổi ngày. Dòng "Running now: n of 5" giữ nguyên trên trang.
- **Cảnh báo vượt ngân sách ("over budget"):** khi tạo hoặc sửa khuyến mãi, nếu với khuyến mãi này cùng các khuyến mãi khác đang bật và chạy **cùng ngày**, khách có thể được giảm **từ 80% giá trở lên** ở một workshop mà khuyến mãi áp dụng (`OVER_BUDGET_PERCENT = 80`), form hiển thị cảnh báo màu vàng kèm danh sách workshop và mức giảm tối đa, và khi bấm Save hiện pop-up xác nhận "Go back and change" / "Save anyway" (cảnh báo, không chặn). Mức giảm tối đa tính theo cách khách thực sự dùng được: gộp tất cả khuyến mãi `MULTIPLE` (cộng các phần trăm, mỗi phần trăm tính trên giá gốc, và các số tiền cố định; tối đa bằng giá), hoặc một khuyến mãi `SINGLE` dùng riêng, lấy mức cao hơn; xét từng ngày (khuyến mãi không bao giờ chạy cùng nhau thì không cộng). Khuyến mãi đang tạm dừng không bị cảnh báo.
- **Chặn khuyến mãi làm workshop miễn phí (100%):** khi tạo hoặc sửa, nếu với khuyến mãi này cùng các khuyến mãi khác đang bật và chạy **cùng ngày**, mức giảm tối đa của **bất kỳ workshop nào** khuyến mãi áp dụng đạt **100% giá** (`FULL_DISCOUNT_PERCENT = 100`, tính cùng cách với cảnh báo over budget: các phần trăm (mỗi phần trăm tính trên **giá gốc**) và các số tiền cố định kết hợp được cộng với nhau, nên chỉ cần tổng đạt 100% giá, ví dụ 60% + 40%, là bị chặn), thì form hiển thị thông báo đỏ nêu rõ các workshop sẽ miễn phí, bấm Save hiện pop-up và **không lưu**. Backend kiểm tra lại và từ chối (422 `FULL_DISCOUNT`, kèm `workshopIds`). Khuyến mãi đang tạm dừng được lưu nhưng **không thể Resume** nếu việc đó làm workshop miễn phí (cùng lỗi). Cảnh báo over budget chỉ hiện khi không bị chặn.
- **Cột khuyến mãi trong danh sách Workshop của shop owner (`/shopowner/workshops`):** thêm 2 cột. "Promotions you can apply" liệt kê các khuyến mãi đang chạy hôm nay và áp dụng cho workshop đó (tiêu đề, mức giảm, có kết hợp được hay không). "Maximum discount" hiển thị **hai con số** cho 1 khách, mỗi số gồm **tổng số tiền** và **tổng % trên giá gốc**: (1) "All n promotions together" = **tổng khi áp dụng tất cả khuyến mãi** của workshop (cộng các % trên giá gốc và các số tiền cố định, tối đa bằng giá, **bỏ qua** việc khuyến mãi nào đó là "Only this promotion"); (2) "Most one guest can combine" = mức giảm tối đa một khách **thực sự** nhận được, tuân theo quy tắc kết hợp: gộp mọi khuyến mãi `MULTIPLE`, hoặc một khuyến mãi `SINGLE` dùng riêng, lấy mức cao hơn; kèm giá sau giảm và các khuyến mãi tạo nên mức đó. Khi mọi khuyến mãi đều kết hợp được thì hai số trùng nhau và chỉ hiện một lần. Không có khuyến mãi nào thì cột hiển thị "No promotion applies" và dấu gạch.
- **Section "Promotions" trên landing page** (loại section mới, tự lấy nội dung như section Workshops; layout `cards` hoặc `banner`; chỉ có tiêu đề section là nhập tay): hiển thị các khuyến mãi đang `ACTIVE` hôm nay gồm mức giảm, tiêu đề, mô tả, workshop áp dụng, hạn dùng và mã. Section tự ẩn (cùng link menu) khi không có khuyến mãi nào đang chạy. Có sẵn trong cả 10 template; shop owner có thể thêm / bớt / đổi thứ tự như các section khác.
- **Section trong Web builder:** section "Promotions" nằm trong danh sách section của builder, sắp xếp thứ tự (kéo thả hoặc mũi tên lên xuống), bật / tắt hiển thị, đổi layout, đổi tiêu đề, màu và nút Book như các section khác. Khi shop owner chọn section này, builder hiển thị thông báo rằng nội dung do **Promotion management** quản lý kèm nút "Go to Promotion management" (builder lưu bản nháp đang chờ trước khi chuyển trang). Bản nháp / bản đã publish lưu trước khi có section này được thêm section **một lần** (sau workshop) khi mở lại; nếu shop owner xóa thì không tự thêm lại.
- **Ảnh:** mỗi khuyến mãi có tối đa **1 ảnh** (upload JPEG / PNG / WebP, hoặc link https), hiển thị ở trang quản lý và ở section Promotions. Ảnh được kiểm tra magic bytes ở server, tối đa 1 MB sau khi thu nhỏ; ảnh bị thay hoặc khuyến mãi bị xóa thì ảnh cũng bị xóa. Ảnh do nền tảng phục vụ tại `/api/v1/media/promotions/{id}` (mock của presigned upload lên R2, FR-MEDIA-01).
- **Giới hạn chạy đồng thời:** tại **một thời điểm** chỉ có tối đa **5 khuyến mãi** chạy (`MAX_CONCURRENT_PROMOTIONS`). Tính trên các khuyến mãi đang bật, theo từng ngày từ hôm nay trở đi, kể cả khuyến mãi đã lên lịch trùng ngày; khuyến mãi tạm dừng và các ngày đã qua không tính. Tạo, sửa ngày hoặc **tiếp tục** một khuyến mãi làm vượt 5 ở bất kỳ ngày nào thì bị từ chối (409 `CONCURRENT_LIMIT`, kèm ngày đầu tiên vượt). Trang quản lý hiển thị "Running now: n of 5".
- **Cách dùng khuyến mãi trên booking (shop owner cấu hình cho TỪNG khuyến mãi, trường `stacking`):** `SINGLE` = khi khách dùng khuyến mãi này thì **không** được dùng thêm khuyến mãi nào khác trên booking đó (mặc định); `MULTIPLE` = **có thể kết hợp** với các khuyến mãi khác cũng là `MULTIPLE`. Tập khuyến mãi khách chọn hợp lệ khi chỉ có 1 khuyến mãi, hoặc khi mọi khuyến mãi trong tập đều là `MULTIPLE`. Trong form đặt chỗ, khách thấy các khuyến mãi đang chạy hôm nay và áp dụng cho workshop đã chọn (kèm ghi chú "Can be combined" / "Cannot be combined"), chọn bằng ô tick: chọn một khuyến mãi `SINGLE` thì thay thế toàn bộ lựa chọn khác; chọn một khuyến mãi `MULTIPLE` thì thay thế khuyến mãi `SINGLE` đang chọn (nếu có) và được cộng cùng các khuyến mãi `MULTIPLE` khác. Cách tính giá (backend tính lại, không tin giá từ client): tạm tính = đơn giá × số khách; **mọi khuyến mãi đều tính trên giá gốc (tạm tính)**: khuyến mãi theo phần trăm giảm đúng phần trăm đó của giá gốc và các phần trăm được **cộng** với nhau (ví dụ 20% và 15% giảm tổng cộng **35% giá gốc**, không phải giảm 20% rồi giảm tiếp 15% trên số tiền còn lại); số tiền cố định (`FIXED_AMOUNT`) tính cho **cả booking**; kết quả không phụ thuộc thứ tự khách chọn; tổng giảm không vượt quá giá gốc nên tổng tiền không bao giờ nhỏ hơn 0. Backend từ chối tập khuyến mãi không hợp lệ. Backend lưu snapshot các khuyến mãi và số tiền giảm vào booking. Mỗi khuyến mãi trên landing page ghi rõ có kết hợp được hay không.
- **Ngoài phạm vi hiện tại:** trong MVP frontend, giá sau khuyến mãi chỉ là giá tạm tính trong form đặt chỗ (đặt chỗ vẫn là mô phỏng), chưa có kiểm tra backend và chưa ghi snapshot; mã khuyến mãi chỉ hiển thị cho khách nhắc lại tại shop, chưa nhập mã trong form. Thanh toán vẫn tại shop.
- API (mock trong frontend, hợp đồng theo backend thật): `GET/POST /promotions`, `PUT/PATCH/DELETE /promotions/{id}`, `POST /media/promotions` (upload ảnh) (chỉ OWNER / MANAGER, lọc theo `organization_id`, ghi audit); trang public đọc các khuyến mãi đang chạy của shop. Bảng `promotions` (`organization_id`, `title jsonb`, `description jsonb`, `discount_type`, `discount_value bigint`, `code`, `image_url`, `stacking`, `applies_to`, `workshop_ids`, `start_date date`, `end_date date`, `enabled`).

**FR-CUST-01 – Khách hàng (Must)**
- Danh sách customer của shop, chi tiết và lịch sử booking. Tìm theo tên/email.
- Customer thuộc riêng từng shop; không gộp giữa các shop.
- Should: export CSV; xóa/ẩn danh customer theo yêu cầu (quyền riêng tư).

### 5.7 Thông báo email

**FR-MAIL-01 – Email (Must)**

| Event | Người nhận | Ngôn ngữ |
|---|---|---|
| Xác minh email, reset password | Shop owner | Ngôn ngữ UI của user (mặc định EN) |
| Shop được duyệt / bị từ chối / bị khóa | Shop owner | Như trên |
| `booking.confirmed` | Khách | Locale khách chọn khi đặt |
| `booking.confirmed` (thông báo booking mới) | Email của shop | Ngôn ngữ của shop |
| `booking.cancelled`, `booking.rescheduled`, `session.cancelled` | Khách | Locale của khách |
| Nhắc lịch 24 giờ trước (Should) | Khách | Locale của khách |

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
- Trang admin `/admin/reports` ("Report management"): thẻ tổng hợp theo trạng thái (cũng là bộ lọc), tìm kiếm (mô tả, email, shop), lọc theo lý do / shop, sắp xếp mới nhất / cũ nhất, xem chi tiết, **Resolve** hoặc **Dismiss** (ghi chú tùy chọn, ≤ 500 ký tự). Danh sách tự làm mới. Nội dung do khách nhập chỉ hiển thị dạng text thuần. Xử lý (`OPEN → RESOLVED | DISMISSED`) chỉ áp dụng cho báo cáo đang `OPEN`, báo cáo đã xử lý trả 409.
- API (mock trong frontend, hợp đồng theo backend thật): `POST /public/sites/{slug}/reports`; `GET /admin/reports`, `PATCH /admin/reports/{id}` (chỉ `SUPER_ADMIN`; mock hiện chưa kiểm tra quyền).
- Ngoài phạm vi hiện tại: shop owner xem báo cáo về shop của mình; thông báo email cho admin.

**FR-ADM-05 – Audit log (Must)**
- Admin xem audit log toàn hệ thống; shop owner xem audit log của shop mình (Should).

**FR-ADM-06 – Template (Should)**
- MVP: template định nghĩa trong code (`packages/shared`). Admin chỉ bật/tắt template.

**FR-ADM-07 – Thông tin liên hệ hỗ trợ của nền tảng (Should, phát triển sau)**
- Admin cấu hình các kênh hỗ trợ của nền tảng: **WhatsApp, Phone, Zalo, Email** (giá trị toàn nền tảng, không theo shop; lưu trong `platform_settings`).
- Đây là kênh để **shop owner liên hệ admin hệ thống khi cần hỗ trợ**. Hoàn toàn **không liên quan đến thông tin liên hệ của shop** (`contact_email`, `contact_phone`, `whatsapp` của organization, section `contact`) và **không bao giờ hiển thị trên landing page của shop** hay bất kỳ trang public nào; chỉ hiển thị trong khu vực `/shopowner`.
- Shop owner thấy các kênh này trong khung **Publish** của trình dựng trang ("Need help?") ở mọi trạng thái shop. Chỉ hiển thị kênh đã nhập; liên kết được dựng ở phía ứng dụng sau khi kiểm tra định dạng (`wa.me`, `tel:`, `zalo.me`, `mailto:`), giá trị sai bị bỏ qua.
- Hiện tại (MVP, chưa có trang admin này) dùng dữ liệu mock tại `apps/web/src/lib/mock/platform.ts`.

---

## 6. Quy tắc nghiệp vụ

| ID | Quy tắc |
|---|---|
| BR-01 | Dữ liệu nghiệp vụ thuộc đúng một organization; không truy cập chéo tenant. |
| BR-02 | Slug shop unique toàn hệ thống và không thuộc danh sách reserved. |
| BR-03 | Không được vượt capacity, kể cả khi có request đồng thời; kiểm tra bằng transaction + row lock. |
| BR-04 | Backend tính giá; không tin giá/discount/status từ client. |
| BR-05 | Booking lưu snapshot: `unit_price_amount`, `quantity`, `total_amount`, `currency`, tên workshop, `starts_at`, timezone. Lịch sử không bị tính lại khi workshop đổi giá. |
| BR-06 | `booking.status` và `payment_status` độc lập; `CONFIRMED` không có nghĩa là đã trả tiền. |
| BR-07 | Các status chiếm chỗ: `CONFIRMED`, `CHECKED_IN`, `COMPLETED`. Chuyển sang `CANCELLED` hoặc `LATE_RELEASED` thì giải phóng chỗ. `NO_SHOW` không thay đổi `reserved_count`. |
| BR-08 | Late release chỉ làm thủ công, sau 30 phút kể từ giờ bắt đầu; luôn có audit. |
| BR-09 | Thông báo chính sách đến trễ (hiển thị ở booking modal, trang xác nhận, email): *"Please arrive on time for your workshop. If you arrive more than 30 minutes late, your booking may be released and your reserved spot may be offered to walk-in guests. If there are still available spots when you arrive, you may still be able to join."* Cần bản dịch VI/KO/JA/ZH/ZH-TW trong `messages/*.json`. |
| BR-10 | Customer nhận diện bằng `email_normalized` (trim + lowercase) trong một organization; không tự gộp theo tên/phone. |
| BR-11 | Khách không tự hủy; mọi thao tác hủy/đổi do shop thực hiện và ghi lý do. |
| BR-12 | Token (verify, reset) dùng một lần, lưu hash (SHA-256), có hạn. |
| BR-13 | Shop chỉ public được sau khi admin duyệt lần đầu. |
| BR-14 | Tiền lưu bằng `BIGINT` minor units + `currency`. Số chữ số thập phân lấy theo ISO 4217 (VND = 0, USD = 2, JPY = 0, KRW = 0). Không dùng float. |
| BR-15 | Mọi timestamp lưu `timestamptz` (UTC). Giờ hiển thị và giờ trong schedule rule hiểu theo timezone IANA của shop. |

### 6.1 State machine booking

```
                ┌──────────────► CANCELLED (shop, có lý do)        [giải phóng chỗ]
                │
  (tạo) ──► CONFIRMED ──► CHECKED_IN ──► COMPLETED
                │   ▲          ▲
                │   │          │ (khách trễ đến, còn chỗ → chiếm lại chỗ)
                │   │          │
                ├───┼──► LATE_RELEASED  (≥ start + 30 phút)          [giải phóng chỗ]
                │   │
                └───┴──► NO_SHOW        (sau khi session kết thúc)
```

Chuyển trạng thái hợp lệ (mọi chuyển khác → HTTP 409 `INVALID_TRANSITION`):

| Từ | Sang | Điều kiện |
|---|---|---|
| CONFIRMED | CHECKED_IN | Session chưa bị hủy |
| CONFIRMED | LATE_RELEASED | now ≥ starts_at + 30 phút |
| CONFIRMED | NO_SHOW | now ≥ ends_at |
| CONFIRMED | CANCELLED | Có lý do |
| LATE_RELEASED | CHECKED_IN | Session còn đủ chỗ (lock) |
| CHECKED_IN | COMPLETED | — |

Implement state machine trong **một chỗ** (`bookings/booking-state.ts`) và có unit test đầy đủ.

### 6.2 State organization

`DRAFT → PENDING_REVIEW → ACTIVE ↔ SUSPENDED`; `PENDING_REVIEW → DRAFT` (bị từ chối).

### 6.3 State session

`OPEN ↔ CLOSED`; `OPEN | CLOSED → CANCELLED` (không quay lại).

---

## 7. Yêu cầu kỹ thuật quan trọng

### 7.1 Chống overbooking (bắt buộc đúng mẫu này)

```sql
BEGIN;

SELECT id, capacity, reserved_count, status, starts_at
FROM workshop_sessions
WHERE id = :session_id AND organization_id = :org_id
FOR UPDATE;

-- validate: status = 'OPEN', starts_at > now() + cutoff (với booking online),
--           reserved_count + :qty <= capacity

INSERT INTO bookings (...) VALUES (...);

UPDATE workshop_sessions
SET reserved_count = reserved_count + :qty, updated_at = now()
WHERE id = :session_id AND organization_id = :org_id;

INSERT INTO outbox_events (...) VALUES (...);

COMMIT;
```

- Thêm `CHECK (reserved_count >= 0 AND reserved_count <= capacity)` trên `workshop_sessions` làm lớp bảo vệ cuối.
- Mọi thao tác thay đổi `reserved_count` (tạo, hủy, late release, check-in lại, đổi session) phải đi qua `SessionCapacityService` và dùng mẫu lock trên.
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

**organizations**: `id`, `name`, `slug` (unique), `status` (`DRAFT|PENDING_REVIEW|ACTIVE|SUSPENDED`), `status_reason`, `country`, `timezone`, `currency`, `default_locale`, `enabled_locales text[]`, `plan` (`FREE` mặc định), `contact_email`, `contact_phone`, `whatsapp`, `address`, `maps_url`, `booking_cutoff_minutes` (mặc định 120), `approved_at`, `approved_by`.

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

**workshop_sessions**: `id`, `organization_id`, `workshop_id`, `schedule_rule_id` (nullable), `starts_at timestamptz`, `ends_at timestamptz`, `capacity`, `reserved_count` (mặc định 0), `status` (`OPEN|CLOSED|CANCELLED`), `cancel_reason`. `UNIQUE (organization_id, workshop_id, starts_at)`; `CHECK (reserved_count BETWEEN 0 AND capacity)`; index `(organization_id, starts_at, status)`.

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

Ghi audit cho các action: đăng nhập thất bại nhiều lần, tạo/duyệt/từ chối/khóa shop, publish page, tạo/sửa/archive workshop, đổi giá, hủy session, tạo booking thủ công, check-in, late release, no-show, hủy booking, đổi session, ghi nhận payment/refund, xóa/ẩn danh customer.

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
| CRUD | `/workshops` · POST `/workshops/{id}/archive` |
| CRUD | `/workshops/{id}/schedule-rules` |
| GET | `/sessions?from=&to=&workshopId=` · POST `/sessions` · PATCH `/sessions/{id}` · POST `/sessions/{id}/cancel` |
| GET | `/bookings?date=&sessionId=&status=&q=` · GET `/bookings/{id}` · POST `/bookings` (thủ công) |
| POST | `/bookings/{id}/check-in` · `/late-release` · `/no-show` · `/cancel` · `/complete` · `/reschedule` |
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

### 12.1 Test bắt buộc

| Loại | Phạm vi |
|---|---|
| Unit (Vitest) | Booking state machine; tính giá; tính payment_status; validate slug; Zod schema của section; sinh session từ rule (bao gồm timezone); localization fallback |
| Integration (Vitest + Testcontainers Postgres) | **Concurrency**: 20 request đồng thời tranh 1 chỗ cuối → đúng 1 thành công, `reserved_count` không vượt capacity; idempotency (gửi lại cùng key); late release/check-in lại; hủy session hàng loạt; **tenant isolation**: shop A gọi API với id tài nguyên của shop B → 404 cho mọi module |
| E2E (Playwright) | Shop đăng ký → onboarding → tạo workshop + rule → chỉnh landing → submit; admin duyệt; khách mở landing → đặt chỗ → thấy trang xác nhận; email xuất hiện trong Mailpit; shop check-in + ghi nhận thanh toán |

Mục tiêu coverage: ≥ 80% cho `bookings`, `sessions`, `payments`, `auth`; các module khác ưu tiên test hành vi quan trọng thay vì chạy theo con số.

### 12.2 Acceptance criteria MVP

| ID | Tiêu chí |
|---|---|
| AC-01 | Shop tự đăng ký, xác minh email, hoàn tất onboarding và có subdomain riêng. |
| AC-02 | Shop tạo landing page từ template, chỉnh section, preview đa ngôn ngữ mà không cần deploy code. |
| AC-03 | Landing page chỉ public sau khi admin duyệt; shop bị khóa thì landing page trả 404. |
| AC-04 | Khách đặt chỗ không cần tài khoản; nhận email xác nhận đúng ngôn ngữ đã chọn. |
| AC-05 | Không overbooking khi có request đồng thời (có test chứng minh). |
| AC-06 | Giá do backend tính; booking giữ snapshot khi workshop đổi giá. |
| AC-07 | Shop tạo booking walk-in, check-in, late release, no-show, hủy, ghi nhận thanh toán; tất cả có audit log. |
| AC-08 | Hủy session thì toàn bộ booking liên quan bị hủy và khách nhận email. |
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
- [ ] State machine: check-in, late release, check-in lại, no-show, cancel, complete
- [ ] Ghi nhận payment + tính payment_status
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
9. Text hiển thị cho người dùng phải qua i18n (`messages/*.json`), có đủ key EN; VI/KO/JA có thể để TODO nhưng phải có key.
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
| Q4 | Booking cutoff mặc định (2 giờ) có phù hợp? | 120 phút, shop cấu hình được |
| Q5 | Số khách tối đa mỗi booking mặc định? | 6 |
| Q6 | Nội dung Terms, Privacy Policy và nghĩa vụ pháp lý về dữ liệu cá nhân? | Pháp chế cung cấp |
| Q7 | RPO/RTO chính thức? | Backup daily, giữ 14 bản |
| Q8 | Có cần request booking / lịch linh hoạt ở phase 2 không? | Phase 2 |
| Q9 | Email nhắc lịch 24h có bắt buộc ở MVP? | Should |
| Q10 | Shop có được đổi slug sau khi publish? | Should, kèm redirect 301 |

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
