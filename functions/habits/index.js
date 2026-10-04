// ============================================================
// habits · Day 17 GET / Day 18 POST
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
// ============================================================

'use strict';

const cloud = require('@cloudbase/node-sdk');

// Event 函数免密路径：SYMBOL_CURRENT_ENV 取当前环境身份（服务端，绕过 RLS）
const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.rdb();

// 前端约定：名称最长 20 字（与 app.js 的 MAX_NAME_LEN 对齐）
const MAX_NAME_LEN = 20;
// PostgreSQL 唯一约束冲突的错误码
const PG_UNIQUE_VIOLATION = '23505';

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

// 统一的错误响应（形状见 api-contract.md「错误响应形状」）
function fail(code, message) {
  return { ok: false, error: { code: code, message: message } };
}

// 服务端日志：便于以后排查（Day 18 余力加练）
// 统一前缀 [habits] + JSON，云端日志里可 grep，且带上关键上下文
function log(step, detail) {
  console.log('[habits]', JSON.stringify({
    step: step,
    detail: detail || null,
    at: new Date().toISOString(),
  }));
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

// 解析请求体：网关可能给字符串，也可能给已解析的对象
function parseBody(event) {
  let raw = event && (event.body !== undefined ? event.body : event.data);
  if (raw === undefined || raw === null || raw === '') {
    return { body: null, error: fail('BAD_REQUEST', '请求体不能为空') };
  }
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (e) {
      return { body: null, error: fail('BAD_REQUEST', '请求体必须是合法的 JSON') };
    }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { body: null, error: fail('BAD_REQUEST', '请求体必须是 JSON 对象') };
  }
  return { body: raw, error: null };
}

// ---------- GET 分支 ----------
async function handleGet(event) {
  // 网关触发时查询参数在 event.queryStringParameters
  const query = (event && event.queryStringParameters) || {};

  // limit 参数校验（Day 17 余力加练：返回条数限制）
  let limit = null;
  if (query.limit !== undefined && query.limit !== '') {
    limit = parseInt(query.limit, 10);
    if (isNaN(limit) || limit < 1 || limit > 50) {
      return fail('BAD_REQUEST', 'limit 必须是 1-50 的整数');
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
      log('get_db_error', { error: error.message || JSON.stringify(error) });
      return fail('INTERNAL', '数据库查询失败：' + (error.message || JSON.stringify(error)));
    }

    // ?id= 详情：data 是单对象或 null
    if (query.id) {
      if (!data || data.length === 0) {
        log('get_not_found', { id: query.id });
        return fail('NOT_FOUND', '习惯不存在：' + query.id);
      }
      return { ok: true, data: toApiHabit(data[0]) };
    }

    // 列表模式
    const habits = (data || []).map(toApiHabit);
    return { ok: true, data: habits, total: habits.length };
  } catch (err) {
    log('get_exception', { message: err && err.message });
    return fail('INTERNAL', '云函数异常：' + (err && err.message));
  }
}

// ---------- POST 分支：新建习惯（Day 18） ----------
async function handlePost(event) {
  // ① 解析请求体
  const parsed = parseBody(event);
  if (parsed.error) {
    log('post_bad_body', {});
    return parsed.error;
  }
  const body = parsed.body;

  // ② 校验 name：必填 + 去首尾空格 + 长度（错误提示全中文）
  if (body.name === undefined || body.name === null || typeof body.name !== 'string') {
    log('post_name_missing', { received: typeof body.name });
    return fail('BAD_REQUEST', '习惯名称不能为空');
  }
  const name = body.name.trim();
  if (name === '') {
    log('post_name_blank', {});
    return fail('BAD_REQUEST', '习惯名称不能为空');
  }
  if (name.length > MAX_NAME_LEN) {
    log('post_name_too_long', { length: name.length });
    return fail('BAD_REQUEST', '习惯名称最多 ' + MAX_NAME_LEN + ' 个字');
  }

  try {
    // ③ 防重复提交第一层：函数层先查同名，命中直接给出人话错误
    //    （第二层是数据库的 idx_habits_name_unique 唯一索引，兜住并发竞态）
    const { data: dup, error: dupErr } = await db
      .from('habits')
      .select('id, name')
      .eq('name', name);

    if (dupErr) {
      log('post_dup_check_error', { error: dupErr.message || JSON.stringify(dupErr) });
      return fail('INTERNAL', '数据库查询失败：' + (dupErr.message || JSON.stringify(dupErr)));
    }
    if (dup && dup.length > 0) {
      log('post_conflict_precheck', { name: name, existingId: dup[0].id });
      return fail('CONFLICT', '已有同名习惯：' + name);
    }

    // ④ 写入：服务端生成 id 与创建日期（不接受客户端传 id，避免被指定）
    const id = makeHabitId();
    const createdAt = todayStr();
    const { error: insErr } = await db.from('habits').insert({
      id: id,
      name: name,
      created_at: createdAt,
    });

    if (insErr) {
      // 唯一约束冲突（并发下的第二层兜底）：即使两个请求同时挤过第 ③ 步的检查，
      // 这里也会被 idx_habits_name_unique 挡下。
      // 错误码可能藏在 code 或 message 里，两种都认。
      const errText = String((insErr && insErr.code) || '') + ' ' + String((insErr && insErr.message) || '');
      if (errText.indexOf(PG_UNIQUE_VIOLATION) !== -1 || /duplicate key/i.test(errText)) {
        log('post_conflict_db', { name: name, raw: errText });
        return fail('CONFLICT', '已有同名习惯：' + name);
      }
      log('post_insert_error', { error: insErr.message || JSON.stringify(insErr) });
      return fail('INTERNAL', '数据库写入失败：' + (insErr.message || JSON.stringify(insErr)));
    }

    log('post_created', { id: id, name: name });

    // ⑤ 返回形状与 GET 的单个习惯完全一致（同一个映射层）
    return {
      ok: true,
      data: {
        id: id,
        name: name,
        createdAt: createdAt,
        records: [],
      },
    };
  } catch (err) {
    log('post_exception', { message: err && err.message });
    return fail('INTERNAL', '云函数异常：' + (err && err.message));
  }
}

exports.main = async function (event) {
  // 网关触发时方法在 event.httpMethod（兼容 requestContext.httpMethod）
  const method = String(
    (event && (event.httpMethod || (event.requestContext && event.requestContext.httpMethod))) || 'GET'
  ).toUpperCase();

  log('request', { method: method, path: event && event.path });

  if (method === 'POST') {
    return handlePost(event);
  }
  return handleGet(event);
};
