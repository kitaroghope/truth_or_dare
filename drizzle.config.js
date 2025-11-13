require('dotenv').config();

const dbType = process.env.DATABASE_TYPE || 'sqlite';
const isPostgres = ['postgres', 'neon', 'supabase'].includes(dbType);

/** @type { import("drizzle-kit").Config } */
module.exports = {
  schema: './db/schema.js',
  out: './drizzle',
  dialect: isPostgres ? 'postgresql' : 'sqlite',
  dbCredentials: isPostgres
    ? {
        url: process.env.DATABASE_URL,
      }
    : {
        url: process.env.DATABASE_URL || './chat.db',
      },
};
