import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer, emailOTP } from "better-auth/plugins";
import { createAuthMiddleware } from "better-auth/api";
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
    // account; keep that (an open decision in the app's NEXT.md §3).
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
  emailAndPassword: {
    enabled: true,
    // A reset is what someone does when they think the account is exposed:
    // sign every device out, as the custom /auth/reset-password did.
    revokeSessionsOnPasswordReset: true,
    password: {
      verify: async ({ password, hash }) => {
        return bcrypt.compare(password, hash);
      },
      hash: async (password) => {
        return bcrypt.hash(password, 12);
      },
    },
  },
  hooks: {
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
      sendVerificationOnSignUp: true,
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
