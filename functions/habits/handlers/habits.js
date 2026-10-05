// ============================================================
// handlers/habits.js —— GET / POST /api/habits 的业务编排层
// Day 19 重构：原本写在 index.js 里的 handleGet / handlePost 搬到这里。
//
// handler 负责三件事：读请求参数 → 调 repo 取数 → 组装成接口响应。
// 它不写 SQL（SQL 在 ../repo/habits.js），也不直接连库（连接在 ../lib/db.js）。
//
// 响应契约见 api-contract.md「GET / POST /api/habits」，字段与文案一字未改。
// ============================================================

'use strict';

const repo = require('../repo/habits');
const { fail } = require('../lib/response');
const { log } = require('../lib/log');
const { toApiHabit, todayStr, makeHabitId } = require('../lib/format');
const { parseBody } = require('../lib/request');
const { validateName } = require('../lib/validate');

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
    if (query.id) {
      // 详情模式：?id=xxx
      const { data, error } = await repo.findById(query.id);

      if (error) {
        log('get_db_error', { error: error.message || JSON.stringify(error) });
        return fail('INTERNAL', '数据库查询失败：' + (error.message || JSON.stringify(error)));
      }
      if (!data || data.length === 0) {
        log('get_not_found', { id: query.id });
        return fail('NOT_FOUND', '习惯不存在：' + query.id);
      }
      return { ok: true, data: toApiHabit(data[0]) };
    }

    // 列表模式
    const { data, error } = await repo.listHabits(limit);

    if (error) {
      log('get_db_error', { error: error.message || JSON.stringify(error) });
      return fail('INTERNAL', '数据库查询失败：' + (error.message || JSON.stringify(error)));
    }

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

  // ② 校验 name（规则集中在 ../lib/validate.js）
  const checked = validateName(body.name);
  if (checked.error) {
    return checked.error;
  }
  const name = checked.value;

  try {
    // ③ 防重复提交第一层：先查同名，命中直接给出人话错误
    //    （第二层是数据库的 idx_habits_name_unique 唯一索引，兜住并发竞态）
    const { data: dup, error: dupErr } = await repo.findByName(name);

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
    const { error: insErr } = await repo.insertHabit({
      id: id,
      name: name,
      created_at: createdAt,
    });

    if (insErr) {
      // 唯一约束冲突（并发下的第二层兜底）：即使两个请求同时挤过第 ③ 步的检查，
      // 这里也会被 idx_habits_name_unique 挡下。
      if (repo.isDuplicateError(insErr)) {
        log('post_conflict_db', { name: name, raw: String(insErr.code || '') + ' ' + String(insErr.message || '') });
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

module.exports = {
  handleGet: handleGet,
  handlePost: handlePost,
};
