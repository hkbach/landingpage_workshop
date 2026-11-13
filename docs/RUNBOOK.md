# Runbook: triển khai, sao lưu và khôi phục

> **Trạng thái (13/11/2026):** bản nháp của TECHVIFY cho giai đoạn POC. Mọi bước **đưa lên production** (bật DNS, TLS, mở cổng, chạy `up -d`, khôi phục lên database đang chạy) cần **người có thẩm quyền duyệt** trước. Xem [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md). Không có bí mật thật nào trong repo hay tài liệu này; mọi giá trị bí mật nằm trong kho bí mật của môi trường.

## 1. Thành phần

| Dịch vụ | File | Vai trò |
|---|---|---|
| `db` | `postgres:16` | Database. Chỉ có trên mạng nội bộ, không mở cổng ra ngoài. |
| `migrate` | `apps/api/Dockerfile` (`node dist/migrate.js`) | Chạy **một lần** mỗi lần triển khai: áp các migration chưa áp. Chạy lại an toàn. |
| `api` | `apps/api/Dockerfile` | API NestJS (cổng 4000, nội bộ). Chạy bằng user không phải root. |
| `worker` | cùng image (`node dist/main.worker.js`) | Gửi email từ outbox, tự đóng session hết giờ, sinh session từ lịch lặp, kết sổ tài chính, xóa dữ liệu quá hạn lưu (D18). |
| `web` | `apps/web/Dockerfile` | Next.js (bản `standalone`). |
| `caddy` | `infra/Caddyfile` | HTTPS tự cấp chứng chỉ theo nhu cầu; `/api/v1/*` → `api`, còn lại → `web`. Chỉ Caddy mở cổng 80 và 443. |
| `backup` | `infra/backup/` | Mỗi đêm `pg_dump`, mã hóa, đẩy lên Cloudflare R2. |

Chạy: `docker compose -f infra/docker-compose.prod.yml --env-file <file biến> build` rồi `up -d`. Thứ tự: `db` → `migrate` → `api` + `worker` → `web` → `caddy`.

## 2. Variables

Tạo một file biến (ngoài repo, hoặc `infra/.env.production` vì git bỏ qua `.env.*`) với các biến sau. **Không commit giá trị thật.** Giữ bản sao các bí mật trong kho bí mật của nhóm.

| Biến | Ý nghĩa |
|---|---|
| `DB_PASSWORD` | Mật khẩu database. |
| `APP_URL` | `https://app.<tên miền>` (API từ chối khởi động nếu không phải https). |
| `PLATFORM_DOMAIN` | Tên miền gốc, ví dụ `example.com`. |
| `ACME_EMAIL` | Email nhận thông báo của nơi cấp chứng chỉ. |
| `APP_SECRET` | ≥ 32 ký tự ngẫu nhiên (`openssl rand -base64 48`). Dùng làm pepper OTP và khóa mã hóa số tài khoản ngân hàng. **Mất hoặc đổi khóa này là mất số tài khoản đã mã hóa**: sao lưu cùng các bí mật khác, không để chung với backup database. |
| `TURNSTILE_SECRET_KEY` | Khóa bí mật Cloudflare Turnstile (bắt buộc ở production). |
| `RESEND_API_KEY`, `EMAIL_FROM` | Gửi email. |
| `LOG_LEVEL` | `info` (mặc định). |
| `IMAGE_TAG` | Nhãn image (mặc định `latest`); đặt theo phiên bản để quay lại được. |
| `BACKUP_PASSPHRASE` | Cụm mật khẩu mã hóa backup. Mất nó là không đọc được backup: giữ trong kho bí mật. |
| `BACKUP_BUCKET` | Bucket R2 **riêng** cho backup. |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT` | Khóa R2 chỉ có quyền ghi vào bucket backup; endpoint dạng `https://<account id>.r2.cloudflarestorage.com`. |
| `BACKUP_HOUR_UTC` | Giờ chạy backup mỗi ngày (0 đến 23, mặc định 19 = 02:00 giờ Việt Nam). |
| `BACKUP_RETENTION_DAYS` | Số ngày giữ backup (mặc định 30). |

Trong compose, API luôn chạy với `NODE_ENV=production`, `REQUIRE_EMAIL_VERIFICATION=true`, `TRUST_PROXY_HOPS=1` (sau Caddy) và `EMAIL_PROVIDER=resend`.

## 3. Triển khai một phiên bản

1. Chạy `pnpm lint && pnpm typecheck && pnpm test` xanh trên đúng commit sẽ phát hành; người duyệt đã đồng ý.
2. **Sao lưu ngay trước khi triển khai** (mục 4, lệnh `once`).
3. `docker compose ... build` (đặt `IMAGE_TAG` mới), rồi `docker compose ... up -d`. Container `migrate` áp migration mới rồi thoát; `api` và `worker` chỉ chạy sau khi nó thành công.
4. Kiểm tra: `docker compose ... ps` (mọi dịch vụ `healthy`; `api` và `web` có healthcheck riêng), `docker compose ... logs migrate api worker` không có lỗi; mở `https://app.<tên miền>`, đăng nhập và làm một booking thử.
5. Quay lại phiên bản trước: đặt `IMAGE_TAG` cũ và `up -d`. Migration **không tự lùi**: nếu migration mới đã áp, khôi phục từ backup (mục 5) vào database mới.

Dữ liệu cũ ở dạng rõ: sau lần migrate đầu có `APP_SECRET`, chạy một lần `docker compose ... run --rm api node dist/encrypt-bank.js` để mã hóa các số tài khoản ngân hàng cũ (chạy lại an toàn).

## 4. Sao lưu

- Container `backup` chạy mỗi ngày vào `BACKUP_HOUR_UTC`: `pg_dump` (định dạng custom) → kiểm tra đọc lại được (`pg_restore --list`) → mã hóa AES-256 (`openssl`, PBKDF2) → đẩy lên `r2:<bucket>/database/workshop-<thời gian>.dump.enc` → so kích thước file trên bucket với file đã gửi → xóa bản cũ hơn `BACKUP_RETENTION_DAYS`. Bước nào lỗi thì script dừng, **không xóa bản cũ**, và ghi lỗi vào log (`docker compose logs backup`).
- Backup ngay: `docker compose ... run --rm backup once`.
- Danh sách backup: `docker compose ... run --rm backup restore.sh --list`.
- Backup **chỉ có database**. Các thứ khác cần giữ riêng: `APP_SECRET`, `BACKUP_PASSPHRASE` (kho bí mật), volume `caddy-data` (chứng chỉ; mất thì Caddy xin lại), ảnh trên R2 (bucket media, bật versioning ở Cloudflare).
- Bucket backup cần bật khóa xóa / lifecycle ở Cloudflare để một khóa bị lộ không xóa được lịch sử backup.

## 5. Khôi phục

Khôi phục **luôn vào một database mới, trống** (script từ chối database đã có bảng).

1. Tạo database trống: `docker compose ... exec db psql -U workshop -c "create database workshop_restored"`.
2. Chọn bản: `docker compose ... run --rm backup restore.sh --list` (chọn tên `workshop-<thời gian>.dump.enc`).
3. Khôi phục: `docker compose ... run --rm -e PGDATABASE=workshop_restored backup restore.sh <tên file>`.
4. Áp migration mới hơn bản backup (nếu có): chạy `node dist/migrate.js` với `DATABASE_URL` trỏ vào database vừa khôi phục.
5. Kiểm tra: đếm bảng chính (`users`, `organizations`, `bookings`, `payments`, `withdrawals`), mở thử một số tài khoản ngân hàng (admin xem invoice rút tiền: nếu lỗi giải mã là `APP_SECRET` sai).
6. Đưa vào chạy: dừng `api` và `worker`, đổi `DATABASE_URL` / đổi tên database, bật lại. Giữ database cũ cho tới khi xác nhận xong.

Đã kiểm thử (13/11/2026) trên database tạm: backup, liệt kê, khôi phục vào database trống, từ chối khôi phục vào database đã có bảng, từ chối sai cụm mật khẩu, từ chối tên file lạ.

**Diễn tập khôi phục:** thực hiện đầy đủ mục 5 trên máy khác ít nhất mỗi quý và sau mỗi thay đổi lớn của quy trình; ghi lại thời gian khôi phục và thời điểm dữ liệu mới nhất (mục tiêu RPO ≤ 24 giờ vì backup hằng đêm; muốn thấp hơn thì cần WAL archiving, chưa làm).

## 6. Việc cần người duyệt trước khi bật

Xem [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md): DNS và chứng chỉ TLS theo nhu cầu (Caddy hỏi API `GET /api/v1/public/tls/ask?domain=` trước khi xin chứng chỉ; đường dẫn này **không** được route ra ngoài), chuyển hướng 301 sang tên miền riêng (chưa làm), rà soát bảo mật, Turnstile, Sentry, nội dung pháp lý.
