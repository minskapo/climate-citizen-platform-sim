CREATE TABLE campaign_subscriptions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  sim_date TEXT
);
CREATE UNIQUE INDEX idx_campaign_subscriptions_unique ON campaign_subscriptions (campaign_id, user_id);
CREATE INDEX idx_campaign_subscriptions_user ON campaign_subscriptions (user_id);
