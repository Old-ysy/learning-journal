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

/* ---------- Day 20：数据源 -------------
 * 公网 https 页面 → 从云端拉真实数据
 * 本地打开（file:// / http://127.0.0.1）→ 继续用 localStorage
 *
 * 为什么用 location.protocol 判断：测试夹具里的 window.location 只有
 * pathname 和 search，没有 protocol，所以会自然落回本地分支 ——
 * Day 13 / Day 14 那套回归测试一行都不用改就能继续跑。
 * --------------------------------------- */
var USE_CLOUD = window.location.protocol === 'https:';

// 跨域是怎么过的：环境的「安全域名」白名单里已经有静态托管的公网域名，
// 网关按白名单回显 Access-Control-Allow-Origin，所以这个跨 HTTPS 域名的请求是被许可的。
// 白名单之外的来源拿不到任何 ACAO 头，会被浏览器直接拦掉 —— 这是网关层规则，
// 前端代码改不了，只能在 CloudBase 控制台加安全域名。
var API_HABITS =
  'https://the-old-d7gopkcrpbbb52f3b-1499234669.ap-shanghai.app.tcloudbase.com/api/habits';

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

// Day 13：视图切换 + 状态切换
var tabsEl = document.getElementById('view-tabs');
var viewListEl = document.getElementById('view-list');
var viewDetailEl = document.getElementById('view-detail');
var viewStatsEl = document.getElementById('view-stats');
var detailContentEl = document.getElementById('detail-content');
var crumbBackEl = document.getElementById('crumb-back');
var crumbCurrentEl = document.getElementById('crumb-current');
var stateLoadingEl = document.getElementById('state-loading');
var stateErrorEl = document.getElementById('state-error');
var errorMsgEl = document.getElementById('error-message');
var errorRetryEl = document.getElementById('error-retry');
var statsListEl = document.getElementById('stats-list');
var statsEmptyEl = document.getElementById('stats-empty');

// 当前视图与列表状态（仅内存，不持久化——刷新就回到默认）
var currentView = 'list';      // list | detail | stats
var listState = 'normal';      // normal | loading | empty | error
// Day 20：error 卡片上那句话现在有两种来源（本地读取失败 / 云端读取失败），
// 所以抽成变量，由触发失败的一方写入
var listErrorMessage = '本地数据读取失败，请检查浏览器存储权限或重试';
// Day 24：本地数据是否已损坏（读都读不出来）。损坏时光点重试救不回来，
// 坏数据还在 localStorage 里，每次 load() 都会再抛一次 —— 需要一条清空重来的路。
var hasCorruptData = false;
var currentHabitId = null;     // detail 视图用
// Day 14 修复：应用内有没有可返回的页面。
// 深链直达（?view=detail 直接打开）时为 false，返回按钮不能走 history.back()，否则会退出应用。
var hasInAppHistory = false;

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

/* ---------- Day 20：云端读取 ---------- */

/**
 * 从 habits 接口拉习惯列表。
 * 成功 → resolve 习惯数组（接口已经返回 camelCase，前端直接用）
 * 失败 → reject 一个带中文说明的 Error，交给 list 的 error 状态展示
 *
 * 这里刻意不 catch：错误统一汇总到调用处，避免同一件事在两处处理。
 */
function fetchHabits() {
  return fetch(API_HABITS).then(function (res) {
    if (!res.ok) throw new Error('接口返回 HTTP ' + res.status);
    return res.json();
  }).then(function (json) {
    if (!json || json.ok !== true || !json.data) {
      throw new Error((json && json.error && json.error.message) || '返回数据格式不正确');
    }
    return json.data;
  });
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
    throw err;                          // Day 13：让上层决定显示 error 状态
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

/* ---------- Day 13：视图路由 ---------- */

/**
 * 读 URL 切视图、列表状态、当前习惯 id。popstate 时也调这个。
 * URL 结构：?view=list|detail|stats[&habit=xxx][&state=loading|empty|error][&filter=xxx]
 */
function applyRoute() {
  var params = new URLSearchParams(window.location.search);

  // 1) filter 同步到 state（保留 Day 12 的能力）
  var f = params.get('filter');
  if (f !== null) {
    state.filter = f;
    filterInputEl.value = f;
  }

  // 2) 视图
  var view = params.get('view') || 'list';
  if (view !== 'list' && view !== 'detail' && view !== 'stats') view = 'list';
  currentView = view;
  currentHabitId = view === 'detail' ? params.get('habit') : null;

  // 3) list 视图的子状态
  if (view === 'list') {
    var st = params.get('state');
    listState = (st === 'loading' || st === 'empty' || st === 'error') ? st : 'normal';
  } else {
    listState = 'normal';
  }

  renderRoute();
}

/**
 * 根据 currentView / listState / currentHabitId 切换面板。
 * 不改数据，只改 DOM 的 hidden 属性和当前 tab 的 aria-current。
 */
function renderRoute() {
  viewListEl.hidden = currentView !== 'list';
  viewDetailEl.hidden = currentView !== 'detail';
  viewStatsEl.hidden = currentView !== 'stats';

  // tab 高亮
  function findTabs(node) {
    var out = [];
    for (var i = 0; i < (node.children || []).length; i++) {
      var c = node.children[i];
      if (c.classList && c.classList.contains('view-tab')) out.push(c);
      out = out.concat(findTabs(c));
    }
    return out;
  }
  var tabs = findTabs(tabsEl);
  for (var i = 0; i < tabs.length; i++) {
    var tab = tabs[i];
    if (tab.dataset.view === currentView) {
      tab.setAttribute('aria-current', 'page');
    } else {
      tab.setAttribute('aria-current', 'false');
    }
  }

  // 面包屑 + 返回按钮（余力加练）
  crumbBackEl.hidden = currentView === 'list';
  crumbCurrentEl.textContent =
    currentView === 'detail' ? '习惯详情' :
    currentView === 'stats'  ? '统计'     : '列表';

  // list 子状态
  if (currentView === 'list') renderListState();

  // detail 内容
  if (currentView === 'detail') renderDetail();

  // stats 内容
  if (currentView === 'stats') renderStats();
}

/**
 * list 视图的 4 种状态：normal / loading / empty / error
 * normal 由原来的 render() 负责（normal / 筛选无结果 / 原本空），其他三态靠隐藏列表+展示占位
 */
function renderListState() {
  if (listState === 'normal') {
    stateLoadingEl.hidden = true;
    stateErrorEl.hidden = true;
    return;
  }
  // loading / empty / error：隐藏原列表与筛选无结果提示
  listEl.textContent = '';
  emptyEl.hidden = true;
  noResultEl.hidden = true;
  filterInputEl.disabled = listState === 'loading' || listState === 'error';
  filterInputEl.value = '';

  if (listState === 'loading') {
    stateLoadingEl.hidden = false;
    stateErrorEl.hidden = true;
  } else if (listState === 'empty') {
    stateLoadingEl.hidden = true;
    stateErrorEl.hidden = true;
    emptyEl.hidden = false;
  } else if (listState === 'error') {
    stateLoadingEl.hidden = true;
    stateErrorEl.hidden = false;
    errorMsgEl.textContent = listErrorMessage;   // Day 20：来源可能是本地，也可能是云端
  }
}

/**
 * detail 视图：找到对应习惯，显示它的名称、总打卡次数、连续天数、最近 30 天日历。
 * 找不到 id → 显示「习惯不存在」的占位。
 */
function renderDetail() {
  detailContentEl.textContent = '';
  var habit = null;
  for (var i = 0; i < state.habits.length; i++) {
    if (state.habits[i].id === currentHabitId) { habit = state.habits[i]; break; }
  }
  if (!habit) {
    var p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = '习惯不存在或已被删除';
    detailContentEl.appendChild(p);
    return;
  }

  var streak = calcStreak(habit.records);
  var total = habit.records.length;
  var last30 = last30DaysMap(habit.records);

  var h2 = document.createElement('h2');
  h2.className = 'detail-name';
  h2.textContent = habit.name;
  detailContentEl.appendChild(h2);

  var meta = document.createElement('p');
  meta.className = 'detail-meta';
  meta.textContent = '连续 ' + streak + ' 天 · 累计 ' + total + ' 次';
  detailContentEl.appendChild(meta);

  var grid = document.createElement('div');
  grid.className = 'detail-cal';
  var dates = last30Dates();
  for (var d = 0; d < dates.length; d++) {
    var cell = document.createElement('div');
    cell.className = 'detail-cal-cell' + (last30[dates[d]] ? ' is-done' : '');
    cell.title = dates[d] + (last30[dates[d]] ? ' · 已打卡' : '');
    grid.appendChild(cell);
  }
  detailContentEl.appendChild(grid);

  var calHint = document.createElement('p');
  calHint.className = 'detail-cal-hint';
  calHint.textContent = '最近 30 天打卡日历';
  detailContentEl.appendChild(calHint);
}

/**
 * 把 records 转成 {'YYYY-MM-DD': true}，方便查最近 30 天。
 */
function last30DaysMap(records) {
  var set = {};
  for (var i = 0; i < (records || []).length; i++) set[records[i]] = true;
  return set;
}

/**
 * 返回最近 30 天的 'YYYY-MM-DD'，从今天往前数。
 */
function last30Dates() {
  var arr = [];
  var d = new Date();
  for (var i = 0; i < 30; i++) {
    arr.push(toDateStr(d));
    d.setDate(d.getDate() - 1);
  }
  return arr;
}

/**
 * stats 视图：复用列表渲染，但只展示 streak > 0 的习惯，并按 streak 倒序。
 */
function renderStats() {
  statsListEl.textContent = '';
  var ranked = state.habits.slice().sort(function (a, b) {
    return calcStreak(b.records) - calcStreak(a.records);
  });
  for (var i = 0; i < ranked.length; i++) {
    statsListEl.appendChild(buildItem(ranked[i]));
  }
  statsEmptyEl.hidden = state.habits.length > 0;
}

/* ---------- 事件绑定 ---------- */

// 视图切换：拦截 tab 点击，只改 URL 不刷新页面
tabsEl.addEventListener('click', function (event) {
  var a = event.target.closest('a.view-tab');
  if (!a) return;
  event.preventDefault();
  var view = a.dataset.view;
  // 只切视图，保留 filter；不带 habit/state
  var params = new URLSearchParams(window.location.search);
  params.set('view', view);
  params.delete('habit');
  params.delete('state');
  var qs = params.toString();
  hasInAppHistory = true;
  history.pushState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
  applyRoute();
});

// 浏览器前进/后退
window.addEventListener('popstate', applyRoute);

// 习惯名字点击 → 进详情（只对 list/stats 的 name 起作用）
listEl.addEventListener('click', function (event) {
  var target = event.target;
  // 名字列已经走 detail 路径
  if (target.classList && target.classList.contains('habit-name')) {
    var li = target.closest('.habit-item');
    if (!li) return;
    var id = li.dataset.id;
    var params = new URLSearchParams(window.location.search);
    params.set('view', 'detail');
    params.set('habit', id);
    var qs = params.toString();
    hasInAppHistory = true;
    history.pushState(null, '', window.location.pathname + '?' + qs);
    applyRoute();
    return;
  }
});

statsListEl.addEventListener('click', function (event) {
  var target = event.target;
  if (target.classList && target.classList.contains('habit-name')) {
    var li = target.closest('.habit-item');
    if (!li) return;
    var id = li.dataset.id;
    var params = new URLSearchParams(window.location.search);
    params.set('view', 'detail');
    params.set('habit', id);
    var qs = params.toString();
    hasInAppHistory = true;
    history.pushState(null, '', window.location.pathname + '?' + qs);
    applyRoute();
  }
});

// 面包屑返回按钮（余力加练；Day 14 修复深链场景）
// 从列表点进来的：栈里有应用内页面，正常 back。
// 深链直达 detail/stats 的：栈里没有应用内页面，back 会退出应用——改为进入应用内列表。
crumbBackEl.addEventListener('click', function () {
  if (hasInAppHistory) {
    history.back();
  } else {
    hasInAppHistory = true;
    history.pushState(null, '', window.location.pathname + '?view=list');
    applyRoute();
  }
});

// error 状态的重试按钮：按当前数据源重试
errorRetryEl.addEventListener('click', function () {
  // Day 24：损坏数据导致的失败，光重试救不回来 —— 坏数据还躺在 localStorage 里，
  // 每次 load() 都会再抛一次同一个错。所以这里给用户一条真正能走出去的路：
  // 确认之后清空重来。删数据要用户点头，不自作主张。
  if (hasCorruptData) {
    var yes = window.confirm(
      '本地数据已损坏，无法正常读取。\n\n要清空损坏的数据并重新开始吗？\n（原来的记录将无法找回）'
    );
    if (!yes) return;
    localStorage.removeItem(STORAGE_KEY);
    hasCorruptData = false;
  }
  bootstrap();
});

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
  }
});

// Day 11 余力：键盘也能操作——Enter / Space 触发名字勾选
listEl.addEventListener('keydown', function (event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  var target = event.target;
  if (!target.classList || !target.classList.contains('habit-name')) return;
  event.preventDefault();                                // 阻止空格滚动页面
  // 名字当前优先于 toggle——键盘直接进详情更符合预期
  var li = target.closest('.habit-item');
  if (!li) return;
  var id = li.dataset.id;
  var params = new URLSearchParams(window.location.search);
  params.set('view', 'detail');
  params.set('habit', id);
  hasInAppHistory = true;
  history.pushState(null, '', window.location.pathname + '?' + params.toString());
  applyRoute();
});

// Day 12：筛选输入即筛。用 input 事件不用 change（change 要失焦才触发，SKILL.md 规则 3）
filterInputEl.addEventListener('input', function () {
  state.filter = filterInputEl.value;
  render();
});

/* ---------- 启动 ---------- */

/**
 * Day 20：公网路径 —— 从云端取真数据。
 * 先显示 Day 13 做好的骨架屏，取到数据再渲染；失败就进 error 状态，
 * 复用当时建的那张错误卡片和重试按钮，这次总算有真实用途了。
 *
 * ⚠️ 这里必须用 renderRoute() 而不是 applyRoute()：
 * applyRoute() 会重读 URL 的 state 参数并覆盖 listState，
 * 一调用就把刚设好的 loading/error 冲回 normal。
 */
function loadFromCloud() {
  applyRoute();            // 先按 URL 定视图
  listState = 'loading';   // 再单独覆盖 list 子状态
  renderRoute();

  fetchHabits().then(function (habits) {
    state.habits = habits;
    listState = 'normal';
    render();
    renderRoute();
    renderUpdatedAt();
  }, function (err) {
    listState = 'error';
    listErrorMessage = '云端数据读取失败：' + (err && err.message ? err.message : '未知原因');
    renderRoute();
  });
}

/**
 * 启动入口：按数据源二选一。
 * 公网 → 云端；本地 → localStorage（Day 13 的原逻辑，一行没动）。
 */
function bootstrap() {
  // 底部那句数据来源跟着实际数据源走：本地打开却写着「来自云端」会误导人
  var srcEl = document.getElementById('habit-source');
  if (srcEl) {
    srcEl.textContent = USE_CLOUD ? '列表来自云端数据库（只读）' : '数据只存在这台浏览器里';
  }
  if (USE_CLOUD) loadFromCloud();
  else loadWithState();
}

/**
 * 余力加练：底部「最后更新时间」。
 * 每次拉数据成功后刷新一次 —— 控制台改完数据回页面按 F5，时间跟着变，
 * 肉眼就能确认「这次刷的是新数据」而不是浏览器缓存。
 */
function renderUpdatedAt() {
  var updatedEl = document.getElementById('updated-at');
  if (!updatedEl) return;
  var now = new Date();
  var hh = String(now.getHours()).padStart(2, '0');
  var mm = String(now.getMinutes()).padStart(2, '0');
  var ss = String(now.getSeconds()).padStart(2, '0');
  updatedEl.textContent = '数据更新于 ' + hh + ':' + mm + ':' + ss;
}

/**
 * Day 13：把 load 包一层，根据 URL ?state 决定展示哪种 list 状态。
 *   state=loading  → 显示骨架 250ms 再切回 normal（演示加载）
 *   state=empty    → 不读 localStorage，强行空
 *   state=error     → 强行模拟读取失败
 *   其它（不传或 normal）→ 正常读 localStorage
 */
function loadWithState() {
  var params = new URLSearchParams(window.location.search);
  var forced = params.get('state');

  if (forced === 'empty') {
    state.habits = [];
    listState = 'normal';           // 让正常渲染路径显示 empty-state
    render();
    applyRoute();
    return;
  }

  if (forced === 'error') {
    listState = 'error';
    applyRoute();
    return;
  }

  if (forced === 'loading') {
    listState = 'loading';
    applyRoute();
    setTimeout(function () {
      // 把 URL 的 state=loading 摘掉，回到正常
      var p = new URLSearchParams(window.location.search);
      p.delete('state');
      history.replaceState(null, '', window.location.pathname + (p.toString() ? '?' + p : ''));
      listState = 'normal';
      load();
      render();
      renderRoute();
    }, 600);
    return;
  }

  // 正常路径
  //
  // Day 24 修复：load() 读到损坏数据会抛错，而这条链路上原本**没人接** ——
  //     顶层 renderDate(); bootstrap();
  //       → bootstrap() → loadWithState() → load()  ← 三层都没有 try/catch
  //   异常一路冒出去变成「未捕获异常」，bootstrap() 从 load() 那一行直接中断，
  //   后面的 render() / applyRoute() 全部不执行：列表一片空白，
  //   而 Day 13 专门为此做的 error 卡片 + 重试按钮也永远等不到上场。
  //   load() 里那句注释写着「让上层决定显示 error 状态」——上层确实该决定，以前是忘了。
  var loadErr = null;
  try {
    load();
  } catch (err) {
    loadErr = err;
  }

  // 无论读写成功与否，都先把视图按 URL 定好
  applyRoute();

  if (loadErr) {
    console.error('本地数据读取失败，已切到错误状态：', loadErr);
    hasCorruptData = true;
    // ⚠️ 顺序不能反：applyRoute() 会重读 URL 的 state 参数覆盖 listState，
    //    所以必须在 applyRoute() 之后再设 error，否则会被冲回 normal（和 loadFromCloud 同一个坑）。
    listState = 'error';
    listErrorMessage = '本地数据读取失败，数据可能已损坏。可重试，或清空后重新开始。';
  }

  render();
  renderRoute();
}

renderDate();
bootstrap();

// 方便在控制台调试（PRD 验收 A12 要求数据可读）
// Day 20：公网数据源已经不是 localStorage，改成直接吐内存里的 state
window.__habits = function () {
  return state.habits;
};
