-- 계약서: 이미지 세로 피드 (순서대로)
-- D1 콘솔에 붙여넣어 실행

CREATE TABLE IF NOT EXISTS contracts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  image_url  TEXT NOT NULL,
  caption    TEXT,                       -- (선택) 짧은 메모, 비워도 됨
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contracts_order ON contracts(sort_order);
