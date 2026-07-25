# 🔒 SSL Certificate Troubleshooting

## Your Current Issue

```
SSL: no alternative certificate subject name matches target hostname
```

This means Railway's SSL certificate doesn't include your custom domain yet.

---

## ✅ Solution Steps

### Step 1: Verify DNS is Correct

```bash
# Check if DNS points to Railway
dig manuver-api.orpheus.my.id +short
nslookup manuver-api.orpheus.my.id
```

**Expected output:** Should show Railway's domain or IP

### Step 2: Check Railway Domain Status

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Select your project → Server service
3. Go to **Settings** → **Networking** → **Domains**
4. Look for `manuver-api.orpheus.my.id`

**Status indicators:**
- ✅ **Green/Active**: SSL provisioned (ready)
- 🟡 **Yellow/Pending**: Waiting for DNS
- ❌ **Red/Failed**: Configuration issue

### Step 3: Wait for SSL Provisioning

Railway automatically provisions SSL via Let's Encrypt, but it takes time:

- **Minimum**: 5-10 minutes after DNS propagates
- **Maximum**: Up to 1 hour

**Check status:**
```bash
# Test if cert is ready (will fail until provisioned)
curl -v https://manuver-api.orpheus.my.id/metrics 2>&1 | grep -i certificate

# Bypass SSL verification to test backend (temporary)
curl -k https://manuver-api.orpheus.my.id/metrics
```

### Step 4: Cloudflare Configuration

Since you're using Cloudflare, you need specific settings:

#### Option A: DNS Only (Recommended for Railway)

**Cloudflare DNS Settings:**
```
Type: CNAME
Name: manuver-api
Target: [your-app].up.railway.app
Proxy status: DNS only (gray cloud ☁️)
TTL: Auto
```

**Why DNS only?**
- Railway handles SSL directly
- Faster SSL provisioning
- Better for WebSockets
- No Cloudflare SSL conflicts

#### Option B: Proxied (If you need Cloudflare features)

If you want to keep Cloudflare proxy enabled:

**Cloudflare DNS:**
```
Type: CNAME
Name: manuver-api
Target: [your-app].up.railway.app
Proxy status: Proxied (orange cloud ☁️)
TTL: Auto
```

**Required Cloudflare Settings:**

1. **SSL/TLS** → **Overview**
   - Set to: **Full (strict)**

2. **SSL/TLS** → **Edge Certificates**
   - Enable: **Always Use HTTPS**
   - Enable: **Automatic HTTPS Rewrites**
   - Minimum TLS Version: **1.2**

3. **Network**
   - Enable: **WebSockets**
   - Enable: **HTTP/2**

4. **Speed** → **Optimization**
   - Disable: **Rocket Loader** (breaks WebSockets)
   - Disable: **Auto Minify JavaScript** (can break WS)

---

## 🔍 Diagnostic Steps

### 1. Test Railway Direct URL First

```bash
# Find your Railway domain
railway domain

# Test the Railway domain directly (not custom domain)
curl https://[your-app].up.railway.app/metrics
```

**If this works:** Backend is fine, issue is with custom domain SSL
**If this fails:** Backend has issues, check Railway logs

### 2. Check Railway Logs

```bash
# View server logs
railway logs

# Or in dashboard: Service → Logs
```

Look for startup errors or crashes.

### 3. Test DNS Propagation

```bash
# Check if DNS has propagated globally
# Visit: https://www.whatsmydns.net/
# Enter: manuver-api.orpheus.my.id
```

Should show consistent results across all regions.

### 4. Check Cloudflare DNS Settings

1. Go to Cloudflare Dashboard
2. Select domain: `orpheus.my.id`
3. Go to **DNS** → **Records**
4. Find: `manuver-api`

**Current setting should be:**
```
CNAME  manuver-api  →  [railway-domain].up.railway.app
```

---

## 🚀 Immediate Workaround

While waiting for SSL, you can test the backend:

### Option 1: Use Railway's Default Domain

Update Netlify environment variable temporarily:

```
VITE_MULTIPLAYER_SERVER_URL=wss://[your-app].up.railway.app
```

This will work immediately since Railway's default domain has SSL.

### Option 2: Bypass SSL Verification (Testing Only)

**NEVER use in production**, but for testing:

```bash
# Test endpoint (insecure)
curl -k https://manuver-api.orpheus.my.id/metrics
```

---

## ⏱️ Expected Timeline

| Step | Time |
|------|------|
| DNS Propagation | 5-30 minutes |
| Railway SSL Provisioning | 5-60 minutes |
| Total | 10-90 minutes |

**Patience is key!** SSL provisioning is automatic but not instant.

---

## ✅ How to Confirm It's Fixed

Once SSL is provisioned, these should all work:

```bash
# 1. Health check
curl https://manuver-api.orpheus.my.id/metrics

# 2. SSL certificate check
openssl s_client -connect manuver-api.orpheus.my.id:443 -servername manuver-api.orpheus.my.id

# 3. WebSocket test
wscat -c wss://manuver-api.orpheus.my.id
```

---

## 🔄 After SSL is Fixed

Update Netlify environment variable:

1. Netlify dashboard → Site settings → Environment variables
2. Update:
   ```
   VITE_MULTIPLAYER_SERVER_URL=wss://manuver-api.orpheus.my.id
   ```
3. Trigger redeploy

---

## 🐛 Still Not Working?

### Check Railway Domain Status

```bash
# CLI
railway status
railway logs

# Or Railway Dashboard:
# Settings → Networking → Domains → Check status
```

### Remove and Re-add Domain

If stuck in "pending" for over 1 hour:

1. Railway: Remove custom domain
2. Wait 5 minutes
3. Re-add domain: `manuver-api.orpheus.my.id`
4. Wait for SSL provisioning

### Contact Railway Support

If issue persists after 2 hours:
- Railway Discord: https://discord.gg/railway
- Railway Help: help@railway.app

---

## 📋 Current Status Checklist

Check these in order:

- [ ] Railway service is running (`railway logs`)
- [ ] Railway default domain works (`curl https://[app].up.railway.app/metrics`)
- [ ] Custom domain added in Railway dashboard
- [ ] DNS CNAME points to Railway (`dig manuver-api.orpheus.my.id`)
- [ ] DNS propagated globally (check whatsmydns.net)
- [ ] Railway domain status shows "Active" (not "Pending")
- [ ] SSL certificate provisioned (curl works without `-k`)
- [ ] WebSocket connects (`wscat -c wss://manuver-api.orpheus.my.id`)

---

## 💡 Recommended Next Steps

1. **Right now:** Test Railway's default domain to confirm backend works
2. **Wait 15-30 min:** Let DNS propagate and SSL provision
3. **Then test:** Try curl again
4. **If still failing:** Switch to "DNS only" mode in Cloudflare
5. **Finally:** Update Netlify env vars and redeploy
