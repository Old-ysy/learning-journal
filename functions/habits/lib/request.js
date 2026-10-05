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

module.exports = { parseBody: parseBody };
