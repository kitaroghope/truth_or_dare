require('dotenv').config();

/** @type { import("drizzle-kit").Config } */
module.exports = {
  schema: './db/schema.js',
  out: './drizzle',
  driver: process.env.DATABASE_TYPE === 'postgres' ? 'pg' : 'better-sqlite',
  dbCredentials: process.env.DATABASE_TYPE === 'postgres'
    ? {
        connectionString: process.env.DATABASE_URL,
      }
    : {
        url: process.env.DATABASE_URL || './chat.db',
      },
};
