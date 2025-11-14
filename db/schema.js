// Load environment variables first
require('dotenv').config();

const { sqliteTable, text, integer: sqliteInteger, index } = require('drizzle-orm/sqlite-core');
const { pgTable, uuid, varchar, timestamp, boolean, json, integer: pgInteger, uniqueIndex } = require('drizzle-orm/pg-core');
const { sql } = require('drizzle-orm');

// Determine which table creator to use based on DATABASE_TYPE env var
const dbType = process.env.DATABASE_TYPE || 'sqlite';
const isPostgres = ['postgres', 'neon', 'supabase'].includes(dbType);
const createTable = isPostgres ? pgTable : sqliteTable;

// Helper functions for cross-database compatibility
const id = () => isPostgres
  ? uuid('id').defaultRandom().primaryKey()
  : text('id').primaryKey();

const timestamp_field = (name) => isPostgres
  ? timestamp(name).defaultNow()
  : sqliteInteger(name, { mode: 'timestamp' }).default(sql`(unixepoch())`);

const varchar_field = (name, length = 255) => isPostgres
  ? varchar(name, { length })
  : text(name);

const boolean_field = (name) => isPostgres
  ? boolean(name).default(false)
  : sqliteInteger(name, { mode: 'boolean' }).default(false);

const json_field = (name) => isPostgres
  ? json(name)
  : text(name, { mode: 'json' });

const integer_field = (name) => isPostgres
  ? pgInteger(name)
  : sqliteInteger(name);

// Users table
const users = createTable('users', {
  id: id(),
  email: varchar_field('email', 255).unique().notNull(),
  username: varchar_field('username', 100).unique().notNull(),
  password_hash: varchar_field('password_hash', 255).notNull(),
  email_verified: boolean_field('email_verified'),
  avatar_url: varchar_field('avatar_url', 500),
  bio: varchar_field('bio', 500),
  last_seen: timestamp_field('last_seen'),
  created_at: timestamp_field('created_at').notNull(),
}, (table) => ({
  emailIdx: index('email_idx').on(table.email),
  usernameIdx: index('username_idx').on(table.username),
}));

// User Stats table
const user_stats = createTable('user_stats', {
  id: id(),
  user_id: isPostgres
    ? uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull()
    : text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  games_played: integer_field('games_played').default(0).notNull(),
  games_won: integer_field('games_won').default(0).notNull(),
  games_lost: integer_field('games_lost').default(0).notNull(),
  truths_completed: integer_field('truths_completed').default(0).notNull(),
  dares_completed: integer_field('dares_completed').default(0).notNull(),
  created_at: timestamp_field('created_at').notNull(),
}, (table) => ({
  userIdIdx: index('user_stats_user_id_idx').on(table.user_id),
}));

// Friendships table
const friendships = createTable('friendships', {
  id: id(),
  user_id_1: isPostgres
    ? uuid('user_id_1').references(() => users.id, { onDelete: 'cascade' }).notNull()
    : text('user_id_1').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  user_id_2: isPostgres
    ? uuid('user_id_2').references(() => users.id, { onDelete: 'cascade' }).notNull()
    : text('user_id_2').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  status: varchar_field('status', 20).notNull(), // 'pending', 'accepted', 'blocked'
  created_at: timestamp_field('created_at').notNull(),
}, (table) => ({
  user1Idx: index('friendships_user1_idx').on(table.user_id_1),
  user2Idx: index('friendships_user2_idx').on(table.user_id_2),
  statusIdx: index('friendships_status_idx').on(table.status),
}));

// Games table
const games = createTable('games', {
  id: id(),
  room_code: varchar_field('room_code', 50).unique().notNull(),
  creator_id: isPostgres
    ? uuid('creator_id').references(() => users.id, { onDelete: 'set null' })
    : text('creator_id').references(() => users.id, { onDelete: 'set null' }),
  opponent_id: isPostgres
    ? uuid('opponent_id').references(() => users.id, { onDelete: 'set null' })
    : text('opponent_id').references(() => users.id, { onDelete: 'set null' }),
  status: varchar_field('status', 20).notNull(), // 'waiting', 'in_progress', 'completed', 'forfeit'
  current_turn: isPostgres
    ? uuid('current_turn').references(() => users.id, { onDelete: 'set null' })
    : text('current_turn').references(() => users.id, { onDelete: 'set null' }),
  game_state: json_field('game_state'), // Stores full game state (choices, winner, loser, etc.)
  game_phase: varchar_field('game_phase', 30), // 'lobby', 'choosing', 'result', 'truth_dare_selection', 'chat', 'completed'
  winner_id: isPostgres
    ? uuid('winner_id').references(() => users.id, { onDelete: 'set null' })
    : text('winner_id').references(() => users.id, { onDelete: 'set null' }),
  created_at: timestamp_field('created_at').notNull(),
  updated_at: timestamp_field('updated_at').notNull(),
}, (table) => ({
  roomCodeIdx: index('games_room_code_idx').on(table.room_code),
  creatorIdx: index('games_creator_idx').on(table.creator_id),
  opponentIdx: index('games_opponent_idx').on(table.opponent_id),
  statusIdx: index('games_status_idx').on(table.status),
}));

// Game Moves table
const game_moves = createTable('game_moves', {
  id: id(),
  game_id: isPostgres
    ? uuid('game_id').references(() => games.id, { onDelete: 'cascade' }).notNull()
    : text('game_id').references(() => games.id, { onDelete: 'cascade' }).notNull(),
  user_id: isPostgres
    ? uuid('user_id').references(() => users.id, { onDelete: 'set null' })
    : text('user_id').references(() => users.id, { onDelete: 'set null' }),
  move_type: varchar_field('move_type', 20).notNull(), // 'rps', 'truth', 'dare'
  move_data: json_field('move_data'), // Stores move details (choice, response, etc.)
  timestamp: timestamp_field('timestamp').notNull(),
}, (table) => ({
  gameIdIdx: index('game_moves_game_id_idx').on(table.game_id),
  userIdIdx: index('game_moves_user_id_idx').on(table.user_id),
}));

// Notifications table
const notifications = createTable('notifications', {
  id: id(),
  user_id: isPostgres
    ? uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull()
    : text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  type: varchar_field('type', 50).notNull(), // 'game_invite', 'your_turn', 'friend_request', etc.
  title: varchar_field('title', 255).notNull(),
  body: varchar_field('body', 500).notNull(),
  data: json_field('data'), // Additional notification data
  read: boolean_field('read'),
  created_at: timestamp_field('created_at').notNull(),
}, (table) => ({
  userIdIdx: index('notifications_user_id_idx').on(table.user_id),
  readIdx: index('notifications_read_idx').on(table.read),
}));

// Refresh Tokens table
const refresh_tokens = createTable('refresh_tokens', {
  id: id(),
  token_hash: varchar_field('token_hash', 255).unique().notNull(),
  user_id: isPostgres
    ? uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull()
    : text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  device_info: varchar_field('device_info', 255),
  expires_at: timestamp_field('expires_at').notNull(),
  created_at: timestamp_field('created_at').notNull(),
}, (table) => ({
  tokenHashIdx: index('refresh_tokens_token_hash_idx').on(table.token_hash),
  userIdIdx: index('refresh_tokens_user_id_idx').on(table.user_id),
}));

// Email Verification Tokens table
const email_verification_tokens = createTable('email_verification_tokens', {
  id: id(),
  token: varchar_field('token', 255).unique().notNull(),
  user_id: isPostgres
    ? uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull()
    : text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  expires_at: timestamp_field('expires_at').notNull(),
  created_at: timestamp_field('created_at').notNull(),
}, (table) => ({
  tokenIdx: index('email_verification_tokens_token_idx').on(table.token),
}));

// Password Reset Tokens table
const password_reset_tokens = createTable('password_reset_tokens', {
  id: id(),
  token: varchar_field('token', 255).unique().notNull(),
  user_id: isPostgres
    ? uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull()
    : text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  expires_at: timestamp_field('expires_at').notNull(),
  created_at: timestamp_field('created_at').notNull(),
}, (table) => ({
  tokenIdx: index('password_reset_tokens_token_idx').on(table.token),
}));

// FCM Tokens table (for push notifications)
const fcm_tokens = createTable('fcm_tokens', {
  id: id(),
  user_id: isPostgres
    ? uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull()
    : text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  token: varchar_field('token', 500).unique().notNull(),
  device_type: varchar_field('device_type', 20), // 'ios', 'android', 'web'
  updated_at: timestamp_field('updated_at').notNull(),
}, (table) => ({
  userIdIdx: index('fcm_tokens_user_id_idx').on(table.user_id),
  tokenIdx: index('fcm_tokens_token_idx').on(table.token),
}));

// Keep existing messages table compatible
const messages = createTable('messages', {
  id: isPostgres
    ? uuid('id').defaultRandom().primaryKey()
    : text('id').primaryKey(),
  room: varchar_field('room', 100).notNull(),
  username: varchar_field('username', 100).notNull(),
  content: varchar_field('content', 5000).notNull(),
  type: varchar_field('type', 50).notNull(),
  user_id: isPostgres
    ? uuid('user_id').references(() => users.id, { onDelete: 'set null' })
    : text('user_id').references(() => users.id, { onDelete: 'set null' }), // Nullable for anonymous users
  game_id: isPostgres
    ? uuid('game_id').references(() => games.id, { onDelete: 'cascade' })
    : text('game_id').references(() => games.id, { onDelete: 'cascade' }),
  timestamp: timestamp_field('timestamp').notNull(),
}, (table) => ({
  roomIdx: index('messages_room_idx').on(table.room),
  gameIdIdx: index('messages_game_id_idx').on(table.game_id),
}));

module.exports = {
  users,
  user_stats,
  friendships,
  games,
  game_moves,
  notifications,
  refresh_tokens,
  email_verification_tokens,
  password_reset_tokens,
  fcm_tokens,
  messages,
};
