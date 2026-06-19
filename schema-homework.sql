-- 숙제 기능 스키마
-- wrangler d1 execute architect-column-db --remote --file=schema-homework.sql

-- 매일 반복되는 고정 숙제 (적용 기간: start_date ~ end_date, end_date NULL이면 계속)
CREATE TABLE IF NOT EXISTS hw_templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  start_date TEXT NOT NULL,            -- 'YYYY-MM-DD' (KST) 적용 시작일
  end_date   TEXT,                     -- 'YYYY-MM-DD' 이날까지 적용(포함), NULL=계속
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- 그날그날 추가 배정되는 일회성 숙제
CREATE TABLE IF NOT EXISTS hw_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL,            -- 'YYYY-MM-DD' (KST)
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hw_items_date ON hw_items(date);

-- 완료 체크 기록 (날짜 × 숙제 단위)
CREATE TABLE IF NOT EXISTS hw_done (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  date     TEXT NOT NULL,              -- 'YYYY-MM-DD'
  kind     TEXT NOT NULL,              -- 'template' | 'item'
  ref_id   INTEGER NOT NULL,           -- hw_templates.id 또는 hw_items.id
  done_at  TEXT NOT NULL,
  UNIQUE(date, kind, ref_id)
);
CREATE INDEX IF NOT EXISTS idx_hw_done_date ON hw_done(date);
