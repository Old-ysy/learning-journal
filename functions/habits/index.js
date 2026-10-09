// ============================================================
// habits · Day 17 GET / Day 18 POST / Day 19 分层重构
// 习惯接口，数据来自 Day 16 建的 PG 真表。
// Event 函数，走网关路由 /api/habits（匿名访问），按 HTTP 方法分流。
//
// GET  查询参数：
//   ?id=h_seed_001   只返回该习惯（详情）
//   ?limit=3         限制返回条数（1-50）—— Day 17 余力加练
// POST 请求体：
//   { "name": "每天散步 20 分钟" }   新建习惯 —— Day 18 主任务
//
// 响应契约见 api-contract.md「GET / POST /api/habits」。
//
// ---------- Day 19 分层（见 TECH_DESIGN.md 第 6 节） ----------
//   index.js           ← 本文件：只做 HTTP 方法分流
//   handlers/habits.js ← 业务编排：读参数 → 调 repo → 组装响应
//   repo/habits.js     ← 数据库操作：所有 SQL 都在这
//   lib/               ← 通用工具：db 连接 / 响应 / 日志 / 格式化 / 校验 / 请求解析
// ============================================================

'use strict';

const { handleGet, handlePost, handlePatch, handleDelete } = require('./handlers/habits');
const { log } = require('./lib/log');
const { fail } = require('./lib/response');

// 方法分流：GET / POST / PATCH / DELETE，其余明确拒绝
function dispatch(method, event) {
  if (method === 'POST') {
    return handlePost(event);
  }
  // Day 22：改走 PATCH、删走 DELETE，都复用同一条网关路由 /api/habits。
  // 网关是精确路径路由，子路径 /api/habits/:id 匹配不到函数，所以 id 走 ?id= 参数。
  if (method === 'PATCH') {
    return handlePatch(event);
  }
  if (method === 'DELETE') {
    return handleDelete(event);
  }
  if (method === 'GET') {
    return handleGet(event);
  }

  // 明确拒绝未知方法（不再默默兜底成 GET —— 免得 PUT 被当成查询）
  log('method_not_allowed', { method: method });
  return fail('BAD_REQUEST', '不支持的请求方法：' + method);
}

exports.main = async function (event) {
  // 网关触发时方法在 event.httpMethod（兼容 requestContext.httpMethod）
  const method = String(
    (event && (event.httpMethod || (event.requestContext && event.requestContext.httpMethod))) || 'GET'
  ).toUpperCase();
  const path = event && event.path;
  const startedAt = Date.now();

  // 请求进来记一条：时间 + 路径 + 方法（lib/log.js 的 at 字段就是时间）
  log('request', { method: method, path: path });

  const result = await dispatch(method, event);

  // Day 23 余力加练：请求结束再记一条，补上「结果」和耗时。
  //   只记结论（ok / 错误码 / 毫秒），不记任何响应正文 —— 日志里不该存业务数据。
  log('request_done', {
    method: method,
    path: path,
    ok: result.ok === true,
    code: (result && result.error && result.error.code) || null,
    ms: Date.now() - startedAt,
  });

  return result;
};
