-- ========================================================
-- SCHEMA FOR THEO DOI COM TRUA - CLOUDFLARE D1 (SQLITE)
-- ========================================================

-- 1. Members Table
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  note TEXT DEFAULT '',
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now', '+7 hours')),
  updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
);

-- 2. Daily Attendance Records Table
CREATE TABLE IF NOT EXISTS meal_records (
  date TEXT NOT NULL,               -- Format: YYYY-MM-DD
  member_id TEXT NOT NULL,          -- References members(id)
  count INTEGER DEFAULT 1,          -- Number of meals: 1, 2, ...
  note TEXT DEFAULT '',             -- Optional note: "Có khách", "Thêm cơm"...
  price INTEGER DEFAULT NULL,       -- Custom price for this meal if overridden
  updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
  PRIMARY KEY (date, member_id)
);

-- Index for fast monthly querying
CREATE INDEX IF NOT EXISTS idx_meal_records_date ON meal_records(date);
CREATE INDEX IF NOT EXISTS idx_meal_records_member ON meal_records(member_id);

-- 3. Payments and Debt Table
CREATE TABLE IF NOT EXISTS payments (
  year_month TEXT NOT NULL,         -- Format: YYYY-MM
  member_id TEXT NOT NULL,          -- References members(id)
  paid INTEGER DEFAULT 0,           -- Total paid amount in VNĐ
  history_json TEXT DEFAULT '[]',   -- JSON array of transactions [{amount, method, date, note}]
  updated_at TEXT DEFAULT (datetime('now', '+7 hours')),
  PRIMARY KEY (year_month, member_id)
);

-- 4. App Settings Table (Key-Value)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Initial default settings if not exists
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('mealPrice', '40000'),
  ('workdays', '[1,2,3,4,5]'),
  ('theme', 'light');
