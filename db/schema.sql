-- Day 16｜习惯打卡器 · 建表脚本（CloudBase PostgreSQL）
-- 两张表：habits（习惯定义）+ records（每日打卡记录）
-- 关联字段：records.habit_id → habits.id（外键，删习惯级联删记录）
-- 建表部分与 migration 20261002105543_create_habits_records.sql 内容一致
-- Day 18 追加唯一索引（migration 20261004062905_add_habits_name_unique.sql）

CREATE TABLE habits (
  id         VARCHAR(64) PRIMARY KEY,
  name       TEXT        NOT NULL,
  created_at DATE        NOT NULL DEFAULT CURRENT_DATE
);

COMMENT ON TABLE habits             IS '习惯定义表：一行一个习惯';
COMMENT ON COLUMN habits.id         IS '习惯 id，字符串（沿用 localStorage 时代的 h_ 前缀规则，服务端生成）';
COMMENT ON COLUMN habits.name       IS '习惯名称，如「每天 8 杯水」';
COMMENT ON COLUMN habits.created_at IS '习惯创建日期（本地时区 YYYY-MM-DD）';

CREATE TABLE records (
  habit_id VARCHAR(64) NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  done_on  DATE        NOT NULL,
  PRIMARY KEY (habit_id, done_on)
);

COMMENT ON TABLE records            IS '打卡记录表：一个习惯一天最多一行（复合主键天然去重）';
COMMENT ON COLUMN records.habit_id  IS '关联字段 → habits.id，删习惯时级联删除其全部记录';
COMMENT ON COLUMN records.done_on   IS '打卡日期（YYYY-MM-DD），与 api-contract.md 的日期 key 约定一致';

CREATE INDEX idx_records_done_on ON records (done_on);
COMMENT ON INDEX idx_records_done_on IS '按日期查记录（统计页"今天打卡总数"类查询）用';

-- ---------- Day 18 追加：习惯名唯一（防重复提交的数据库层兜底） ----------
CREATE UNIQUE INDEX idx_habits_name_unique ON habits (name);
COMMENT ON INDEX idx_habits_name_unique IS '习惯名唯一（Day 18 防重复提交：数据库层兜底约束）';
