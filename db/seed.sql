-- Day 16｜习惯打卡器 · 种子脚本
-- 设计目标：重复执行不报错、不产生重复数据（幂等）
-- 幂等手段：INSERT ... ON CONFLICT DO NOTHING
--   habits  撞主键 id        → 跳过
--   records 撞复合主键 (habit_id, done_on) → 跳过

INSERT INTO habits (id, name, created_at) VALUES
  ('h_seed_001', '每天 8 杯水',     DATE '2026-09-20'),
  ('h_seed_002', '跑步 30 分钟',    DATE '2026-09-21'),
  ('h_seed_003', '睡前阅读 20 分钟', DATE '2026-09-22'),
  ('h_seed_004', '23 点前睡觉',     DATE '2026-09-23'),
  ('h_seed_005', '不吃夜宵',        DATE '2026-09-24'),
  ('h_seed_006', '背 20 个单词',    DATE '2026-09-25')
ON CONFLICT (id) DO NOTHING;

-- 打卡记录：日期用 CURRENT_DATE 相对计算，保证任何时候执行数据都是"最近 7 天"
-- 覆盖三种典型形态：连续打卡、中间断一天、只打过一两次
INSERT INTO records (habit_id, done_on) VALUES
  -- h_seed_001 每天 8 杯水：连续 7 天，streak = 7
  ('h_seed_001', CURRENT_DATE),
  ('h_seed_001', CURRENT_DATE - 1),
  ('h_seed_001', CURRENT_DATE - 2),
  ('h_seed_001', CURRENT_DATE - 3),
  ('h_seed_001', CURRENT_DATE - 4),
  ('h_seed_001', CURRENT_DATE - 5),
  ('h_seed_001', CURRENT_DATE - 6),
  -- h_seed_002 跑步：断了一天（CURRENT_DATE-2 缺），streak = 2
  ('h_seed_002', CURRENT_DATE),
  ('h_seed_002', CURRENT_DATE - 1),
  ('h_seed_002', CURRENT_DATE - 3),
  -- h_seed_003 睡前阅读：断更长（前天断了），streak = 1
  ('h_seed_003', CURRENT_DATE),
  ('h_seed_003', CURRENT_DATE - 3),
  -- h_seed_004 早睡：只打过两次，且不是最近（streak = 0）
  ('h_seed_004', CURRENT_DATE - 4),
  ('h_seed_004', CURRENT_DATE - 5),
  -- h_seed_005 不吃夜宵：连续 5 天
  ('h_seed_005', CURRENT_DATE),
  ('h_seed_005', CURRENT_DATE - 1),
  ('h_seed_005', CURRENT_DATE - 2),
  ('h_seed_005', CURRENT_DATE - 3),
  ('h_seed_005', CURRENT_DATE - 4),
  -- h_seed_006 背单词：今天刚打第一次
  ('h_seed_006', CURRENT_DATE)
ON CONFLICT (habit_id, done_on) DO NOTHING;
