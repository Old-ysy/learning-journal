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
  habits: [],   // [{ id, name, createdAt, records: ['YYYY-MM-DD', ...] }]
  filter: ''    // 筛选只作用于显示，不持久化（SKILL.md 规则 1）
};

/* ---------- DOM 引用 ---------- */

var dateEl = document.getElementById('today-date');
var formEl = document.getElementById('add-form');
var inputEl = document.getElementById('habit-input');
var hintEl = document.getElementById('hint');
var listEl = document.getElementById('habit-list');
var emptyEl = document.getElementById('empty-state');
var noResultEl = document.getElementById('no-result');
var filterInputEl = document.getElementById('filter-input');

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
    id: 'h_' + Date.now() + Math.random().toString(36).slice(2, 6),  // 随机尾巴防同毫秒 id 撞车
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
  var result = null;

  for (var i = 0; i < state.habits.length; i++) {
    var habit = state.habits[i];
    if (habit.id !== id) continue;

    var idx = habit.records.indexOf(today);
    var nowChecked = idx === -1;
    if (nowChecked) {
      habit.records.push(today);        // 勾上
    } else {
      habit.records.splice(idx, 1);     // 撤销
    }
    // Day 11：把操作结果带出去，让界面能给出「生效了」的反馈
    result = { checked: nowChecked, streak: calcStreak(habit.records) };
    break;
  }

  save();
  render();
  return result;
}

/**
 * Day 11：统一的打卡反馈
 * - 勾上 → hint 提示「已打卡 · 连续 N 天」+ streak 徽章脉冲一次
 * - 取消 → hint 提示「已取消今日打卡」
 * 反馈发生在 render() 之后，所以直接查新 DOM 里的徽章。
 */
function handleToggle(id) {
  var result = toggleHabit(id);
  if (!result) return result;

  if (result.checked) {
    showHint('已打卡 · 连续 ' + result.streak + ' 天');
    var li = listEl.querySelector('[data-id="' + id + '"]');
    if (li) {
      var badge = li.querySelector('.habit-streak');
      if (badge) badge.classList.add('is-pulse');
    }
  } else {
    showHint('已取消今日打卡');
  }
  return result;
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
  // Day 11 余力：名字可勾选，但要给键盘用户留路——可聚焦 + 语义角色 + 键盘事件
  name.tabIndex = 0;
  name.setAttribute('role', 'button');
  name.setAttribute('aria-label', '切换「' + habit.name + '」的今日打卡');

  var streakEl = document.createElement('span');
  streakEl.className = 'habit-streak' + (streak > 0 ? ' is-active' : '');
  // streak 为 0 时不挂火苗（"🔥 0 天"像嘲讽），显示中性文案
  streakEl.textContent = streak > 0 ? '🔥 ' + streak + ' 天' : '还没开始';

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

/* ---------- 筛选（Day 12 · filter-interaction Skill） ---------- */

/**
 * 返回当前应显示的习惯列表：有筛选词时按名称双向包含、大小写不敏感、忽略首尾空格。
 * SKILL.md 规则 2：只筛显示，不改 state.habits。
 */
function visibleHabits() {
  var q = state.filter.trim().toLowerCase();
  if (!q) return state.habits;
  return state.habits.filter(function (habit) {
    return habit.name.toLowerCase().indexOf(q) !== -1;
  });
}

function render() {
  listEl.textContent = '';

  var shown = visibleHabits();
  for (var i = 0; i < shown.length; i++) {
    listEl.appendChild(buildItem(shown[i]));
  }

  // F6 空状态（本来就没有习惯）
  emptyEl.hidden = state.habits.length > 0;
  // 筛选无命中（有习惯但都不匹配），SKILL.md 规则 4：两种空态分开
  noResultEl.hidden = !(state.habits.length > 0 && shown.length === 0);
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
    handleToggle(id);                                   // F2 + Day 11 反馈
  } else if (target.classList.contains('habit-delete')) {
    var ok = window.confirm('确定删除这个习惯吗？删除后记录不保留。');   // F4
    if (ok) deleteHabit(id);
  } else if (target.classList.contains('habit-name')) {
    handleToggle(id);                                   // 点名字也能勾，手指好按
  }
});

// Day 11 余力：键盘也能操作——Enter / Space 触发名字勾选
listEl.addEventListener('keydown', function (event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  var target = event.target;
  if (!target.classList || !target.classList.contains('habit-name')) return;
  event.preventDefault();                                // 阻止空格滚动页面
  handleToggle(target.closest('.habit-item').dataset.id);
});

// Day 12：筛选输入即筛。用 input 事件不用 change（change 要失焦才触发，SKILL.md 规则 3）
filterInputEl.addEventListener('input', function () {
  state.filter = filterInputEl.value;
  render();
});

/* ---------- 启动 ---------- */

renderDate();
load();

// Day 12：URL ?filter=xxx 初始化筛选值（SKILL.md 规则 5，与 Day 8 ?state= 同套路）
try {
  var filterParam = new URLSearchParams(window.location.search).get('filter');
  if (filterParam) {
    state.filter = filterParam;
    filterInputEl.value = filterParam;
  }
} catch (err) {
  // 老浏览器没有 URLSearchParams 就不初始化，不影响主流程
}

render();

// 方便在控制台调试（PRD 验收 A12 要求数据可读）
window.__habits = function () {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
};
