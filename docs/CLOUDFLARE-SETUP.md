# ☁️ Cloudflare Subdomain Setup Guide

Connect your Motion Platform to custom subdomains via Cloudflare.

---

## 📋 Prerequisites

- Domain registered and added to Cloudflare
- Netlify site deployed
- Railway backend deployed
- Access to Cloudflare dashboard

---

## 🎯 Recommended Subdomain Structure

```
game.yourdomain.com      → Frontend (Netlify)
api.yourdomain.com       → Backend (Railway)
```

Or:
```
play.yourdomain.com      → Frontend (Netlify)
ws.yourdomain.com        → Backend (Railway)
```

---

## 🎨 Part 1: Frontend Setup (Netlify)

### Step 1: Add Domain in Netlify

1. Go to your Netlify site dashboard
2. **Site settings** → **Domain management**
3. Click **"Add custom domain"**
4. Enter your subdomain: `game.yourdomain.com`
5. Click **"Verify"**

Netlify will show you DNS instructions.

### Step 2: Configure Cloudflare DNS

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your domain
3. Go to **DNS** → **Records**
4. Click **"Add record"**

**Add CNAME record:**
```
Type: CNAME
Name: game (or your subdomain)
Target: [your-site].netlify.app
Proxy status: Proxied (orange cloud)
TTL: Auto
```

**Example:**
```
CNAME  game  →  motion-platform.netlify.app  (Proxied)
```

### Step 3: Wait for DNS Propagation

- Usually takes 5-10 minutes
- Check status in Netlify dashboard
- Netlify will auto-provision SSL certificate

### Step 4: Verify

Visit `https://game.yourdomain.com` - should load your platform!

---

## 🚂 Part 2: Backend Setup (Railway)

### Step 1: Add Domain in Railway

1. Go to your Railway project dashboard
2. Click on your server service
3. Go to **Settings** → **Networking** → **Domains**
4. Click **"Custom Domain"**
5. Enter: `api.yourdomain.com`
6. Railway will show DNS instructions

### Step 2: Configure Cloudflare DNS

**Option A: CNAME (Recommended for Proxied)**
```
Type: CNAME
Name: api (or ws)
Target: [your-railway-domain].railway.app
Proxy status: DNS only (gray cloud) ⚠️
TTL: Auto
```

**Why "DNS only"?**
- Cloudflare proxying can interfere with WebSocket connections
- Railway handles SSL automatically
- If you want DDoS protection, use Option B below

**Option B: Using Cloudflare Proxy (Advanced)**

If you want Cloudflare's proxy for DDoS protection:

```
Type: CNAME
Name: api
Target: [your-railway-domain].railway.app
Proxy status: Proxied (orange cloud)
TTL: Auto
```

**Then configure Cloudflare for WebSockets:**

1. Go to **SSL/TLS** → **Overview**
   - Set to **Full (strict)** or **Full**

2. Go to **Network**
   - Enable **WebSockets** (should be on by default)

3. Go to **Speed** → **Optimization**
   - Disable **Rocket Loader** (can break WebSockets)
   - Disable **Auto Minify** for JS (can break WebSockets)

### Step 3: Verify Backend

```bash
# Test health endpoint
curl https://api.yourdomain.com/metrics

# Test WebSocket (using wscat)
npm install -g wscat
wscat -c wss://api.yourdomain.com
```

---

## 🔧 Part 3: Update Environment Variables

### Update Netlify Environment Variables

1. Go to Netlify site settings
2. **Environment variables**
3. Update `VITE_MULTIPLAYER_SERVER_URL`:

```
VITE_MULTIPLAYER_SERVER_URL=wss://api.yourdomain.com
```

4. **Trigger redeploy**:
   - Go to **Deploys** → **Trigger deploy** → **Deploy site**

### Update Local .env (Optional)

For local development, create `.env.local`:

```bash
# .env.local (for local testing with production backend)
VITE_MULTIPLAYER_SERVER_URL=wss://api.yourdomain.com
```

---

## 🔐 SSL/TLS Configuration

### Cloudflare SSL Settings

1. Go to **SSL/TLS** → **Overview**
2. Choose encryption mode:

**For Frontend (Netlify) - Proxied:**
```
Encryption mode: Full (strict)
```
- Netlify provides SSL cert
- Cloudflare validates it

**For Backend (Railway) - DNS Only:**
```
No configuration needed
```
- Railway handles SSL directly
- Cloudflare not in the middle

**For Backend (Railway) - Proxied:**
```
Encryption mode: Full (strict)
```
- Railway provides SSL cert
- Cloudflare validates it

### Force HTTPS

1. **SSL/TLS** → **Edge Certificates**
2. Enable **"Always Use HTTPS"**
3. Enable **"Automatic HTTPS Rewrites"**

---

## ✅ Verification Checklist

### Frontend
- [ ] `https://game.yourdomain.com` loads
- [ ] SSL certificate valid (green lock)
- [ ] Camera permissions work
- [ ] Hand tracking initializes
- [ ] Console shows correct backend URL

### Backend
- [ ] `https://api.yourdomain.com/metrics` returns data
- [ ] WebSocket connects successfully
- [ ] No CORS errors in console
- [ ] Multiplayer rooms work

### Test Full Flow
- [ ] Open game in browser
- [ ] Create multiplayer room
- [ ] Join from second device/browser
- [ ] Verify hand data syncs

---

## 🐛 Troubleshooting

### Frontend: "Site not found"

**Issue**: DNS not propagated or incorrect CNAME

**Fix:**
```bash
# Check DNS propagation
nslookup game.yourdomain.com

# Should point to Netlify
dig game.yourdomain.com +short
```

Wait 5-30 minutes for propagation.

### Frontend: SSL Certificate Error

**Issue**: Cloudflare/Netlify SSL mismatch

**Fix:**
1. Cloudflare: Set SSL to **Full (strict)**
2. Wait for Netlify to provision certificate
3. May take up to 24 hours

### Backend: WebSocket Connection Failed

**Issue**: Cloudflare blocking WebSockets

**Fix Option 1 - Disable Proxy:**
```
Change DNS record to "DNS only" (gray cloud)
```

**Fix Option 2 - Configure Cloudflare:**
1. **Network** → Enable **WebSockets**
2. **Speed** → Disable **Rocket Loader**
3. **Speed** → Disable **Auto Minify** for JS

### Backend: 522 Error (Connection Timed Out)

**Issue**: Railway backend not responding

**Fix:**
```bash
# Check Railway logs
railway logs

# Check if service is running
railway status

# Check health endpoint directly
curl https://[your-app].railway.app/metrics
```

### Mixed Content Errors

**Issue**: HTTPS page loading HTTP resources

**Fix:**
1. Ensure `VITE_MULTIPLAYER_SERVER_URL` uses `wss://` (not `ws://`)
2. Cloudflare: Enable **Automatic HTTPS Rewrites**
3. Redeploy Netlify site

### CORS Errors

**Issue**: Backend blocking frontend requests

**Fix:**

Railway backend needs to allow your domain. Check `server/src/index.js`:

```javascript
// If using express for REST endpoints
express: (app) => {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'https://game.yourdomain.com');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });
}
```

---

## 🚀 Performance Optimization

### Cloudflare Caching

1. **Caching** → **Configuration**
2. **Caching Level**: Standard
3. **Browser Cache TTL**: 4 hours

### Page Rules (Optional)

Create rule for static assets:

```
URL: game.yourdomain.com/assets/*

Settings:
- Cache Level: Cache Everything
- Edge Cache TTL: 1 month
- Browser Cache TTL: 1 month
```

### CDN Coverage

Cloudflare automatically uses global CDN. No config needed.

---

## 📊 Monitoring

### Cloudflare Analytics

**Analytics** → **Traffic**
- Page views
- Bandwidth
- Requests by country
- Threats blocked

### Railway Metrics

```bash
# View backend metrics
curl https://api.yourdomain.com/metrics

# View logs
railway logs --tail
```

### Test Performance

```bash
# Test latency
ping api.yourdomain.com

# Test WebSocket latency
# (Use browser console on your game)
console.log(multiplayerService.getLatency());
```

---

## 🎯 Quick Setup (TL;DR)

**Cloudflare DNS:**
```
# Frontend
CNAME  game  →  [site].netlify.app  (Proxied)

# Backend
CNAME  api   →  [app].railway.app   (DNS only)
```

**Netlify:**
1. Add domain: `game.yourdomain.com`
2. Update env var: `VITE_MULTIPLAYER_SERVER_URL=wss://api.yourdomain.com`
3. Redeploy

**Railway:**
1. Add domain: `api.yourdomain.com`
2. Wait for DNS propagation

**Test:**
```bash
curl https://game.yourdomain.com
curl https://api.yourdomain.com/metrics
```

---

## 🔗 Useful Resources

- [Cloudflare DNS](https://dash.cloudflare.com)
- [Netlify Domains](https://docs.netlify.com/domains-https/custom-domains/)
- [Railway Custom Domains](https://docs.railway.app/deploy/custom-domains)
- [DNS Propagation Checker](https://www.whatsmydns.net/)

---

Need help? Check the errors in:
- **Cloudflare**: Analytics → Logs
- **Netlify**: Deploys → Deploy log
- **Railway**: Service → Logs
