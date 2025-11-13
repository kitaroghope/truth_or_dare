const { drizzle: drizzleSqlite } = require('drizzle-orm/better-sqlite3');
const { drizzle: drizzlePg } = require('drizzle-orm/node-postgres');
const { drizzle: drizzlePostgres } = require('drizzle-orm/postgres-js');
const Database = require('better-sqlite3');
const { Client } = require('pg');
const postgres = require('postgres');
const schema = require('./schema');

let db = null;
let dbClient = null;

/**
 * Initialize database connection based on DATABASE_TYPE environment variable
 * Supports: sqlite, postgres (via pg), neon (via postgres-js), supabase (via postgres-js)
 */
async function initDatabase() {
  const dbType = process.env.DATABASE_TYPE || 'sqlite';

  try {
    switch (dbType) {
      case 'sqlite':
        console.log('📦 Connecting to SQLite database...');
        dbClient = new Database(process.env.DATABASE_URL || './chat.db');
        db = drizzleSqlite(dbClient, { schema });
        console.log('✅ SQLite connected successfully');
        break;

      case 'postgres':
        console.log('📦 Connecting to PostgreSQL database...');
        dbClient = new Client({
          connectionString: process.env.DATABASE_URL,
        });
        await dbClient.connect();
        db = drizzlePg(dbClient, { schema });
        console.log('✅ PostgreSQL connected successfully');
        break;

      case 'neon':
      case 'supabase':
        console.log(`📦 Connecting to ${dbType} database...`);
        const sql = postgres(process.env.DATABASE_URL, {
          max: 10, // Connection pool size
        });
        db = drizzlePostgres(sql, { schema });
        dbClient = sql;
        console.log(`✅ ${dbType} connected successfully`);
        break;

      default:
        throw new Error(`Unsupported DATABASE_TYPE: ${dbType}. Use 'sqlite', 'postgres', 'neon', or 'supabase'.`);
    }

    return db;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}

/**
 * Get the database instance
 * @returns {Object} Drizzle database instance
 */
function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close database connection
 */
async function closeDatabase() {
  const dbType = process.env.DATABASE_TYPE || 'sqlite';

  try {
    if (dbClient) {
      switch (dbType) {
        case 'sqlite':
          dbClient.close();
          break;
        case 'postgres':
          await dbClient.end();
          break;
        case 'neon':
        case 'supabase':
          await dbClient.end();
          break;
      }
      console.log('✅ Database connection closed');
    }
  } catch (error) {
    console.error('❌ Error closing database:', error);
  }
}

/**
 * Run database migrations
 * For SQLite: Create tables if they don't exist
 * For PostgreSQL/Neon/Supabase: Run generated migrations from drizzle folder
 */
async function runMigrations() {
  const dbType = process.env.DATABASE_TYPE || 'sqlite';
  const isPostgres = ['postgres', 'neon', 'supabase'].includes(dbType);

  if (isPostgres) {
    console.log(`📦 Running ${dbType} migrations...`);

    try {
      const { sql: sqlTag } = require('drizzle-orm');

      // Initialize database if not already done
      if (!db) {
        await initDatabase();
      }

      // Create tables directly using SQL - this approach works like SQLite migrations
      // It will fail gracefully if tables already exist
      await db.execute(sqlTag`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) UNIQUE NOT NULL,
          username VARCHAR(100) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          email_verified BOOLEAN DEFAULT FALSE,
          avatar_url VARCHAR(500),
          bio VARCHAR(500),
          last_seen TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);

      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS email_idx ON users(email)`);
      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS username_idx ON users(username)`);

      await db.execute(sqlTag`
        CREATE TABLE IF NOT EXISTS user_stats (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          games_played INTEGER DEFAULT 0 NOT NULL,
          games_won INTEGER DEFAULT 0 NOT NULL,
          games_lost INTEGER DEFAULT 0 NOT NULL,
          truths_completed INTEGER DEFAULT 0 NOT NULL,
          dares_completed INTEGER DEFAULT 0 NOT NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);

      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS user_stats_user_id_idx ON user_stats(user_id)`);

      await db.execute(sqlTag`
        CREATE TABLE IF NOT EXISTS friendships (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id_1 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          user_id_2 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status VARCHAR(20) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);

      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS friendships_user1_idx ON friendships(user_id_1)`);
      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS friendships_user2_idx ON friendships(user_id_2)`);
      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS friendships_status_idx ON friendships(status)`);

      await db.execute(sqlTag`
        CREATE TABLE IF NOT EXISTS games (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          room_code VARCHAR(50) UNIQUE NOT NULL,
          creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
          opponent_id UUID REFERENCES users(id) ON DELETE SET NULL,
          status VARCHAR(20) NOT NULL,
          current_turn UUID REFERENCES users(id) ON DELETE SET NULL,
          game_state JSONB,
          game_phase VARCHAR(30),
          winner_id UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);

      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS games_room_code_idx ON games(room_code)`);
      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS games_creator_idx ON games(creator_id)`);
      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS games_opponent_idx ON games(opponent_id)`);
      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS games_status_idx ON games(status)`);

      await db.execute(sqlTag`
        CREATE TABLE IF NOT EXISTS game_moves (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
          user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          move_type VARCHAR(20) NOT NULL,
          move_data JSONB,
          timestamp TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);

      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS game_moves_game_id_idx ON game_moves(game_id)`);
      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS game_moves_user_id_idx ON game_moves(user_id)`);

      await db.execute(sqlTag`
        CREATE TABLE IF NOT EXISTS notifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type VARCHAR(50) NOT NULL,
          title VARCHAR(255) NOT NULL,
          body VARCHAR(500) NOT NULL,
          data JSONB,
          read BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);

      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id)`);
      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS notifications_read_idx ON notifications(read)`);

      await db.execute(sqlTag`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          token_hash VARCHAR(255) UNIQUE NOT NULL,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          device_info VARCHAR(255),
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);

      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS refresh_tokens_token_hash_idx ON refresh_tokens(token_hash)`);
      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens(user_id)`);

      await db.execute(sqlTag`
        CREATE TABLE IF NOT EXISTS email_verification_tokens (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          token VARCHAR(255) UNIQUE NOT NULL,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);

      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS email_verification_tokens_token_idx ON email_verification_tokens(token)`);

      await db.execute(sqlTag`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          token VARCHAR(255) UNIQUE NOT NULL,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);

      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS password_reset_tokens_token_idx ON password_reset_tokens(token)`);

      await db.execute(sqlTag`
        CREATE TABLE IF NOT EXISTS fcm_tokens (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token VARCHAR(500) UNIQUE NOT NULL,
          device_type VARCHAR(20),
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);

      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS fcm_tokens_user_id_idx ON fcm_tokens(user_id)`);
      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS fcm_tokens_token_idx ON fcm_tokens(token)`);

      await db.execute(sqlTag`
        CREATE TABLE IF NOT EXISTS messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          room VARCHAR(100) NOT NULL,
          username VARCHAR(100) NOT NULL,
          content VARCHAR(5000) NOT NULL,
          type VARCHAR(50) NOT NULL,
          user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          game_id UUID REFERENCES games(id) ON DELETE CASCADE,
          timestamp TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);

      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS messages_room_idx ON messages(room)`);
      await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS messages_game_id_idx ON messages(game_id)`);

      console.log(`✅ ${dbType} migrations completed successfully`);
    } catch (error) {
      // Check if error is about tables already existing
      if (error.message && error.message.includes('already exists')) {
        console.log(`✅ ${dbType} tables already exist, skipping migration`);
      } else {
        console.error(`❌ ${dbType} migration failed:`, error);
        throw error;
      }
    }

    return;
  }

  if (dbType === 'sqlite') {
    console.log('📦 Running SQLite migrations...');

    // SQLite: Create tables using raw SQL for backward compatibility
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(process.env.DATABASE_URL || './chat.db');

    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Users table
        db.run(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            email_verified INTEGER DEFAULT 0,
            avatar_url TEXT,
            bio TEXT,
            last_seen INTEGER,
            created_at INTEGER NOT NULL
          )
        `);

        // User stats table
        db.run(`
          CREATE TABLE IF NOT EXISTS user_stats (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            games_played INTEGER DEFAULT 0,
            games_won INTEGER DEFAULT 0,
            games_lost INTEGER DEFAULT 0,
            truths_completed INTEGER DEFAULT 0,
            dares_completed INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL
          )
        `);

        // Friendships table
        db.run(`
          CREATE TABLE IF NOT EXISTS friendships (
            id TEXT PRIMARY KEY,
            user_id_1 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            user_id_2 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status TEXT NOT NULL,
            created_at INTEGER NOT NULL
          )
        `);

        // Games table
        db.run(`
          CREATE TABLE IF NOT EXISTS games (
            id TEXT PRIMARY KEY,
            room_code TEXT UNIQUE NOT NULL,
            creator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            opponent_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            status TEXT NOT NULL,
            current_turn TEXT REFERENCES users(id) ON DELETE SET NULL,
            game_state TEXT,
            game_phase TEXT,
            winner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `);

        // Game moves table
        db.run(`
          CREATE TABLE IF NOT EXISTS game_moves (
            id TEXT PRIMARY KEY,
            game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
            user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            move_type TEXT NOT NULL,
            move_data TEXT,
            timestamp INTEGER NOT NULL
          )
        `);

        // Notifications table
        db.run(`
          CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            data TEXT,
            read INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL
          )
        `);

        // Refresh tokens table
        db.run(`
          CREATE TABLE IF NOT EXISTS refresh_tokens (
            id TEXT PRIMARY KEY,
            token_hash TEXT UNIQUE NOT NULL,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            device_info TEXT,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
          )
        `);

        // Email verification tokens table
        db.run(`
          CREATE TABLE IF NOT EXISTS email_verification_tokens (
            id TEXT PRIMARY KEY,
            token TEXT UNIQUE NOT NULL,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
          )
        `);

        // Password reset tokens table
        db.run(`
          CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id TEXT PRIMARY KEY,
            token TEXT UNIQUE NOT NULL,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
          )
        `);

        // FCM tokens table
        db.run(`
          CREATE TABLE IF NOT EXISTS fcm_tokens (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token TEXT UNIQUE NOT NULL,
            device_type TEXT,
            updated_at INTEGER NOT NULL
          )
        `);

        // Messages table (update existing or create new)
        db.run(`
          CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            room TEXT NOT NULL,
            username TEXT NOT NULL,
            content TEXT NOT NULL,
            type TEXT NOT NULL,
            user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
            timestamp INTEGER NOT NULL
          )
        `);

        // Add new columns to existing messages table if they don't exist
        db.run(`
          ALTER TABLE messages ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL
        `, (err) => {
          // Ignore error if column already exists
          if (err && !err.message.includes('duplicate column')) {
            console.log('⚠️  user_id column may already exist or error:', err.message);
          }
        });

        db.run(`
          ALTER TABLE messages ADD COLUMN game_id TEXT REFERENCES games(id) ON DELETE CASCADE
        `, (err) => {
          // Ignore error if column already exists
          if (err && !err.message.includes('duplicate column')) {
            console.log('⚠️  game_id column may already exist or error:', err.message);
          }
        });

        // Add game_phase column to games table for state restoration
        db.run(`
          ALTER TABLE games ADD COLUMN game_phase TEXT
        `, (err) => {
          // Ignore error if column already exists
          if (err && !err.message.includes('duplicate column')) {
            console.log('⚠️  game_phase column may already exist or error:', err.message);
          }

          console.log('✅ SQLite migrations completed');
          db.close();
          resolve();
        });

        // Create indices
        db.run(`CREATE INDEX IF NOT EXISTS email_idx ON users(email)`);
        db.run(`CREATE INDEX IF NOT EXISTS username_idx ON users(username)`);
        db.run(`CREATE INDEX IF NOT EXISTS user_stats_user_id_idx ON user_stats(user_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS friendships_user1_idx ON friendships(user_id_1)`);
        db.run(`CREATE INDEX IF NOT EXISTS friendships_user2_idx ON friendships(user_id_2)`);
        db.run(`CREATE INDEX IF NOT EXISTS friendships_status_idx ON friendships(status)`);
        db.run(`CREATE INDEX IF NOT EXISTS games_room_code_idx ON games(room_code)`);
        db.run(`CREATE INDEX IF NOT EXISTS games_creator_idx ON games(creator_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS games_opponent_idx ON games(opponent_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS games_status_idx ON games(status)`);
        db.run(`CREATE INDEX IF NOT EXISTS game_moves_game_id_idx ON game_moves(game_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS game_moves_user_id_idx ON game_moves(user_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS notifications_read_idx ON notifications(read)`);
        db.run(`CREATE INDEX IF NOT EXISTS refresh_tokens_token_hash_idx ON refresh_tokens(token_hash)`);
        db.run(`CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens(user_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS email_verification_tokens_token_idx ON email_verification_tokens(token)`);
        db.run(`CREATE INDEX IF NOT EXISTS password_reset_tokens_token_idx ON password_reset_tokens(token)`);
        db.run(`CREATE INDEX IF NOT EXISTS fcm_tokens_user_id_idx ON fcm_tokens(user_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS fcm_tokens_token_idx ON fcm_tokens(token)`);
        db.run(`CREATE INDEX IF NOT EXISTS messages_room_idx ON messages(room)`);
        db.run(`CREATE INDEX IF NOT EXISTS messages_game_id_idx ON messages(game_id)`);
      });
    });
  }
}

module.exports = {
  initDatabase,
  getDatabase,
  closeDatabase,
  runMigrations,
  schema,
};
