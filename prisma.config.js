require('dotenv').config();

module.exports = {
  // The schema is a folder, not a file: prisma/schema/*.prisma, split by domain.
  // Prisma stitches them into one schema, so relations cross files freely.
  schema: "prisma/schema",
  migrations: {
    // Must be stated explicitly. Migrations are resolved relative to the schema,
    // so pointing `schema` at prisma/schema made Prisma look for them in
    // prisma/schema/migrations and find none -- and `migrate status` then reports
    // "Database schema is up to date!" because it compared against an empty
    // history, not because anything was applied.
    path: "prisma/migrations",
    seed: "pnpm exec tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL
  },
};
