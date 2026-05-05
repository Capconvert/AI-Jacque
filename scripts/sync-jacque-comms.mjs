#!/usr/bin/env node
// Walks /Users/jacque/Desktop/Jacque's Comms, extracts text from PDFs (pdftotext),
// matches each file to an AI Jacque client by filename pattern or content, and POSTs
// new/changed files to https://ai-jacque.vercel.app/api/jacque-comms.
//
// State is tracked in ~/.aijacque-comms-state.json (filename -> content_hash) so
// already-uploaded files are skipped on subsequent runs.
//
// Run manually:
//   node scripts/sync-jacque-comms.mjs
// Or schedule via launchd (see scripts/com.capconvert.aijacque-comms.plist).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const COMMS_DIR = '/Users/jacque/Desktop/Jacque\'s Comms';
const STATE_FILE = path.join(os.homedir(), '.aijacque-comms-state.json');
const API_BASE = process.env.AI_JACQUE_API_BASE || 'https://ai-jacque.vercel.app';
const API_URL = `${API_BASE}/api/jacque-comms`;
const VERBOSE = process.argv.includes('--verbose') || process.env.VERBOSE === '1';
const DRY_RUN = process.argv.includes('--dry-run');

function log(...a) {
  console.log(new Date().toISOString(), ...a);
}
function vlog(...a) {
  if (VERBOSE) log(...a);
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function extractPdfText(filepath) {
  try {
    const buf = execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', filepath, '-'], {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });
    return buf;
  } catch (err) {
    log('pdftotext failed for', filepath, err.message);
    return null;
  }
}

function parseClientFromFilename(filename) {
  // patterns: "Client Q | <Client> - <Topic>.pdf", "<Client> - <Topic>.pdf", etc.
  const stem = filename.replace(/\.[^.]+$/, '');
  const m1 = stem.match(/Client Q \|\s*([^\-]+?)\s*-/i);
  if (m1) return m1[1].trim();
  const m2 = stem.match(/^([A-Z][A-Za-z0-9 .]+?)\s*-\s*/);
  if (m2) return m2[1].trim();
  return null;
}

async function listClients() {
  const r = await fetch(`${API_BASE}/api/clients`);
  if (!r.ok) throw new Error(`/api/clients ${r.status}`);
  return r.json();
}

function matchClient(name, clients) {
  if (!name) return null;
  const norm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  let best = null;
  for (const c of clients) {
    const cn = String(c.name).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cn === norm) return c.id;
    if (norm.length >= 4 && cn.includes(norm)) {
      if (!best || cn.length < best.len) best = { id: c.id, len: cn.length };
    }
    if (cn.length >= 4 && norm.includes(cn)) {
      if (!best || cn.length < best.len) best = { id: c.id, len: cn.length };
    }
  }
  return best ? best.id : null;
}

async function uploadOne({ filename, content, client_id, file_mtime, content_hash }) {
  if (DRY_RUN) {
    log('  [dry-run] would upload', filename, 'client_id=', client_id, 'hash=', content_hash.slice(0, 8));
    return true;
  }
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename,
      content,
      client_id,
      file_mtime,
      content_hash,
    }),
  });
  if (!res.ok) {
    log('  upload failed', filename, res.status, (await res.text()).slice(0, 200));
    return false;
  }
  const data = await res.json();
  log('  uploaded', filename, '->', data.row?.id, 'client=', data.row?.client_id);
  return true;
}

async function main() {
  if (!fs.existsSync(COMMS_DIR)) {
    log('comms dir not found:', COMMS_DIR);
    process.exit(1);
  }

  const state = loadState();
  const files = fs.readdirSync(COMMS_DIR).filter((f) => !f.startsWith('.'));
  log(`found ${files.length} files in ${COMMS_DIR}`);

  const clients = await listClients();
  log(`fetched ${clients.length} AI Jacque clients`);

  let processed = 0, skipped = 0, failed = 0, unsupported = 0;

  for (const filename of files) {
    const filepath = path.join(COMMS_DIR, filename);
    const stat = fs.statSync(filepath);
    const ext = path.extname(filename).toLowerCase();

    let content = null;
    if (ext === '.pdf') {
      content = extractPdfText(filepath);
    } else if (ext === '.txt' || ext === '.md') {
      content = fs.readFileSync(filepath, 'utf8');
    } else {
      vlog('  skipping unsupported file', filename);
      unsupported++;
      continue;
    }

    if (!content || !content.trim()) {
      vlog('  empty content, skipping', filename);
      skipped++;
      continue;
    }

    const hash = sha256(content);
    if (state[filename]?.hash === hash) {
      vlog('  unchanged, skipping', filename);
      skipped++;
      continue;
    }

    const clientName = parseClientFromFilename(filename);
    const clientId = matchClient(clientName, clients);
    if (clientName && !clientId) vlog(`  parsed client "${clientName}" but no AI Jacque match`);

    const ok = await uploadOne({
      filename,
      content,
      client_id: clientId,
      file_mtime: stat.mtime.toISOString(),
      content_hash: hash,
    });
    if (ok) {
      state[filename] = { hash, mtime: stat.mtime.toISOString(), uploaded_at: new Date().toISOString(), client_id: clientId };
      processed++;
    } else {
      failed++;
    }
  }

  saveState(state);
  log(`done. processed=${processed} skipped=${skipped} unsupported=${unsupported} failed=${failed}`);
}

main().catch((err) => {
  log('fatal', err);
  process.exit(1);
});
