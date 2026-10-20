import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer, emailOTP } from "better-auth/plugins";
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
      systemRole: {
        type: "string",
        required: false,
        defaultValue: "user",
      },
      roleType: {
        type: "string[]",
        required: false,
        defaultValue: [],
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
