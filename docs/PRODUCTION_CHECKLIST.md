# Checklist triển khai production

> **Trạng thái:** bản nháp của TECHVIFY, ngày 13/11/2026. Dự án hiện là **POC**. Mọi mục dưới đây là việc **chưa làm** hoặc **cần người duyệt** trước khi chạy cho khách hàng thật. **Không bật hay triển khai bất kỳ mục nào lên production khi chưa có người có thẩm quyền duyệt** (hạ tầng, DNS, TLS, bảo mật, pháp lý).
>
> Nguồn: `docs/REQUIREMENTS.md` (§11 hạ tầng, §13 milestone M7, các quyết định D13, D17, D18, D21).

## 1. Tên miền riêng của shop (D13) — cần người duyệt

Backend đã có: lưu `organizations.custom_domain` (unique), kiểm tra DNS (`custom_domain_verified_at`), tra host `GET /public/domains/{host}`. Phần dưới là **hạ tầng**, chưa làm:

- [ ] **Chuyển hướng 301** từ `{slug}.{PLATFORM_DOMAIN}` sang tên miền riêng **đã xác minh** (tránh trùng nội dung, SEO). Chỉ chuyển hướng khi `custom_domain_verified_at` có giá trị; tên miền chưa xác minh thì không chuyển.
- [ ] **Chứng chỉ TLS tự cấp (Caddy on-demand TLS)** cho tên miền riêng, với `on_demand_tls { ask ... }` gọi `GET /public/domains/{host}`: **chỉ cấp cho tên miền đã xác minh** của một shop đang hoạt động (nếu không, bất kỳ ai cũng có thể bắt máy chủ xin chứng chỉ cho tên miền tùy ý và làm cạn hạn mức của Let's Encrypt).
- [ ] Giới hạn tần suất của endpoint `ask` và không để nó lộ ra ngoài mạng nội bộ.
- [ ] Hướng dẫn cho shop: bản ghi DNS cần tạo (CNAME / A), thời gian lan truyền, cách xử lý khi xác minh lỗi.
- [ ] Kiểm thử trên staging với một tên miền thật trước khi bật; có cách tắt nhanh (gỡ tên miền khỏi shop làm `ask` từ chối).
- [ ] Tên miền riêng bị gỡ hoặc shop bị khóa: ngừng cấp và ngừng chuyển hướng.

## 2. Hạ tầng và vận hành (M7)

- [x] Dockerfile production (multi-stage) cho `apps/web` và `apps/api`, docker-compose prod, Caddyfile: đã viết (13/11/2026); image API đã chạy thử với database tạm (migrate, health, worker, user không phải root). Còn: chạy thử toàn bộ stack trên staging, đặt biến môi trường thật (`docs/RUNBOOK.md`), cần người duyệt.
- [ ] Tách host theo D21: website công khai ở `{PLATFORM_DOMAIN}`, khu quản lý ở `app.{PLATFORM_DOMAIN}`; cookie đăng nhập chỉ đặt cho `app.`.
- [ ] `APP_URL` dùng **https**; cookie `Secure`, `SameSite` đúng; kiểm tra `OriginGuard` với các host thật.
- [x] Backup `pg_dump` mã hóa lên R2 và runbook khôi phục (`infra/backup/`, `docs/RUNBOOK.md`): đã viết và thử với database tạm. Còn: thử với bucket R2 thật (cần khóa R2), bật khóa xóa / lifecycle cho bucket backup, diễn tập khôi phục trên máy khác.
- [ ] Giám sát và cảnh báo cơ bản, Sentry (cần DSN do người phụ trách cung cấp; không đưa vào repo).
- [ ] Chạy worker (`dev:worker` → process production) cho outbox email, tự đóng session, sinh session, kết sổ tài chính, `maintenance.purge`.
- [x] CSP đầy đủ cho web (nonce theo request) và che log: đã làm (13/11/2026). Còn: rà CSP bằng trình duyệt thật khi web đã nối API thật (Playwright kiểm tra không có vi phạm CSP), rate limit ở tầng proxy (Caddy), chuyển rate limit trong bộ nhớ vào database khi chạy nhiều instance.
- [ ] E2E Playwright cho luồng chính.

## 3. Bảo mật và dữ liệu cá nhân

- [ ] **Rà soát bảo mật bởi con người** (xác thực, phân quyền theo tổ chức, rút tiền, tên miền riêng, upload) trước khi cho khách thật dùng. Mã do AI sinh ra không được coi là đã tin cậy.
- [ ] `REQUIRE_EMAIL_VERIFICATION=true` và bật Turnstile (khóa do người phụ trách cấp).
- [x] Mã hóa cột số tài khoản ngân hàng (AES-256-GCM) và pepper cho OTP: **đã làm trong mã** (13/11/2026). Việc còn lại khi triển khai: đặt `APP_SECRET` riêng (≥ 32 ký tự ngẫu nhiên) trong kho bí mật, sao lưu nó cùng quy trình backup (mất khóa là mất số tài khoản đã mã hóa), chạy `pnpm db:encrypt-bank` một lần sau khi migrate nếu đã có dữ liệu cũ, và quyết định chính sách lưu trữ theo D18.
- [ ] Không có bí mật thật trong repo, log hay tài liệu; quản lý bí mật bằng kho bí mật của môi trường.
- [ ] Ảnh tải lên R2 (presign) khi có khóa Cloudflare R2; hiện ảnh vẫn là link https.

## 4. Pháp lý (cần pháp chế / người có thẩm quyền xác nhận)

- [ ] Nội dung Terms và Privacy (Q6) do pháp chế cung cấp; quy trình duyệt nháp trước khi công bố (D17).
- [ ] Xác nhận thời hạn lưu trữ mặc định (Contact 12 tháng, email 90 ngày; D18) và quy trình xóa theo yêu cầu.
- [ ] Phạm vi email hàng loạt chỉ là thông báo vận hành (D16); muốn gửi marketing phải bổ sung đồng ý riêng và liên kết hủy đăng ký.
- [ ] Tỷ lệ phí mặc định hiện chỉ là **số chạy thử**; chủ sản phẩm cấu hình lại trước khi chạy thật.

## 5. Sản phẩm còn mở

- [ ] Nối `apps/web` với API thật (hiện vẫn dùng mock trong bộ nhớ), gồm bắt đồng ý lại Terms / Privacy ở client.
- [x] Kiểm tra props theo từng section ở backend: đã làm (13/11/2026).
- [x] Email đa ngôn ngữ: đã làm (13/11/2026): email booking 6 ngôn ngữ trong một email, email tài khoản theo ngôn ngữ UI. Còn: bản dịch Thai/Korean/Japanese/Chinese cần người bản ngữ rà soát trước khi chạy thật; email nhắc lịch và file `.ics`.

## Quy tắc phát hành

1. Mọi thay đổi lên production đi qua người duyệt (hạ tầng, bảo mật, pháp lý, ước tính thương mại).
2. Không chạy lệnh phá hủy (xóa DB, xóa volume, force push) khi chưa có phê duyệt của con người.
3. Chạy `pnpm lint`, `pnpm typecheck`, `pnpm test` (và E2E khi đã có) xanh trước khi phát hành.
