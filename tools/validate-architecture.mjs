#!/usr/bin/env node
/**
 * Clean Architecture Validator — layer boundaries for a modular source tree.
 *
 * Ported from `rm-template/node-postg-backend-template/tools/validate-architecture.mjs`.
 * The rules are that file's rules, unchanged:
 *
 *   repositories  may import utils, helpers, config, constants, prisma
 *   services      may import repositories, infrastructure, events, utils, helpers,
 *                 constants — NEVER controllers or routes
 *   controllers   may import services, helpers, utils, constants — NEVER routes
 *   routes        wire controllers and middleware
 *   utils/helpers/constants  are agnostic and may import no business layer
 *
 * What changed is only how a file's layer is *detected*.
 *
 * The template is laid out by layer (`src/services/x.service.ts`), so it reads
 * the layer from the first path segment. This repository is laid out by domain
 * (`src/modules/venue/venue.service.ts`), so the first segment is always
 * "modules" and says nothing. Here the layer comes from the filename suffix,
 * which every file already carries, and the *target* layer is found by
 * resolving the import to a real file and reading its suffix too — a relative
 * specifier like "./venue.repository" carries no layer word at all.
 *
 * Same rules, same enforcement, different tree. The dependency direction is the
 * standard; the folder shape was only ever how the template spelled it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../src');

function logViolation(file, rule, description) {
  console.error(`\x1b[31m[VIOLATION]\x1b[0m ${file}`);
  console.error(`  ↳ \x1b[33mRule:\x1b[0m ${rule}`);
  console.error(`  ↳ \x1b[36mDetails:\x1b[0m ${description}\n`);
}

function extractImports(content) {
  const imports = [];
  const importRegex =
    /(?:import\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"])|(?:require\(['"]([^'"]+)['"]\))/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1] || match[2]);
  }
  return imports;
}

/** A file's layer, from its name first and its folder second. */
function layerOf(absPath) {
  const base = path.basename(absPath);
  // Spelled out rather than derived. "repository" + "s" is "repositorys", which
  // silently matches no rule -- the first version of this file did exactly that
  // and reported a clean tree while every repository rule was inert.
  const LAYER_BY_SUFFIX = {
    controller: 'controllers',
    service: 'services',
    repository: 'repositories',
    routes: 'routes',
  };
  const suffix = base.match(/\.(controller|service|repository|routes)\.[tj]s$/);
  if (suffix) return LAYER_BY_SUFFIX[suffix[1]];
  const rel = path.relative(ROOT_DIR, absPath).split(path.sep).join('/');
  const first = rel.split('/')[0];
  if (['utils', 'helpers', 'constants', 'middleware', 'infrastructure', 'types', 'config', 'jobs', 'api'].includes(first)) {
    return first;
  }
  return null;
}

/** Resolve a relative specifier the way Node would, so we can read its layer. */
function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const cand of [base + '.ts', base + '.js', base, path.join(base, 'index.ts')]) {
    if (fs.statSync(cand, { throwIfNoEntry: false })?.isFile()) return cand;
  }
  return null;
}

/**
 * This validator only resolves relative specifiers (see resolveImport above).
 * ADR 0004 dropped `@/*` path aliases and says the decision should stay
 * dropped -- partly because reintroducing them would make every aliased
 * import invisible here (resolveImport returns null, the caller treats that
 * the same as "not a business-layer import", and the file goes unscanned for
 * that edge). Fail loudly instead of silently if that decision is reversed
 * without updating this file.
 */
function tsconfigHasPathAliases() {
  const tsconfigPath = path.resolve(__dirname, '../tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) return false;
  return fs.readFileSync(tsconfigPath, 'utf8')
    .split('\n')
    .some((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('//') && /"paths"\s*:/.test(trimmed);
    });
}

const BUSINESS_LAYERS = ['controllers', 'services', 'repositories', 'routes'];

// Same four rules the header's dependency-direction table describes, as data
// instead of four copy-pasted `if` blocks: for a file in `from`, importing
// any layer in `to` is a violation.
const RULES = [
  {
    from: 'repositories',
    to: ['services', 'controllers', 'routes'],
    describe: (targetLayer, imp) =>
      `Repositories represent the data access layer and cannot import from "${targetLayer}" ("${imp}").`,
  },
  {
    from: 'services',
    to: ['controllers', 'routes'],
    describe: (targetLayer, imp) =>
      `Services represent business logic and cannot import from "${targetLayer}" ("${imp}").`,
  },
  {
    from: 'controllers',
    to: ['routes'],
    describe: (_targetLayer, imp) => `Controllers cannot import from routes ("${imp}").`,
  },
  {
    from: 'controllers',
    to: ['repositories'],
    describe: (_targetLayer, imp) =>
      `Controllers must go through a service rather than importing a repository directly ("${imp}").`,
  },
  {
    from: ['utils', 'helpers', 'constants'],
    to: BUSINESS_LAYERS,
    describe: (targetLayer, imp) =>
      `Agnostic helper/utility/constant modules cannot depend on application business layer "${targetLayer}" ("${imp}").`,
  },
];

/** Every boundary violation found in one file, or null if it carries no layer. */
function validateFile(absPath) {
  const relativePath = path.relative(ROOT_DIR, absPath).split(path.sep).join('/');
  const layer = layerOf(absPath);
  if (!layer) return null;

  const content = fs.readFileSync(absPath, 'utf8');
  const violations = [];

  for (const imp of extractImports(content)) {
    const targetPath = resolveImport(absPath, imp);
    const targetLayer = targetPath ? layerOf(targetPath) : null;
    if (!targetLayer) continue;

    for (const rule of RULES) {
      const from = Array.isArray(rule.from) ? rule.from : [rule.from];
      if (from.includes(layer) && rule.to.includes(targetLayer)) {
        violations.push({
          file: relativePath,
          rule: 'Layer Boundary Violation',
          description: rule.describe(targetLayer, imp),
        });
      }
    }
  }

  return violations;
}

/** Every boundary violation found under `dir`, plus how many files were scanned. */
function crawl(dir) {
  let filesScanned = 0;
  const violations = [];

  if (!fs.existsSync(dir)) return { filesScanned, violations };

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = crawl(full);
      filesScanned += sub.filesScanned;
      violations.push(...sub.violations);
    } else if (/\.(ts|js|mjs)$/.test(entry.name)) {
      const fileViolations = validateFile(full);
      if (fileViolations !== null) {
        filesScanned++;
        violations.push(...fileViolations);
      }
    }
  }

  return { filesScanned, violations };
}

console.info('\x1b[36m%s\x1b[0m', '\u{1F6E1}  Running Backend Layer Architecture Boundary Scan...');
if (!fs.existsSync(ROOT_DIR)) {
  console.error(`Source root not found at target context path: ${ROOT_DIR}`);
  process.exit(1);
}
if (tsconfigHasPathAliases()) {
  console.error(
    'tsconfig.json declares "paths". This validator only resolves relative ' +
    'imports (see resolveImport), so aliased imports would be silently ' +
    'unscanned. ADR 0004 explains why aliases were dropped -- either revert ' +
    'that, or teach resolveImport to read tsconfig paths before trusting this scan.',
  );
  process.exit(1);
}

const { filesScanned, violations } = crawl(ROOT_DIR);
violations.forEach((v) => logViolation(v.file, v.rule, v.description));

if (violations.length > 0) {
  console.error('\x1b[31m%s\x1b[0m', `❌ Layer architecture boundary checks failed (${filesScanned} files scanned).`);
  process.exit(1);
} else {
  console.info('\x1b[32m%s\x1b[0m', `✅ Backend architecture boundaries cleanly intact (${filesScanned} files scanned).`);
  process.exit(0);
}
