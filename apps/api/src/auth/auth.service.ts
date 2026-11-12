import { BadRequestException, ForbiddenException, HttpException, Inject, Injectable, UnauthorizedException, UnprocessableEntityException, ConflictException } from "@nestjs/common";
import { and, eq, gt, isNull, like, sql } from "drizzle-orm";
import { checkPassword, generateShopSlug, slugifyShopName } from "@workshop/shared";
import { AuditService } from "../audit/audit.service";
import { RateLimiter } from "../common/limiter";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { DB, type Database, type Executor } from "../db/db.module";
import { authSessions, organizationMembers, organizations, userTokens, users } from "../db/schema";
import { OutboxService } from "../outbox/outbox.service";
import type { SignupInput } from "./auth.schemas";
import { hashPassword, hashToken, newToken, spendVerifyTime, verifyPassword } from "./crypto";
import { TurnstileService } from "./turnstile.service";

/** Who is asking: the address (as the trusted proxy saw it) and the browser, for the session and the audit line. */
export interface ClientContext { ip: string | null; userAgent: string | null }

export type AccountType = "SUPER_ADMIN" | "SHOP_OWNER" | "CUSTOMER";

export interface AuthContext {
  sessionId: string;
  user: { id: string; email: string; fullName: string; status: "UNVERIFIED" | "ACTIVE" | "DISABLED"; platformRole: "SUPER_ADMIN" | null; uiLocale: string };
  activeOrganizationId: string | null;
}

/** What the login and the signup answer (the web app sends the person to the right area from it): the same shape the mock API uses. */
export interface Me {
  type: AccountType;
  id: string;
  email: string;
  fullName: string;
  uiLocale: string;
  organization?: { id: string; slug: string; name: string; status: "DRAFT" | "ACTIVE" | "SUSPENDED" };
}

export type SignupResult = { kind: "LOGGED_IN"; token: string; me: Me } | { kind: "CHECK_EMAIL" };

const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MS = 15 * 60_000;
const TOUCH_AFTER_MS = 5 * 60_000;

/** An error the client sees with the standard body: `{ error: { code, message, details } }`. */
const fail = (Exception: new (body: object) => HttpException, code: string, message: string, details: Record<string, unknown> = {}) => new Exception({ code, message, details });

export const isUniqueViolation = (error: unknown): boolean => {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
};

const emailOf = (email: string): string => email.trim().toLowerCase();
const nameOf = (email: string): string => email.split("@")[0] ?? email;

@Injectable()
export class AuthService {
  private readonly loginFailures = new RateLimiter(MAX_LOGIN_FAILURES, LOGIN_LOCK_MS);
  private readonly signups = new RateLimiter(10, 60 * 60_000);
  private readonly mailsByIp = new RateLimiter(10, 60 * 60_000);
  private readonly mailsByEmail = new RateLimiter(3, 60 * 60_000);
  private readonly tokenTries = new RateLimiter(30, 15 * 60_000);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(TurnstileService) private readonly turnstile: TurnstileService,
  ) {}

  // ---- helpers --------------------------------------------------------------------------------------------------------------------------------------------

  private throttled(seconds: number): HttpException {
    return new HttpException({ code: "RATE_LIMITED", message: "Too many attempts. Please try again later.", details: { retryAfterSeconds: seconds } }, 429);
  }

  private link(path: string, token: string): string {
    return `${this.env.APP_URL.replace(/\/$/, "")}${path}?token=${encodeURIComponent(token)}`;
  }

  private async checkBot(token: string | undefined, ctx: ClientContext): Promise<void> {
    if (!(await this.turnstile.verify(token, ctx.ip))) throw fail(BadRequestException, "BOT_CHECK_FAILED", "We could not check that you are a person. Please try again.");
  }

  private checkPasswords(password: string, confirm: string): void {
    const fields: Record<string, string> = {};
    const strength = checkPassword(password);
    if (strength !== "OK") fields.password = strength === "TOO_SHORT" ? "tooShort" : "tooLong";
    if (confirm !== password) fields.confirmPassword = "mismatch";
    if (Object.keys(fields).length) throw fail(UnprocessableEntityException, "VALIDATION", "Please check the highlighted fields.", { fields });
  }

  /** The organization of a shop owner (one per person in the MVP), or null for a customer or an administrator. */
  private async organizationOf(executor: Executor, userId: string) {
    const [row] = await executor
      .select({ id: organizations.id, slug: organizations.slug, name: organizations.name, status: organizations.status })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.status, "ACTIVE")))
      .limit(1);
    return row ?? null;
  }

  private async meOf(executor: Executor, user: AuthContext["user"]): Promise<Me> {
    const organization = await this.organizationOf(executor, user.id);
    const type: AccountType = user.platformRole === "SUPER_ADMIN" ? "SUPER_ADMIN" : organization ? "SHOP_OWNER" : "CUSTOMER";
    return { type, id: user.id, email: user.email, fullName: user.fullName, uiLocale: user.uiLocale, ...(organization ? { organization } : {}) };
  }

  /** Opens a session: the cookie carries the random token, the table keeps only its hash. */
  private async createSession(executor: Executor, userId: string, organizationId: string | null, ctx: ClientContext): Promise<string> {
    const token = newToken();
    await executor.insert(authSessions).values({
      userId, tokenHash: hashToken(token), activeOrganizationId: organizationId, ip: ctx.ip, userAgent: ctx.userAgent?.slice(0, 300) ?? null,
      expiresAt: new Date(Date.now() + this.env.SESSION_TTL_DAYS * 86_400_000),
    });
    return token;
  }

  /** A single-use email token (verification or reset): stored as a hash, valid for `hours`. Older tokens of the same kind stop working. */
  private async issueToken(executor: Executor, userId: string, type: "EMAIL_VERIFY" | "PASSWORD_RESET", hours: number): Promise<string> {
    await executor.update(userTokens).set({ usedAt: new Date() }).where(and(eq(userTokens.userId, userId), eq(userTokens.type, type), isNull(userTokens.usedAt)));
    const token = newToken();
    await executor.insert(userTokens).values({ userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + hours * 3_600_000) });
    return token;
  }

  /** Uses a token once. The UPDATE ... WHERE used_at IS NULL is the whole check, so two requests with the same token cannot both succeed. */
  private async consumeToken(executor: Executor, token: string, type: "EMAIL_VERIFY" | "PASSWORD_RESET"): Promise<string | null> {
    const [row] = await executor
      .update(userTokens).set({ usedAt: new Date() })
      .where(and(eq(userTokens.tokenHash, hashToken(token)), eq(userTokens.type, type), isNull(userTokens.usedAt), gt(userTokens.expiresAt, new Date())))
      .returning({ userId: userTokens.userId });
    return row?.userId ?? null;
  }

  // ---- signup ---------------------------------------------------------------------------------------------------------------------------------------

  async signup(input: SignupInput, ctx: ClientContext): Promise<SignupResult> {
    const key = ctx.ip ?? "unknown";
    const wait = this.signups.retryAfter(key);
    if (wait > 0) throw this.throttled(wait);
    await this.checkBot(input.turnstileToken, ctx);
    this.checkPasswords(input.password, input.confirmPassword);
    this.signups.hit(key);

    const email = emailOf(input.email);
    const verify = this.env.REQUIRE_EMAIL_VERIFICATION;
    const [existing] = await this.db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) return this.signupForExistingEmail(email, existing.fullName, verify);

    const passwordHash = await hashPassword(input.password); // slow on purpose: outside the transaction
    try {
      const result = await this.db.transaction(async (tx) => {
        const [user] = await tx.insert(users).values({ email, passwordHash, fullName: nameOf(email), status: verify ? "UNVERIFIED" : "ACTIVE" }).returning();
        if (!user) throw new Error("The user was not created");
        let organizationId: string | null = null;
        if (input.type === "SHOP_OWNER") {
          const org = await this.createOrganization(tx, user.id, input.shopName, email);
          organizationId = org.id;
        }
        await this.audit.record({ organizationId, actorUserId: user.id, action: "auth.signup", entityType: "user", entityId: user.id, after: { type: input.type, status: user.status }, ip: ctx.ip }, tx);
        if (verify) {
          const token = await this.issueToken(tx, user.id, "EMAIL_VERIFY", this.env.EMAIL_VERIFY_HOURS);
          await this.outbox.enqueueEmail(tx, { name: "verify-email", to: email, data: { name: user.fullName, link: this.link("/verify-email", token), hours: this.env.EMAIL_VERIFY_HOURS } }, organizationId);
          return { kind: "CHECK_EMAIL" as const };
        }
        const token = await this.createSession(tx, user.id, organizationId, ctx);
        return { kind: "LOGGED_IN" as const, token, me: await this.meOf(tx, { id: user.id, email, fullName: user.fullName, status: user.status, platformRole: null, uiLocale: user.uiLocale }) };
      });
      if (result.kind === "CHECK_EMAIL") void this.outbox.wake();
      return result;
    } catch (error) {
      if (isUniqueViolation(error)) return this.signupForExistingEmail(email, nameOf(email), verify); // two signups with the same email at once
      throw error;
    }
  }

  /** Signing up with an email that has an account: in production nothing is said (D3: no way to find out which emails exist) and the owner of the mailbox is told by email. */
  private async signupForExistingEmail(email: string, name: string, verify: boolean): Promise<SignupResult> {
    if (!verify) throw fail(ConflictException, "EMAIL_TAKEN", "This email already has an account.");
    const app = this.env.APP_URL.replace(/\/$/, "");
    await this.outbox.enqueueEmail(this.db, { name: "account-exists", to: email, data: { name, loginLink: `${app}/?auth=login`, resetLink: `${app}/forgot-password` } });
    void this.outbox.wake();
    return { kind: "CHECK_EMAIL" };
  }

  /** Creates the shop of a new owner (DRAFT) with the slug made from its name (BR-21), and makes the person its OWNER. */
  private async createOrganization(tx: Executor, userId: string, shopName: string, email: string) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const prefix = (slugifyShopName(shopName) || "shop").slice(0, 20);
      const rows = await tx.select({ slug: organizations.slug }).from(organizations).where(like(organizations.slug, `${prefix}%`));
      const taken = new Set(rows.map((r) => r.slug));
      const slug = generateShopSlug(shopName, (s) => taken.has(s));
      try {
        await tx.execute(sql`savepoint new_org`);
        const [org] = await tx.insert(organizations).values({ name: shopName, slug, country: "VN", timezone: "Asia/Ho_Chi_Minh", currency: "VND", contactEmail: email }).returning();
        if (!org) throw new Error("The organization was not created");
        await tx.insert(organizationMembers).values({ organizationId: org.id, userId, role: "OWNER" });
        await this.audit.record({ organizationId: org.id, actorUserId: userId, action: "organization.create", entityType: "organization", entityId: org.id, after: { slug: org.slug, status: org.status } }, tx);
        return org;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        await tx.execute(sql`rollback to savepoint new_org`); // the slug was taken a moment ago by another signup: look again
      }
    }
    throw new Error("No free slug");
  }

  // ---- login, session, logout -------------------------------------------------------------------------------------------------------------------------

  async login(rawEmail: string, password: string, ctx: ClientContext): Promise<{ token: string; me: Me }> {
    const email = emailOf(rawEmail);
    const key = `${ctx.ip ?? "unknown"}|${email}`;
    const wait = this.loginFailures.retryAfter(key);
    if (wait > 0) throw this.throttled(wait);

    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    const good = user ? await verifyPassword(user.passwordHash, password) : (await spendVerifyTime(password), false); // the same time for an unknown email and a wrong password
    if (!user || !good) {
      this.loginFailures.hit(key);
      if (user && this.loginFailures.retryAfter(key) > 0) await this.audit.record({ actorUserId: user.id, action: "auth.login_locked", entityType: "user", entityId: user.id, ip: ctx.ip });
      throw fail(UnauthorizedException, "INVALID_CREDENTIALS", "The email or the password is wrong.");
    }
    if (user.status === "DISABLED") throw fail(ForbiddenException, "DEACTIVATED", "This account is deactivated.");
    if (user.status === "UNVERIFIED" && this.env.REQUIRE_EMAIL_VERIFICATION) throw fail(ForbiddenException, "EMAIL_NOT_VERIFIED", "Please confirm your email first.");
    this.loginFailures.reset(key);

    const context: AuthContext["user"] = { id: user.id, email: user.email, fullName: user.fullName, status: user.status, platformRole: user.platformRole, uiLocale: user.uiLocale };
    return this.db.transaction(async (tx) => {
      const org = await this.organizationOf(tx, user.id);
      await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      const token = await this.createSession(tx, user.id, org?.id ?? null, ctx);
      await this.audit.record({ organizationId: org?.id ?? null, actorUserId: user.id, action: "auth.login", entityType: "user", entityId: user.id, ip: ctx.ip }, tx);
      return { token, me: await this.meOf(tx, context) };
    });
  }

  /** The session of a cookie token, or null (unknown, expired, or the account was disabled). Slides `last_seen_at` at most every five minutes. */
  async authenticate(token: string | undefined): Promise<AuthContext | null> {
    if (!token || token.length > 200) return null;
    const [row] = await this.db
      .select({ session: authSessions, user: users })
      .from(authSessions)
      .innerJoin(users, eq(users.id, authSessions.userId))
      .where(and(eq(authSessions.tokenHash, hashToken(token)), gt(authSessions.expiresAt, new Date())))
      .limit(1);
    if (!row || row.user.status === "DISABLED") return null;
    if (Date.now() - row.session.lastSeenAt.getTime() > TOUCH_AFTER_MS) await this.db.update(authSessions).set({ lastSeenAt: new Date() }).where(eq(authSessions.id, row.session.id));
    const u = row.user;
    return { sessionId: row.session.id, activeOrganizationId: row.session.activeOrganizationId, user: { id: u.id, email: u.email, fullName: u.fullName, status: u.status, platformRole: u.platformRole, uiLocale: u.uiLocale } };
  }

  me(auth: AuthContext): Promise<Me> {
    return this.meOf(this.db, auth.user);
  }

  async logout(auth: AuthContext, ctx: ClientContext): Promise<void> {
    await this.db.delete(authSessions).where(eq(authSessions.id, auth.sessionId));
    await this.audit.record({ organizationId: auth.activeOrganizationId, actorUserId: auth.user.id, action: "auth.logout", entityType: "user", entityId: auth.user.id, ip: ctx.ip });
  }

  // ---- email verification and password reset -------------------------------------------------------------------------------------------------------------

  private tokenRateLimit(ctx: ClientContext): void {
    const key = ctx.ip ?? "unknown";
    const wait = this.tokenTries.retryAfter(key);
    if (wait > 0) throw this.throttled(wait);
    this.tokenTries.hit(key);
  }

  async verifyEmail(token: string, ctx: ClientContext): Promise<void> {
    this.tokenRateLimit(ctx);
    await this.db.transaction(async (tx) => {
      const userId = await this.consumeToken(tx, token, "EMAIL_VERIFY");
      if (!userId) throw fail(BadRequestException, "TOKEN_INVALID", "This link is not valid any more. Ask for a new one.");
      await tx.update(users).set({ status: "ACTIVE", emailVerifiedAt: new Date(), updatedAt: new Date() }).where(and(eq(users.id, userId), eq(users.status, "UNVERIFIED")));
      await this.audit.record({ actorUserId: userId, action: "auth.verify_email", entityType: "user", entityId: userId, ip: ctx.ip }, tx);
    });
  }

  /** Always accepted, whatever the email (no way to find out who has an account). */
  async resendVerification(rawEmail: string, turnstileToken: string | undefined, ctx: ClientContext): Promise<void> {
    await this.mailLimits(rawEmail, turnstileToken, ctx);
    const email = emailOf(rawEmail);
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || user.status !== "UNVERIFIED") return;
    await this.db.transaction(async (tx) => {
      const token = await this.issueToken(tx, user.id, "EMAIL_VERIFY", this.env.EMAIL_VERIFY_HOURS);
      await this.outbox.enqueueEmail(tx, { name: "verify-email", to: email, data: { name: user.fullName, link: this.link("/verify-email", token), hours: this.env.EMAIL_VERIFY_HOURS } });
    });
    void this.outbox.wake();
  }

  private async mailLimits(rawEmail: string, turnstileToken: string | undefined, ctx: ClientContext): Promise<void> {
    const ipKey = ctx.ip ?? "unknown";
    const wait = Math.max(this.mailsByIp.retryAfter(ipKey), this.mailsByEmail.retryAfter(emailOf(rawEmail)));
    if (wait > 0) throw this.throttled(wait);
    await this.checkBot(turnstileToken, ctx);
    this.mailsByIp.hit(ipKey);
    this.mailsByEmail.hit(emailOf(rawEmail));
  }

  /** Always accepted. An account that exists gets an email with a link that works once, for RESET_LINK_HOURS. */
  async forgotPassword(rawEmail: string, turnstileToken: string | undefined, ctx: ClientContext): Promise<void> {
    await this.mailLimits(rawEmail, turnstileToken, ctx);
    const email = emailOf(rawEmail);
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || user.status === "DISABLED") return;
    await this.db.transaction(async (tx) => {
      const token = await this.issueToken(tx, user.id, "PASSWORD_RESET", this.env.RESET_LINK_HOURS);
      await this.outbox.enqueueEmail(tx, { name: "password-reset", to: email, data: { name: user.fullName, link: this.link("/reset-password", token), hours: this.env.RESET_LINK_HOURS } });
      await this.audit.record({ actorUserId: user.id, action: "auth.password_reset_requested", entityType: "user", entityId: user.id, ip: ctx.ip }, tx);
    });
    void this.outbox.wake();
  }

  /** Sets a new password with the link, and logs the account out everywhere (a stolen session does not survive a reset). */
  async resetPassword(token: string, password: string, confirm: string, ctx: ClientContext): Promise<void> {
    this.tokenRateLimit(ctx);
    this.checkPasswords(password, confirm);
    const passwordHash = await hashPassword(password);
    await this.db.transaction(async (tx) => {
      const userId = await this.consumeToken(tx, token, "PASSWORD_RESET");
      if (!userId) throw fail(BadRequestException, "TOKEN_INVALID", "This link is not valid any more. Ask for a new one.");
      const [user] = await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
      if (!user) throw fail(BadRequestException, "TOKEN_INVALID", "This link is not valid any more. Ask for a new one.");
      // The link came to the mailbox of the account, so the email is proven too.
      if (user.status === "UNVERIFIED") await tx.update(users).set({ status: "ACTIVE", emailVerifiedAt: new Date() }).where(eq(users.id, userId));
      await tx.delete(authSessions).where(eq(authSessions.userId, userId));
      await this.audit.record({ actorUserId: userId, action: "auth.password_reset", entityType: "user", entityId: userId, ip: ctx.ip }, tx);
      await this.outbox.enqueueEmail(tx, { name: "password-changed", to: user.email, data: { name: user.fullName } });
    });
    void this.outbox.wake();
  }
}
