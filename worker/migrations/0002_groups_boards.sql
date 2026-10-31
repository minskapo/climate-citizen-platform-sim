ALTER TABLE posts ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE files ADD COLUMN post_id TEXT;
CREATE INDEX idx_files_post ON files (post_id);
ALTER TABLE groups ADD COLUMN chat_link TEXT NOT NULL DEFAULT '';
ALTER TABLE groups ADD COLUMN categories_json TEXT NOT NULL DEFAULT '["공지","자료","활동 기록","후기","자유"]';
ALTER TABLE groups ADD COLUMN closed_at TEXT;
ALTER TABLE groups ADD COLUMN transfer_to TEXT;
ALTER TABLE groups ADD COLUMN transfer_expires TEXT;
