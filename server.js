const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data', 'sessions.json');

if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readSessions() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeSessions(sessions) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(sessions, null, 2));
}

app.get('/api/sessions', (req, res) => {
  res.json(readSessions());
});

app.post('/api/sessions', (req, res) => {
  const sessions = readSessions();
  const session = { id: uuidv4(), createdAt: new Date().toISOString(), ...req.body };
  sessions.push(session);
  writeSessions(sessions);
  res.json(session);
});

app.put('/api/sessions/:id', (req, res) => {
  const sessions = readSessions();
  const idx = sessions.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  sessions[idx] = { ...sessions[idx], ...req.body };
  writeSessions(sessions);
  res.json(sessions[idx]);
});

app.delete('/api/sessions/:id', (req, res) => {
  const sessions = readSessions();
  const filtered = sessions.filter(s => s.id !== req.params.id);
  writeSessions(filtered);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\n  Poker Tracker running at http://localhost:${PORT}\n`);
});
