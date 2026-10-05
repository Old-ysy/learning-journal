// ============================================================
// lib/format.js —— 纯数据变换，不碰数据库也不碰 HTTP
// Day 19 重构：从 index.js 搬过来。
// ============================================================

'use strict';

// 数据库行 → 接口字段（snake_case → camelCase，records 多行 → 日期数组）
function toApiHabit(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    records: (row.records || [])
      .map(function (r) { return r.done_on; })
      .sort(), // 升序，streak 从尾部往前算
  };
}

// 当天日期（YYYY-MM-DD，与库里的 DATE 类型、契约的日期 key 一致）
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// 生成习惯 id：沿用 localStorage 时代的 h_ 前缀规则，
// 时间戳（36 进制）+ 随机尾巴（防同毫秒撞车）
function makeHabitId() {
  return 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

module.exports = {
  toApiHabit: toApiHabit,
  todayStr: todayStr,
  makeHabitId: makeHabitId,
};
