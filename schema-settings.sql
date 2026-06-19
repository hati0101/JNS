-- 앱 설정 KV (D-day 등 소소한 설정 저장)
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
