// ============================================================
// habits · Day 17
// GET 读接口：习惯列表（含打卡记录），数据来自 Day 16 建的 PG 真表。
// Event 函数，走网关路由 /api/habits（匿名访问）。
//
// 查询参数：
//   ?id=h_seed_001   只返回该习惯（详情）
//   ?limit=3         限制返回条数（1-50）—— Day 17 余力加练
//
// 响应契约见 api-contract.md「GET /api/habits（Day 17）」。
// ============================================================

'use strict';

const cloud = require('@cloudbase/node-sdk');

// Event 函数免密路径：SYMBOL_CURRENT_ENV 取当前环境身份（服务端，绕过 RLS）
const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.rdb();

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

function badRequest(message) {
  return { ok: false, error: { code: 'BAD_REQUEST', message: message } };
}

exports.main = async function (event) {
  // 网关触发时查询参数在 event.queryStringParameters
  const query = (event && event.queryStringParameters) || {};

  // limit 参数校验（余力加练：返回条数限制）
  let limit = null;
  if (query.limit !== undefined && query.limit !== '') {
    limit = parseInt(query.limit, 10);
    if (isNaN(limit) || limit < 1 || limit > 50) {
      return badRequest('limit 必须是 1-50 的整数');
    }
  }

  try {
    // 外键嵌套查询：habits 一行 + records(habit_id → habits.id) 多行，一次拿两表
    let q = db.from('habits').select('id, name, created_at, records(done_on)');

    if (query.id) {
      // 详情模式：?id=xxx
      q = q.eq('id', query.id);
    } else if (limit) {
      // 条数限制模式：?limit=N
      q = q.limit(limit);
    }

    const { data, error } = await q;

    if (error) {
      return { ok: false, error: { code: 'INTERNAL', message: '数据库查询失败：' + (error.message || JSON.stringify(error)) } };
    }

    // ?id= 详情：data 是单对象或 null
    if (query.id) {
      if (!data || data.length === 0) {
        return { ok: false, error: { code: 'NOT_FOUND', message: '习惯不存在：' + query.id } };
      }
      return { ok: true, data: toApiHabit(data[0]) };
    }

    // 列表模式
    const habits = (data || []).map(toApiHabit);
    return { ok: true, data: habits, total: habits.length };
  } catch (err) {
    return { ok: false, error: { code: 'INTERNAL', message: '云函数异常：' + (err && err.message) } };
  }
};
