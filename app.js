/* ============================================================
   今日打卡 · app.js
   纯原生 JavaScript，无框架无依赖（TECH_DESIGN.md 第 1 节）
   数据流：用户操作 → state → save() → localStorage
           页面加载：localStorage → state → render()
   ============================================================ */

'use strict';

/* ---------- 常量 ---------- */

var STORAGE_KEY = 'habits';
var MAX_HABITS = 12;          // PRD F1：上限 12 个
var MAX_NAME_LEN = 20;        // PRD F1：1-20 字符
var WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/* ---------- 状态 ---------- */

var state = {
  habits: []   // [{ id, name, createdAt, records: ['YYYY-MM-DD', ...] }]
};

/* ---------- DOM 引用 ---------- */

var dateEl = document.getElementById('today-date');
var formEl = document.getElementById('add-form');
var inputEl = document.getElementById('habit-input');
var hintEl = document.getElementById('hint');
var listEl = document.getElementById('habit-list');
var emptyEl = document.getElementById('empty-state');

/* ---------- 日期工具 ---------- */

/**
 * 把 Date 转成本地时区的 'YYYY-MM-DD'。
 * 不能用 toISOString()——那是 UTC，会导致晚上打卡算到第二天。
 */
function toDateStr(date) {
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function todayStr() {
  return toDateStr(new Date());
}

/* ---------- 持久化（F5） ---------- */

function load() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    var parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.habits)) {
      state.habits = parsed.habits;
    }
  } catch (err) {
    // 数据损坏时不静默清空，先在控制台报出来，方便排查
    console.error('读取本地数据失败，已忽略：', err);
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ habits: state.habits }));
}

/* ---------- streak 计算（F3） ---------- */

/**
 * 规则（PRD F3）：
 * - 按自然日；从今天往前数连续天数
 * - 今天还没勾，就从昨天往前数（不归零，只是不给今天的份）
 * - 中间断一天，从断点重新计数
 * records 用日期字符串数组，天然去重（TECH_DESIGN.md 第 3 节）
 */
function calcStreak(records) {
  if (!records || records.length === 0) return 0;

  var set = {};
  for (var i = 0; i < records.length; i++) {
    set[records[i]] = true;
  }

  var cursor = new Date();
  // 今天没完成 → 从昨天开始数（保留"昨天的战绩"）
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

/* ---------- 操作：增 / 改 / 删 ---------- */

function addHabit(name) {
  var trimmed = name.trim();

  if (trimmed === '') {
    return { ok: false };                     // A2：空输入无反应、无报错
  }
  if (state.habits.length >= MAX_HABITS) {
    return { ok: false, message: '最多 ' + MAX_HABITS + ' 个，先删一个吧' };
  }

  state.habits.unshift({
    id: 'h_' + Date.now(),
    name: trimmed.slice(0, MAX_NAME_LEN),
    createdAt: todayStr(),
    records: []
  });

  save();
  render();
  return { ok: true };
}

function toggleHabit(id) {
  var today = todayStr();

  for (var i = 0; i < state.habits.length; i++) {
    var habit = state.habits[i];
    if (habit.id !== id) continue;

    var idx = habit.records.indexOf(today);
    if (idx === -1) {
      habit.records.push(today);        // 勾上
    } else {
      habit.records.splice(idx, 1);     // 撤销
    }
    break;
  }

  save();
  render();
}

function deleteHabit(id) {
  state.habits = state.habits.filter(function (habit) {
    return habit.id !== id;
  });
  save();
  render();
}

/* ---------- 渲染 ---------- */

function showHint(message) {
  hintEl.textContent = message;
  if (showHint.timer) clearTimeout(showHint.timer);
  showHint.timer = setTimeout(function () {
    hintEl.textContent = '';
  }, 2500);
}

function renderDate() {
  var now = new Date();
  dateEl.textContent = toDateStr(now) + ' ' + WEEKDAYS[now.getDay()];
}

function buildItem(habit) {
  var today = todayStr();
  var isDone = habit.records.indexOf(today) !== -1;
  var streak = calcStreak(habit.records);

  var li = document.createElement('li');
  li.className = 'habit-item' + (isDone ? ' is-done' : '');
  li.dataset.id = habit.id;

  var checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'habit-check';
  checkbox.checked = isDone;
  checkbox.setAttribute('aria-label', '完成「' + habit.name + '」');

  var name = document.createElement('span');
  name.className = 'habit-name';
  name.textContent = habit.name;          // textContent 防注入

  var streakEl = document.createElement('span');
  streakEl.className = 'habit-streak' + (streak > 0 ? ' is-active' : '');
  streakEl.textContent = '🔥 ' + streak + ' 天';

  var del = document.createElement('button');
  del.type = 'button';
  del.className = 'habit-delete';
  del.textContent = '×';
  del.title = '删除';
  del.setAttribute('aria-label', '删除「' + habit.name + '」');

  li.appendChild(checkbox);
  li.appendChild(name);
  li.appendChild(streakEl);
  li.appendChild(del);
  return li;
}

function render() {
  listEl.textContent = '';

  for (var i = 0; i < state.habits.length; i++) {
    listEl.appendChild(buildItem(state.habits[i]));
  }

  // F6 空状态
  emptyEl.hidden = state.habits.length > 0;
}

/* ---------- 事件绑定 ---------- */

formEl.addEventListener('submit', function (event) {
  event.preventDefault();
  var result = addHabit(inputEl.value);
  if (result.ok) {
    inputEl.value = '';
    showHint('');
  } else if (result.message) {
    showHint(result.message);
  }
});

// 事件委托：一个监听器管住整张列表
listEl.addEventListener('click', function (event) {
  var target = event.target;
  var li = target.closest ? target.closest('.habit-item') : null;
  if (!li) return;
  var id = li.dataset.id;

  if (target.classList.contains('habit-check')) {
    toggleHabit(id);                                   // F2
  } else if (target.classList.contains('habit-delete')) {
    var ok = window.confirm('确定删除这个习惯吗？删除后记录不保留。');   // F4
    if (ok) deleteHabit(id);
  } else if (target.classList.contains('habit-name')) {
    toggleHabit(id);                                   // 点名字也能勾，手指好按
  }
});

/* ---------- 启动 ---------- */

renderDate();
load();
render();

// 方便在控制台调试（PRD 验收 A12 要求数据可读）
window.__habits = function () {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
};
