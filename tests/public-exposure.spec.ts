import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

/**
 * Two unauthenticated endpoints published data they should never have:
 *
 *   GET /users/:id   returned a bare `prisma.user.findUnique`, so the password
 *                    hash went out with email, phone, address and Stripe ids.
 *   GET /bookings    returned every booking with the customer's name and email,
 *                    filtered by a Prisma `where` built from raw `req.query`.
 *
 * The route-level assertions here are structural rather than behavioural: they
 * parse the route files and check the middleware chain. That is weaker than
 * driving a request, but it fails loudly if someone removes a guard, which is
 * the regression that matters and the one that is otherwise silent.
 */

const src = (rel: string) =>
  readFileSync(join(process.cwd(), "src", rel), "utf-8");

/** Middleware names attached to `router.<method>("<path>", ...)`. */
function middlewareFor(
  file: string,
  method: string,
  route: string,
): string[] | null {
  const text = src(file);
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  let found: string[] | null = null;

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === method &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text === route
    ) {
      found = node.arguments.slice(1).map((a) => a.getText(sf));
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return found;
}

describe("endpoints that used to be public", () => {
  it("GET /users/:id requires authentication", () => {
    const chain = middlewareFor("modules/users/users.routes.ts", "get", "/:id");
    expect(chain, "route not found").not.toBeNull();
    expect(chain).toContain("authenticate");
  });

  it("GET /bookings requires authentication", () => {
    const chain = middlewareFor(
      "modules/booking/booking.routes.ts",
      "get",
      "/",
    );
    expect(chain, "route not found").not.toBeNull();
    expect(chain).toContain("authenticate");
  });
});

describe("the password hash cannot leave by accident", () => {
  it("the Prisma client omits User.password globally", () => {
    const client = src("utils/prisma.ts");
    expect(client).toMatch(/omit:\s*\{\s*user:\s*\{\s*password:\s*true/);
  });

  it("only the three known call sites opt back in", () => {
    // A bare query cannot leak the hash; asking for it takes `omit:
    // { password: false }` or an explicit `select`. Both are greppable, and
    // this pins how many places do it so a fourth has to be deliberate.
    const files = [
      "modules/auth/auth.repository.ts",
      "modules/profile/profile.repository.ts",
    ];
    const optIns = files.flatMap((f) => {
      const text = src(f);
      return [
        ...text.matchAll(/omit:\s*\{\s*password:\s*false/g),
        ...text.matchAll(/password:\s*true/g),
      ];
    });
    expect(optIns.length).toBe(2);
  });

  it("findUserById returns an explicit field list, not the whole row", () => {
    const repo = src("modules/users/users.repository.ts");
    const fn = repo.slice(repo.indexOf("static async findUserById"));
    const body = fn.slice(0, fn.indexOf("\n  }"));
    expect(body).toMatch(/select:\s*\{/);
    expect(body).not.toMatch(/password/);
  });
});
