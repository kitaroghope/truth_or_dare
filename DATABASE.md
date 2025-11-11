# Database Configuration Guide

This project supports multiple database backends using Drizzle ORM. You can easily switch between SQLite, PostgreSQL, Neon, and Supabase.

## Supported Databases

- **SQLite** (default) - Local file-based database, great for development
- **PostgreSQL** - Traditional PostgreSQL server
- **Neon** - Serverless PostgreSQL with auto-scaling
- **Supabase** - PostgreSQL with built-in auth and storage

## Quick Start (SQLite - Default)

1. Copy environment template:
```bash
cp .env.example .env
```

2. The default configuration uses SQLite (no setup needed):
```env
DATABASE_TYPE=sqlite
DATABASE_URL=./chat.db
```

3. Run migrations:
```bash
node -e "require('./db/index.js').runMigrations()"
```

## Switching to PostgreSQL

### Local PostgreSQL

1. Install PostgreSQL on your machine

2. Create a database:
```bash
createdb truth_or_dare
```

3. Update `.env`:
```env
DATABASE_TYPE=postgres
DATABASE_URL=postgresql://username:password@localhost:5432/truth_or_dare
```

4. Run migrations:
```bash
npx drizzle-kit push:pg
```

## Switching to Neon

[Neon](https://neon.tech) provides serverless PostgreSQL with instant branching.

1. Sign up at [neon.tech](https://neon.tech)

2. Create a new project

3. Copy your connection string from the Neon dashboard

4. Update `.env`:
```env
DATABASE_TYPE=neon
DATABASE_URL=postgresql://user:password@your-project.neon.tech/neondb?sslmode=require
```

5. Run migrations:
```bash
npx drizzle-kit push:pg
```

## Switching to Supabase

[Supabase](https://supabase.com) provides PostgreSQL plus authentication, storage, and real-time features.

1. Sign up at [supabase.com](https://supabase.com)

2. Create a new project

3. Get your database connection string:
   - Go to Project Settings → Database
   - Copy the "Connection string" (URI mode)
   - Replace `[YOUR-PASSWORD]` with your actual database password

4. Update `.env`:
```env
DATABASE_TYPE=supabase
DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres
```

5. Run migrations:
```bash
npx drizzle-kit push:pg
```

## Database Schema

The application includes the following tables:

- `users` - User accounts with email and authentication
- `user_stats` - Game statistics per user
- `friendships` - Friend relationships between users
- `games` - Persistent game state
- `game_moves` - Individual moves within games
- `notifications` - In-app notifications
- `refresh_tokens` - JWT refresh token management
- `email_verification_tokens` - Email verification tokens
- `password_reset_tokens` - Password reset tokens
- `fcm_tokens` - Firebase Cloud Messaging tokens for push notifications
- `messages` - Chat messages (existing table, now enhanced)

## Migrating Data Between Databases

### Export from SQLite

```bash
node -e "
const db = require('./db/index.js').getDatabase();
const fs = require('fs');
// Export logic here
"
```

### Import to PostgreSQL/Neon/Supabase

After setting up your target database, you can use Drizzle's insert methods to migrate data.

## Drizzle Kit Commands

### Generate SQL migrations
```bash
npx drizzle-kit generate:sqlite  # For SQLite
npx drizzle-kit generate:pg      # For PostgreSQL/Neon/Supabase
```

### Push schema directly (no migration files)
```bash
npx drizzle-kit push:sqlite  # For SQLite
npx drizzle-kit push:pg      # For PostgreSQL/Neon/Supabase
```

### Open Drizzle Studio (database GUI)
```bash
npx drizzle-kit studio
```

This opens a web-based database browser at http://localhost:4983

## Connection Pooling

- **SQLite**: Single connection (file-based)
- **PostgreSQL**: Uses `pg` client with default pooling
- **Neon/Supabase**: Connection pool size set to 10 (configurable in `db/index.js`)

## Best Practices

1. **Development**: Use SQLite for fast local development
2. **Staging**: Use Neon or Supabase for cloud staging environment
3. **Production**: Use Neon, Supabase, or managed PostgreSQL for production

## Troubleshooting

### Connection Errors

- Verify your `DATABASE_URL` is correct
- Check firewall settings for remote databases
- Ensure SSL mode is enabled for cloud databases (Neon/Supabase)

### Migration Issues

- For SQLite: Delete `chat.db` and re-run migrations
- For PostgreSQL: Drop and recreate database if schema conflicts occur

### Performance

- Add indexes for frequently queried fields (already included in schema)
- Use connection pooling for PostgreSQL databases
- Consider read replicas for high-traffic applications

## Environment Variables

All database configuration is done via environment variables in `.env`:

```env
# Required
DATABASE_TYPE=sqlite|postgres|neon|supabase
DATABASE_URL=your-connection-string

# Optional (for advanced configuration)
DB_POOL_SIZE=10
DB_SSL_MODE=require
```

## Support

For database-specific issues:
- SQLite: [sqlite.org/docs.html](https://sqlite.org/docs.html)
- Neon: [neon.tech/docs](https://neon.tech/docs)
- Supabase: [supabase.com/docs](https://supabase.com/docs)
- Drizzle ORM: [orm.drizzle.team](https://orm.drizzle.team)
