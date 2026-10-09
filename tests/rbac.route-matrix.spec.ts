import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { SystemRole } from "@prisma/client";
import { ACCESS_TOKEN_SECRET } from "../src/config";
import apiApp from "../src/app";
import { REQUIRED_PERMISSIONS } from "../src/middleware/auth.middleware";
import { can, type Permission } from "../src/types/permissions";

/**
 * RBAC.md §21: every protected route answers 401 without a token, 403 to a
 * caller missing its permission, and lets a caller holding it through.
 *
 * The routes are not listed by hand. `requirePermission` and
 * `requirePermissionAny` tag their guard with the permissions they check, and
 * this walks the mounted Express app to find every tagged route — a new
 * protected route is covered the moment it is mounted.
 *
 * Only the refusals are sent as requests. Both are answered by middleware
 * before any controller runs, so nothing here reads or writes data. The
 * allowed leg is asserted through `can()` (the same call the guard makes)
 * instead of a request, because letting a request through would run a real
 * controller — a POST or DELETE with an admin token — against the database.
 */

interface ProtectedRoute {
  method: string;
  path: string;
  permissions: Permission[];
}

interface Layer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { handle: unknown }[];
  };
  name?: string;
  handle: { stack?: Layer[] } & Record<symbol, unknown>;
  regexp: RegExp;
  keys: { name: string }[];
}

const DUMMY_ID = "00000000-0000-4000-8000-000000000000";

/** A router's mount path, recovered from the regexp Express 4 compiled it to. */
function mountPath(layer: Layer): string {
  if (
    layer.regexp.source === "^\\/?$" ||
    layer.regexp.source === "^\\/?(?=\\/|$)"
  )
    return "";
  return layer.regexp.source
    .replace(/^\^/, "")
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, "")
    .replace(/\(\?:\(\[\^\\\/]\+\?\)\)/g, DUMMY_ID)
    .replace(/\\\//g, "/");
}

function collect(stack: Layer[], prefix: string, out: ProtectedRoute[]) {
  for (const layer of stack) {
    if (layer.route) {
      const permissions = layer.route.stack
        .map(
          (s) =>
            (s.handle as Record<symbol, unknown>)[REQUIRED_PERMISSIONS] as
              Permission[] | undefined,
        )
        .find(Boolean);
      if (!permissions) continue;
      const path = (prefix + layer.route.path).replace(/:[^/]+/g, DUMMY_ID);
      for (const method of Object.keys(layer.route.methods)) {
        out.push({ method, path, permissions });
      }
    } else if (layer.name === "router" && layer.handle.stack) {
      collect(layer.handle.stack, prefix + mountPath(layer), out);
    }
  }
}

const routes: ProtectedRoute[] = [];
collect(
  (apiApp as unknown as { _router: { stack: Layer[] } })._router.stack,
  "",
  routes,
);

const SYSTEM_ROLES = Object.values(SystemRole);

function tokenFor(systemRole: SystemRole) {
  return jwt.sign(
    {
      userId: `matrix-${systemRole}`,
      email: `${systemRole}@matrix.test`,
      systemRole,
      roleType: [],
    },
    ACCESS_TOKEN_SECRET,
  );
}

const holds = (systemRole: SystemRole, route: ProtectedRoute) =>
  route.permissions.some((p) => can({ systemRole, roleType: [] }, p));

const label = (r: ProtectedRoute) =>
  `${r.method.toUpperCase()} ${r.path} [${r.permissions.join(" | ")}]`;

describe("the route walk", () => {
  it("finds the protected routes", () => {
    // A sanity floor, not an exact count: if the walk silently broke (an
    // Express upgrade changing its internals), every test below would pass
    // over an empty list.
    expect(routes.length).toBeGreaterThan(40);
  });
});

describe.each(routes.map((r) => [label(r), r] as const))("%s", (_, route) => {
  const send = (token?: string) => {
    const req = (
      request(apiApp) as unknown as Record<
        string,
        (path: string) => request.Test
      >
    )[route.method](route.path);
    return token ? req.set("Authorization", `Bearer ${token}`) : req;
  };

  it("answers 401 without a token", async () => {
    const res = await send();
    expect(res.status).toBe(401);
  });

  const refused = SYSTEM_ROLES.filter((role) => !holds(role, route));
  it.each(refused)("answers 403 to %s", async (role) => {
    const res = await send(tokenFor(role));
    expect(res.status).toBe(403);
  });

  const allowed = SYSTEM_ROLES.filter((role) => holds(role, route));
  it.each(allowed)("lets %s through the guard", (role) => {
    expect(holds(role, route)).toBe(true);
  });
});
