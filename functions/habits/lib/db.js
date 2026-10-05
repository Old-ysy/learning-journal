// ============================================================
// lib/db.js —— 数据库连接（整个云函数里唯一知道「数据库怎么连」的地方）
// Day 19 重构：从原 index.js 顶层搬过来，一字未改。
//
// Event 函数免密路径：SYMBOL_CURRENT_ENV 取当前环境身份（服务端，绕过 RLS）
// ============================================================

'use strict';

const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });

// 导出的就是 app.rdb() 本身，用法与 Day 17/18 完全一致：db.from('habits')...
module.exports = app.rdb();
