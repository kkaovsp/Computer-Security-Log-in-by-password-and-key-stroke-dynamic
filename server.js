// server.js — Password + Keystroke Dynamics with SQLite
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// ---- SQLite setup ----
const dbPath = path.join(__dirname, 'users.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS typing_patterns (
    user_id INTEGER UNIQUE,
    mean_latencies TEXT NOT NULL,
    std_latencies TEXT NOT NULL,
    mean_dwell TEXT NOT NULL,
    std_dwell TEXT NOT NULL,
    sample_count INTEGER NOT NULL,
    threshold REAL NOT NULL DEFAULT 1.75,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
});

app.use(express.json());
app.use('/', express.static(path.join(__dirname, 'frontend')));

// ---- Helpers ----
function meanVector(vectors) {
  const n = vectors.length, len = vectors[0].length, out = new Array(len).fill(0);
  for (let v of vectors) for (let i=0;i<len;i++) out[i]+=v[i];
  for (let i=0;i<len;i++) out[i]/=n; return out;
}
function stdVector(vectors, mean) {
  const n = vectors.length, len = mean.length, out = new Array(len).fill(0);
  for (let v of vectors) for (let i=0;i<len;i++){ const d=v[i]-mean[i]; out[i]+=d*d; }
  for (let i=0;i<len;i++) out[i]=Math.sqrt(out[i]/Math.max(1,n-1)); return out;
}
function alignToMinLength(vectors) {
  const minLen = Math.min(...vectors.map(v=>v.length));
  return vectors.map(v=>v.slice(0,minLen));
}
function avgAbsZScore(sample, mean, std) {
  const len = Math.min(sample.length, mean.length, std.length);
  let total=0; for (let i=0;i<len;i++){ const z=Math.abs((sample[i]-mean[i])/(std[i]||1e-9)); total+=z; }
  return total/len;
}

app.get('/api/health', (_, res) => res.json({ ok:true }));

// Registration: { username, password, samples:{ latencies:number[][], dwell:number[][] } }
app.post('/api/register', (req, res) => {
  try {
    const { username, password, samples } = req.body||{};
    if(!username||!password||!samples||!Array.isArray(samples.latencies)||!Array.isArray(samples.dwell))
      return res.status(400).json({ ok:false, error:'Bad request' });
    if(samples.latencies.length<2||samples.dwell.length<2)
      return res.status(400).json({ ok:false, error:'Provide at least 2 samples' });

    const latAligned = alignToMinLength(samples.latencies);
    const dwellAligned = alignToMinLength(samples.dwell);
    const meanLat = meanVector(latAligned);
    const stdLat = stdVector(latAligned, meanLat);
    const meanDwell = meanVector(dwellAligned);
    const stdDwell = stdVector(dwellAligned, meanDwell);

    const password_hash = bcrypt.hashSync(password, 10);

    db.run(`INSERT INTO users (username, password_hash) VALUES (?,?)`, [username, password_hash], function(err){
      if(err){
        if(String(err.message).includes('UNIQUE')) return res.status(409).json({ ok:false, error:'Username already exists' });
        return res.status(500).json({ ok:false, error:'DB error (users)' });
      }
      const userId = this.lastID;
      db.run(`INSERT INTO typing_patterns (user_id, mean_latencies, std_latencies, mean_dwell, std_dwell, sample_count, threshold)
              VALUES (?,?,?,?,?,?,?)`,
        [userId, JSON.stringify(meanLat), JSON.stringify(stdLat), JSON.stringify(meanDwell), JSON.stringify(stdDwell), latAligned.length, 1.75],
        (e2)=>{
          if(e2) return res.status(500).json({ ok:false, error:'DB error (patterns)' });
          res.json({ ok:true, message:'Registered successfully. You can now log in.' });
        });
    });
  } catch(e){ res.status(500).json({ ok:false, error:'Server error' }); }
});

// Login: { username, password, attempt:{ latencies:number[], dwell:number[] } }
app.post('/api/login', (req, res) => {
  try {
    const { username, password, attempt } = req.body||{};
    if(!username||!password||!attempt||!Array.isArray(attempt.latencies)||!Array.isArray(attempt.dwell))
      return res.status(400).json({ ok:false, error:'Bad request' });

    db.get(`SELECT id, password_hash FROM users WHERE username = ?`, [username], (err, user)=>{
      if(err) return res.status(500).json({ ok:false, error:'DB error' });
      if(!user) return res.status(401).json({ ok:false, error:'Invalid credentials' });
      const passOk = bcrypt.compareSync(password, user.password_hash);
      if(!passOk) return res.status(401).json({ ok:false, error:'Invalid credentials' });

      db.get(`SELECT mean_latencies, std_latencies, mean_dwell, std_dwell, threshold FROM typing_patterns WHERE user_id = ?`,
        [user.id], (e2, pat)=>{
          if(e2) return res.status(500).json({ ok:false, error:'DB error' });
          if(!pat) return res.json({ ok:true, message:'Password OK (no pattern stored). Login success.' });

          const meanLat = JSON.parse(pat.mean_latencies);
          const stdLat = JSON.parse(pat.std_latencies);
          const meanDwell = JSON.parse(pat.mean_dwell);
          const stdDwell = JSON.parse(pat.std_dwell);
          const threshold = pat.threshold||1.75;

          const latAligned = (attempt.latencies||[]).slice(0, meanLat.length);
          const dwellAligned = (attempt.dwell||[]).slice(0, meanDwell.length);

          const zLat = avgAbsZScore(latAligned, meanLat, stdLat);
          const zDwell = avgAbsZScore(dwellAligned, meanDwell, stdDwell);
          const score = (zLat+zDwell)/2;
          const ok = score <= threshold;

          res.json({ ok, score: Number(score.toFixed(3)), threshold: Number(threshold),
            message: ok ? 'Login success (password + typing style matched).' : 'Typing style does not match profile.' });
        });
    });
  } catch(e){ res.status(500).json({ ok:false, error:'Server error' }); }
});

app.listen(PORT, ()=> console.log(`Server http://localhost:${PORT}`));
