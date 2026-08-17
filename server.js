require("dotenv").config();
const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const RATES_KEY = "imoth_rates_v1";
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL in .env — see .env.example");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rates (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      ts BIGINT NOT NULL
    );
  `);
}

const app = express();
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (err) {
    console.error("Health check failed", err);
    res.status(500).json({ ok: false });
  }
});

app.get("/api/rates", async (req, res) => {
  try {
    const r = await pool.query("SELECT value FROM rates WHERE key=$1", [RATES_KEY]);
    if (r.rows.length === 0) return res.status(404).json({ error: "not found" });
    res.json(r.rows[0].value);
  } catch (err) {
    console.error("Load rates failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.put("/api/rates", async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO rates (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [RATES_KEY, req.body]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Save rates failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.get("/api/quotes", async (req, res) => {
  try {
    const r = await pool.query("SELECT data FROM quotes ORDER BY ts DESC");
    res.json(r.rows.map((row) => row.data));
  } catch (err) {
    console.error("List quotes failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.put("/api/quotes/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body;
    const ts = data.ts || Date.now();
    await pool.query(
      `INSERT INTO quotes (id, data, ts) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET data = $2, ts = $3`,
      [id, data, ts]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Save quote failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.delete("/api/quotes/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM quotes WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete quote failed", err);
    res.status(500).json({ error: "db error" });
  }
});

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "imoth_motor_quotation_1.html"));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Imoth quotation app running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database", err);
    process.exit(1);
  });
