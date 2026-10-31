CREATE TABLE users (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  nickname TEXT NOT NULL UNIQUE,
  sido TEXT NOT NULL DEFAULT '',
  sigungu TEXT NOT NULL DEFAULT '',
  consents_json TEXT NOT NULL DEFAULT '{}',
  settings_json TEXT NOT NULL DEFAULT '{}',
  sim_date TEXT
);

CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_file_id TEXT,
  sido TEXT NOT NULL DEFAULT '',
  sigungu TEXT NOT NULL DEFAULT '',
  join_policy TEXT NOT NULL DEFAULT 'open',
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  sim_date TEXT
);

CREATE TABLE group_members (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','staff','member','pending','banned')),
  sim_date TEXT,
  UNIQUE (group_id, user_id)
);

CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  group_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_by TEXT,
  expires_at TEXT,
  sim_date TEXT
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  board_type TEXT NOT NULL CHECK (board_type IN ('group','campaign')),
  board_id TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  attachments_json TEXT NOT NULL DEFAULT '[]',
  sim_date TEXT
);
CREATE INDEX idx_posts_board ON posts (board_type, board_id);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  post_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  sim_date TEXT
);
CREATE INDEX idx_comments_post ON comments (post_id);

CREATE TABLE reactions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'like',
  sim_date TEXT,
  UNIQUE (target_type, target_id, user_id, kind)
);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  sim_date TEXT
);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  data BLOB NOT NULL,
  owner_id TEXT,
  sim_date TEXT
);

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('practice','signature','offline')),
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  image_file_id TEXT,
  host_group_id TEXT,
  schedule_json TEXT NOT NULL DEFAULT '{}',
  settings_json TEXT NOT NULL DEFAULT '{}',
  publish TEXT NOT NULL DEFAULT 'draft',
  show_upcoming INTEGER NOT NULL DEFAULT 0,
  hero INTEGER NOT NULL DEFAULT 0,
  status_cache TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT,
  sim_date TEXT
);

CREATE TABLE missions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  cycle TEXT NOT NULL DEFAULT 'daily',
  fields_json TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL DEFAULT 0,
  settings_json TEXT NOT NULL DEFAULT '{}',
  sim_date TEXT
);
CREATE INDEX idx_missions_campaign ON missions (campaign_id);

CREATE TABLE mission_bundles (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  mission_ids_json TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL DEFAULT 0,
  sim_date TEXT
);

CREATE TABLE checklist_items (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  sim_date TEXT
);

CREATE TABLE campaign_files (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  sim_date TEXT
);

CREATE TABLE campaign_tools (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  slot TEXT NOT NULL DEFAULT 'none',
  sim_date TEXT
);

CREATE TABLE participations (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'applied',
  companions INTEGER NOT NULL DEFAULT 0,
  consents_json TEXT NOT NULL DEFAULT '{}',
  answers_json TEXT NOT NULL DEFAULT '{}',
  waitlist_no INTEGER,
  shared_by TEXT,
  sim_date TEXT,
  UNIQUE (campaign_id, user_id)
);

CREATE TABLE records (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  participation_id TEXT NOT NULL,
  mission_id TEXT,
  slot_date TEXT NOT NULL,
  fields_json TEXT NOT NULL DEFAULT '{}',
  sim_date TEXT
);
CREATE INDEX idx_records_participation ON records (participation_id);

CREATE TABLE attendance (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  participation_id TEXT NOT NULL,
  at TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'qr',
  sim_date TEXT
);

CREATE TABLE measurements (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  user_id TEXT,
  local_id TEXT,
  answers_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  actions_json TEXT NOT NULL DEFAULT '[]',
  social_json TEXT NOT NULL DEFAULT '{}',
  policies_json TEXT NOT NULL DEFAULT '[]',
  place TEXT NOT NULL DEFAULT '',
  campaign_id TEXT,
  kind TEXT NOT NULL DEFAULT 'plain' CHECK (kind IN ('start','end','plain')),
  sim_date TEXT NOT NULL
);

CREATE TABLE tools (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  owner_id TEXT,
  sim_date TEXT
);

CREATE TABLE tool_versions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  html TEXT NOT NULL DEFAULT '',
  manifest_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','archived')),
  sim_date TEXT
);

CREATE TABLE tool_records (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  user_id TEXT,
  campaign_id TEXT,
  data_json TEXT NOT NULL DEFAULT '{}',
  sim_date TEXT
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  dedupe_key TEXT UNIQUE,
  read INTEGER NOT NULL DEFAULT 0,
  sim_date TEXT
);
CREATE INDEX idx_notifications_user ON notifications (user_id);

CREATE TABLE collab_proposals (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  from_group_id TEXT,
  to_group_id TEXT,
  campaign_id TEXT,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  due_at TEXT,
  sim_date TEXT
);

CREATE TABLE collab_replies (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  author_id TEXT,
  body TEXT NOT NULL DEFAULT '',
  sim_date TEXT
);

CREATE TABLE deliveries (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  summary_json TEXT NOT NULL DEFAULT '{}',
  sim_date TEXT
);

CREATE TABLE delivery_answers (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  author_id TEXT,
  body TEXT NOT NULL DEFAULT '',
  sim_date TEXT
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  sim_date TEXT
);

CREATE TABLE request_counts (
  day TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0
);
