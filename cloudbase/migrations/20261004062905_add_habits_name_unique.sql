-- Day 18：习惯名唯一索引
-- 用途：防重复提交的数据库层兜底。
-- 函数层会先查同名（给出人话错误的 CONFLICT），但「检查 → 写入」之间有竞态窗口，
-- 两个并发请求可能同时通过检查。唯一索引让第二条 INSERT 直接失败，
-- 函数捕获 PostgreSQL 唯一冲突错误码 23505 后转成 CONFLICT 返回。
-- 前置：已确认现有数据无重名（SELECT name, COUNT(*) ... HAVING COUNT(*) > 1 返回空）。

CREATE UNIQUE INDEX idx_habits_name_unique ON habits (name);

COMMENT ON INDEX idx_habits_name_unique IS '习惯名唯一（Day 18 防重复提交：数据库层兜底约束）';
