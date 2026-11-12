import { betterAuth, BASE_ERROR_CODES } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer, emailOTP } from "better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { normalizeUsername, USERNAME_MESSAGE } from "../../utils/username";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  passwordPolicyError,
} from "../../utils/password-policy";
import { prisma } from "../../utils/prisma";
import { sendTemplatedEmail } from "../../utils/helpers";
import {
  BETTER_AUTH_SECRET,
  BETTER_AUTH_URL,
  CORS_ORIGINS,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET,
} from "../../config";
import bcrypt from "bcryptjs";

// Better Auth routes that set a password, and the body field holding it.
// Its own config only checks length; the hook below adds the character rules.
const PASSWORD_FIELD_BY_PATH: Record<string, string> = {
  "/sign-up/email": "password",
  "/reset-password": "newPassword",
  "/email-otp/reset-password": "password",
  "/change-password": "newPassword",
  "/set-password": "newPassword",
};

// Better Auth's emailOTP answers 200 for an unknown email and sends nothing, so
// a client can't tell "code sent" from "no such account". These routes check
// first and say so. That does reveal whether an email is registered; the
// per-IP and per-account otpSendRateLimit in app.ts caps how fast anyone can ask.
const PASSWORD_RESET_REQUEST_PATHS = new Set([
  "/email-otp/request-password-reset",
  "/forget-password/email-otp",
]);

export const NO_ACCOUNT_MESSAGE =
  "No account found with this email. Please double-check your email and try again.";

function checkUsername<T extends Record<string, unknown>>(user: T): T {
  if (user.username === undefined || user.username === null) return user;
  const username = normalizeUsername(user.username);
  if (!username) {
    throw new APIError("BAD_REQUEST", { message: USERNAME_MESSAGE });
  }
  return { ...user, username };
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: BETTER_AUTH_SECRET,
  baseURL: BETTER_AUTH_URL,
  trustedOrigins: CORS_ORIGINS,
  // emailOTP also brings passwordless sign-in and email change by code, which
  // this product does not offer. Closed here so a code can never be spent on
  // them (the sender below also refuses to email one).
  disabledPaths: [
    "/sign-in/email-otp",
    "/email-otp/request-email-change",
    "/email-otp/change-email",
  ],
  user: {
    modelName: "User",
    fields: {
      emailVerified: "isEmailVerified",
    },
    additionalFields: {
      username: {
        type: "string",
        required: false,
      },
      // Never from the request: sign-up and /update-user pass extra body
      // fields through, so without `input: false` anyone could send
      // `systemRole: "admin"` and become one. Roles are granted by the admin
      // routes, through Prisma.
      systemRole: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,
      },
      roleType: {
        type: "string[]",
        required: false,
        defaultValue: [],
        input: false,
      },
    },
  },
  session: {
    modelName: "Session",
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  account: {
    modelName: "Account",
    // Today a Google/Facebook sign-in with an existing email joins that
    // account; keep that (an open decision in the app's NEXT.md §3). Better
    // Auth only joins it once that account's own email is verified
    // (`requireLocalEmailVerified`, on by default), and answers
    // `account_not_linked` until then: otherwise whoever registered the email
    // with a password, without owning it, would share the account with the
    // Google user. requireEmailVerification below is how such an account gets
    // verified.
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "facebook"],
    },
  },
  // Callback URLs are `${BETTER_AUTH_URL}/api/auth/callback/<provider>` and must
  // be registered in each provider's console. Mobile signs in natively by
  // sending the provider's ID token to /sign-in/social.
  socialProviders: {
    ...(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: GOOGLE_CLIENT_ID,
            clientSecret: GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    ...(FACEBOOK_APP_ID && FACEBOOK_APP_SECRET
      ? {
          facebook: {
            clientId: FACEBOOK_APP_ID,
            clientSecret: FACEBOOK_APP_SECRET,
          },
        }
      : {}),
  },
  verification: {
    modelName: "Verification",
  },
  // With requireEmailVerification, a refused sign-in also emails a fresh code
  // (sent by emailOTP below, overrideDefaultEmailVerification), so the code
  // screen the web and mobile open on that 403 has one waiting.
  emailVerification: {
    sendOnSignIn: true,
  },
  emailAndPassword: {
    enabled: true,
    // An unverified email can't sign in with its password: 403
    // EMAIL_NOT_VERIFIED, which the web and mobile already answer with the
    // code screen. Without it an unverified account was usable forever and
    // could never link Google/Facebook (see accountLinking above).
    // Sign-up then returns no session (token: null); both clients already send
    // the new user to the code screen and then to sign in.
    requireEmailVerification: true,
    // A reset is what someone does when they think the account is exposed:
    // sign every device out, as the custom /auth/reset-password did.
    revokeSessionsOnPasswordReset: true,
    // utils/password-policy.ts; the defaults were 8–128 (BUG-27).
    minPasswordLength: PASSWORD_MIN,
    maxPasswordLength: PASSWORD_MAX,
    password: {
      verify: async ({ password, hash }) => {
        return bcrypt.compare(password, hash);
      },
      hash: async (password) => {
        return bcrypt.hash(password, 12);
      },
    },
  },
  databaseHooks: {
    // Sign-up takes `username` straight from the request body, so the rule is
    // enforced here too, not only in the web form.
    user: {
      create: { before: async (user) => ({ data: checkUsername(user) }) },
      update: { before: async (user) => ({ data: checkUsername(user) }) },
    },
  },
  hooks: {
    // The full password policy on every route that sets one, so a password
    // the web would refuse can't be set by calling the API directly. Runs
    // before the handler: nothing is created or changed when it fails.
    before: createAuthMiddleware(async (ctx) => {
      // A reset code is only sent to an account that exists. Lowercased the
      // way the handler itself does before it looks the user up.
      if (ctx.path && PASSWORD_RESET_REQUEST_PATHS.has(ctx.path)) {
        const email = (ctx.body as Record<string, unknown> | undefined)?.email;
        if (typeof email !== "string") return;
        const user = await ctx.context.internalAdapter.findUserByEmail(
          email.toLowerCase(),
        );
        if (!user) {
          throw new APIError("NOT_FOUND", { message: NO_ACCOUNT_MESSAGE });
        }
        return;
      }
      const field = ctx.path ? PASSWORD_FIELD_BY_PATH[ctx.path] : undefined;
      if (!field) return;
      const password = (ctx.body as Record<string, unknown> | undefined)?.[
        field
      ];
      if (typeof password !== "string") return;
      const error = passwordPolicyError(password);
      if (error) throw new APIError("BAD_REQUEST", { message: error });
      // requireEmailVerification makes Better Auth answer a sign-up with a
      // taken email as if it had worked, so as not to reveal the account. This
      // product already reveals it (password reset above), and the web and
      // mobile show "User already exists", so keep that answer.
      if (ctx.path === "/sign-up/email") {
        const email = (ctx.body as Record<string, unknown> | undefined)?.email;
        if (typeof email !== "string") return;
        const user = await ctx.context.internalAdapter.findUserByEmail(
          email.toLowerCase(),
        );
        if (user) {
          throw APIError.from(
            "UNPROCESSABLE_ENTITY",
            BASE_ERROR_CODES.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL,
          );
        }
      }
    }),
    // A sign-in replaces the session the request arrived with, as logging out
    // would. Signing in as someone else without logging out first used to
    // leave the first account's session valid for its full seven days, for
    // whoever still held its token. Runs only once a new session exists, so a
    // wrong password signs nobody out; and the `bearer` plugin has already
    // copied an `Authorization: Bearer` token (mobile, the web proxy) into the
    // cookie it reads. A refresh that keeps the same token is left alone.
    after: createAuthMiddleware(async (ctx) => {
      const created = ctx.context.newSession?.session.token;
      if (!created) return;
      const previous = await ctx.getSignedCookie(
        ctx.context.authCookies.sessionToken.name,
        ctx.context.secret,
      );
      if (!previous || previous === created) return;
      try {
        await ctx.context.internalAdapter.deleteSession(previous);
      } catch (e) {
        ctx.context.logger.error("Failed to revoke the replaced session", e);
      }
    }),
  },
  plugins: [
    bearer(),
    // Same codes as the custom /auth/verify-email and /auth/reset-password:
    // six digits, five minutes, the same two email templates. See
    // docs/BETTER-AUTH-CONSOLIDATION.md.
    emailOTP({
      otpLength: 6,
      expiresIn: 5 * 60,
      allowedAttempts: 5,
      // Better Auth's own verification email (on sign-up, and on a sign-in
      // refused for an unverified email) is sent as this code instead of a
      // link. Replaces sendVerificationOnSignUp, which only covered sign-up.
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP({ email, otp, type }) {
        // Passwordless sign-in and email change by code are not features
        // this product offers; refuse rather than open a new way in.
        if (type !== "email-verification" && type !== "forget-password") {
          throw new Error(`Email OTP type "${type}" is not enabled`);
        }
        await sendTemplatedEmail({
          subject:
            type === "email-verification"
              ? "Verify Your Email Address"
              : "Password Reset Code",
          email_data: { email, OTP_CODE: otp },
          template_name:
            type === "email-verification"
              ? "verification-email.html"
              : "forgot-password.html",
        });
      },
    }),
  ],
});
