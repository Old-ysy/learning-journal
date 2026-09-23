/* ============================================================
   dashboard.js · Day 8
   主视图的 4 种页面状态演示。
   核心抽象：4 个 render 函数（success / loading / empty / error）
   URL ?state=xxx 决定调用哪一个；默认 success。
   数据来自 mock-data.js（不读 localStorage）。
   ============================================================ */

'use strict';

var WEEKDAYS = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];

/* ---------- 日期工具（与 app.js 一致，可独立） ---------- */

function toDateStr(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/* ---------- streak 复用 app.js 的算法（写在这里方便独立运行） ---------- */

function calcStreak(records) {
  if (!records || records.length === 0) return 0;
  var set = {};
  for (var i = 0; i < records.length; i++) set[records[i]] = true;

  var cursor = new Date();
  if (!set[toDateStr(cursor)]) {
    cursor.setDate(cursor.getDate() - 1);
  }

  var streak = 0;
  while (set[toDateStr(cursor)]) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/* ---------- 路由：URL ?state=success|loading|empty|error ---------- */

function getStateFromURL() {
  var sp = new URLSearchParams(window.location.search);
  var s = sp.get('state');
  if (['success', 'loading', 'empty', 'error'].indexOf(s) === -1) {
    return 'success';   // 默认
  }
  return s;
}

/* ---------- 4 种 render 出口 ---------- */

// ① Success：mock 数据列表
function renderSuccess() {
  var listEl = document.getElementById('habit-list');
  listEl.textContent = '';

  var habits = window.MOCK_HABITS;
  if (!habits || habits.length === 0) {
    renderEmpty();
    return;
  }

  for (var i = 0; i < habits.length; i++) {
    listEl.appendChild(buildCard(habits[i]));
  }
}

function buildCard(habit) {
  var li = document.createElement('li');
  li.className = 'habit-item' + (habit.completedToday ? ' is-done' : '');

  // 头像位（icon）
  var icon = document.createElement('span');
  icon.className = 'habit-icon';
  icon.textContent = habit.icon || '•';
  icon.setAttribute('aria-hidden', 'true');

  // 习惯名
  var name = document.createElement('span');
  name.className = 'habit-name';
  name.textContent = habit.name;

  // streak 徽章
  var streak = calcStreak(habit.records);
  var streakEl = document.createElement('span');
  streakEl.className = 'habit-streak' + (streak > 0 ? ' is-active' : '');
  streakEl.textContent = streak > 0 ? '🔥 ' + streak + ' 天' : '—';
  streakEl.setAttribute('aria-label', '已连续 ' + streak + ' 天');

  // 状态标签（今天是否完成）
  var status = document.createElement('span');
  status.className = 'habit-status ' + (habit.completedToday ? 'is-done' : 'is-pending');
  status.textContent = habit.completedToday ? '今日已完成' : '今日待完成';

  li.appendChild(icon);
  li.appendChild(name);
  li.appendChild(streakEl);
  li.appendChild(status);
  return li;
}

// ② Loading：骨架屏
function renderLoading() {
  // 不操作 DOM —— 骨架屏本来就写在 HTML 里
  // 这里留个口，未来接真 API 时可改 spinner 文本
}

// ③ Empty：空状态（无任何习惯）
function renderEmpty() {
  // 空状态写在 HTML 里，无需操作 DOM
}

// ④ Error：错误状态
function renderError() {
  var msgEl = document.getElementById('error-message');
  if (window.MOCK_ERROR && msgEl) {
    msgEl.textContent = window.MOCK_ERROR.message;
  }
}

/* ---------- 调度器：每次只显示一个 section ---------- */

function showOnly(state) {
  var ids = ['success', 'loading', 'empty', 'error'];
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById('state-' + ids[i]);
    if (el) el.hidden = (ids[i] !== state);
  }
}

/* ---------- 头/尾信息 ---------- */

function renderMeta() {
  var now = new Date();
  var dateEl = document.getElementById('today-date');
  dateEl.textContent = toDateStr(now) + ' ' + WEEKDAYS[now.getDay()];

  var updatedEl = document.getElementById('updated-at');
  if (updatedEl) {
    updatedEl.textContent = '页面生成于 ' + now.toLocaleTimeString('zh-CN', { hour12: false });
  }
}

/* ---------- 状态切换器：select 与 URL 双向同步 ---------- */

function bindStateSwitch() {
  var select = document.getElementById('state-select');
  if (!select) return;

  // 初始化：URL 决定当前值
  var current = getStateFromURL();
  select.value = current;

  // 用户改 select → 更新 URL 不刷新页面
  select.addEventListener('change', function () {
    var newState = select.value;
    var url = new URL(window.location.href);
    url.searchParams.set('state', newState);
    history.replaceState(null, '', url.toString());
    go(newState);
  });
}

/* ---------- 路由主入口 ---------- */

function go(state) {
  showOnly(state);

  switch (state) {
    case 'success': renderSuccess(); break;
    case 'loading': renderLoading(); break;
    case 'empty':   renderEmpty();   break;
    case 'error':   renderError();   break;
  }
}

/* ---------- 启动 ---------- */

renderMeta();
bindStateSwitch();
go(getStateFromURL());

// 暴露调试钩子（控制台验证）
window.__demoState = function () { return getStateFromURL(); };
