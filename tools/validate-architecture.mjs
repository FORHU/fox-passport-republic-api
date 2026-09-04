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

let hasViolations = false;
let filesScanned = 0;

function logViolation(file, rule, description) {
  console.error(`\x1b[31m[VIOLATION]\x1b[0m ${file}`);
  console.error(`  ↳ \x1b[33mRule:\x1b[0m ${rule}`);
  console.error(`  ↳ \x1b[36mDetails:\x1b[0m ${description}\n`);
  hasViolations = true;
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
  if (['utils', 'helpers', 'constants', 'middleware', 'infrastructure', 'types', 'config'].includes(first)) {
    return first;
  }
  return null;
}

/** Resolve a relative specifier the way Node would, so we can read its layer. */
function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const cand of [base + '.ts', base + '.js', base, path.join(base, 'index.ts')]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return null;
}

function validateFile(absPath) {
  const relativePath = path.relative(ROOT_DIR, absPath).split(path.sep).join('/');
  const content = fs.readFileSync(absPath, 'utf8');
  const layer = layerOf(absPath);
  if (!layer) return;
  filesScanned++;

  for (const imp of extractImports(content)) {
    const targetPath = resolveImport(absPath, imp);
    const targetLayer = targetPath ? layerOf(targetPath) : null;
    if (!targetLayer) continue;

    // Rule 1: repositories are the data layer and depend on nothing above them.
    if (layer === 'repositories' && ['services', 'controllers', 'routes'].includes(targetLayer)) {
      logViolation(relativePath, 'Layer Boundary Violation',
        `Repositories represent the data access layer and cannot import from "${targetLayer}" ("${imp}").`);
    }

    // Rule 2: services never reach up into the transport layer.
    if (layer === 'services' && ['controllers', 'routes'].includes(targetLayer)) {
      logViolation(relativePath, 'Layer Boundary Violation',
        `Services represent business logic and cannot import from "${targetLayer}" ("${imp}").`);
    }

    // Rule 3: controllers never import routes.
    if (layer === 'controllers' && targetLayer === 'routes') {
      logViolation(relativePath, 'Layer Boundary Violation',
        `Controllers cannot import from routes ("${imp}").`);
    }

    // Rule 3b: controllers go through a service, not straight to the data layer.
    if (layer === 'controllers' && targetLayer === 'repositories') {
      logViolation(relativePath, 'Layer Boundary Violation',
        `Controllers must go through a service rather than importing a repository directly ("${imp}").`);
    }

    // Rule 4: agnostic layers depend on no business layer.
    if (['utils', 'helpers', 'constants'].includes(layer) &&
        ['controllers', 'services', 'repositories', 'routes'].includes(targetLayer)) {
      logViolation(relativePath, 'Layer Boundary Violation',
        `Agnostic helper/utility/constant modules cannot depend on application business layer "${targetLayer}" ("${imp}").`);
    }
  }
}

function crawl(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) crawl(full);
    else if (stat.isFile() && /\.(ts|js|mjs)$/.test(entry)) validateFile(full);
  }
}

console.info('\x1b[36m%s\x1b[0m', '\u{1F6E1}  Running Backend Layer Architecture Boundary Scan...');
if (!fs.existsSync(ROOT_DIR)) {
  console.error(`Source root not found at target context path: ${ROOT_DIR}`);
  process.exit(1);
}

crawl(ROOT_DIR);

if (hasViolations) {
  console.error('\x1b[31m%s\x1b[0m', `❌ Layer architecture boundary checks failed (${filesScanned} files scanned).`);
  process.exit(1);
} else {
  console.info('\x1b[32m%s\x1b[0m', `✅ Backend architecture boundaries cleanly intact (${filesScanned} files scanned).`);
  process.exit(0);
}
