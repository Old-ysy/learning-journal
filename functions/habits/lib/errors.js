// ============================================================
// lib/errors.js —— 错误文案统一层（Day 23）
//
// 为什么要有这一层：
//   之前 handler 里到处写 `fail('INTERNAL', '数据库查询失败：' + err.message)`，
//   等于把 PostgreSQL 的英文原始报错直接甩给用户。真实长这样：
//
//     "数据库删除失败：update or delete on table \"habits\" violates
//      foreign key constraint \"records_habit_id_fkey\" on table \"records\""
//
//   两个毛病：
//     ① 用户看不懂 —— 他要的是「现在该怎么办」，不是数据库内部细节
//     ② 信息泄露 —— 表名、字段名、约束名全暴露到公网，等于给攻击者递地图
//
// 约定（从今天起）：
//   · 响应里的 message 一律中文人话，**不含任何原始错误内容**
//   · 原始错误只写进日志（截断 300 字符），排查去云函数日志看
//   · 已知的数据库错误尽量翻译成「下一步该怎么办」，翻译不了才用通用兜底
// ============================================================

'use strict';

const { fail } = require('./response');
const { log } = require('./log');

// ---------- 通用兜底文案（按操作类型分） ----------
// 写在「用户现在能做什么」的视角，不写「系统哪里坏了」
const HUMAN = {
  read:    '数据读取失败，请稍后重试',
  write:   '数据保存失败，请稍后重试',
  update:  '数据更新失败，请稍后重试',
  delete:  '数据删除失败，请稍后重试',
  readback:'数据已处理，但回读确认失败，请刷新后确认结果',
  unknown: '服务开小差了，请稍后重试',
};

// ---------- 已知数据库错误 → 具体人话 ----------
// 返回 null 表示「翻译不了」，交给上层用通用兜底。
// 注意：这里只做判断用，返回的字符串里绝不能带原始错误内容。
function translateDbError(err) {
  if (!err) return null;
  const text = String(err.code || '') + ' ' + String(err.message || '');

  // 权限不足 —— Day 18 就踩过（anon 没给 INSERT，报 permission denied for table habits）
  if (/permission denied/i.test(text)) {
    return '服务端缺少这项操作的权限，问题已记录，请稍后重试';
  }
  // 外键约束：删了被别的表引用的数据
  if (/23503|violates foreign key/i.test(text)) {
    return '该数据仍被其它记录引用，暂不能删除';
  }
  // 唯一约束：并发下撞车（正常路径已由 CONFLICT 覆盖，这是兜底分支）
  if (/23505|duplicate key/i.test(text)) {
    return '已存在相同的数据，请勿重复提交';
  }
  // 连不上 / 超时
  if (/ETIMEDOUT|timeout/i.test(text)) {
    return '数据库响应超时，请稍后重试';
  }
  if (/ECONNREFUSED|ENOTFOUND|ECONNRESET/i.test(text)) {
    return '数据库连接异常，请稍后重试';
  }
  // 非空约束 / 类型错误等，通常意味着服务端拼参数有 bug
  if (/23502|violates not-null/i.test(text)) {
    return '服务端数据不完整，问题已记录，请稍后重试';
  }
  if (/22P02|invalid input syntax/i.test(text)) {
    return '服务端数据格式有误，问题已记录，请稍后重试';
  }
  return null;
}

// ---------- 统一出口 ----------
// 用法：return dbFail('write', err, 'post_insert_error')
//   operation —— HUMAN 的 key，决定通用兜底文案
//   err       —— 原始错误对象
//   logTag    —— 日志里的步骤名，跟排查时对得上
function dbFail(operation, err, logTag) {
  const raw = String((err && (err.message || JSON.stringify(err))) || '').slice(0, 300);
  log(logTag || ('db_' + operation + '_error'), { raw: raw });

  const specific = translateDbError(err);
  return fail('INTERNAL', specific || HUMAN[operation] || HUMAN.unknown);
}

// 未预期异常（代码 bug 那类）：同样只给人话，原文进日志
function unexpectedFail(err, logTag) {
  const raw = String((err && err.message) || '').slice(0, 300);
  log(logTag || 'unexpected_error', { raw: raw });
  return fail('INTERNAL', HUMAN.unknown);
}

module.exports = {
  HUMAN: HUMAN,
  translateDbError: translateDbError,
  dbFail: dbFail,
  unexpectedFail: unexpectedFail,
};
