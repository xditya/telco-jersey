import { createHash, timingSafeEqual } from 'node:crypto';
import { db, toCsv } from './_shared.js';

const digest = (s) => createHash('sha256').update(s).digest();

// Admin-only: CSV download, or JSON with ?format=json for the admin page. The browser's
// own Basic-auth prompt asks for the password (any username); it is checked against
// the ADMIN_PASSWORD env var.
export async function GET(request) {
  const expected = process.env.ADMIN_PASSWORD;
  const header = request.headers.get('authorization') ?? '';
  const given = header.startsWith('Basic ')
    ? Buffer.from(header.slice(6), 'base64').toString().split(':').slice(1).join(':')
    : '';
  if (!expected || !timingSafeEqual(digest(given), digest(expected))) {
    return new Response('Admin password required.', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Jersey export", charset="UTF-8"', 'Cache-Control': 'no-store' },
    });
  }

  const sql = await db();
  const rows = await sql`
    SELECT uid, name, size, jersey_name, jersey_number,
           to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS submitted,
           to_char(updated_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS edited
    FROM entries ORDER BY jersey_number`;
  if (new URL(request.url).searchParams.get('format') === 'json') {
    return Response.json(rows, { headers: { 'Cache-Control': 'no-store' } });
  }
  const csv = toCsv([
    ['UID', 'Name', 'Size', 'Name on jersey', 'Number', 'Submitted (IST)', 'Last edited (IST)'],
    ...rows.map((r) => [r.uid, r.name, r.size, r.jersey_name, r.jersey_number, r.submitted, r.edited]),
  ]);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="jerseys-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
