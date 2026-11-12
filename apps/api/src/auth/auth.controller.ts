import { Body, Controller, Get, HttpCode, Inject, Post, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { ZodPipe } from "../common/zod.pipe";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { emailOnlySchema, loginSchema, resetPasswordSchema, signupSchema, verifyEmailSchema, type SignupInput } from "./auth.schemas";
import { AuthService, type AuthContext, type ClientContext } from "./auth.service";
import { AuthGuard, Client, CurrentUser } from "./auth.guards";
import { sessionCookie } from "./cookies";

/** `/api/v1/auth/*`. The session is an HttpOnly cookie; the body of a login or a signup tells the web app where to send the person (the same shape as the mock API). */
@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(ENV) private readonly env: Env) {}

  private setSession(reply: FastifyReply, token: string): void {
    void reply.header("set-cookie", sessionCookie(this.env.SESSION_COOKIE_NAME, token, { maxAgeSeconds: this.env.SESSION_TTL_DAYS * 86_400, secure: this.env.APP_URL.startsWith("https://") }));
  }

  @Post("signup")
  async signup(@Body(new ZodPipe(signupSchema)) body: SignupInput, @Client() client: ClientContext, @Res({ passthrough: true }) reply: FastifyReply) {
    const result = await this.auth.signup(body, client);
    if (result.kind === "CHECK_EMAIL") {
      void reply.status(202);
      return { status: "CHECK_EMAIL" };
    }
    this.setSession(reply, result.token);
    void reply.status(201);
    return result.me;
  }

  @Post("login")
  @HttpCode(200)
  async login(@Body(new ZodPipe(loginSchema)) body: { email: string; password: string }, @Client() client: ClientContext, @Res({ passthrough: true }) reply: FastifyReply) {
    const { token, me } = await this.auth.login(body.email, body.password, client);
    this.setSession(reply, token);
    return me;
  }

  @Post("logout")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async logout(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.auth.logout(auth, client);
    void reply.header("set-cookie", sessionCookie(this.env.SESSION_COOKIE_NAME, "", { maxAgeSeconds: 0, secure: this.env.APP_URL.startsWith("https://") }));
    return { status: "LOGGED_OUT" };
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUser() auth: AuthContext) {
    return this.auth.me(auth);
  }

  @Post("verify-email")
  @HttpCode(200)
  async verifyEmail(@Body(new ZodPipe(verifyEmailSchema)) body: { token: string }, @Client() client: ClientContext) {
    await this.auth.verifyEmail(body.token, client);
    return { status: "VERIFIED" };
  }

  @Post("resend-verification")
  @HttpCode(202)
  async resend(@Body(new ZodPipe(emailOnlySchema)) body: { email: string; turnstileToken?: string | undefined }, @Client() client: ClientContext) {
    await this.auth.resendVerification(body.email, body.turnstileToken, client);
    return { status: "ACCEPTED" };
  }

  @Post("forgot-password")
  @HttpCode(202)
  async forgot(@Body(new ZodPipe(emailOnlySchema)) body: { email: string; turnstileToken?: string | undefined }, @Client() client: ClientContext) {
    await this.auth.forgotPassword(body.email, body.turnstileToken, client);
    return { status: "ACCEPTED" };
  }

  @Post("reset-password")
  @HttpCode(200)
  async reset(@Body(new ZodPipe(resetPasswordSchema)) body: { token: string; password: string; confirmPassword: string }, @Client() client: ClientContext) {
    await this.auth.resetPassword(body.token, body.password, body.confirmPassword, client);
    return { status: "PASSWORD_CHANGED" };
  }
}
