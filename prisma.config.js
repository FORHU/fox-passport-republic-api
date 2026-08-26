require('dotenv').config();

module.exports = {
  migrations: {
    seed: "pnpm exec tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL
  },
};
