# 📊 Monitoring Guide - Railway Production Server

Monitor your Railway backend (`https://manuver-api.orpheus.my.id/metrics`) using Prometheus + Grafana.

---

## 🚀 Quick Start

### Option 1: Monitor Production from Local Machine

Run Prometheus + Grafana locally to scrape Railway metrics:

```bash
cd docker
docker compose -f docker-compose.monitoring.yml up -d
```

**Access:**
- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090

**Stop:**
```bash
docker compose -f docker-compose.monitoring.yml down
```

---

## 📈 Setting Up Grafana Dashboard

### 1. Access Grafana
Open http://localhost:3000
- Username: `admin`
- Password: `admin`

### 2. Verify Prometheus Data Source

1. Go to **Connections** → **Data Sources** (or the ⚙️ gear icon)
2. Prometheus should already be configured (auto-provisioned)
3. Click **"Test"** to verify connection

### 3. Import Pre-Built Dashboard

**Quick Method (Recommended):**

1. Click **"+"** or **"Dashboards"** in the left sidebar
2. Click **"Import"**
3. Click **"Upload JSON file"**
4. Select: `docker/grafana/dashboards/motion-platform-dashboard.json`
5. Click **"Load"**
6. Select **Prometheus** as the data source
7. Click **"Import"**

**Done!** You now have a complete dashboard with all metrics.

---

### 4. Create Custom Dashboard (Manual Method)

If you want to create your own dashboard from scratch:

1. Click **"+"** in the left sidebar → **"Create Dashboard"**
2. Click **"Add visualization"**
3. Select **Prometheus** as the data source
4. In the query editor at the bottom, enter a PromQL query (see examples below):

**Example queries:**

**Active Rooms:**
```promql
colyseus_rooms_count
```

**Connected Clients:**
```promql
colyseus_clients_count
```

**Messages Per Second:**
```promql
rate(colyseus_messages_total[1m])
```

**Room Join Rate:**
```promql
rate(colyseus_room_joins_total[1m])
```

**Room Leave Rate:**
```promql
rate(colyseus_room_leaves_total[1m])
```

#### Custom Panels

1. **"+ Add visualization"**
2. Select **Prometheus** as data source
3. Enter query (see examples above)
4. Customize:
   - Panel type: Time series, Stat, Gauge, etc.
   - Legend, colors, thresholds
5. Save dashboard

---

## 📊 Available Metrics

Your Colyseus server exposes these metrics:

### Room Metrics
```
colyseus_rooms_count - Current number of active rooms
colyseus_rooms_total - Total rooms created (counter)
```

### Client Metrics
```
colyseus_clients_count - Currently connected clients
colyseus_clients_total - Total client connections (counter)
```

### Message Metrics
```
colyseus_messages_total - Total messages processed (counter)
colyseus_message_bytes_total - Total bytes transmitted
```

### Room Lifecycle
```
colyseus_room_joins_total - Room join events
colyseus_room_leaves_total - Room leave events
colyseus_room_errors_total - Room errors
```

### System Metrics (Node.js)
```
nodejs_heap_size_total_bytes - Heap size
nodejs_heap_size_used_bytes - Used heap
nodejs_external_memory_bytes - External memory
process_cpu_user_seconds_total - CPU usage
```

---

## 🎯 Useful Queries

### Game-Specific Metrics

**Hand-Sword Active Rooms:**
```promql
colyseus_rooms_count{room="hand-sword"}
```

**Tennis Players Online:**
```promql
colyseus_clients_count{room="tennis"}
```

### Performance

**Average Message Rate (last 5 min):**
```promql
rate(colyseus_messages_total[5m])
```

**Memory Usage Percentage:**
```promql
100 * (nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes)
```

**Client Churn Rate:**
```promql
rate(colyseus_room_leaves_total[1m]) / rate(colyseus_room_joins_total[1m])
```

---

## 🔔 Setting Up Alerts (Optional)

### 1. Create Alert Rule in Grafana

1. Edit a panel
2. Go to **Alert** tab
3. Click **"Create alert rule from this panel"**

### 2. Example Alert: High Error Rate

**Condition:**
```promql
rate(colyseus_room_errors_total[5m]) > 0.1
```

**Alert when:** Error rate exceeds 0.1/sec for 5 minutes

### 3. Notification Channels

Configure in **Alerting** → **Contact points**:
- Email
- Slack
- Discord
- Webhook

---

## 🛠️ Troubleshooting

### Issue: "Prometheus can't reach Railway"

**Check Railway CORS:**
The backend should allow Prometheus to scrape (already configured in server/src/index.js)

**Test manually:**
```bash
curl https://manuver-api.orpheus.my.id/metrics
```

Should return Prometheus metrics format.

### Issue: "No data in Grafana"

**Check Prometheus targets:**
1. Open http://localhost:9090
2. Go to **Status** → **Targets**
3. Verify `motion-platform-production` shows **UP**

**If DOWN:**
- Check Railway server is running: `railway status`
- Check Railway logs: `railway logs`
- Verify metrics endpoint: `curl https://manuver-api.orpheus.my.id/metrics`

### Issue: "Grafana shows old data"

**Refresh interval:**
- Top-right corner, set refresh to **5s** or **10s**
- Use relative time range: "Last 5 minutes", "Last 1 hour"

---

## 📱 Pre-built Dashboard

Create a dashboard with these panels:

### Row 1: Overview
- **Active Games** (Stat panel): `sum(colyseus_rooms_count)`
- **Total Players** (Stat panel): `sum(colyseus_clients_count)`
- **Messages/sec** (Graph): `rate(colyseus_messages_total[1m])`

### Row 2: Game Breakdown
- **Hand-Sword Rooms** (Stat): `colyseus_rooms_count{room="hand-sword"}`
- **Tennis Rooms** (Stat): `colyseus_rooms_count{room="tennis"}`
- **Pong Rooms** (Stat): `colyseus_rooms_count{room="pong"}`

### Row 3: Performance
- **CPU Usage** (Graph): `rate(process_cpu_user_seconds_total[1m])`
- **Memory Usage** (Graph): `nodejs_heap_size_used_bytes`
- **Error Rate** (Graph): `rate(colyseus_room_errors_total[1m])`

### Row 4: Player Activity
- **Joins vs Leaves** (Graph):
  - Join rate: `rate(colyseus_room_joins_total[1m])`
  - Leave rate: `rate(colyseus_room_leaves_total[1m])`

---

## 🎨 Dashboard JSON Export

Save your dashboard:
1. Dashboard settings (gear icon)
2. **JSON Model** → Copy
3. Save to `docker/grafana/dashboards/motion-platform.json`

Import on another Grafana:
1. **"+"** → **Import**
2. Paste JSON

---

## 🌐 Production Deployment (Optional)

To run monitoring in the cloud instead of locally:

### Option 1: Grafana Cloud (Free Tier)
- https://grafana.com/products/cloud/
- Managed Prometheus + Grafana
- Free tier: 10k metrics, 50GB logs, 50GB traces

### Option 2: Self-Hosted on Railway
Deploy Prometheus + Grafana alongside your server.

---

## 📚 References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Dashboard Guide](https://grafana.com/docs/grafana/latest/dashboards/)
- [PromQL Query Examples](https://prometheus.io/docs/prometheus/latest/querying/examples/)
- [Colyseus Metrics](https://docs.colyseus.io/monitoring/)

---

## 🚀 Quick Commands

```bash
# Start monitoring
cd docker
docker compose -f docker-compose.monitoring.yml up -d

# View logs
docker logs -f prometheus-monitoring
docker logs -f grafana-monitoring

# Stop monitoring
docker compose -f docker-compose.monitoring.yml down

# Stop and remove all data
docker compose -f docker-compose.monitoring.yml down -v

# Test metrics endpoint
curl https://manuver-api.orpheus.my.id/metrics
```
