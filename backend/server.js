'use strict';
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const olt     = require('./olt');

const app  = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'ganti-kunci-rahasia';

// ─── MIDDLEWARE ─────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    process.env.ALLOWED_ORIGIN || 'https://sabila07.github.io',
    'http://localhost',
    'http://127.0.0.1',
  ],
}));
app.use(express.json());

// Autentikasi API Key
function authMiddleware(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.apikey;
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: 'API key tidak valid' });
  }
  next();
}

// ─── ROUTES ─────────────────────────────────────────────────────────────────

// GET / — cek status server
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Billing WiFi — OLT API',
    time: new Date().toISOString(),
  });
});

/**
 * GET /api/ont/:sn
 * Ambil info ONT berdasarkan serial number
 * Contoh: GET /api/ont/HSGQ1234ABCD
 */
app.get('/api/ont/:sn', authMiddleware, async (req, res) => {
  try {
    const { sn } = req.params;
    if (!sn || sn.length < 8) return res.status(400).json({ error: 'Serial number tidak valid' });

    console.log(`[${new Date().toISOString()}] GET ONT: ${sn}`);
    const data = await olt.getOntBySN(sn.toUpperCase());
    res.json(data);
  } catch (err) {
    console.error('Error getOntBySN:', err.message);
    res.status(500).json({ error: 'Gagal konek ke OLT', detail: err.message });
  }
});

/**
 * GET /api/onts
 * Ambil semua ONT yang terdaftar di OLT
 */
app.get('/api/onts', authMiddleware, async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] GET ALL ONTs`);
    const list = await olt.getAllOnts();
    res.json({ total: list.length, onts: list });
  } catch (err) {
    console.error('Error getAllOnts:', err.message);
    res.status(500).json({ error: 'Gagal konek ke OLT', detail: err.message });
  }
});

/**
 * POST /api/ont/:sn/isolir
 * Disable ONT (isolir pelanggan nunggak)
 * Body: { port: "gei_1/1/1", ontId: "1" }
 */
app.post('/api/ont/:sn/isolir', authMiddleware, async (req, res) => {
  try {
    const { sn } = req.params;
    const { port, ontId } = req.body;
    if (!port || !ontId) return res.status(400).json({ error: 'port dan ontId wajib diisi' });

    console.log(`[${new Date().toISOString()}] ISOLIR ONT: ${sn} (${port} ${ontId})`);
    const result = await olt.isolirOnt(port, ontId);
    res.json({ sn, action: 'isolir', ...result });
  } catch (err) {
    console.error('Error isolir:', err.message);
    res.status(500).json({ error: 'Gagal isolir ONT', detail: err.message });
  }
});

/**
 * POST /api/ont/:sn/aktifkan
 * Enable ONT kembali setelah bayar
 * Body: { port: "gei_1/1/1", ontId: "1" }
 */
app.post('/api/ont/:sn/aktifkan', authMiddleware, async (req, res) => {
  try {
    const { sn } = req.params;
    const { port, ontId } = req.body;
    if (!port || !ontId) return res.status(400).json({ error: 'port dan ontId wajib diisi' });

    console.log(`[${new Date().toISOString()}] AKTIFKAN ONT: ${sn} (${port} ${ontId})`);
    const result = await olt.aktifkanOnt(port, ontId);
    res.json({ sn, action: 'aktifkan', ...result });
  } catch (err) {
    console.error('Error aktifkan:', err.message);
    res.status(500).json({ error: 'Gagal aktifkan ONT', detail: err.message });
  }
});

// ─── START ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`====================================`);
  console.log(` Billing WiFi OLT API`);
  console.log(` Port   : ${PORT}`);
  console.log(` OLT    : ${process.env.OLT_HOST || '(belum dikonfigurasi)'}:${process.env.OLT_PORT || 22}`);
  console.log(` API Key: ${API_KEY.substring(0, 8)}...`);
  console.log(`====================================`);
});
