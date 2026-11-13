# Workshop Landing Page & Booking Platform

Nền tảng cho các shop workshop (gốm, nến, nấu ăn, bánh...) tự tạo **landing page**, quản lý **workshop, session, booking, khuyến mãi, thu nhập**, và để khách đặt chỗ trực tuyến. Gồm 4 khu vực:

- **Website công khai của nền tảng:** Home, About Us, Contact, Terms, Privacy; đăng nhập và đăng ký bằng **popup** (đăng ký có 2 tab: khách cá nhân và chủ shop).
- **Khu vực chủ shop (shop owner):** landing page builder, workshop, session, booking, khuyến mãi, thu nhập, cài đặt (kể cả tên miền riêng).
- **Khu vực khách hàng (customer):** Today, hồ sơ, booking (check-in, đánh giá workshop sau khi session kết thúc, hủy), yêu thích, workshops, Affiliate, Referrals và rút tiền.
- **Khu admin hệ thống:** quản lý người dùng, shop (sửa, khóa, tên miền riêng), workshop, session, booking, landing page, hình ảnh, khuyến mãi, thu nhập, rút tiền, phí, affiliate, referrals, báo cáo vi phạm, hộp thư hỗ trợ, email hệ thống, Terms & Privacy, cài đặt nền tảng và audit log.

> **Trạng thái hiện tại (phiên bản 2.0-MVP, 11/11/2026):** đây là bản **MVP chỉ có giao diện (frontend)**. Dữ liệu là **dữ liệu mẫu (mock)** nằm trong bộ nhớ, **không cần database, không cần Docker, không cần backend**. Các API chạy ngay trong Next.js (`/api/v1/*`) nhưng **giữ đúng hợp đồng** của backend thật sẽ làm sau. Yêu cầu đầy đủ của dự án nằm ở [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) (tiếng Việt, là nguồn sự thật duy nhất; có bảng tình trạng triển khai và danh sách API mock).

---

## Mục lục

1. [Công nghệ sử dụng](#1-công-nghệ-sử-dụng)
2. [Cấu trúc thư mục](#2-cấu-trúc-thư-mục)
3. [Cài đặt môi trường từ số 0 (Windows)](#3-cài-đặt-môi-trường-từ-số-0-windows)
4. [Cài đặt môi trường (macOS / Linux)](#4-cài-đặt-môi-trường-macos--linux)
5. [Lấy mã nguồn và cài thư viện](#5-lấy-mã-nguồn-và-cài-thư-viện)
6. [Chạy test (lint, typecheck, test)](#6-chạy-test-lint-typecheck-test)
7. [Chạy ứng dụng để xem giao diện](#7-chạy-ứng-dụng-để-xem-giao-diện)
8. [Gặp lỗi? Xem ở đây](#8-gặp-lỗi-xem-ở-đây)
9. [Quy ước làm việc](#9-quy-ước-làm-việc)

---

## 1. Công nghệ sử dụng

| Phần | Công nghệ |
| --- | --- |
| Ngôn ngữ | TypeScript (strict) |
| Quản lý gói + monorepo | pnpm + Turborepo |
| Giao diện | Next.js (App Router), React, Tailwind CSS, shadcn/ui |
| Đa ngôn ngữ | next-intl (en, vi, ko, ja, zh; trang `/systemadmin` chỉ en + vi) |
| Kiểm tra dữ liệu | Zod |
| Test | Vitest |

Các thành phần dự kiến cho giai đoạn sau (NestJS, PostgreSQL, Drizzle, pg-boss, Cloudflare R2, Resend, Cloudflare Turnstile, Docker, Caddy) **chưa có trong mã nguồn**, bạn không cần cài.

## 2. Cấu trúc thư mục

```
landingpage_workshop/
├── apps/
│   ├── api/                  Backend NestJS (Fastify) + Drizzle + PostgreSQL (đang dựng: đăng ký, đăng nhập, email, 7 bảng đầu)
│   │   ├── src/              Mã nguồn (config, db/schema, common, health)
│   │   └── drizzle/          Migration SQL (đã merge thì không sửa, muốn đổi thì tạo migration mới)
│   └── web/                  Ứng dụng Next.js (giao diện + API mock dưới /api/v1)
│       ├── src/app/          Các trang: (marketing) website công khai, (auth), shopowner, customer,
│       │                     systemadmin, sites (landing page của shop), api
│       ├── src/lib/mock/     Kho dữ liệu mẫu trong bộ nhớ (mỗi kho có test)
│       └── messages/         Chữ giao diện 5 ngôn ngữ: en, vi, ko, ja, zh
├── packages/
│   ├── shared/               Luật nghiệp vụ dùng chung (session, booking, phí, khuyến mãi, tên miền...), có test riêng
│   └── config/               Chỗ dự phòng cho cấu hình dùng chung (hiện còn trống)
├── infra/                    docker-compose.yml (PostgreSQL 16 và Mailpit cho dev); Caddy, backup chưa có
├── docs/
│   └── REQUIREMENTS.md       Tài liệu yêu cầu (tiếng Việt)
├── CLAUDE.md                 Quy tắc làm việc của dự án
├── .env.example              Mẫu biến môi trường
├── package.json              Các lệnh chạy chung (pnpm dev, pnpm test...)
└── turbo.json                Cấu hình Turborepo
```

---

## 3. Cài đặt môi trường từ số 0 (Windows)

Làm **lần lượt từng bước**, đừng bỏ bước nào. Mỗi bước có cách kiểm tra "đã đúng chưa".

> **Terminal là gì?** Là cửa sổ đen/xanh để gõ lệnh. Trên Windows, bấm phím **Windows**, gõ `PowerShell`, bấm **Enter**. Cửa sổ hiện ra chính là terminal. Mỗi lệnh bên dưới: gõ (hoặc dán) vào, rồi bấm **Enter**.

### Bước 1. Cài Git

Git dùng để tải mã nguồn về máy.

1. Vào https://git-scm.com/download/win , bản tải về sẽ tự bắt đầu.
2. Mở file vừa tải, bấm **Next** liên tục cho đến **Install**, rồi **Finish**. (Giữ nguyên các lựa chọn mặc định.)
3. **Đóng terminal cũ và mở terminal mới** (để máy nhận Git), rồi gõ:

```powershell
git --version
```

Đúng khi hiện một dòng như `git version 2.xx.x`. Nếu hiện chữ đỏ "not recognized" thì xem [mục 8](#8-gặp-lỗi-xem-ở-đây).

### Bước 2. Cài Node.js (bản 24 trở lên)

Node.js là chương trình chạy ứng dụng. Dự án **cần Node 24 trở lên** (file `.nvmrc` ghi `24`).

1. Vào https://nodejs.org , tải bản **LTS** hoặc bản **24.x** (chọn "Windows Installer (.msi)").
2. Mở file vừa tải, bấm **Next** đến hết, tích đồng ý điều khoản, bấm **Install**.
3. **Đóng terminal và mở lại**, rồi gõ:

```powershell
node --version
```

Đúng khi hiện `v24.x.x` hoặc số lớn hơn (ví dụ `v24.1.0`). Nếu ra số nhỏ hơn 24 (như `v20...`), hãy tải lại bản mới hơn ở trang trên và cài đè lên.

### Bước 3. Cài pnpm (bản 12.16.1)

pnpm là công cụ tải các thư viện mà dự án cần. Gõ:

```powershell
npm install -g pnpm@12.16.1
```

Chờ chạy xong, rồi kiểm tra:

```powershell
pnpm --version
```

Đúng khi hiện `12.16.1`.

> Nếu PowerShell báo lỗi đỏ có chữ "running scripts is disabled" thì chạy lệnh này một lần rồi thử lại:
> `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` (gõ `Y` rồi Enter nếu máy hỏi).

### Bước 4 (không bắt buộc, khuyên dùng). Cài Visual Studio Code

Trình soạn mã để xem và sửa file: https://code.visualstudio.com . Cài bằng cách bấm **Next** đến hết.

Xong! Chuyển sang [mục 5](#5-lấy-mã-nguồn-và-cài-thư-viện).

---

## 4. Cài đặt môi trường (macOS / Linux)

1. **Git**: macOS gõ `git --version` (máy sẽ tự mời cài nếu chưa có). Linux: `sudo apt install git`.
2. **Node.js 24+**: cách dễ nhất là dùng nvm.
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   ```
   Đóng terminal, mở lại, rồi:
   ```bash
   nvm install 24
   nvm use 24
   node --version      # phải ra v24.x.x
   ```
3. **pnpm**:
   ```bash
   npm install -g pnpm@12.16.1
   pnpm --version      # phải ra 12.16.1
   ```

---

## 5. Lấy mã nguồn và cài thư viện

### Bước 1. Tải mã nguồn về máy

Chọn một thư mục để chứa dự án (ví dụ thư mục của bạn), mở terminal ở đó, rồi gõ:

```bash
git clone https://github.com/hkbach/landingpage_workshop.git
cd landingpage_workshop
```

> Nếu máy hỏi đăng nhập GitHub thì đăng nhập tài khoản **đã được cấp quyền** vào dự án. Nếu báo "repository not found" nghĩa là tài khoản chưa có quyền, hãy nhờ người quản lý dự án thêm bạn.

> **Mẹo:** nếu bạn đã có sẵn thư mục dự án (tải bằng cách khác), chỉ cần mở terminal **trong thư mục đó**. Trong VS Code: menu **File → Open Folder**, chọn thư mục dự án, rồi menu **Terminal → New Terminal**.

Kiểm tra bạn đang đứng đúng chỗ, gõ:

```bash
pnpm --version
```
rồi xem trong thư mục có file `package.json` (Windows gõ `dir`, macOS/Linux gõ `ls`).

### Bước 2. Cài các thư viện

```bash
pnpm install
```

- Lần đầu mất khoảng **1–5 phút** tùy mạng. Màn hình sẽ chạy nhiều dòng chữ, đó là bình thường.
- Đúng khi kết thúc **không có chữ `ERR`** màu đỏ, thường có dòng `Done in ...`.
- Việc này tạo ra thư mục `node_modules` (rất nặng, **không** đưa lên Git).

### Bước 3 (không bắt buộc). Tạo file biến môi trường

Dự án chạy được **không cần** file này vì đã có giá trị mặc định. Chỉ làm nếu bạn muốn đặt tên miền khác:

- Tạo file `apps/web/.env.local` với nội dung đúng một dòng: `PLATFORM_DOMAIN=localtest.me`
- File `.env.example` ở thư mục gốc là bản mẫu. Các file `.env*` **không được đưa lên Git** và **tuyệt đối không ghi mật khẩu/khóa bí mật vào đây**.

---

## 6. Chạy test (lint, typecheck, test)

Đứng ở **thư mục gốc của dự án** (thư mục có file `package.json`) và chạy các lệnh sau. **Không cần mở ứng dụng** để chạy test.

### 6.1. Chạy toàn bộ test

```bash
pnpm test
```

- Mất khoảng **10–60 giây**.
- **Thành công** khi cuối màn hình có các dòng kiểu:
  ```
  Test Files  23 passed (23)
  Tests  377 passed (377)
  ...
  Test Files  107 passed (107)
  Tests  1142 passed (1142)
  ```
  (Con số có thể khác khi dự án thêm test mới. Quan trọng là **không có chữ `failed`** và không có `FAIL`.)
- Trong lúc chạy bạn có thể thấy nhiều dòng `IntlError ...` màu đỏ/vàng. **Đó là cảnh báo của bài test, không phải lỗi.** Chỉ cần xem dòng tổng kết ở cuối.

Hai nhóm test được chạy:

| Nhóm | Ở đâu | Kiểm tra gì |
| --- | --- | --- |
| `@workshop/shared` | `packages/shared` | Luật nghiệp vụ: session, booking, phí, khuyến mãi, tên miền riêng... |
| `web` | `apps/web` | Giao diện, API mock, dữ liệu mẫu, audit log, bản dịch 5 ngôn ngữ... |

### 6.2. Chạy kiểm tra code (lint) và kiểm tra kiểu (typecheck)

```bash
pnpm lint
pnpm typecheck
```

- Thành công khi cuối có `Tasks: ... successful` và không có `error`.
- Dự án yêu cầu **cả 3 lệnh (`lint`, `typecheck`, `test`) đều phải xanh trước khi hoàn thành một thay đổi**.

### 6.3. Chạy test của riêng một nhóm hoặc một file

```bash
# Chỉ test của packages/shared
cd packages/shared
pnpm test

# Chỉ test của apps/web
cd apps/web
pnpm test

# Một file cụ thể (đang đứng trong apps/web)
pnpm exec vitest run src/lib/date-input.test.ts
```

(Dùng `cd ..` hai lần để quay về thư mục gốc.)

### 6.4. Bảng tóm tắt các lệnh

| Lệnh (chạy ở thư mục gốc) | Làm gì |
| --- | --- |
| `pnpm install` | Cài thư viện (làm lần đầu và khi `pnpm-lock.yaml` thay đổi) |
| `pnpm test` | Chạy toàn bộ test |
| `pnpm lint` | Kiểm tra cách viết code |
| `pnpm typecheck` | Kiểm tra kiểu TypeScript |
| `pnpm dev` | Chạy ứng dụng để xem giao diện (chỉ `apps/web`, không cần database) |
| `pnpm dev:api` | Chạy backend `apps/api` (cần PostgreSQL và `apps/api/.env`, xem [mục 7.1](#71-backend-và-database-postgresql-bằng-docker)); gửi email cần thêm `pnpm --filter api dev:worker` |
| `pnpm db:seed` | Nạp dữ liệu demo (cần `SEED_PASSWORD` do bạn đặt) |
| `pnpm db:generate` | Sinh migration SQL từ schema Drizzle (`apps/api/src/db/schema`) |
| `pnpm db:migrate` | Áp migration lên database trong `DATABASE_URL` |
| `pnpm build` | Đóng gói bản chạy thật (kiểm tra build) |
| `pnpm test:e2e` | Chạy các test E2E bằng trình duyệt thật (Playwright; cài một lần bằng `pnpm exec playwright install chromium`; xem [e2e/README.md](e2e/README.md)) |
| `pnpm db:encrypt-bank` | Mã hóa các số tài khoản ngân hàng còn ở dạng rõ (cần `APP_SECRET`; chạy lại an toàn) |

---

## 7. Chạy ứng dụng để xem giao diện

```bash
pnpm dev
```

Đợi đến khi thấy dòng `Ready` / `Local: http://localhost:3000`. **Giữ nguyên cửa sổ terminal đó** (đóng là ứng dụng tắt). Muốn tắt: bấm **Ctrl + C** trong terminal.

Mở trình duyệt (khuyên dùng Chrome) và vào các địa chỉ sau. Địa chỉ `*.localtest.me` luôn trỏ về máy của bạn nên **không cần cấu hình gì thêm** (nhưng cần có Internet để tên miền này được "dịch" ra địa chỉ máy).

| Khu vực | Địa chỉ | Ai dùng |
| --- | --- | --- |
| **Website công khai** (Home, About Us, Contact) | http://app.localtest.me:3000 | Mọi người |
| Đăng nhập / đăng ký | Nút **Log in** và **Sign up** trên thanh trên của website (mở popup) | Mọi người |
| **Quản lý của shop** (shop mẫu `whiskladle`) | http://app.localtest.me:3000/shopowner/whiskladle | Chủ shop |
| **Khu vực khách hàng** (khách mẫu `cu-1`) | http://app.localtest.me:3000/customer/cu-1/today | Khách có tài khoản |
| **Landing page công khai** của shop mẫu | http://whiskladle.localtest.me:3000 | Khách đặt chỗ |
| **Admin hệ thống** (chỉ en + vi) | http://app.localtest.me:3000/systemadmin | Quản trị nền tảng |

**Đăng nhập thử:** mọi tài khoản mẫu (chủ shop và khách) dùng chung **một mật khẩu mẫu** được ghi ở đầu file `apps/web/src/lib/mock/accounts-store.ts` (đây là dữ liệu mẫu, không phải mật khẩu thật). Email mẫu: chủ shop `linh@whiskladle.example`; khách có thể tìm ở trang Users của admin. Bạn cũng có thể **đăng ký tài khoản mới** bằng popup Sign up: khách cá nhân (email + mật khẩu) hoặc chủ shop (thêm tên shop, địa chỉ shop được sinh từ tên); sau khi đăng ký, chủ shop đi qua wizard thiết lập (khu vực, ngôn ngữ, liên hệ). Shop mới chỉ có trang chào mừng vì dữ liệu mẫu đầy đủ chỉ có cho shop `whiskladle`.

**Sau khi đăng nhập:** chủ shop vào trang **Overview** của shop, khách hàng vào trang **Today**.

Mẹo: bạn có thể dùng `http://localhost:3000/shopowner/whiskladle` thay cho địa chỉ `app.localtest.me` khi máy không có Internet (riêng landing page công khai thì bắt buộc dùng `whiskladle.localtest.me`).

### Đổi ngôn ngữ

Dùng nút ngôn ngữ ở góc trên bên phải (English, Tiếng Việt, 한국어, 日本語, 中文). Ngày tháng và ô nhập ngày sẽ đổi định dạng theo ngôn ngữ đã chọn.

### Về dữ liệu mẫu (rất quan trọng)

- Toàn bộ dữ liệu (workshop, session, booking, khuyến mãi, thu nhập...) là **dữ liệu mẫu** tạo sẵn.
- Bộ dữ liệu mẫu có **5 shop**: Whisk & Ladle Kitchen `whiskladle` (shop mẫu đầy đủ), Sugar & Sift Bakery `sugarsift` (bản nháp), Golden Noodle House `goldennoodle` (bị khóa), Brew & Bean Coffee Lab và Green Table Vegan Kitchen (có workshop riêng để xem trang Workshops của khách), kèm workshop, session, khách, booking ở đủ các trạng thái, khuyến mãi, thanh toán, affiliate / referral và yêu cầu rút tiền. Dữ liệu nằm trong `apps/web/src/lib/mock/`.
- Những thay đổi bạn làm (ví dụ hủy booking, đổi tỷ lệ phí hay cài đặt của admin, tạo khuyến mãi, đăng ký tài khoản, gửi tin ở trang Contact) được giữ **trong bộ nhớ của máy chủ đang chạy** nên sẽ **mất khi tắt `pnpm dev` và chạy lại**. Một số thay đổi khác lưu trong trình duyệt (xóa dữ liệu trình duyệt là mất).
- Vì vậy muốn "làm lại từ đầu" chỉ cần tắt (Ctrl + C) rồi chạy lại `pnpm dev`.

---

### 7.1. Backend và database (PostgreSQL bằng Docker)

Bản giao diện ở trên **không cần** phần này. Chỉ làm khi bạn muốn chạy `apps/api` (backend thật đang được dựng từng bước theo [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) mục 13).

1. Cài **Docker Desktop** và bật nó lên.
2. Tạo `infra/.env` với một dòng `DB_PASSWORD=<mật-khẩu-bạn-tự-đặt>` (file này không được commit).
3. Chạy database và Mailpit: `docker compose -f infra/docker-compose.yml --env-file infra/.env up -d`, rồi tạo thêm database cho test: `docker exec -it workshop-db psql -U workshop -d workshop -c "create database workshop_test;"`.
4. Tạo `apps/api/.env` (không được commit) gồm các biến sau, thay `<mật-khẩu>` bằng mật khẩu ở bước 2:
   ```
   DATABASE_URL=postgres://workshop:<mật-khẩu>@localhost:5432/workshop
   TEST_DATABASE_URL=postgres://workshop:<mật-khẩu>@localhost:5432/workshop_test
   API_PORT=4000
   LOG_LEVEL=info
   ```
   Các biến tùy chọn (đã có giá trị mặc định cho môi trường dev): `APP_URL` (mặc định `http://app.localtest.me:3000`), `REQUIRE_EMAIL_VERIFICATION` (dev mặc định `false`: đăng ký xong vào luôn; đặt `true` để bắt xác minh email như production), `EMAIL_PROVIDER` (`mailpit` hoặc `resend`), `APP_SECRET` (>= 32 ký tự; pepper của OTP và khóa mã hóa số tài khoản; dev có mặc định, **production bắt buộc đặt riêng**), `TURNSTILE_SECRET_KEY` (trống thì bỏ qua kiểm tra bot, chỉ khi dev). Danh sách đầy đủ ở [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) mục 11.1.
5. Tạo bảng: `pnpm db:migrate`.
6. Chạy backend: `pnpm dev:api`, rồi mở http://127.0.0.1:4000/health (còn sống) và http://127.0.0.1:4000/ready (kết nối được database).
7. Gửi email (đăng ký có xác minh, quên mật khẩu): chạy thêm worker ở một terminal khác bằng `pnpm --filter api dev:worker`. Email được **giữ lại ở Mailpit**, xem tại http://127.0.0.1:8025 (không gửi ra ngoài). Worker cũng **tự đóng session hết giờ** (mỗi phút) và **sinh session từ lịch lặp của workshop** (mỗi giờ), nên nên để nó chạy khi thử phần workshop và session.
8. Dữ liệu demo (tùy chọn): chạy `pnpm db:seed`. Sẽ có 1 admin, 3 shop (Whisk & Ladle `ACTIVE` có đủ lịch sử, Sugar & Sift `DRAFT`, Golden Noodle `SUSPENDED`), 4 workshop kèm lịch lặp, khoảng 120 session (đã qua, đang chạy, sắp tới, tạm dừng), khoảng 250 booking ở đủ trạng thái và khoảng 100 khoản thanh toán, cùng các khách hàng. Dữ liệu tính theo ngày hôm nay nên luôn có vẻ mới. Mọi tài khoản demo dùng **chung một mật khẩu**: nếu bạn không đặt `SEED_PASSWORD` (ít nhất 10 ký tự) trong `apps/api/.env` thì seed tự sinh một mật khẩu ngẫu nhiên và ghi vào file `apps/api/.seed-credentials` (git bỏ qua file này, mật khẩu **không** được in ra màn hình), kèm danh sách email: `admin@workshopkit.example`, `linh@whiskladle.example` (chủ shop chính), `ava@sugarsift.example`, `minh@goldennoodle.example`, `emma@example.com` (khách). Chạy lại không ghi đè tài khoản đã có. Seed cũng cho shop Whisk & Ladle tỷ lệ phí riêng (8% duy trì, 12% dịch vụ), một số booking dùng mã giảm giá 10% (phí tính trên giá gốc) và kết sổ các tháng đã qua, như worker làm mỗi giờ; chạy lại `pnpm db:seed` cũng kết sổ thêm nếu có tháng mới qua. Khách thanh toán bằng tiền mặt tại shop nên shop không có rút tiền; **customer** có ví Affiliate / Referrals và lập lệnh rút tiền, admin xử lý (chuyển tiền thật làm ngoài hệ thống, D22). Tài khoản `emma@example.com` có sẵn số dư và 3 invoice (Paid, Rejected, Pending) để xem thử. Tài khoản `emma@example.com` cũng có link mời bạn (hai người bạn đã đăng ký, một người đã có bonus) và, với dữ liệu seed mới, một link affiliate có booking đã thanh toán. Tiền affiliate / referral chỉ rút được sau khi tháng của shop được kết sổ (worker kết sổ mỗi giờ; chạy lại `pnpm db:seed` cũng kết sổ và ghi khoản cộng vào ví), và đổi tỷ lệ phí chỉ áp dụng cho các khoản thanh toán sau đó. Khi rút tiền, customer nhập **tên ngân hàng, số tài khoản và tên chủ tài khoản** để admin chuyển khoản ngoài hệ thống (số tài khoản chỉ hiện đầy đủ cho admin, customer chỉ thấy 4 ký tự cuối).
9. Test: có `TEST_DATABASE_URL` thì `pnpm test` chạy thêm các test trên PostgreSQL thật (đăng ký, đăng nhập, cách ly dữ liệu giữa các shop, email, outbox). Thiếu nó thì các test đó được bỏ qua. Các test này **tạo dữ liệu có tên ngẫu nhiên** trong `workshop_test` (audit log không xóa được nên dữ liệu tích lũy; muốn dọn thì tạo lại database test).

**Lưu ý:** đây là bản POC. Phần đăng nhập, session và phân quyền chưa được người review bảo mật, nên **không đưa lên production** khi chưa review. Những việc còn phải làm và cần người duyệt trước khi chạy thật (chuyển hướng 301 và chứng chỉ TLS cho tên miền riêng, Dockerfile, Caddy, backup, Sentry, CSP, mã hóa số tài khoản, rà soát bảo mật, pháp lý...) nằm ở [docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md).

**Triển khai thật (chưa bật):** Dockerfile, `infra/docker-compose.prod.yml`, `infra/Caddyfile`, backup mã hóa lên R2 và cách khôi phục nằm ở [docs/RUNBOOK.md](docs/RUNBOOK.md). **Nối `apps/web` với API thật chưa làm**: hiện trạng, số liệu và kế hoạch theo từng lát cắt ở [docs/WEB_API_INTEGRATION.md](docs/WEB_API_INTEGRATION.md).

**Điều khoản và Privacy (D17):** admin soạn bản **nháp**, rồi **công bố** từng ngôn ngữ; mọi phiên bản đã công bố được giữ lại (không sửa, không xóa) và có thể đưa về thành nháp mới. Công bố kiểu **major** buộc mọi người dùng đồng ý lại; mỗi lần đồng ý được ghi (phiên bản, ngôn ngữ, thời điểm). **Số tháng lưu tin Contact** và **số ngày lưu email đã gửi** chỉnh ở Settings. Khi session bị đóng hoặc dời (kể cả do admin), khách có booking còn hiệu lực nhận email báo.

Dừng database: `docker compose -f infra/docker-compose.yml stop`. **Không** thêm `-v` vào lệnh `down` nếu bạn muốn giữ dữ liệu.

---

## 8. Gặp lỗi? Xem ở đây

| Hiện tượng | Cách xử lý |
| --- | --- |
| `git` / `node` / `pnpm` "is not recognized" | Bạn chưa **đóng và mở lại terminal** sau khi cài. Đóng hẳn rồi mở lại. Vẫn lỗi thì cài lại phần mềm đó. |
| `node --version` ra số nhỏ hơn 24 | Cài Node 24+ (xem [bước 2](#bước-2-cài-nodejs-bản-24-trở-lên)). Trên macOS/Linux chạy `nvm use 24`. |
| PowerShell: "running scripts is disabled" | Chạy `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` rồi thử lại. |
| `pnpm install` báo lỗi về phiên bản Node/pnpm | Kiểm tra `node --version` (≥ 24) và `pnpm --version` (`12.16.1`). |
| `pnpm install` rất chậm hoặc đứt giữa chừng | Kiểm tra mạng, chạy lại `pnpm install`. Vẫn lỗi: xóa thư mục `node_modules` rồi chạy lại. |
| "Port 3000 is already in use" / `EADDRINUSE` | Có chương trình khác đang dùng cổng 3000 (thường là bản `pnpm dev` cũ chưa tắt). Tắt cửa sổ đó (Ctrl + C) rồi chạy lại. |
| Trình duyệt không mở được `app.localtest.me` | Kiểm tra Internet. Hoặc dùng `http://localhost:3000/shopowner/whiskladle`. |
| `pnpm test` có 1–2 test đỏ **không liên quan** thay đổi của bạn | Có vài test thỉnh thoảng chạy chậm trên máy yếu. Chạy lại `pnpm test` lần nữa. Nếu vẫn đỏ ở cùng một test thì báo cho nhóm kèm ảnh chụp màn hình. |
| Thấy nhiều dòng `IntlError` khi chạy test | Bình thường, bỏ qua. Chỉ nhìn dòng tổng kết `Tests ... passed`. |
| Sửa code nhưng trang không đổi | Tắt `pnpm dev` (Ctrl + C), chạy lại. |
| Lỗi kiểu `X is not a function` ở API sau khi `git pull` | Máy chủ dev đang giữ dữ liệu mẫu cũ trong bộ nhớ. Tắt `pnpm dev` rồi chạy lại. |
| Lỗi lạ sau khi kéo code mới (`git pull`) | Chạy lại `pnpm install`, rồi `pnpm test`. |

Vẫn chưa được? Chụp ảnh màn hình **toàn bộ** thông báo lỗi trong terminal và gửi cho nhóm.

---

## 9. Quy ước làm việc

Đọc kỹ [CLAUDE.md](CLAUDE.md) và [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) trước khi sửa. Tóm tắt:

- **Không thêm thư viện mới** nếu chưa hỏi/duyệt.
- **Mọi chữ hiển thị** phải đi qua i18n, và **mỗi chữ tĩnh phải có đủ 5 ngôn ngữ** (en, vi, ko, ja, zh) trong thư mục `apps/web/messages/`. Test `messages-parity.test.ts` sẽ báo lỗi nếu thiếu. Riêng `/systemadmin` chỉ cần en + vi. Nội dung do chủ shop nhập thì không dịch.
- **Cập nhật [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) cùng với mỗi thay đổi** về chức năng (tài liệu viết bằng tiếng Việt).
- **Mọi hành động ghi dữ liệu** của người dùng hay admin phải ghi **audit log** (không ghi mật khẩu, token hay nội dung riêng tư).
- **Không bao giờ** đưa mật khẩu, khóa bí mật, token, dữ liệu khách thật vào mã nguồn, log hay tài liệu.
- Tiền lưu bằng **đơn vị nhỏ nhất (số nguyên)**, thời gian lưu **UTC**. Giá và trạng thái do **backend tính**, không tin dữ liệu từ trình duyệt.
- Nút **Save** của form thêm/sửa chỉ bật khi dữ liệu có thay đổi; chữ nhập vào được cắt khoảng trắng đầu/cuối khi gửi.
- Mã (code), tên biến, enum và **commit message dùng tiếng Anh** theo [Conventional Commits](https://www.conventionalcommits.org) (ví dụ `feat(web): ...`, `fix(shared): ...`). **Tài liệu viết bằng tiếng Việt.**
- Trước khi báo hoàn thành một thay đổi: chạy **`pnpm lint`, `pnpm typecheck`, `pnpm test`** và cả ba phải xanh.
- **Không** chạy lệnh nguy hiểm (xóa database, force push) hoặc triển khai lên môi trường thật khi chưa có người duyệt.
