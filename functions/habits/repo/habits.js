// ============================================================
// repo/habits.js —— habits 表的全部数据库操作
// Day 19 重构：这些 SQL 原本内联在 handleGet / handlePost 里，现在集中到这里。
//
// 分层约定：
//   repo 只管「怎么取数据」，不做业务判断 —— 查不到就返回空数组，
//   由 handlers 决定「空」该翻译成 NOT_FOUND 还是别的。
//   返回 { data, error }，交给上层处理；repo 自己不吞错、不抛错。
// ============================================================

'use strict';

const db = require('../lib/db');

// 列表 + 详情共用的字段串：
// 外键嵌套查询，habits 一行 + records(habit_id → habits.id) 多行，一次拿两表
const HABIT_WITH_RECORDS = 'id, name, created_at, records(done_on)';

// PostgreSQL 唯一约束冲突的错误码
const PG_UNIQUE_VIOLATION = '23505';

// 列表：可按 limit 限制条数（1-50，范围由 handlers 校验，这里只负责执行）
function listHabits(limit) {
  let q = db.from('habits').select(HABIT_WITH_RECORDS);
  if (limit) {
    q = q.limit(limit);
  }
  return q;
}

// 详情：按 id 精确查一条
function findById(id) {
  return db.from('habits').select(HABIT_WITH_RECORDS).eq('id', id);
}

// 查同名（防重复提交第一层用）：只要 id 和 name，不拖 records
function findByName(name) {
  return db.from('habits').select('id, name').eq('name', name);
}

// 新增习惯：id 与创建日期由服务端生成后传入
function insertHabit(row) {
  return db.from('habits').insert(row);
}

// 判断错误是否为唯一约束冲突（idx_habits_name_unique）
// 错误码可能藏在 code 或 message 里，两种都认
function isDuplicateError(err) {
  if (!err) return false;
  const errText = String(err.code || '') + ' ' + String(err.message || '');
  return errText.indexOf(PG_UNIQUE_VIOLATION) !== -1 || /duplicate key/i.test(errText);
}

module.exports = {
  listHabits: listHabits,
  findById: findById,
  findByName: findByName,
  insertHabit: insertHabit,
  isDuplicateError: isDuplicateError,
};
