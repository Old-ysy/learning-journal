/**
 * health 云函数 · Day 15
 * 用途：/api/health 健康检查——验证云函数链路（部署、公网访问、JSON 返回）是否通。
 * 今天不接数据库、不做业务逻辑（Day 16-20 再做）。
 */

'use strict';

exports.main = async function (event) {
  return {
    ok: true,
    service: 'habit-tracker',
    api: 'health',
    timestamp: new Date().toISOString(),
    // 回显请求方式，方便截图时确认 GET/POST 都能通
    method: (event && event.httpMethod) || 'GET',
  };
};
