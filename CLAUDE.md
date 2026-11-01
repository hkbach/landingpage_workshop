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
- All user-facing text through i18n messages, and every static text/label exists in en, vi, ko, ja and zh (add or change it in all five locales together; `messages-parity.test.ts` enforces it). Shop-owner dynamic content is not translated by us. The system admin area (/systemadmin) is en + vi only.
- Never log secrets, tokens, passwords, cookies, presigned URLs. No real secrets in repo.
- Never run destructive commands (drop db, delete volumes, force push) or deploy to production without human approval.
- Run lint + typecheck + test before declaring a task done.

## Workflow
Work milestone by milestone (REQUIREMENTS.md §13). Ask when requirements are unclear.
Code, identifiers, enums and commit messages in English (Conventional Commits); docs in Vietnamese.
