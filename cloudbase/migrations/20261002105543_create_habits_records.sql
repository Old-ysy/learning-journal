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
