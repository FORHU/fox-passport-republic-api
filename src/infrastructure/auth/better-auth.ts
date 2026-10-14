import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer } from "better-auth/plugins";
import { prisma } from "../../utils/prisma";
import {
  BETTER_AUTH_SECRET,
  BETTER_AUTH_URL,
  CORS_ORIGINS,
} from "../../config";
import bcrypt from "bcryptjs";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: BETTER_AUTH_SECRET,
  baseURL: BETTER_AUTH_URL,
  trustedOrigins: CORS_ORIGINS,
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
  },
  verification: {
    modelName: "Verification",
  },
  emailAndPassword: {
    enabled: true,
    password: {
      verify: async ({ password, hash }) => {
        return bcrypt.compare(password, hash);
      },
      hash: async (password) => {
        return bcrypt.hash(password, 12);
      },
    },
  },
  plugins: [bearer()],
});
