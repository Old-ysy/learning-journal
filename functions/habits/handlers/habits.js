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
const { parseBody, pickId } = require('../lib/request');
const { validateName, validateId } = require('../lib/validate');

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

// ---------- PATCH 分支：改习惯名（Day 22 主任务 ①） ----------
async function handlePatch(event) {
  // ① 定位到哪一条：缺 id 直接拒绝（没有「改全部」这种入口）
  const checkedId = validateId(pickId(event), '缺少参数 id');
  if (checkedId.error) {
    return checkedId.error;
  }
  const id = checkedId.value;

  // ② 解析请求体（PATCH 必须带 body）
  const parsed = parseBody(event);
  if (parsed.error) {
    log('patch_bad_body', {});
    return parsed.error;
  }
  const body = parsed.body;

  // ③ 校验新名字：规则与 POST 完全一致（同一份 validateName）
  const checked = validateName(body.name);
  if (checked.error) {
    return checked.error;
  }
  const name = checked.value;

  try {
    // ④ 先确认这条存在。不存在就 NOT_FOUND，不做「改了个寂寞还返回成功」
    const { data: found, error: findErr } = await repo.findById(id);

    if (findErr) {
      log('patch_find_error', { error: findErr.message || JSON.stringify(findErr) });
      return fail('INTERNAL', '数据库查询失败：' + (findErr.message || JSON.stringify(findErr)));
    }
    if (!found || found.length === 0) {
      log('patch_not_found', { id: id });
      return fail('NOT_FOUND', '习惯不存在：' + id);
    }
    const before = toApiHabit(found[0]);

    // ⑤ 重名检查（第二层同样是数据库唯一索引兜底）
    //    命中「别人」才算冲突；命中「自己」要放过 —— 否则点了保存但没改动会被误判成重名
    const { data: dup, error: dupErr } = await repo.findByName(name);

    if (dupErr) {
      log('patch_dup_check_error', { error: dupErr.message || JSON.stringify(dupErr) });
      return fail('INTERNAL', '数据库查询失败：' + (dupErr.message || JSON.stringify(dupErr)));
    }
    if (dup && dup.some(function (row) { return row.id !== id; })) {
      log('patch_conflict_precheck', { id: id, name: name });
      return fail('CONFLICT', '已有同名习惯：' + name);
    }

    // ⑥ 更新（只传 name，id 与 created_at 碰不到）
    const { error: updErr } = await repo.updateName(id, name);

    if (updErr) {
      if (repo.isDuplicateError(updErr)) {
        log('patch_conflict_db', { id: id, name: name, raw: String(updErr.code || '') });
        return fail('CONFLICT', '已有同名习惯：' + name);
      }
      log('patch_update_error', { error: updErr.message || JSON.stringify(updErr) });
      return fail('INTERNAL', '数据库更新失败：' + (updErr.message || JSON.stringify(updErr)));
    }

    // ⑦ 改完再读回一次：返回库里的真实值，而不是拿请求体拼一个「看起来改成功了」
    //    （Day 21 验收里那条原则：写成功不等于写对，读回来才算数）
    const { data: after, error: afterErr } = await repo.findById(id);

    if (afterErr || !after || after.length === 0) {
      log('patch_reread_error', { error: afterErr && (afterErr.message || JSON.stringify(afterErr)) });
      return fail('INTERNAL', '数据库更新后读取失败：' + (afterErr && (afterErr.message || JSON.stringify(afterErr))));
    }
    const afterHabit = toApiHabit(after[0]);

    log('patch_done', { id: id, from: before.name, to: afterHabit.name });

    return {
      ok: true,
      data: afterHabit,
      changed: { name: { from: before.name, to: afterHabit.name } },
    };
  } catch (err) {
    log('patch_exception', { message: err && err.message });
    return fail('INTERNAL', '云函数异常：' + (err && err.message));
  }
}

// ---------- DELETE 分支：删习惯（Day 22 主任务 ②） ----------
async function handleDelete(event) {
  // ① 确认机制·服务端入参：没有 id 就拒绝。
  //    卡死这一条，就不存在「一个请求把整表清了」的可能。
  const checkedId = validateId(pickId(event), '删除必须指定 id，不支持批量删除');
  if (checkedId.error) {
    log('delete_no_id', {});
    return checkedId.error;
  }
  const id = checkedId.value;

  try {
    // ② 确认机制·服务端执行：先读到才删。
    //    读不到就 NOT_FOUND —— 绝不做「删了但不知道删没删成」的静默失败。
    const { data: found, error: findErr } = await repo.findById(id);

    if (findErr) {
      log('delete_find_error', { error: findErr.message || JSON.stringify(findErr) });
      return fail('INTERNAL', '数据库查询失败：' + (findErr.message || JSON.stringify(findErr)));
    }
    if (!found || found.length === 0) {
      log('delete_not_found', { id: id });
      return fail('NOT_FOUND', '习惯不存在：' + id);
    }
    const snapshot = toApiHabit(found[0]);

    // ③ 删。records 靠外键 ON DELETE CASCADE 连带删掉，
    //    所以快照里要记下连带删了多少条 —— 这是删完以后唯一的留痕。
    const { error: delErr } = await repo.deleteById(id);

    if (delErr) {
      log('delete_error', { error: delErr.message || JSON.stringify(delErr) });
      return fail('INTERNAL', '数据库删除失败：' + (delErr.message || JSON.stringify(delErr)));
    }

    log('delete_done', { id: id, name: snapshot.name, deletedRecords: snapshot.records.length });

    return {
      ok: true,
      data: {
        id: id,
        name: snapshot.name,
        createdAt: snapshot.createdAt,
        deletedRecords: snapshot.records.length,
      },
    };
  } catch (err) {
    log('delete_exception', { message: err && err.message });
    return fail('INTERNAL', '云函数异常：' + (err && err.message));
  }
}

module.exports = {
  handleGet: handleGet,
  handlePost: handlePost,
  handlePatch: handlePatch,
  handleDelete: handleDelete,
};
