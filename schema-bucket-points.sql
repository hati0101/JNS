-- 버킷리스트 + 상벌 포인트 + 포상/징계 상점
-- D1 콘솔에 붙여넣어 실행

-- 버킷리스트
CREATE TABLE IF NOT EXISTS bucket (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  detail     TEXT,
  author     TEXT,                                  -- '마스터' | '슬레이브' (제안자)
  status     TEXT NOT NULL DEFAULT 'todo',          -- 'todo' | 'doing' | 'done'
  image_url  TEXT,
  done_at    TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- 포인트 원장 (상벌 기록)
CREATE TABLE IF NOT EXISTS point_ledger (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  delta      INTEGER NOT NULL,                       -- + 적립 / - 차감
  reason     TEXT,
  type       TEXT NOT NULL,                          -- 'merit' | 'demerit' | 'reward' | 'adjust'
  created_at TEXT NOT NULL
);

-- 상점 (포상/징계 카탈로그)
CREATE TABLE IF NOT EXISTS shop_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,                          -- 'reward' | 'punishment'
  name       TEXT NOT NULL,
  detail     TEXT,
  cost       INTEGER NOT NULL DEFAULT 0,             -- reward: 교환 비용 / punishment: 부과 시 차감 포인트
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- 포상 교환 신청 (슬레이브 신청 → 마스터 승인 시 차감)
CREATE TABLE IF NOT EXISTS reward_requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id      INTEGER,                              -- shop_items.id
  name         TEXT NOT NULL,                        -- 신청 시점 포상명 스냅샷
  cost         INTEGER NOT NULL,                     -- 신청 시점 비용 스냅샷
  status       TEXT NOT NULL DEFAULT 'pending',      -- 'pending' | 'approved' | 'rejected'
  requested_at TEXT NOT NULL,
  decided_at   TEXT,
  ledger_id    INTEGER
);
