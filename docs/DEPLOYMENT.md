# 🚀 Deployment Guide

Deploy Motion Platform to **Netlify** (frontend) + **Railway** (backend).

---

## 📋 Prerequisites

- GitHub account
- [Netlify account](https://netlify.com) (free)
- [Railway account](https://railway.app) (free $5/month credit)
- Project pushed to GitHub

---

## 🚂 Part 1: Deploy Backend to Railway

### Step 1: Create Railway Project

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize project (from repo root)
railway init
```

**Or use the Railway dashboard:**
1. Go to [railway.app/new](https://railway.app/new)
2. Select "Deploy from GitHub repo"
3. Choose your `motion-platform` repository
4. Railway will auto-detect the Dockerfile

### Step 2: Configure Railway

Railway will use the `railway.toml` and `server/Dockerfile` automatically.

**Set environment variables in Railway dashboard:**
- `PORT`: Leave empty (Railway auto-assigns)
- `SIMULATE_LATENCY_MS`: `0` (or omit)

### Step 3: Deploy

```bash
# Deploy via CLI
railway up

# Or push to GitHub (auto-deploys if connected)
git push origin main
```

### Step 4: Get Your Server URL

```bash
# Generate public URL
railway domain

# Or in dashboard: Settings → Generate Domain
# Example: motion-platform-production.up.railway.app
```

**Copy your WebSocket URL:**
```
wss://your-app.railway.app
```

---

## 🎨 Part 2: Deploy Frontend to Netlify

### Step 1: Connect to GitHub

1. Go to [app.netlify.com](https://app.netlify.com)
2. Click **"Add new site"** → **"Import an existing project"**
3. Choose **GitHub** and authorize
4. Select `motion-platform` repository

### Step 2: Configure Build Settings

Netlify will auto-detect `netlify.toml`, but verify:

- **Build command**: `./netlify-build.sh`
- **Publish directory**: `dist`
- **Node version**: `22`

### Step 3: Set Environment Variables

In Netlify dashboard → **Site settings** → **Environment variables**:

Add:
```
VITE_MULTIPLAYER_SERVER_URL=wss://your-app.railway.app
```

Replace `your-app.railway.app` with your Railway domain from Part 1.

### Step 4: Deploy

Click **"Deploy site"**

Netlify will:
1. Run `netlify-build.sh`
2. Build host + all games
3. Deploy to CDN

**Your site will be live at:**
```
https://your-site-name.netlify.app
```

### Step 5: (Optional) Custom Domain

1. **Netlify**: Domain settings → Add custom domain
2. **Railway**: Settings → Domains → Add custom domain
3. Update `VITE_MULTIPLAYER_SERVER_URL` in Netlify env vars

---

## ✅ Verify Deployment

### Frontend (Netlify)

Visit your Netlify URL:
```
https://your-site-name.netlify.app
```

**Check:**
- [ ] Platform loads
- [ ] Games appear in hub
- [ ] Camera access works
- [ ] Hand tracking initializes

### Backend (Railway)

Test WebSocket connection:
```bash
# Check health endpoint
curl https://your-app.railway.app/metrics

# Or check Railway logs
railway logs
```

**Check:**
- [ ] Server is running
- [ ] Health check passes
- [ ] WebSocket accepts connections

### Multiplayer

1. Open game in two browser windows
2. Create/join room
3. Verify hand data syncs

---

## 🔄 Continuous Deployment

Both platforms support auto-deploy on git push:

```bash
# Make changes
git add .
git commit -m "feat: add new feature"
git push origin main

# Automatic deploys:
# - Railway: rebuilds server
# - Netlify: rebuilds frontend
```

---

## 🐛 Troubleshooting

### Build Fails on Netlify

**Error**: "Command failed with exit code 1"

**Fix**:
```bash
# Test build locally
./netlify-build.sh

# Check Netlify build logs for specific errors
# Common issues:
# - Missing dependencies → check package.json
# - Build script permissions → chmod +x netlify-build.sh
```

### WebSocket Connection Fails

**Error**: "WebSocket connection failed"

**Fix**:
1. Check Railway server is running: `railway logs`
2. Verify `VITE_MULTIPLAYER_SERVER_URL` in Netlify env vars
3. Ensure URL uses `wss://` (not `ws://`) for production
4. Check Railway domain is public (not private)

### Games Don't Load

**Error**: "Failed to load remote entry"

**Fix**:
1. Check CORS headers in `netlify.toml`
2. Verify all games built successfully
3. Check browser console for specific errors
4. Verify manifest.json files copied to dist

### Railway Server Sleeps

Railway free tier doesn't auto-sleep, but may restart if crashed.

**Check health:**
```bash
railway logs --tail
```

### Camera Permission Denied

**Error**: "NotAllowedError: Permission denied"

**Fix**:
- HTTPS required for camera access (Netlify auto-provides)
- Check browser permissions
- Verify `Permissions-Policy` header in netlify.toml

---

## 💰 Cost Estimates

### Free Tier Limits

**Netlify:**
- ✅ 100GB bandwidth/month
- ✅ Unlimited sites
- ✅ Unlimited builds (300 min/month)

**Railway:**
- ✅ $5 credit/month (~720 hours for small app)
- ⚠️ After free credit: ~$5-10/month

### Expected Usage

**Frontend** (per 1000 users):
- Initial load: ~500KB × 1000 = 500MB
- Game switch: ~200KB × 1000 = 200MB
- **Total**: ~700MB (well within 100GB)

**Backend** (continuous):
- Small app: ~$0.50-2/month
- With active users: ~$5-10/month

---

## 📊 Monitoring

### Netlify Analytics

Dashboard shows:
- Page views
- Bandwidth usage
- Build times
- Deploy history

### Railway Metrics

```bash
# View metrics endpoint
curl https://your-app.railway.app/metrics
```

Shows:
- Active connections
- Room count
- Message rate
- Latency

### Performance

**Frontend:**
- Netlify Analytics (built-in)
- Lighthouse scores
- Browser DevTools

**Backend:**
- Railway logs: `railway logs`
- Prometheus metrics: `/metrics` endpoint
- WebSocket connection count

---

## 🔐 Security Checklist

- [ ] HTTPS enabled (auto on Netlify)
- [ ] WSS enabled (auto on Railway)
- [ ] CORS configured (see netlify.toml)
- [ ] Camera permissions policy set
- [ ] No secrets in env vars committed to git
- [ ] Railway env vars set privately
- [ ] Rate limiting on multiplayer (if needed)

---

## 🎯 Next Steps

1. **Custom domain**: Point your domain to Netlify + Railway
2. **Monitoring**: Set up Prometheus/Grafana for backend
3. **Analytics**: Add Google Analytics or Plausible
4. **Error tracking**: Add Sentry for error monitoring
5. **CDN**: Consider Cloudflare for additional DDoS protection

---

## 📞 Support

**Netlify Issues:**
- Docs: https://docs.netlify.com
- Support: https://answers.netlify.com

**Railway Issues:**
- Docs: https://docs.railway.app
- Discord: https://discord.gg/railway

**Project Issues:**
- GitHub: Create an issue in your repo
- Logs: Check Netlify/Railway dashboards

---

## 🚀 Quick Deploy (TL;DR)

```bash
# 1. Deploy backend
railway login
railway init
railway up
railway domain  # Copy this URL

# 2. Deploy frontend
# Go to netlify.com → Import from GitHub
# Set env var: VITE_MULTIPLAYER_SERVER_URL=wss://your-railway-url
# Click deploy

# Done! 🎉
```
