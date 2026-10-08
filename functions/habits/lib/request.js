// ============================================================
// lib/request.js —— HTTP 请求侧的小工具
// Day 19 重构：parseBody 从 index.js 搬过来。
// ============================================================

'use strict';

const { fail } = require('./response');

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

// 取 id：优先 query ?id=，其次 body 里的 id（Day 22 PATCH / DELETE 用）
//
// 为什么两条路都要：网关路由是精确路径 /api/habits，子路径走不通，
// 所以 id 只能走参数。curl 调试时 ?id= 顺手，前端 fetch 时放 body 顺手，都支持。
//
// DELETE 的请求体通常为空，所以这里对 body「解析失败」是宽容的（当没有 id），
// 最终由 validateId 统一报「缺少参数 id」—— 不会因为空 body 先撞上「请求体不能为空」。
function pickId(event) {
  const query = (event && event.queryStringParameters) || {};
  const fromQuery = normalizeId(query.id);
  if (fromQuery) {
    return fromQuery;
  }

  let raw = event && (event.body !== undefined ? event.body : event.data);
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      raw = JSON.parse(raw);
    } catch (e) {
      return null; // 不是合法 JSON 就当没带 id
    }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const fromBody = normalizeId(raw.id);
    if (fromBody) {
      return fromBody;
    }
  }
  return null;
}

function normalizeId(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

module.exports = { parseBody: parseBody, pickId: pickId };
