const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Storage abstraction ────────────────────────────────────────────────────────
// Uses Postgres when DATABASE_URL is set (Railway), otherwise JSON file (local).

let db;

if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id        TEXT PRIMARY KEY,
      date      TEXT NOT NULL,
      buy_in    REAL,
      cash_out  REAL,
      hours     REAL,
      venue     TEXT,
      notes     TEXT,
      created_at TEXT
    )
  `).catch(console.error);

  const toClient = r => ({
    id: r.id, date: r.date, buyIn: r.buy_in, cashOut: r.cash_out,
    hours: r.hours, venue: r.venue, notes: r.notes, createdAt: r.created_at,
  });

  db = {
    async getAll() {
      const { rows } = await pool.query('SELECT * FROM sessions ORDER BY date ASC');
      return rows.map(toClient);
    },
    async insert(s) {
      await pool.query(
        `INSERT INTO sessions (id, date, buy_in, cash_out, hours, venue, notes, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [s.id, s.date, s.buyIn, s.cashOut, s.hours, s.venue || null, s.notes || null, s.createdAt]
      );
      return s;
    },
    async update(id, data) {
      const colMap = { buyIn: 'buy_in', cashOut: 'cash_out', hours: 'hours', venue: 'venue', notes: 'notes', date: 'date' };
      const sets = []; const vals = []; let i = 1;
      for (const [k, col] of Object.entries(colMap)) {
        if (k in data) { sets.push(`${col} = $${i++}`); vals.push(data[k]); }
      }
      vals.push(id);
      const { rows } = await pool.query(
        `UPDATE sessions SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals
      );
      return toClient(rows[0]);
    },
    async delete(id) {
      await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
    },
  };

  console.log('  Storage: PostgreSQL');
} else {
  // Local JSON file fallback
  const DATA_FILE = path.join(__dirname, 'data', 'sessions.json');
  if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

  db = {
    async getAll()        { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); },
    async insert(s)       { const all = await this.getAll(); all.push(s); fs.writeFileSync(DATA_FILE, JSON.stringify(all, null, 2)); return s; },
    async update(id, data){ const all = await this.getAll(); const i = all.findIndex(s => s.id === id); if (i === -1) throw new Error('Not found'); all[i] = { ...all[i], ...data }; fs.writeFileSync(DATA_FILE, JSON.stringify(all, null, 2)); return all[i]; },
    async delete(id)      { const all = await this.getAll(); fs.writeFileSync(DATA_FILE, JSON.stringify(all.filter(s => s.id !== id), null, 2)); },
  };

  console.log('  Storage: local JSON file');
}

// ── Routes ─────────────────────────────────────────────────────────────────────
app.get('/api/sessions', async (req, res) => {
  res.json(await db.getAll());
});

app.post('/api/sessions', async (req, res) => {
  const session = { id: uuidv4(), createdAt: new Date().toISOString(), ...req.body };
  res.json(await db.insert(session));
});

app.put('/api/sessions/:id', async (req, res) => {
  try { res.json(await db.update(req.params.id, req.body)); }
  catch { res.status(404).json({ error: 'Not found' }); }
});

app.delete('/api/sessions/:id', async (req, res) => {
  await db.delete(req.params.id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\n  Poker Tracker → http://localhost:${PORT}\n`);
});
