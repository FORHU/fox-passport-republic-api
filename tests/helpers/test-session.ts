/**
 * A signed-in test user without a database session.
 *
 * Sign-in is Better Auth's, and `authenticate` asks `auth.api.getSession`. In
 * tests that call routes as a given user, `tests/env.setup.ts` wraps that call:
 * a `Bearer test.<payload>` token resolves to the user in the payload, and any
 * other request goes to the real Better Auth. Nothing in `src` reads these
 * tokens — there is no test path in the production middleware.
 */

export interface TestSessionUser {
  userId: string;
  email?: string;
  systemRole?: string;
  roleType?: string[];
}

export const TEST_TOKEN_PREFIX = "test.";

/** A bearer token that authenticates as `user` in tests. */
export function signTestSession(user: TestSessionUser): string {
  return (
    TEST_TOKEN_PREFIX + Buffer.from(JSON.stringify(user)).toString("base64url")
  );
}

/** The Better Auth session shape for a test token, or null if it is not one. */
export function readTestSession(authorization: string | null) {
  const token = authorization?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token.startsWith(TEST_TOKEN_PREFIX)) return null;
  const user = JSON.parse(
    Buffer.from(token.slice(TEST_TOKEN_PREFIX.length), "base64url").toString(),
  ) as TestSessionUser;
  return {
    session: { id: `test-${user.userId}`, userId: user.userId, token },
    user: {
      id: user.userId,
      email: user.email ?? "test@test.com",
      systemRole: user.systemRole ?? "user",
      roleType: user.roleType ?? [],
    },
  };
}
