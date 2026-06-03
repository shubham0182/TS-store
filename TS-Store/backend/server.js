import express from 'express';
import cors from 'cors';
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'db.sqlite');

const app = express();
app.use(cors());
app.use(express.json({limit:'10mb'}));
app.use(express.static(path.join(__dirname, '..'), {maxAge:0,etag:false,lastModified:false}));

let db;

function saveDb() {
  const data = db.export();
  const buf = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buf);
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  if (sql.trim().toUpperCase().startsWith('SELECT') || sql.trim().toUpperCase().startsWith('WITH') || sql.trim().toUpperCase().startsWith('PRAGMA')) {
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }
  stmt.run();
  stmt.free();
  saveDb();
  return null;
}

function getOne(sql, params = []) {
  const rows = query(sql, params);
  return rows.length ? rows[0] : null;
}

async function initDb() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS apps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    developer TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT DEFAULT '',
    description TEXT NOT NULL,
    icon TEXT DEFAULT '',
    banner TEXT DEFAULT '',
    screenshots TEXT DEFAULT '[]',
    websiteLink TEXT DEFAULT '',
    apkLink TEXT DEFAULT '',
    version TEXT DEFAULT '1.0.0',
    featured INTEGER DEFAULT 0,
    rating REAL DEFAULT 0,
    reviews TEXT DEFAULT '[]',
    installs INTEGER DEFAULT 0,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS admin (
    id TEXT PRIMARY KEY,
    password TEXT NOT NULL
  )`);

  db.run("DELETE FROM admin");
  db.run("INSERT INTO admin (id, password) VALUES (?, ?)", ['shubham', '1234']);
  saveDb();
}

function parseApp(row) {
  if (!row) return null;
  return {
    ...row,
    featured: !!row.featured,
    screenshots: (() => { try { return JSON.parse(row.screenshots || '[]'); } catch { return []; } })(),
    reviews: (() => { try { return JSON.parse(row.reviews || '[]'); } catch { return []; } })(),
    installs: Number(row.installs || 0),
    rating: Number(row.rating || 0)
  };
}

// Admin auth middleware
function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) return res.status(401).json({ error: 'Unauthorized' });
  const creds = Buffer.from(auth.slice(6), 'base64').toString();
  const [id, pw] = creds.split(':');
  const row = getOne('SELECT * FROM admin WHERE id=? AND password=?', [id, pw]);
  if (!row) return res.status(401).json({ error: 'Invalid credentials' });
  next();
}

// API Routes

app.get('/api/apps', (req, res) => {
  const rows = query('SELECT * FROM apps ORDER BY createdAt DESC');
  res.json(rows.map(parseApp));
});

app.get('/api/apps/:id', (req, res) => {
  const row = getOne('SELECT * FROM apps WHERE id=?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(parseApp(row));
});

app.post('/api/apps', adminAuth, (req, res) => {
  const { name, developer, category, subcategory, description, icon, banner, screenshots, websiteLink, apkLink, version, featured } = req.body;
  if (!name || !developer || !category || !description) return res.status(400).json({ error: 'Missing required fields' });
  const id = 'a_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  query(`INSERT INTO apps (id, name, developer, category, subcategory, description, icon, banner, screenshots, websiteLink, apkLink, version, featured, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'), datetime('now'))`,
    [id, name, developer, category, subcategory || '', description, icon || '', banner || '', JSON.stringify(screenshots || []), websiteLink || '', apkLink || '', version || '1.0.0', featured ? 1 : 0]);
  const row = getOne('SELECT * FROM apps WHERE id=?', [id]);
  res.status(201).json(parseApp(row));
});

app.put('/api/apps/:id', adminAuth, (req, res) => {
  const existing = getOne('SELECT * FROM apps WHERE id=?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { name, developer, category, subcategory, description, icon, banner, screenshots, websiteLink, apkLink, version, featured } = req.body;
  query(`UPDATE apps SET name=?, developer=?, category=?, subcategory=?, description=?, icon=?, banner=?, screenshots=?, websiteLink=?, apkLink=?, version=?, featured=?, updatedAt=datetime('now') WHERE id=?`,
    [name || existing.name, developer || existing.developer, category || existing.category, subcategory ?? existing.subcategory, description || existing.description,
     icon !== undefined ? icon : existing.icon, banner !== undefined ? banner : existing.banner,
     screenshots ? JSON.stringify(screenshots) : existing.screenshots,
     websiteLink || existing.websiteLink, apkLink || existing.apkLink, version || existing.version,
     featured !== undefined ? (featured ? 1 : 0) : existing.featured, req.params.id]);
  const row = getOne('SELECT * FROM apps WHERE id=?', [req.params.id]);
  res.json(parseApp(row));
});

app.delete('/api/apps/:id', adminAuth, (req, res) => {
  query('DELETE FROM apps WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

app.delete('/api/apps', adminAuth, (req, res) => {
  query('DELETE FROM apps');
  res.json({ success: true });
});

app.post('/api/apps/:id/install', (req, res) => {
  query('UPDATE apps SET installs = installs + 1 WHERE id=?', [req.params.id]);
  const row = getOne('SELECT * FROM apps WHERE id=?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(parseApp(row));
});

app.post('/api/apps/:id/review', (req, res) => {
  const row = getOne('SELECT * FROM apps WHERE id=?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { user, rating, comment } = req.body;
  if (!rating) return res.status(400).json({ error: 'Rating required' });
  const reviews = (() => { try { return JSON.parse(row.reviews || '[]'); } catch { return []; } })();
  reviews.push({ user: user || 'Anonymous', rating, comment: comment || '', date: new Date().toISOString() });
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  query('UPDATE apps SET reviews=?, rating=?, updatedAt=datetime(\'now\') WHERE id=?', [JSON.stringify(reviews), Math.round(avg * 10) / 10, req.params.id]);
  const updated = getOne('SELECT * FROM apps WHERE id=?', [req.params.id]);
  res.json(parseApp(updated));
});

// Admin auth endpoint
app.post('/api/admin/login', (req, res) => {
  const { id, password } = req.body;
  if (id === 'shubham' && password === '1234') return res.json({ success: true });
  try {
    const row = getOne('SELECT * FROM admin WHERE id=? AND password=?', [id, password]);
    if (row) return res.json({ success: true });
  } catch(e) {}
  res.status(401).json({ error: 'Invalid credentials' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('TS Store server running on http://localhost:' + PORT);
});

initDb().then(() => {
  console.log('Database initialized');
});
