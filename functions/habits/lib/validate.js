// ============================================================
// lib/validate.js —— 输入校验规则（纯逻辑：进什么值，出什么错）
// Day 19 重构：这套规则原本散落在 handlePost 的 ② 步里，现在独立成文件。
//
// 校验顺序与错误文案与 Day 18 完全一致，契约不许动。
// ============================================================

'use strict';

const { fail } = require('./response');
const { log } = require('./log');

// 前端约定：名称最长 20 字（与 app.js 的 MAX_NAME_LEN 对齐）
const MAX_NAME_LEN = 20;

// 校验习惯名称：必填 + 去首尾空格 + 长度（错误提示全中文）
// 返回 { value: 规范化后的名称, error: null 或 fail 对象 }
function validateName(raw) {
  if (raw === undefined || raw === null || typeof raw !== 'string') {
    log('post_name_missing', { received: typeof raw });
    return { value: null, error: fail('BAD_REQUEST', '习惯名称不能为空') };
  }

  const name = raw.trim();
  if (name === '') {
    log('post_name_blank', {});
    return { value: null, error: fail('BAD_REQUEST', '习惯名称不能为空') };
  }

  if (name.length > MAX_NAME_LEN) {
    log('post_name_too_long', { length: name.length });
    return { value: null, error: fail('BAD_REQUEST', '习惯名称最多 ' + MAX_NAME_LEN + ' 个字') };
  }

  return { value: name, error: null };
}

// 校验习惯 id（Day 22：PATCH / DELETE 都要先定位到具体一条）
// missingMessage 允许自定义 —— DELETE 缺 id 要说清「不支持批量删除」，
// 这本身就是一道确认（见 api-contract.md「删除的三道确认」）
function validateId(raw, missingMessage) {
  if (raw === undefined || raw === null || typeof raw !== 'string' || raw.trim() === '') {
    log('id_missing', { received: typeof raw });
    return { value: null, error: fail('BAD_REQUEST', missingMessage || '缺少参数 id') };
  }
  return { value: raw.trim(), error: null };
}

module.exports = {
  MAX_NAME_LEN: MAX_NAME_LEN,
  validateName: validateName,
  validateId: validateId,
};
