import { randomBytes } from 'node:crypto';
import { db, validate, hashToken, readToken } from './_shared.js';

const json = (data, status = 200, headers = {}) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

const COLUMNS = 'uid, name, size, jersey_name, jersey_number';
const shape = (r) => r && { uid: r.uid, name: r.name, size: r.size, jerseyName: r.jersey_name, jerseyNumber: r.jersey_number };

// The caller's own entry (only via the device cookie) plus the numbers other people hold.
// Never returns anyone else's details.
export async function GET(request) {
  const token = readToken(request);
  const hash = token ? hashToken(token) : null;
  const sql = await db();
  const [mine, taken] = await Promise.all([
    hash ? sql.query(`SELECT ${COLUMNS} FROM entries WHERE token_hash = $1`, [hash]) : [],
    sql`SELECT jersey_number FROM entries WHERE token_hash IS DISTINCT FROM ${hash} ORDER BY jersey_number`,
  ]);
  return json({ entry: shape(mine[0]) ?? null, taken: taken.map((r) => r.jersey_number) });
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const { entry: e, errors } = validate(body);
  if (Object.keys(errors).length) return json({ errors }, 422);

  const sql = await db();
  const oldToken = readToken(request);
  try {
    if (oldToken) {
      // UID stays fixed once registered; everything else is editable from the same device.
      const [row] = await sql.query(
        `UPDATE entries SET name = $1, size = $2, jersey_name = $3, jersey_number = $4, updated_at = now()
         WHERE token_hash = $5 RETURNING ${COLUMNS}`,
        [e.name, e.size, e.jerseyName, e.jerseyNumber, hashToken(oldToken)],
      );
      if (row) return json({ entry: shape(row) });
      // Cookie points at an entry that no longer exists: register fresh below.
    }
    const token = randomBytes(32).toString('base64url');
    const [row] = await sql.query(
      `INSERT INTO entries (uid, name, size, jersey_name, jersey_number, token_hash)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNS}`,
      [e.uid, e.name, e.size, e.jerseyName, e.jerseyNumber, hashToken(token)],
    );
    return json({ entry: shape(row) }, 201, {
      'Set-Cookie': `jt=${token}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
    });
  } catch (err) {
    if (err?.code !== '23505') throw err;
    if (err.constraint === 'entries_pkey') {
      return json({ errors: { uid: 'This UID is already registered. It can only be edited from the device it was submitted on. Ask the organisers if something needs changing.' } }, 409);
    }
    return json({ errors: { jerseyNumber: `#${e.jerseyNumber} is taken. Pick another number.` }, takenNumber: e.jerseyNumber }, 409);
  }
}
