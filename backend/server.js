import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import App from './models/App.js';
import User from './models/User.js';
import Category from './models/Category.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ADMIN_ID = process.env.ADMIN_ID || 'shubham';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ts-store';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '_' + Math.random().toString(36).substring(2, 9) + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

const app = express();
app.use(cors());
app.use(express.json({limit:'10mb'}));
app.use(express.static(path.join(__dirname, '..'), {maxAge:0,etag:false,lastModified:false}));
app.use('/uploads', express.static(UPLOADS_DIR));

// Admin auth middleware
function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) return res.status(401).json({ error: 'Unauthorized' });
  const creds = Buffer.from(auth.slice(6), 'base64').toString();
  const [id, pw] = creds.split(':');
  if (id !== ADMIN_ID || pw !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid credentials' });
  next();
}

// API Routes

app.get('/api/apps', async (req, res) => {
  try {
    const rows = await App.find().sort({ createdAt: -1 }).lean();
    res.json(rows.map(r => ({ ...r, id: r._id })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/apps/:id', async (req, res) => {
  try {
    const row = await App.findById(req.params.id).lean();
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ ...row, id: row._id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/apps', adminAuth, async (req, res) => {
  try {
    const { name, developer, category, subcategory, description, icon, banner, screenshots, websiteLink, apkLink, version, featured } = req.body;
    if (!name || !developer || !category || !description) return res.status(400).json({ error: 'Missing required fields' });
    const id = 'a_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const doc = await App.create({
      _id: id, name, developer, category, subcategory: subcategory || '', description,
      icon: icon || '', banner: banner || '', screenshots: screenshots || [],
      websiteLink: websiteLink || '', apkLink: apkLink || '', version: version || '1.0.0',
      featured: !!featured
    });
    res.status(201).json({ ...doc.toObject(), id: doc._id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/apps/:id', adminAuth, async (req, res) => {
  try {
    const existing = await App.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { name, developer, category, subcategory, description, icon, banner, screenshots, websiteLink, apkLink, version, featured } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (developer !== undefined) update.developer = developer;
    if (category !== undefined) update.category = category;
    if (subcategory !== undefined) update.subcategory = subcategory;
    if (description !== undefined) update.description = description;
    if (icon !== undefined) update.icon = icon;
    if (banner !== undefined) update.banner = banner;
    if (screenshots !== undefined) update.screenshots = screenshots;
    if (websiteLink !== undefined) update.websiteLink = websiteLink;
    if (apkLink !== undefined) update.apkLink = apkLink;
    if (version !== undefined) update.version = version;
    if (featured !== undefined) update.featured = !!featured;
    const doc = await App.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    res.json({ ...doc, id: doc._id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/apps/:id', adminAuth, async (req, res) => {
  try {
    await App.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/apps', adminAuth, async (req, res) => {
  try {
    await App.deleteMany({});
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/apps/:id/install', async (req, res) => {
  try {
    const doc = await App.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const { user } = req.body;
    if (user) {
      const usageCount = (doc.usage && doc.usage[user]) || 0;
      if (usageCount >= 3) {
        const hasReview = doc.reviews.some(r => r.user === user);
        if (!hasReview) {
          return res.json({ blocked: true, usageCount });
        }
      }
      if (!doc.usage) doc.usage = {};
      doc.usage[user] = usageCount + 1;
    }
    doc.installs = (doc.installs || 0) + 1;
    await doc.save();
    res.json({ ...doc.toObject(), id: doc._id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/apps/:id/review', async (req, res) => {
  try {
    const doc = await App.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const { user, rating, comment } = req.body;
    if (!rating) return res.status(400).json({ error: 'Rating required' });
    if (user) {
      const usageCount = (doc.usage && doc.usage[user]) || 0;
      if (usageCount >= 3) {
        const hasReview = doc.reviews.some(r => r.user === user);
        if (!hasReview) {
          const required = Math.min(usageCount, 5);
          if (rating !== required) {
            return res.status(400).json({ error: 'Rating must be ' + required + ' stars' });
          }
        }
      }
    }
    doc.reviews.push({ user: user || 'Anonymous', rating, comment: comment || '', date: new Date() });
    const avg = doc.reviews.reduce((s, r) => s + r.rating, 0) / doc.reviews.length;
    doc.rating = Math.round(avg * 10) / 10;
    await doc.save();
    res.json({ ...doc.toObject(), id: doc._id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Category routes
app.get('/api/categories', async (req, res) => {
  try {
    const rows = await Category.find().sort({ name: 1 }).lean();
    res.json(rows.map(r => ({ ...r, id: r._id })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/categories', adminAuth, async (req, res) => {
  try {
    const { name, icon, subcategories } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name required' });
    const existing = await Category.findOne({ name });
    if (existing) return res.status(409).json({ error: 'Category already exists' });
    const doc = await Category.create({ name, icon: icon || 'folder', subcategories: subcategories || [] });
    res.status(201).json({ ...doc.toObject(), id: doc._id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/categories/:name', adminAuth, async (req, res) => {
  try {
    const existing = await Category.findOne({ name: req.params.name });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { name, icon, subcategories } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (icon !== undefined) update.icon = icon;
    if (subcategories !== undefined) update.subcategories = subcategories;
    const doc = await Category.findOneAndUpdate({ name: req.params.name }, update, { new: true }).lean();
    res.json({ ...doc, id: doc._id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/categories/:name', adminAuth, async (req, res) => {
  try {
    await Category.findOneAndDelete({ name: req.params.name });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// File upload endpoints
app.post('/api/upload', adminAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = '/uploads/' + req.file.filename;
  res.json({ url, filename: req.file.filename });
});

app.post('/api/upload/multiple', adminAuth, upload.array('files', 10), (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });
  const urls = req.files.map(f => ({ url: '/uploads/' + f.filename, filename: f.filename }));
  res.json({ files: urls });
});

// User auth endpoints
app.post('/api/users/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
    const existing = await User.findOne({ username });
    if (existing) return res.status(409).json({ error: 'Username already taken' });
    const id = 'u_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const doc = await User.create({ _id: id, username, password });
    res.status(201).json({ success: true, user: { id: doc._id, username: doc.username } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const row = await User.findOne({ username, password }).lean();
    if (!row) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ success: true, user: { id: row._id, username: row.username } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users/google', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const displayName = name || email.split('@')[0] || email;
    let user = await User.findOne({ email }).lean();
    if (!user) {
      const id = 'u_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      await User.create({ _id: id, username: 'google_' + displayName, password: 'firebase_auto', email });
      user = await User.findById(id).lean();
    }
    res.json({ success: true, user: { id: user._id, username: user.username.replace('google_', '') } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin auth endpoint
app.post('/api/admin/login', (req, res) => {
  const { id, password } = req.body;
  if (id === ADMIN_ID && password === ADMIN_PASSWORD) return res.json({ success: true });
  res.status(401).json({ error: 'Invalid credentials' });
});

// Admin analytics endpoint
app.get('/api/admin/analytics', adminAuth, async (req, res) => {
  try {
    const apps = await App.find().lean();
    const userUsage = {};
    let totalInstalls = 0;
    const appUsage = [];
    for (const a of apps) {
      totalInstalls += a.installs || 0;
      const u = a.usage || {};
      const total = Object.values(u).reduce((s, v) => s + v, 0);
      if (total > 0) appUsage.push({ id: a._id, name: a.name, icon: a.icon || '', usage: total, installs: a.installs || 0 });
      for (const [user, count] of Object.entries(u)) {
        userUsage[user] = (userUsage[user] || 0) + count;
      }
    }
    const topUsers = Object.entries(userUsage).map(([user, usage]) => ({ user, usage })).sort((a, b) => b.usage - a.usage).slice(0, 20);
    const topApps = appUsage.sort((a, b) => b.usage - a.usage).slice(0, 20);
    res.json({ totalApps: apps.length, totalInstalls, totalActiveUsers: topUsers.length, topUsers, topApps });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Seed default categories if empty
async function seedCategories() {
  const count = await Category.countDocuments();
  if (count > 0) return;
  const defaults = [
    { name: 'Games', icon: 'gamepad', subcategories: ['Action', 'Racing', 'Puzzle', 'Adventure'] },
    { name: 'AI Tools', icon: 'robot', subcategories: ['Chatbots', 'Image Generators', 'Productivity AI', 'Coding AI'] },
    { name: 'Business', icon: 'briefcase', subcategories: ['CRM', 'Finance', 'Marketing', 'Startup Tools'] },
    { name: 'Jobs', icon: 'laptop-code', subcategories: ['Internship', 'Remote Jobs', 'Freelance', 'Full Time'] },
    { name: 'Skills', icon: 'book-open', subcategories: ['Programming', 'Data Science', 'Design', 'Marketing', 'AI & ML'] },
    { name: 'Education', icon: 'graduation-cap', subcategories: ['Learning Apps', 'Courses', 'Exam Preparation'] },
    { name: 'Productivity', icon: 'tasks', subcategories: ['Notes', 'To-Do', 'Calculator', 'Utility Tools'] }
  ];
  await Category.insertMany(defaults);
  console.log('Default categories seeded');
}

const PORT = process.env.PORT || 3000;

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    await seedCategories();
    const count = await App.countDocuments();
    console.log('Database initialized (' + count + ' apps loaded)');
    app.listen(PORT, () => {
      console.log('TS Store server running on http://localhost:' + PORT);
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });
