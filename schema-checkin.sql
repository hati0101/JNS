-- 데일리 체크인 (하루 1건)
CREATE TABLE IF NOT EXISTS checkins (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL UNIQUE,        -- 'YYYY-MM-DD' (KST)
  mood       INTEGER,                     -- 1~5 기분
  energy     INTEGER,                     -- 1~5 컨디션/에너지
  headspace  TEXT,                        -- 헤드스페이스 (자유 입력)
  aftercare  INTEGER NOT NULL DEFAULT 0,  -- 0/1 케어 필요
  note       TEXT,                        -- 메모
  created_at TEXT NOT NULL,
  updated_at TEXT
);
