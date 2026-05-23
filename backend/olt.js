'use strict';
/**
 * olt.js — Modul koneksi SSH ke OLT Hioso
 * Mengirim perintah CLI dan mem-parse hasilnya
 */

const { Client } = require('ssh2');

const OLT_CFG = {
  host:       process.env.OLT_HOST || '192.168.1.1',
  port:       parseInt(process.env.OLT_PORT) || 22,
  username:   process.env.OLT_USER || 'admin',
  password:   process.env.OLT_PASS || 'admin',
  readyTimeout: 10000,
  keepaliveInterval: 5000,
};

const PROMPT      = process.env.OLT_PROMPT || '#';
const ENABLE_CMD  = process.env.OLT_ENABLE_CMD || '';
const ENABLE_PASS = process.env.OLT_ENABLE_PASS || '';

/**
 * Eksekusi satu atau beberapa perintah ke OLT via SSH shell
 * @param {string[]} cmds — array perintah
 * @param {number} waitMs — waktu tunggu output per perintah (ms)
 * @returns {Promise<string>} output mentah dari OLT
 */
function execOLT(cmds, waitMs = 2000) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = '';
    let timer;

    conn.on('ready', () => {
      conn.shell({ term: 'vt100', cols: 200, rows: 50 }, (err, stream) => {
        if (err) { conn.end(); return reject(err); }

        stream.on('data',  d => { output += d.toString(); });
        stream.stderr.on('data', d => { output += d.toString(); });

        stream.on('close', () => {
          clearTimeout(timer);
          conn.end();
          resolve(output);
        });

        const sendCmds = [...cmds, 'exit'];
        if (ENABLE_CMD) sendCmds.unshift(ENABLE_CMD);
        if (ENABLE_PASS) sendCmds.splice(ENABLE_CMD ? 1 : 0, 0, ENABLE_PASS);

        let idx = 0;
        const sendNext = () => {
          if (idx >= sendCmds.length) { stream.end(); return; }
          stream.write(sendCmds[idx++] + '\n');
          timer = setTimeout(sendNext, waitMs);
        };

        // Tunggu prompt login siap
        setTimeout(sendNext, 1500);
      });
    });

    conn.on('error', err => reject(err));
    conn.connect(OLT_CFG);
  });
}

// ─── PARSER ────────────────────────────────────────────────────────────────

/**
 * Parse output "show pon onu state" Hioso
 * Contoh baris: gei_1/1/1  1  HSGQ1234ABCD  auth  active  online
 */
function parseOntList(raw) {
  const onts = [];
  // Pola baris ONT Hioso: port  id  sn  auth  state  online/offline
  const re = /(gei_\d+\/\d+\/\d+)\s+(\d+)\s+([A-Z0-9]{12,16})\s+(\S+)\s+(\S+)\s+(online|offline)/gi;
  let m;
  while ((m = re.exec(raw)) !== null) {
    onts.push({
      port:   m[1],   // gei_1/1/1
      ontId:  m[2],   // 1
      sn:     m[3],   // serial number
      auth:   m[4],
      state:  m[5],
      status: m[6],   // online / offline
    });
  }
  return onts;
}

/**
 * Parse output "show pon power attenuation" Hioso
 * Ambil Rx Power (redaman) dan jarak
 */
function parseOptical(raw) {
  const result = {};

  // Rx power: "-18.50 dBm" atau "Rx Power: -18.50 dBm"
  const rxMatch = raw.match(/[Rr]x\s*[Pp]ower[^:\n]*:\s*([-\d.]+)\s*dBm/);
  if (rxMatch) result.rxPower = parseFloat(rxMatch[1]);

  // Tx power ONT
  const txMatch = raw.match(/[Tt]x\s*[Pp]ower[^:\n]*:\s*([-\d.]+)\s*dBm/);
  if (txMatch) result.txPower = parseFloat(txMatch[1]);

  // Jarak (distance / ranging)
  const distMatch = raw.match(/[Dd]istance[^:\n]*:\s*([\d.]+)\s*(km|m)/i);
  if (distMatch) {
    let d = parseFloat(distMatch[1]);
    if (distMatch[2].toLowerCase() === 'm') d = d / 1000;
    result.distanceKm = Math.round(d * 100) / 100;
  }

  // OLT Rx — dari kolom tabel
  const tblMatch = raw.match(/([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
  if (tblMatch && !result.rxPower) result.rxPower = parseFloat(tblMatch[2]);

  return result;
}

/**
 * Parse info ONT detail: model, vendor
 */
function parseOntDetail(raw) {
  const result = {};
  const vendorMatch = raw.match(/[Vv]endor[^:\n]*:\s*([^\n\r]+)/);
  if (vendorMatch) result.vendor = vendorMatch[1].trim();
  const modelMatch = raw.match(/[Mm]odel[^:\n]*:\s*([^\n\r]+)/);
  if (modelMatch) result.model = modelMatch[1].trim();
  const upMatch = raw.match(/[Uu]ptime[^:\n]*:\s*([^\n\r]+)/);
  if (upMatch) result.uptime = upMatch[1].trim();
  return result;
}

// ─── FUNGSI PUBLIK ──────────────────────────────────────────────────────────

/**
 * Ambil semua ONT dari semua PON port
 */
async function getAllOnts() {
  // Hioso: show pon onu state — tampilkan semua ONT
  const raw = await execOLT(['show pon onu state'], 4000);
  return parseOntList(raw);
}

/**
 * Ambil info lengkap satu ONT berdasarkan serial number
 * @param {string} sn — serial number ONT, contoh: HSGQ1234ABCD
 */
async function getOntBySN(sn) {
  // Cari ONT dulu untuk dapat port & ID-nya
  const allRaw = await execOLT([`show pon onu state`], 3000);
  const list = parseOntList(allRaw);
  const ont = list.find(o => o.sn.toUpperCase() === sn.toUpperCase());
  if (!ont) return { sn, status: 'not_found', error: 'ONT tidak ditemukan di OLT' };

  // Ambil data optik & detail
  const [optRaw, detRaw] = await Promise.all([
    execOLT([`show pon power attenuation ${ont.port} ${ont.ontId}`], 2500),
    execOLT([`show pon onu detail-info ${ont.port} ${ont.ontId}`], 2500),
  ]);

  const optical = parseOptical(optRaw);
  const detail  = parseOntDetail(detRaw);

  // Evaluasi kualitas sinyal
  let signalQuality = 'unknown';
  if (optical.rxPower !== undefined) {
    if (optical.rxPower >= -20)      signalQuality = 'excellent';
    else if (optical.rxPower >= -24) signalQuality = 'good';
    else if (optical.rxPower >= -27) signalQuality = 'weak';
    else                             signalQuality = 'critical';
  }

  return {
    sn,
    port:          ont.port,
    ontId:         ont.ontId,
    status:        ont.status,           // online / offline
    rxPower:       optical.rxPower,      // dBm
    txPower:       optical.txPower,      // dBm
    distanceKm:    optical.distanceKm,   // km
    signalQuality,
    vendor:        detail.vendor || 'Hioso',
    model:         detail.model,
    uptime:        detail.uptime,
    rawOptical:    optRaw,               // debug
  };
}

/**
 * Isolir ONT (disable port) — untuk pelanggan nunggak
 * @param {string} port — contoh: gei_1/1/1
 * @param {string} ontId — contoh: 1
 */
async function isolirOnt(port, ontId) {
  // Hioso CLI: masuk mode pon-onu-mng lalu shutdown
  const cmds = [
    `pon-onu-mng ${port} ${ontId}`,
    `shutdown`,
    `exit`,
  ];
  const raw = await execOLT(cmds, 2000);
  return { success: true, raw };
}

/**
 * Aktifkan kembali ONT
 */
async function aktifkanOnt(port, ontId) {
  const cmds = [
    `pon-onu-mng ${port} ${ontId}`,
    `no shutdown`,
    `exit`,
  ];
  const raw = await execOLT(cmds, 2000);
  return { success: true, raw };
}

module.exports = { getAllOnts, getOntBySN, isolirOnt, aktifkanOnt };
