// ============================================================
// lib/response.js —— 统一响应形状（契约见 api-contract.md）
// Day 19 重构：从 index.js 搬过来。
//
// 对外契约：失败一律 { ok: false, error: { code, message } }
// ============================================================

'use strict';

// 统一的错误响应（形状见 api-contract.md「错误响应形状」）
function fail(code, message) {
  return { ok: false, error: { code: code, message: message } };
}

module.exports = { fail: fail };
