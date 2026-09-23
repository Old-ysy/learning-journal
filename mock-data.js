/* ============================================================
   mock-data.js · Day 8
   用于 dashboard.html（主视图 mock 数据版）的假数据。
   不写 localStorage，仅临时渲染。
   ============================================================ */

/**
 * 生成过去 N 天的连续日期数组（用于根据 streak 数量倒推 records）。
 * @param {number} count - 连续天数
 * @param {Date}   endDate - 结束日期（含），不传则用今天
 * @returns {string[]} YYYY-MM-DD 列表
 */
function recentDates(count, endDate) {
  var out = [];
  var d = endDate ? new Date(endDate) : new Date();
  for (var i = 0; i < count; i++) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    out.push(y + '-' + m + '-' + day);
    d.setDate(d.getDate() - 1);
  }
  return out;
}

/**
 * 在一组连续日期末尾挖掉一天，制造「streak 断了」的视觉：
 * 比如 23 天连续 + 昨天断了 → streak 显示 22 但 records 有 23 个。
 */
function breakLatest(records) {
  if (records.length <= 1) return records;
  var copy = records.slice();
  copy.shift();         // 去掉「最新一天」，模拟昨天漏了
  return copy;
}

/* ---------- 8 个有故事的假习惯 ---------- */

window.MOCK_HABITS = (function () {
  var today = new Date();

  // 每个习惯的 streak 数字是「今天打开页面你应该看到的天数」
  // records 数组负责让 calcStreak()（复用 app.js 的算法）算出对应数字
  var habits = [
    {
      id: 'h001',
      name: '晨跑 30 分钟',
      icon: '🏃',
      streak: 23,
      completedToday: true,
      records: recentDates(23, today),
      createdAt: recentDates(120, today)[recentDates(120, today).length - 1]
    },
    {
      id: 'h002',
      name: '阅读 20 分钟',
      icon: '📖',
      streak: 12,
      completedToday: true,
      records: recentDates(12, today),
      createdAt: recentDates(45, today)[recentDates(45, today).length - 1]
    },
    {
      id: 'h003',
      name: '冥想 10 分钟',
      icon: '🧘',
      streak: 8,
      completedToday: true,
      records: recentDates(8, today),
      createdAt: recentDates(30, today)[recentDates(30, today).length - 1]
    },
    {
      id: 'h004',
      name: '每天 8 杯水',
      icon: '💧',
      streak: 5,
      completedToday: false,                         // 今天还没勾
      records: recentDates(5, today).slice(1),       // 但昨天起连续 5 天
      createdAt: recentDates(60, today)[recentDates(60, today).length - 1]
    },
    {
      id: 'h005',
      name: '写日记',
      icon: '✍️',
      streak: 3,
      completedToday: true,
      records: recentDates(3, today),
      createdAt: recentDates(15, today)[recentDates(15, today).length - 1]
    },
    {
      id: 'h006',
      name: '拉伸 5 分钟',
      icon: '🤸',
      streak: 0,
      completedToday: false,
      records: [],                                    // 新建习惯，零记录
      createdAt: today.toISOString().slice(0, 10)
    },
    {
      id: 'h007',
      name: '练字 15 分钟',
      icon: '🖌️',
      streak: 45,
      completedToday: true,
      records: recentDates(45, today),
      createdAt: recentDates(200, today)[recentDates(200, today).length - 1]
    },
    {
      id: 'h008',
      name: '睡前不刷手机',
      icon: '📵',
      streak: 2,
      completedToday: true,
      records: recentDates(2, today),
      createdAt: recentDates(8, today)[recentDates(8, today).length - 1]
    }
  ];

  return habits;
})();

/* ---------- 错误状态用的假错误对象 ---------- */

window.MOCK_ERROR = {
  message: '数据加载失败：网络请求超时（mock）',
  hint: '请检查网络后点击「重试」'
};
