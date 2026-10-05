// ============================================================
// lib/log.js —— 服务端日志（Day 18 余力加练）
// Day 19 重构：从 index.js 搬过来，格式一字未改。
//
// 统一前缀 [habits] + JSON，云端日志里可 grep，且带上关键上下文
// ============================================================

'use strict';

function log(step, detail) {
  console.log('[habits]', JSON.stringify({
    step: step,
    detail: detail || null,
    at: new Date().toISOString(),
  }));
}

module.exports = { log: log };
