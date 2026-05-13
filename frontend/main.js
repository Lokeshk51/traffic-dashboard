import L from 'leaflet';
import { io } from 'socket.io-client';
import Chart from 'chart.js/auto';

// ─── City configurations ───────────────────────────────────────────────────
const CITIES = {
  blr: {
    name: 'Bengaluru',
    center: [12.9716, 77.5946],
    zoom: 12,
    segments: [
      { id: 'blr-1', name: 'MG Road',         type: 'city',    coords: [[12.9716,77.5946],[12.9796,77.6252]] },
      { id: 'blr-2', name: 'Outer Ring Road',  type: 'highway', coords: [[12.9352,77.6245],[12.9450,77.6450]] },
      { id: 'blr-3', name: 'NH-48',            type: 'highway', coords: [[12.9900,77.5700],[12.9980,77.5850]] },
      { id: 'blr-4', name: 'Hosur Road',       type: 'city',    coords: [[12.9139,77.6411],[12.9250,77.6520]] },
      { id: 'blr-5', name: 'Bellary Road',     type: 'highway', coords: [[13.0200,77.5800],[13.0350,77.5950]] },
      { id: 'blr-6', name: 'Old Airport Road', type: 'city',    coords: [[12.9600,77.6400],[12.9700,77.6600]] },
    ]
  },
  mum: {
    name: 'Mumbai',
    center: [19.0760, 72.8777],
    zoom: 12,
    segments: [
      { id: 'mum-1', name: 'Western Exp Hwy',  type: 'highway', coords: [[19.1100,72.8650],[19.1300,72.8700]] },
      { id: 'mum-2', name: 'Eastern Exp Hwy',  type: 'highway', coords: [[19.0500,72.9200],[19.0700,72.9300]] },
      { id: 'mum-3', name: 'Linking Road',     type: 'city',    coords: [[19.0550,72.8300],[19.0650,72.8500]] },
      { id: 'mum-4', name: 'SV Road',          type: 'city',    coords: [[19.0750,72.8350],[19.0900,72.8550]] },
      { id: 'mum-5', name: 'Marine Drive',     type: 'city',    coords: [[18.9400,72.8230],[18.9600,72.8290]] },
      { id: 'mum-6', name: 'LBS Marg',         type: 'city',    coords: [[19.0900,72.9000],[19.1100,72.9200]] },
    ]
  },
  del: {
    name: 'Delhi',
    center: [28.6139, 77.2090],
    zoom: 11,
    segments: [
      { id: 'del-1', name: 'Ring Road',        type: 'highway', coords: [[28.6200,77.2000],[28.6400,77.2300]] },
      { id: 'del-2', name: 'Outer Ring Road',  type: 'highway', coords: [[28.5500,77.1800],[28.5800,77.2100]] },
      { id: 'del-3', name: 'NH-44',            type: 'highway', coords: [[28.6900,77.2200],[28.7100,77.2400]] },
      { id: 'del-4', name: 'Mathura Road',     type: 'city',    coords: [[28.5900,77.2500],[28.6100,77.2700]] },
      { id: 'del-5', name: 'GT Road',          type: 'city',    coords: [[28.6700,77.1500],[28.6900,77.1700]] },
      { id: 'del-6', name: 'Aurobindo Marg',   type: 'city',    coords: [[28.5400,77.2000],[28.5600,77.2200]] },
    ]
  },
  hyd: {
    name: 'Hyderabad',
    center: [17.3850, 78.4867],
    zoom: 12,
    segments: [
      { id: 'hyd-1', name: 'ORR',              type: 'highway', coords: [[17.4100,78.3800],[17.4300,78.4000]] },
      { id: 'hyd-2', name: 'NH-65',            type: 'highway', coords: [[17.3600,78.4700],[17.3800,78.4900]] },
      { id: 'hyd-3', name: 'Necklace Road',    type: 'city',    coords: [[17.4100,78.4600],[17.4200,78.4800]] },
      { id: 'hyd-4', name: 'Banjara Hills Rd', type: 'city',    coords: [[17.4150,78.4400],[17.4300,78.4600]] },
      { id: 'hyd-5', name: 'Jubilee Hills Rd', type: 'city',    coords: [[17.4300,78.4000],[17.4500,78.4200]] },
    ]
  }
};

// ─── App state ────────────────────────────────────────────────────────────
let currentCity  = 'blr';
let filterType   = 'all';
let paused       = false;
let alertThreshold = 75;
let updateInterval = null;
const roadLayers = {};
const trendHistory = [];

// ─── Map setup ────────────────────────────────────────────────────────────
const map = L.map('map').setView(CITIES.blr.center, CITIES.blr.zoom);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
  maxZoom: 18
}).addTo(map);

// ─── Chart setup ──────────────────────────────────────────────────────────
const trendChart = new Chart(document.getElementById('trendChart'), {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: 'Avg congestion %',
      data: [],
      borderColor: '#f97316',
      backgroundColor: 'rgba(249,115,22,0.08)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointBackgroundColor: '#f97316'
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    scales: {
      y: {
        min: 0,
        max: 100,
        ticks: { color: '#94a3b8', callback: v => v + '%' },
        grid: { color: 'rgba(148,163,184,0.1)' }
      },
      x: {
        ticks: { color: '#94a3b8', maxTicksLimit: 8 },
        grid: { display: false }
      }
    },
    plugins: {
      legend: { labels: { color: '#94a3b8', font: { size: 12 } } },
      tooltip: {
        callbacks: { label: ctx => ` ${ctx.parsed.y}% avg congestion` }
      }
    }
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────
function getCongestionColor(score) {
  if (score < 25) return '#22c55e';
  if (score < 50) return '#eab308';
  if (score < 75) return '#f97316';
  return '#ef4444';
}

function getCongestionLabel(score) {
  if (score < 25) return 'Free flowing';
  if (score < 50) return 'Moderate';
  if (score < 75) return 'Heavy';
  return 'Critical';
}

function buildPopupHTML(seg) {
  const color = getCongestionColor(seg.congestion);
  const label = getCongestionLabel(seg.congestion);
  const speed = seg.currentSpeed   ? `${seg.currentSpeed} km/h`  : 'N/A';
  const free  = seg.freeFlowSpeed  ? `${seg.freeFlowSpeed} km/h` : 'N/A';
  const conf  = seg.confidence     ? `${Math.round(seg.confidence * 100)}%` : 'N/A';

  return `
    <div style="min-width:180px;font-family:sans-serif">
      <p style="font-size:15px;font-weight:600;margin:0 0 2px">${seg.name}</p>
      <p style="font-size:11px;color:#94a3b8;margin:0 0 10px;text-transform:uppercase;letter-spacing:.05em">
        ${seg.type === 'highway' ? 'Highway' : 'City road'}
      </p>
      <p style="font-size:28px;font-weight:700;margin:0;color:${color}">${seg.congestion}%</p>
      <p style="font-size:12px;font-weight:500;color:${color};margin:0 0 10px">${label}</p>
      <table style="width:100%;font-size:12px;border-collapse:collapse">
        <tr>
          <td style="color:#94a3b8;padding:3px 0">Current speed</td>
          <td style="text-align:right;font-weight:500">${speed}</td>
        </tr>
        <tr>
          <td style="color:#94a3b8;padding:3px 0">Free flow speed</td>
          <td style="text-align:right;font-weight:500">${free}</td>
        </tr>
        <tr>
          <td style="color:#94a3b8;padding:3px 0">Data confidence</td>
          <td style="text-align:right;font-weight:500">${conf}</td>
        </tr>
      </table>
    </div>`;
}

// ─── Map rendering ────────────────────────────────────────────────────────
function drawRoad(seg) {
  // Remove old layer if it exists
  if (roadLayers[seg.id]) {
    map.removeLayer(roadLayers[seg.id]);
    delete roadLayers[seg.id];
  }

  // Skip if filtered out
  if (filterType !== 'all' && seg.type !== filterType) return;

  // Handle missing data
  if (seg.error || seg.congestion === null) {
    roadLayers[seg.id] = L.polyline(seg.coords, {
      color: '#475569',
      weight: 5,
      opacity: 0.5,
      dashArray: '8 6',
      roadType: seg.type
    }).addTo(map).bindPopup(`<b>${seg.name}</b><br><span style="color:#94a3b8">No data available</span>`, { maxWidth: 220 });
    return;
  }

  const color = getCongestionColor(seg.congestion);

  // Outer glow for critical roads
  if (seg.congestion >= 75) {
    L.polyline(seg.coords, {
      color,
      weight: 12,
      opacity: 0.15,
      roadType: seg.type
    }).addTo(map);
  }

  roadLayers[seg.id] = L.polyline(seg.coords, {
    color,
    weight: 6,
    opacity: 0.85,
    lineCap: 'round',
    lineJoin: 'round',
    roadType: seg.type
  })
    .addTo(map)
    .bindPopup(buildPopupHTML(seg), { maxWidth: 240 })
    .on('mouseover', function () { this.setStyle({ weight: 9, opacity: 1 }); })
    .on('mouseout',  function () { this.setStyle({ weight: 6, opacity: 0.85 }); });
}

// ─── Sidebar: segment list ────────────────────────────────────────────────
function updateSegmentList(segments) {
  const list = document.getElementById('segments');
  list.innerHTML = '';

  const filtered = filterType === 'all'
    ? segments
    : segments.filter(s => s.type === filterType);

  filtered.forEach(seg => {
    if (seg.congestion === null) return;
    const color = getCongestionColor(seg.congestion);
    const card = document.createElement('div');
    card.className = 'segment-card';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span class="segment-name">${seg.name}</span>
        <span style="font-size:11px;font-weight:600;color:${color}">${seg.congestion}%</span>
      </div>
      <div style="height:5px;background:#1e3a5f;border-radius:3px;overflow:hidden">
        <div style="width:${seg.congestion}%;height:100%;background:${color};border-radius:3px;transition:width 0.5s,background 0.5s"></div>
      </div>
      <div class="congestion-label">${getCongestionLabel(seg.congestion)}</div>`;
    card.onclick = () => {
      map.flyTo(seg.coords[0], 14, { duration: 1 });
      roadLayers[seg.id]?.openPopup();
    };
    list.appendChild(card);
  });
}

// ─── Sidebar: metric cards ─────────────────────────────────────────────────
function updateMetrics(segments) {
  const valid = segments.filter(s => s.congestion !== null);
  if (!valid.length) return;

  const avg  = Math.round(valid.reduce((a, b) => a + b.congestion, 0) / valid.length);
  const crit = valid.filter(s => s.congestion >= 75).length;
  const free = valid.filter(s => s.congestion < 25).length;

  document.getElementById('metric-avg').textContent  = avg + '%';
  document.getElementById('metric-crit').textContent = crit;
  document.getElementById('metric-free').textContent = free;
  document.getElementById('metric-time').textContent =
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Color code the avg metric
  document.getElementById('metric-avg').style.color = getCongestionColor(avg);
}

// ─── Sidebar: alerts ──────────────────────────────────────────────────────
function updateAlerts(segments) {
  const box = document.getElementById('alertsList');
  box.innerHTML = '';

  const triggered = segments.filter(s => s.congestion !== null && s.congestion >= alertThreshold);

  if (!triggered.length) {
    box.innerHTML = `<p style="font-size:12px;color:#64748b;padding:4px 0">All roads below ${alertThreshold}% — no alerts</p>`;
    return;
  }

  triggered.sort((a, b) => b.congestion - a.congestion).forEach(seg => {
    const isCrit = seg.congestion >= 80;
    const item = document.createElement('div');
    item.className = `alert-item ${isCrit ? 'critical' : 'warn'}`;
    item.innerHTML = `
      <span style="font-size:14px">${isCrit ? '▲' : '!'}</span>
      <div>
        <strong>${seg.name}</strong><br>
        <span>${seg.congestion}% — ${getCongestionLabel(seg.congestion)}</span>
      </div>`;
    item.onclick = () => {
      map.flyTo(seg.coords[0], 14, { duration: 1 });
      roadLayers[seg.id]?.openPopup();
    };
    box.appendChild(item);
  });
}

// ─── Trend chart ──────────────────────────────────────────────────────────
function updateTrendChart(segments) {
  const valid = segments.filter(s => s.congestion !== null);
  if (!valid.length) return;

  const avg = Math.round(valid.reduce((a, b) => a + b.congestion, 0) / valid.length);
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  trendHistory.push({ avg, time });
  if (trendHistory.length > 20) trendHistory.shift();

  trendChart.data.labels = trendHistory.map(p => p.time);
  trendChart.data.datasets[0].data = trendHistory.map(p => p.avg);
  trendChart.update();
}

// ─── Status indicator ─────────────────────────────────────────────────────
function setStatus(text, type = 'info') {
  const el = document.getElementById('status');
  el.textContent = text;
  el.className = `status-${type}`;
}

// ─── Main update function ─────────────────────────────────────────────────
function applyUpdate(data) {
  if (!data?.segments) return;

  // Merge city coords into segments from server
  const cityDef = CITIES[currentCity];
  const enriched = data.segments.map(seg => {
    const def = cityDef.segments.find(s => s.id === seg.id);
    return def ? { ...def, ...seg } : seg;
  });

  enriched.forEach(drawRoad);
  updateSegmentList(enriched);
  updateMetrics(enriched);
  updateAlerts(enriched);
  updateTrendChart(enriched);
  setStatus(`Last updated: ${new Date(data.timestamp).toLocaleTimeString()}`, 'ok');
}

// ─── City switching ────────────────────────────────────────────────────────
function changeCity(cityCode) {
  currentCity = cityCode;

  // Clear all existing road layers
  Object.values(roadLayers).forEach(layer => map.removeLayer(layer));
  Object.keys(roadLayers).forEach(k => delete roadLayers[k]);

  // Fly to new city
  const city = CITIES[cityCode];
  map.flyTo(city.center, city.zoom, { duration: 1.5 });

  document.getElementById('city-title').textContent = city.name;
  setStatus('Loading...', 'loading');

  // Fetch fresh data for new city
  fetch(`${import.meta.env.VITE_BACKEND_URL}/api/traffic`)
    .then(r => r.json())
    .then(applyUpdate)
    .catch(() => setStatus('Failed to load city data', 'error'));
}

// ─── Road type filter ─────────────────────────────────────────────────────
function filterRoads(type) {
  filterType = type;

  // Re-draw based on current filter
  const cityDef = CITIES[currentCity];
  cityDef.segments.forEach(seg => {
    if (type !== 'all' && seg.type !== type) {
      if (roadLayers[seg.id]) map.removeLayer(roadLayers[seg.id]);
    }
    // Existing layers that match filter are already drawn — just toggle visibility
  });

  // Re-fetch to redraw properly
  fetch(`${import.meta.env.VITE_BACKEND_URL}/api/traffic`)
    .then(r => r.json())
    .then(applyUpdate);
}

// ─── Pause / Resume ───────────────────────────────────────────────────────
function togglePause() {
  paused = !paused;
  const btn = document.getElementById('pauseBtn');
  const badge = document.getElementById('liveBadge');

  if (paused) {
    btn.textContent = 'Resume';
    badge.textContent = '⏸ paused';
    badge.className = 'badge paused';
  } else {
    btn.textContent = 'Pause';
    badge.textContent = '● live';
    badge.className = 'badge live';
    applyInitialFetch();  // immediate refresh on resume
  }
}

// ─── Alert threshold ──────────────────────────────────────────────────────
function updateThreshold(value) {
  alertThreshold = parseInt(value);
  document.getElementById('threshVal').textContent = value;
  // Re-run alerts with current data (last fetched)
  const cityDef = CITIES[currentCity];
  // Re-fetch to re-evaluate
  fetch(`${import.meta.env.VITE_BACKEND_URL}/api/traffic`)
    .then(r => r.json())
    .then(data => updateAlerts(data.segments));
}

// ─── Socket.io real-time connection ───────────────────────────────────────
const socket = io(import.meta.env.VITE_BACKEND_URL);

socket.on('connect', () => {
  setStatus('Connected — waiting for data...', 'ok');
  document.getElementById('liveBadge').textContent = '● live';
  document.getElementById('liveBadge').className = 'badge live';
});

socket.on('disconnect', () => {
  setStatus('Disconnected — retrying...', 'error');
  document.getElementById('liveBadge').textContent = '✕ offline';
  document.getElementById('liveBadge').className = 'badge offline';
});

socket.on('connect_error', (err) => {
  setStatus(`Connection error: ${err.message}`, 'error');
});

socket.on('trafficUpdate', (data) => {
  if (!paused && data.city === currentCity) {
    applyUpdate(data);
  }
});

// ─── Initial data fetch ───────────────────────────────────────────────────
function applyInitialFetch() {
  fetch(`${import.meta.env.VITE_BACKEND_URL}/api/traffic`)
    .then(r => r.json())
    .then(applyUpdate)
    .catch(err => setStatus('Could not reach backend — is server.js running?', 'error'));
}

applyInitialFetch();

// ─── Expose functions to HTML ─────────────────────────────────────────────
window.changeCity      = changeCity;
window.filterRoads     = filterRoads;
window.togglePause     = togglePause;
window.updateThreshold = updateThreshold;