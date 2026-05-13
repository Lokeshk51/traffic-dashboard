require('dotenv').config();
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors    = require('cors');

const app    = express();
const server = http.createServer(app);

const API_KEY = process.env.TOMTOM_API_KEY;

// ─── CORS ─────────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    'http://localhost:5173',
    process.env.FRONTEND_URL || 'https://your-app.vercel.app'
  ]
}));

const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      process.env.FRONTEND_URL || 'https://your-app.vercel.app'
    ],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// ─── Road segments per city ───────────────────────────────────────────────
const CITY_SEGMENTS = {
  blr: [
    { id:'blr-1', name:'MG Road',         type:'city',    point:'12.9756,77.6099', coords:[[12.9716,77.5946],[12.9796,77.6252]] },
    { id:'blr-2', name:'Outer Ring Road',  type:'highway', point:'12.9352,77.6245', coords:[[12.9352,77.6245],[12.9450,77.6450]] },
    { id:'blr-3', name:'NH-48',            type:'highway', point:'12.9900,77.5700', coords:[[12.9900,77.5700],[12.9980,77.5850]] },
    { id:'blr-4', name:'Hosur Road',       type:'city',    point:'12.9139,77.6411', coords:[[12.9139,77.6411],[12.9250,77.6520]] },
    { id:'blr-5', name:'Bellary Road',     type:'highway', point:'13.0200,77.5800', coords:[[13.0200,77.5800],[13.0350,77.5950]] },
    { id:'blr-6', name:'Old Airport Road', type:'city',    point:'12.9600,77.6400', coords:[[12.9600,77.6400],[12.9700,77.6600]] },
  ],
  mum: [
    { id:'mum-1', name:'Western Exp Hwy', type:'highway', point:'19.1136,72.8697', coords:[[19.1100,72.8650],[19.1300,72.8700]] },
    { id:'mum-2', name:'Eastern Exp Hwy', type:'highway', point:'19.0600,72.9200', coords:[[19.0500,72.9200],[19.0700,72.9300]] },
    { id:'mum-3', name:'Linking Road',    type:'city',    point:'19.0550,72.8300', coords:[[19.0550,72.8300],[19.0650,72.8500]] },
    { id:'mum-4', name:'SV Road',         type:'city',    point:'19.0800,72.8400', coords:[[19.0750,72.8350],[19.0900,72.8550]] },
    { id:'mum-5', name:'Marine Drive',    type:'city',    point:'18.9400,72.8230', coords:[[18.9400,72.8230],[18.9600,72.8290]] },
    { id:'mum-6', name:'LBS Marg',        type:'city',    point:'19.1000,72.9100', coords:[[19.0900,72.9000],[19.1100,72.9200]] },
  ],
  del: [
    { id:'del-1', name:'Ring Road',       type:'highway', point:'28.6315,77.2167', coords:[[28.6200,77.2000],[28.6400,77.2300]] },
    { id:'del-2', name:'Outer Ring Road', type:'highway', point:'28.5600,77.1900', coords:[[28.5500,77.1800],[28.5800,77.2100]] },
    { id:'del-3', name:'NH-44',           type:'highway', point:'28.7000,77.2300', coords:[[28.6900,77.2200],[28.7100,77.2400]] },
    { id:'del-4', name:'Mathura Road',    type:'city',    point:'28.6000,77.2600', coords:[[28.5900,77.2500],[28.6100,77.2700]] },
    { id:'del-5', name:'GT Road',         type:'city',    point:'28.6800,77.1600', coords:[[28.6700,77.1500],[28.6900,77.1700]] },
    { id:'del-6', name:'Aurobindo Marg',  type:'city',    point:'28.5500,77.2100', coords:[[28.5400,77.2000],[28.5600,77.2200]] },
  ],
  hyd: [
    { id:'hyd-1', name:'ORR',              type:'highway', point:'17.4200,78.3900', coords:[[17.4100,78.3800],[17.4300,78.4000]] },
    { id:'hyd-2', name:'NH-65',            type:'highway', point:'17.3700,78.4800', coords:[[17.3600,78.4700],[17.3800,78.4900]] },
    { id:'hyd-3', name:'Necklace Road',    type:'city',    point:'17.4150,78.4700', coords:[[17.4100,78.4600],[17.4200,78.4800]] },
    { id:'hyd-4', name:'Banjara Hills Rd', type:'city',    point:'17.4200,78.4500', coords:[[17.4150,78.4400],[17.4300,78.4600]] },
    { id:'hyd-5', name:'Jubilee Hills Rd', type:'city',    point:'17.4400,78.4100', coords:[[17.4300,78.4000],[17.4500,78.4200]] },
  ]
};

// ─── Fetch one segment from TomTom ────────────────────────────────────────
async function fetchSegment(seg) {
  try {
    const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json`
      + `?point=${seg.point}&unit=KMPH&key=${API_KEY}`;

    const res = await fetch(url);

    if (!res.ok) {
      console.warn(`TomTom ${res.status} for ${seg.name}`);
      return { ...seg, congestion: null, error: true };
    }

    const data = await res.json();
    const flow = data.flowSegmentData;

    const congestion = Math.min(
      100,
      Math.max(0, Math.round((1 - flow.currentSpeed / flow.freeFlowSpeed) * 100))
    );

    return {
      ...seg,
      congestion,
      currentSpeed:  flow.currentSpeed,
      freeFlowSpeed: flow.freeFlowSpeed,
      confidence:    flow.confidence
    };

  } catch (err) {
    console.error(`Error fetching ${seg.name}:`, err.message);
    return { ...seg, congestion: null, error: true };
  }
}

// ─── Fetch all segments for a city ───────────────────────────────────────
async function fetchCityTraffic(cityCode) {
  const segments = CITY_SEGMENTS[cityCode];
  if (!segments) return { city: cityCode, timestamp: new Date().toISOString(), segments: [] };

  const results = await Promise.all(segments.map(fetchSegment));
  return { city: cityCode, timestamp: new Date().toISOString(), segments: results };
}

// ─── REST endpoint ────────────────────────────────────────────────────────
app.get('/api/traffic', async (req, res) => {
  const city = req.query.city || 'blr';
  if (!CITY_SEGMENTS[city]) return res.status(400).json({ error: 'Unknown city code' });
  const data = await fetchCityTraffic(city);
  res.json(data);
});

// ─── Debug endpoint ───────────────────────────────────────────────────────
app.get('/debug', async (req, res) => {
  const keyLoaded = !!API_KEY;
  let tomtomOk = false;
  let tomtomResponse = null;

  try {
    const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json`
      + `?point=12.9756,77.6099&unit=KMPH&key=${API_KEY}`;
    const r = await fetch(url);
    tomtomResponse = await r.json();
    tomtomOk = r.ok;
  } catch (e) {
    tomtomResponse = { error: e.message };
  }

  res.json({ keyLoaded, tomtomOk, tomtomResponse });
});

// ─── Health check ─────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Traffic dashboard backend is running' });
});

// ─── Real-time push via Socket.io ─────────────────────────────────────────
const CITIES = Object.keys(CITY_SEGMENTS);

async function pushAllCities() {
  for (const city of CITIES) {
    console.log(`Fetching ${city}...`);
    const data = await fetchCityTraffic(city);
    io.emit('trafficUpdate', data);
    await new Promise(r => setTimeout(r, 3000));
  }
}

setInterval(pushAllCities, 2 * 60 * 1000);

// ─── On client connect ────────────────────────────────────────────────────
io.on('connection', async (socket) => {
  console.log('Client connected:', socket.id);
  const data = await fetchCityTraffic('blr');
  socket.emit('trafficUpdate', data);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ─── Error handlers ───────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err.message);
});

// ─── Start server (only once, at the very end) ────────────────────────────
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Server running on port ${PORT}`);
  console.log(`   API key loaded: ${!!API_KEY}`);
  console.log(`   Debug: http://localhost:${PORT}/debug\n`);
});