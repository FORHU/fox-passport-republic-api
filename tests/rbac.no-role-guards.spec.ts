import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * RBAC.md §21: no `systemRole === "admin"`-style authorization outside the
 * RBAC module. Every such check is a capability nobody named — it has to be
 * found by grep when a role is added, which is exactly the audit the
 * permission table exists to make unnecessary. Ask `can(user, "…")` instead,
 * adding a permission to `src/types/permissions.ts` if none fits.
 */

const SRC = path.resolve(__dirname, "..", "src");
// The one place allowed to know what a role name means.
const ALLOWED = new Set([path.join(SRC, "types", "permissions.ts")]);

// `systemRole === "admin"`, `!== 'admin_secretary'`, and so on.
const ROLE_NAME_CHECK = /systemRole\s*[!=]==?\s*["'`]/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

/** Drops comments, so prose explaining an old check doesn't count as one. */
function stripComments(code: string): string {
  // Block comments keep their newlines, so reported line numbers stay right.
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ""))
    .replace(/\/\/.*$/gm, "");
}

describe("role-name authorization", () => {
  it("appears nowhere outside src/types/permissions.ts", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !ALLOWED.has(file))
      .flatMap((file) =>
        stripComments(fs.readFileSync(file, "utf8"))
          .split("\n")
          .map((line, i) => ({ line, i }))
          .filter(({ line }) => ROLE_NAME_CHECK.test(line))
          .map(
            ({ line, i }) =>
              `${path.relative(SRC, file)}:${i + 1}  ${line.trim()}`,
          ),
      );
    expect(offenders).toEqual([]);
  });
});
