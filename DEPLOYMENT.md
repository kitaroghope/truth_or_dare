# Deployment Guide

Complete guide for deploying the Truth or Dare application to production.

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Setup](#environment-setup)
3. [Database Setup](#database-setup)
4. [Deployment Platforms](#deployment-platforms)
5. [Post-Deployment](#post-deployment)
6. [Monitoring & Maintenance](#monitoring--maintenance)

## Pre-Deployment Checklist

### Security

- [ ] Change default admin credentials
- [ ] Generate strong JWT secrets (64+ characters)
- [ ] Review and update CORS origins
- [ ] Configure secure password for database
- [ ] Enable HTTPS/SSL certificates
- [ ] Review rate limiting configurations
- [ ] Audit dependencies for vulnerabilities (`npm audit`)

### Configuration

- [ ] Set up production environment variables
- [ ] Configure production database (PostgreSQL/Neon/Supabase)
- [ ] Set up SendGrid for email delivery
- [ ] Configure Firebase for push notifications
- [ ] Set appropriate BASE_URL for your domain
- [ ] Configure error logging (optional: Sentry)

### Code

- [ ] Run tests (if available)
- [ ] Build frontend assets (if separate)
- [ ] Remove console.log statements (or use proper logging)
- [ ] Minify JavaScript/CSS (optional)
- [ ] Optimize images

### Documentation

- [ ] Update README with deployment info
- [ ] Document any custom configurations
- [ ] Create admin guide
- [ ] Document API for mobile developers

## Environment Setup

### Required Environment Variables

Create `.env` file in production (never commit to version control):

```bash
# ===== Server Configuration =====
NODE_ENV=production
PORT=3000
BASE_URL=https://yourdomain.com

# ===== Database Configuration =====
# Choose one database type
DATABASE_TYPE=postgres  # or 'sqlite', 'neon', 'supabase'

# SQLite (for development/small scale)
DATABASE_URL=./chat.db

# PostgreSQL (recommended for production)
# DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require

# Neon (serverless PostgreSQL)
# DATABASE_URL=postgresql://user:password@ep-xxx-xxx.neon.tech/database?sslmode=require

# Supabase (PostgreSQL with additional features)
# DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres

# ===== JWT Configuration =====
# Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=your_64_character_secret_here
JWT_REFRESH_SECRET=your_different_64_character_secret_here

# ===== SendGrid Email Configuration =====
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
SENDGRID_FROM_NAME=Truth or Dare

# ===== Firebase Cloud Messaging (Push Notifications) =====
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour\nPrivate\nKey\nHere\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com

# ===== Admin Panel =====
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_this_strong_password_123

# ===== CORS Configuration =====
# Comma-separated list of allowed origins
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com,https://app.yourdomain.com
```

### Generate Secure Secrets

```bash
# Generate JWT secrets
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
```

## Database Setup

### Option 1: Neon (Recommended for Production)

**Advantages:**
- Serverless PostgreSQL
- Automatic scaling
- Built-in connection pooling
- Free tier available
- Easy backup and restore

**Setup:**

1. Sign up at [neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string
4. Update `.env`:

```bash
DATABASE_TYPE=neon
DATABASE_URL=postgresql://user:password@ep-xxx-xxx.neon.tech/database?sslmode=require
```

5. Run migrations:

```bash
npm run migrate
# or
npm run db:push
```

### Option 2: Supabase

**Advantages:**
- PostgreSQL with real-time features
- Built-in authentication (optional, we use custom auth)
- File storage
- Free tier available

**Setup:**

1. Sign up at [supabase.com](https://supabase.com)
2. Create a new project
3. Get connection string from Settings > Database
4. Update `.env`:

```bash
DATABASE_TYPE=supabase
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
```

5. Run migrations:

```bash
npm run migrate
```

### Option 3: Traditional PostgreSQL

**For VPS, AWS RDS, DigitalOcean, etc.**

```bash
DATABASE_TYPE=postgres
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
```

### Database Migration

Run migrations after database setup:

```bash
# Option 1: Using our migration script
npm run migrate

# Option 2: Using Drizzle Kit
npm run db:push

# Option 3: Generate SQL migration files
npm run db:generate
```

### Backup Strategy

**Neon/Supabase:**
- Use built-in backup features
- Enable point-in-time recovery

**Self-hosted PostgreSQL:**

```bash
# Backup
pg_dump -h localhost -U username -d database > backup.sql

# Restore
psql -h localhost -U username -d database < backup.sql

# Automated daily backups (cron)
0 2 * * * pg_dump -h localhost -U username -d database > /backups/backup_$(date +\%Y\%m\%d).sql
```

## Deployment Platforms

### Option 1: Render (Recommended)

**Free tier available, easy setup**

1. Push code to GitHub
2. Create account at [render.com](https://render.com)
3. Click "New +" → "Web Service"
4. Connect your GitHub repository
5. Configure:
   - **Name**: truth-or-dare
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free (or paid for production)
6. Add environment variables from `.env`
7. Deploy!

**Custom Domain:**
- Settings → Custom Domain
- Add your domain
- Update DNS records as instructed

### Option 2: Railway

**Similar to Render, good PostgreSQL integration**

1. Push code to GitHub
2. Create account at [railway.app](https://railway.app)
3. "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Add PostgreSQL database (optional)
6. Add environment variables
7. Deploy!

### Option 3: Heroku

**Mature platform, easy add-ons**

1. Install Heroku CLI
2. Login and create app:

```bash
heroku login
heroku create your-app-name
```

3. Add PostgreSQL:

```bash
heroku addons:create heroku-postgresql:mini
```

4. Set environment variables:

```bash
heroku config:set JWT_SECRET=your_secret
heroku config:set SENDGRID_API_KEY=your_key
# ... etc
```

5. Deploy:

```bash
git push heroku main
```

6. Run migrations:

```bash
heroku run npm run migrate
```

### Option 4: DigitalOcean App Platform

1. Push code to GitHub
2. Create account at [digitalocean.com](https://digitalocean.com)
3. Apps → Create App
4. Select GitHub repository
5. Configure build and run commands
6. Add environment variables
7. Deploy!

### Option 5: VPS (Ubuntu)

**For full control**

1. SSH into your server
2. Install Node.js:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

3. Install PM2 (process manager):

```bash
sudo npm install -g pm2
```

4. Clone your repository:

```bash
git clone https://github.com/yourusername/truth_or_dare.git
cd truth_or_dare
npm install
```

5. Create `.env` file with production variables

6. Run migrations:

```bash
npm run migrate
```

7. Start with PM2:

```bash
pm2 start app.js --name truth-or-dare
pm2 save
pm2 startup
```

8. Install nginx for reverse proxy:

```bash
sudo apt install nginx
```

9. Configure nginx (`/etc/nginx/sites-available/truth-or-dare`):

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

10. Enable site and restart nginx:

```bash
sudo ln -s /etc/nginx/sites-available/truth-or-dare /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

11. Install SSL certificate (Let's Encrypt):

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### Option 6: Docker

Create `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/truthordare
    env_file:
      - .env
    depends_on:
      - db

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=truthordare
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

Deploy:

```bash
docker-compose up -d
```

## Post-Deployment

### Verify Deployment

1. **Health Check:**
   ```bash
   curl https://yourdomain.com/ping
   # Should return: {"message":"Server is alive"}
   ```

2. **Test Authentication:**
   - Open https://yourdomain.com
   - Click "Sign Up"
   - Create test account
   - Verify email (check SendGrid logs)

3. **Test Game Flow:**
   - Create a room
   - Join with another browser/device
   - Play a round
   - Verify database updates

4. **Test WebSocket:**
   - Open browser console
   - Check for Socket.io connection logs
   - Test real-time chat

### DNS Configuration

Point your domain to your deployment:

**For most platforms (Render, Railway, Heroku):**

Add CNAME record:
```
Type: CNAME
Name: @ or www
Value: your-app.onrender.com (or platform-specific URL)
```

**For VPS:**

Add A record:
```
Type: A
Name: @ or www
Value: Your server IP address
```

### SSL Certificate

**Automatic (Render, Railway, Heroku):**
- SSL is automatically provisioned
- Ensure custom domain is verified

**Manual (VPS with Let's Encrypt):**

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Auto-renewal (already set up with certbot):
```bash
sudo certbot renew --dry-run
```

### Firewall Configuration (VPS only)

```bash
# Allow HTTP, HTTPS, SSH
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## Monitoring & Maintenance

### Application Monitoring

**PM2 (VPS):**

```bash
# View logs
pm2 logs truth-or-dare

# Monitor resources
pm2 monit

# View status
pm2 status
```

**Platform Logs:**
- **Render**: Dashboard → Logs tab
- **Railway**: Project → Deployments → View Logs
- **Heroku**: `heroku logs --tail`

### Error Tracking (Optional)

**Sentry:**

1. Sign up at [sentry.io](https://sentry.io)
2. Create new project (Node.js)
3. Install Sentry:

```bash
npm install @sentry/node
```

4. Add to app.js:

```javascript
const Sentry = require("@sentry/node");

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});

// Error handler
app.use(Sentry.Handlers.errorHandler());
```

### Database Monitoring

**Monitor Connection Pool:**

```javascript
// Add to your app
setInterval(() => {
  console.log('Database connections:', db.pool?.totalCount || 'N/A');
}, 60000);
```

**Monitor Query Performance:**

Enable slow query logging in PostgreSQL:

```sql
ALTER DATABASE your_db SET log_min_duration_statement = 1000;
```

### Uptime Monitoring

**Free Services:**
- [UptimeRobot](https://uptimerobot.com) - 50 monitors free
- [StatusCake](https://www.statuscake.com) - Free tier available
- [Pingdom](https://www.pingdom.com) - Free trial

Set up HTTP monitor for: `https://yourdomain.com/ping`

### Backup Schedule

**Automated Daily Backups:**

```bash
# crontab -e
0 2 * * * pg_dump -h host -U user -d database > /backups/db_$(date +\%Y\%m\%d).sql

# Keep last 7 days only
0 3 * * * find /backups -name "db_*.sql" -mtime +7 -delete
```

### Update Strategy

1. **Test Updates Locally:**
   ```bash
   npm update
   npm audit fix
   npm test
   ```

2. **Deploy to Staging** (if available)

3. **Create Database Backup**

4. **Deploy to Production:**
   ```bash
   git push main
   # or platform-specific deployment
   ```

5. **Run Migrations:**
   ```bash
   npm run migrate
   ```

6. **Monitor for Errors**

### Security Updates

**Weekly:**
- Check `npm audit`
- Review rate limit logs
- Check failed authentication attempts

**Monthly:**
- Update dependencies
- Review user permissions
- Audit admin access logs
- Rotate JWT secrets (optional, but recommended yearly)

### Performance Optimization

**Enable Gzip Compression:**

```javascript
const compression = require('compression');
app.use(compression());
```

**Add Caching Headers:**

```javascript
app.use('/uploads', express.static('uploads', {
  maxAge: '1y',
  etag: true,
}));
```

**Database Indexing:**

Ensure indexes exist on frequently queried columns:
- users.email
- users.username
- games.room_code
- refresh_tokens.token_hash

**CDN (Optional):**

Use a CDN for static assets:
- Cloudflare (free tier)
- AWS CloudFront
- Fastly

### Scaling Considerations

**Vertical Scaling (Single Server):**
- Upgrade server resources (CPU, RAM)
- Increase database connections
- Optimize queries

**Horizontal Scaling (Multiple Servers):**

1. Use Redis for session storage
2. Configure sticky sessions for Socket.io
3. Use load balancer (nginx, AWS ALB)
4. Share uploads via S3 or similar

**Socket.io Scaling:**

```javascript
const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");

const pubClient = createClient({ url: "redis://localhost:6379" });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

## Troubleshooting

### Common Issues

**Database Connection Failed:**
```bash
# Check connection string format
# Ensure database is accessible
# Verify SSL mode if required
```

**WebSocket Not Connecting:**
```bash
# Check CORS configuration
# Verify firewall allows WebSocket
# Ensure reverse proxy forwards upgrade headers
```

**Emails Not Sending:**
```bash
# Verify SendGrid API key
# Check email address format
# Review SendGrid activity logs
```

**Rate Limit Too Strict:**
```javascript
// Adjust in middleware/rateLimiter.js
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Increase from 5
});
```

## Support

For deployment issues:
1. Check application logs
2. Review platform-specific documentation
3. Search for error messages
4. Open GitHub issue with details

## Checklist Summary

### Before Deployment
- [ ] All environment variables configured
- [ ] Database set up and migrated
- [ ] JWT secrets generated
- [ ] Admin credentials changed
- [ ] CORS origins configured
- [ ] SSL/HTTPS enabled

### After Deployment
- [ ] Health check passes
- [ ] Authentication works
- [ ] Game flow tested
- [ ] WebSocket connects
- [ ] Email delivery works
- [ ] Push notifications work (if configured)
- [ ] Monitoring set up
- [ ] Backups configured

### Ongoing
- [ ] Monitor application logs
- [ ] Check error tracking
- [ ] Review security logs
- [ ] Update dependencies monthly
- [ ] Test backup restoration quarterly

## Resources

- [Node.js Production Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)
- [PostgreSQL Performance Tips](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Socket.io Production](https://socket.io/docs/v4/using-multiple-nodes/)
- [Let's Encrypt](https://letsencrypt.org/getting-started/)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
