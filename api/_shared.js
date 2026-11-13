import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';

// The table is created on first use, once per function instance, so a fresh
// database needs no manual setup step.
let schemaReady = null;
export async function db() {
  const sql = neon(process.env.DATABASE_URL);
  schemaReady ??= sql`
    CREATE TABLE IF NOT EXISTS entries (
      uid           text PRIMARY KEY,
      name          text NOT NULL,
      size          text NOT NULL,
      jersey_name   text NOT NULL,
      jersey_number smallint NOT NULL UNIQUE CHECK (jersey_number BETWEEN 0 AND 99),
      token_hash    text NOT NULL UNIQUE,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    )`.catch((err) => {
    schemaReady = null;
    throw err;
  });
  await schemaReady;
  return sql;
}

// Must match the size guide table in public/index.html (check.js enforces this).
export const SIZES = ['22', '24', '26', '28', '30', '32/XXS', '34/XS', '36/S', '38/M', '40/L', '42/XL', '44/XXL', '46/XXXL'];

export function validate(body) {
  const b = body && typeof body === 'object' ? body : {};
  const s = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().replace(/\s+/g, ' ') : '');
  const entry = {
    uid: s(b.uid).toUpperCase(),
    name: s(b.name),
    size: s(b.size),
    jerseyName: s(b.jerseyName).toUpperCase(),
    jerseyNumber: s(b.jerseyNumber),
  };
  const errors = {};
  if (!/^[A-Z0-9][A-Z0-9._/-]{1,31}$/.test(entry.uid)) errors.uid = 'Enter your UID: letters and numbers, 2–32 characters.';
  if (entry.name.length < 2 || entry.name.length > 80) errors.name = 'Enter your full name.';
  if (!SIZES.includes(entry.size)) errors.size = 'Pick a size.';
  if (!/^[A-Z][A-Z .'-]{0,14}$/.test(entry.jerseyName)) errors.jerseyName = 'Up to 15 letters. Spaces, dots, apostrophes and hyphens are fine.';
  if (/^\d{1,2}$/.test(entry.jerseyNumber)) entry.jerseyNumber = Number(entry.jerseyNumber);
  else errors.jerseyNumber = 'Pick a number from 0 to 99.';
  return { entry, errors };
}

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export function readToken(request) {
  const m = /(?:^|;\s*)jt=([A-Za-z0-9_-]{43})(?:;|$)/.exec(request.headers.get('cookie') ?? '');
  return m ? m[1] : null;
}

export function toCsv(rows) {
  const cell = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheets from running user input as a formula
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
