# 个人习惯打卡器 · 技术设计文档

> Day 5 技术路线与数据流设计｜基于 Day 4 PRD.md 展开
> 作者：Old-ysy｜日期：2026-09-20

---

## 1. 技术路线

**选定：纯 HTML + CSS + 原生 JavaScript + localStorage（浏览器本地存储）**

| 层 | 选型 | 不选的备选 |
|---|---|---|
| 结构 | 原生 HTML | ~~JSX / 模板语法~~ |
| 样式 | 手写 CSS（单文件） | ~~Tailwind / Bootstrap~~ |
| 逻辑 | 原生 JavaScript（ES6+） | ~~React / Vue / jQuery~~ |
| 存储 | localStorage | ~~IndexedDB / 后端数据库 / Firebase~~ |
| 构建 | 无（双击 index.html 直接跑） | ~~Vite / Webpack / npm~~ |
| 部署 | 静态文件（GitHub Pages，Day 7 后再说） | ~~服务器 / 云函数~~ |

### 选它的理由（三条）

1. **MVP 只有 1 个页面 + 6 个功能**（PRD F1-F6），上框架是大炮打蚊子——框架的价值（组件复用、状态管理、路由）在这个规模下一样都用不到，反而带来构建工具链和心智负担。
2. **无依赖 = 永不掉链子**。不引 CDN、不需要 node_modules，双击文件就能跑，部署到任何静态托管零配置。30 天学习周期里，出问题的环节越少越好。
3. **教学价值最大化**。先手写 DOM 操作、事件、localStorage 序列化，Day 23 换真数据库时才知道框架和后端到底帮你解决了什么——先吃苦再享福，比反过来强。

### 什么时候会推翻这个选型

- Day 23 接入真实后端时，存储层换掉（localStorage → API + 数据库）
- 如果 Day 30+ 页面膨胀到 3+ 个视图，再评估是否引入前端框架

---

## 2. 数据流图（核心）

```
【用户操作】                 【内存（页面运行时）】              【浏览器持久层】
                                   │
  点击 [+ 添加] ─────┐             │                              ┌─────────────┐
  点击复选框 ────────┤             ▼                              │ localStorage │
  点击 [删除] ───────┤    ┌─────────────────┐                    │  key:        │
                     └───▶│  事件监听器       │                    │  "habits"    │
                          │  (addEventListener)│                   │             │
                          └────────┬────────┘                    │  value:      │
                                   │                              │  JSON 字符串  │
                                   ▼                              └──────▲──────┘
                          ┌─────────────────┐    save()                 │
                          │  状态对象 state   │─────── stringify ─────────┘
                          │  (内存中的数据)   │
                          └────────┬────────┘
                                   │
                          ┌────────▼────────┐
                          │  render() 重绘   │──────▶ 用户看到新界面
                          │  (DOM 更新)      │
                          └─────────────────┘

【页面加载（刷新/重开浏览器）】

  localStorage ──▶ JSON.parse ──▶ state ──▶ render() ──▶ 界面恢复
```

### 一句话说清（今日一问）

**数据从用户的点击来，到浏览器 localStorage 去；页面刷新时再从 localStorage 读回来重绘界面。** 全程不出这台设备。

---

## 3. 数据结构（localStorage Schema）

一个 key 存全部数据，value 是 JSON 字符串：

```json
{
  "habits": [
    {
      "id": "h_1695200000000",
      "name": "跑步 30 分钟",
      "createdAt": "2026-09-20",
      "records": ["2026-09-20", "2026-09-21", "2026-09-22"]
    }
  ]
}
```

设计说明：

- **`records` 用日期字符串数组**而不是布尔映射——天然去重（同一天点两次只留一条），算 streak 时排序遍历即可
- **日期格式 `YYYY-MM-DD`（本地时区）**——与 PRD F3 的"自然日切换"对齐，人类可读，控制台可直接检查（验收 A12）
- **`id` 用时间戳生成**——MVP 单用户不需要 UUID，够用
- **单 key 存全部**——数据量极小（12 个习惯 × 365 天 ≈ 几 KB），远低于 localStorage 5MB 上限，读写一次搞定，避免多 key 的部分更新问题

### streak 计算逻辑（F3 的算法）

```
从 records 数组末尾往前数：
  今天(或昨天)有记录 → 继续往前
  某天缺失 → 停，返回已数的天数
```

### 3.1 云端数据库 Schema（Day 16 起）

Day 15 开通 CloudBase（环境 the-old-d7gopkcrpbbb52f3b，PostgreSQL 模式）后，
localStorage 的单 key 结构拆成两张表，靠 `records.habit_id → habits.id` 关联：

```sql
CREATE TABLE habits (
  id         VARCHAR(64) PRIMARY KEY,            -- 沿用 h_ 前缀字符串 id（与 localStorage 时代一致）
  name       TEXT        NOT NULL,
  created_at DATE        NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE records (
  habit_id VARCHAR(64) NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  done_on  DATE        NOT NULL,
  PRIMARY KEY (habit_id, done_on)
);

-- Day 18 追加：习惯名唯一（防重复提交的数据库层兜底，见 api-contract.md POST /api/habits）
CREATE UNIQUE INDEX idx_habits_name_unique ON habits (name);
```

与 localStorage 版的映射关系：

| localStorage 结构 | 数据库表 | 说明 |
|---|---|---|
| `habits[].id / name / createdAt` | `habits` | 一个习惯一行 |
| `habits[].records[]`（日期数组） | `records` | 一天一行，`(habit_id, done_on)` 复合主键天然去重 |

设计说明（为什么这么拆）：
- **`records` 从数组改成独立表**：localStorage 里日期数组挂在习惯对象下，是"一个 JSON 存全部"的将就；拆表后一个习惯一天最多一行（复合主键强制），重复打卡在数据库层面就插不进去，不用靠前端去重
- **`ON DELETE CASCADE`**：删习惯时打卡记录自动跟着删，对应 localStorage 版"删对象就全没了"的行为
- **日期仍用 `DATE` 类型（YYYY-MM-DD）**：与 api-contract.md 的日期 key 约定一致，streak 计算可以直接用日期减法
- **`habits.name` 唯一索引（Day 18 追加）**：防重复提交不能只靠「写入前查一遍」——检查和写入之间有竞态窗口，两个并发请求可能同时通过检查。唯一索引把这条规则下沉到数据库，是真正兜得住的那一层；函数捕获唯一冲突错误码（`23505`）转成 `CONFLICT` 返回给前端

---

## 4. 前后端分工（本期版）

| 职责 | 本期由谁做 | Day 23 之后 |
|---|---|---|
| 界面渲染 | 浏览器（JS） | 浏览器（JS） |
| 数据存取 | 浏览器 localStorage | 后端 API + 数据库 |
| 用户身份 | 无（单用户假设） | 账号系统 |
| 运行位置 | 全在本机 | 前端在用户设备，后端在云 |

本期是"**纯前端 + 假持久层**"架构——localStorage 模拟了数据库的"存取"职责，让 MVP 不写一行后端代码也有真实的数据持久化。

---

## 5. 文件规划（Day 6-7 按此创建）

```
/
├── index.html      ← 现有占位页将被重写为应用骨架
├── style.css       ← Day 6 新增
├── app.js          ← Day 6-7 新增（状态管理 + 事件 + 渲染）
├── research.md     ← Day 3
├── PRD.md          ← Day 4
└── TECH_DESIGN.md  ← 本文档
```

---

## 6. 云函数分层结构（Day 19）

### 6.1 为什么要拆

Day 17（GET）和 Day 18（POST）为了先把链路跑通，代码全写在 `functions/habits/index.js` 一个文件里。
到 Day 18 结束它已经 **231 行**：路径分流、参数校验、SQL、错误翻译全糊在一起。
这时候要改一句 SQL，得先从上往下读完 200 多行确认上下文。
Day 19 主任务就是把它拆开——**只动内部结构，对外契约一字不改**。

### 6.2 分层图

```
                      HTTP 请求（网关 /api/habits）
                                 │
                                 ▼
   ┌───────────────────────────────────────────────────────┐
   │  index.js                              入口层           │
   │  ────────────────────────────────────────────────       │
   │  只做一件事：按 HTTP 方法分流                            │
   │  POST → handlePost()        其它 → handleGet()           │
   └──────────────────────────┬────────────────────────────┘
                              │
                              ▼
   ┌───────────────────────────────────────────────────────┐
   │  handlers/habits.js                    编排层           │
   │  ────────────────────────────────────────────────       │
   │  读参数 → 调 repo 取数 → 组装成接口响应                  │
   │  它知道「查不到该翻译成 NOT_FOUND」                      │
   │  它不知道 SQL 长什么样                                   │
   └──────────────────────────┬────────────────────────────┘
                              │
                              ▼
   ┌───────────────────────────────────────────────────────┐
   │  repo/habits.js                       数据访问层        │
   │  ────────────────────────────────────────────────       │
   │  全项目唯一出现 SQL 的地方                              │
   │  listHabits  findById  findByName  insertHabit          │
   │  它不知道 HTTP，也不知道该翻译成什么错误码               │
   └──────────────────────────┬────────────────────────────┘
                              │
                              ▼
   ┌───────────────────────────────────────────────────────┐
   │  lib/db.js                            连接层           │
   │  ────────────────────────────────────────────────       │
   │  唯一 require('@cloudbase/node-sdk') 的文件             │
   └──────────────────────────┬────────────────────────────┘
                              │
                              ▼
                    PostgreSQL（habits / records）
```

四个竖层之外，还有一组**不分层级的公共工具**，任何一层都能直接用：

```
   lib/response.js   fail()          统一错误形状 {ok:false, error:{code,message}}
   lib/log.js        log()           统一日志前缀 [habits] + JSON
   lib/format.js     toApiHabit()    数据库行 → 接口字段（snake_case → camelCase）
                     todayStr()      当天 YYYY-MM-DD
                     makeHabitId()   生成 h_ 开头的 id
   lib/validate.js   validateName()  名称校验：必填 / trim / 最长 20 字
   lib/request.js    parseBody()     请求体解析（字符串或对象都吃）
```

### 6.3 一句话记住调用方向

> **入口分流 → 编排取值 → repo 执行 SQL → 连接层打到数据库。**
> 依赖只能往下走，不许回头：`repo` 不许 `require` `handlers`，`lib/db.js` 不许知道业务。

### 6.4 这么拆换来了什么

| 场景 | 拆之前（231 行单文件） | 拆之后 |
|---|---|---|
| 改一句查询条件 | 在 handleGet 的 40 行里找 | 直接开 `repo/habits.js` |
| 想知道有哪些 SQL | 全文搜 `db.from` | 看 `repo/` 一个目录就够了 |
| 加新接口（Day 20 DELETE） | 继续往 index.js 里堆 | 新增 handler + 在 repo 加一个操作 |
| 本地测业务逻辑 | 只能整体跑 | 可以直接喂假 db 给 repo 单独测 |
| 本地测 HTTP 分支 | 依赖云环境 | 用假 db 替换 `lib/db.js` 即可 |

### 6.5 重构怎么保证「没改坏」

这次改了 100% 的代码组织方式，所以验证也做了三层：

1. **本地回归 73 项**（`.workbuddy/tmp/test-day19.js`）：把 Day 17 + Day 18 的全部用例原样重跑，
   再补一组针对分层本身的断言（比如「index.js 和 handlers 里不许再出现 `db.from`」）→ **73/73 通过**
2. **新旧差分对比 26 项**（`.workbuddy/tmp/test-day19-diff.js`）：从 git 取出**拆分前的** `index.js`，
   把同一批请求分别喂给新旧两版，逐条比对返回的 JSON（随机 id 归一化）→ **26/26 一致**，
   包括错误码、中文文案、以及「写了几条进库」这种副作用
3. **公网回归 29 项**（`.workbuddy/tmp/verify-day19-api.js`）：部署后直接打线上 https 网关 → **29/29 通过**

> 差分对比是这里面最关键的一层：单看「测试全过」只能说明新版本自洽，
> 差分能说明**新版本和旧版本对外表现得一模一样**——这才是「重构」和「重写」的分界线。

### 6.6 契约没有变（今日 Callout）

重构前后完全没动的东西：接口路径 `/api/habits`、请求参数（`/ ?id= / ?limit=` 与 `{name}`）、
响应字段（`ok / data / total / error.code / error.message`）、字段名拼写（`createdAt` 而非 `created_at`）、
错误码（`BAD_REQUEST / NOT_FOUND / CONFLICT / INTERNAL`）、以及每一句中文错误文案。

---

> 本文档为 Day 5 交付物，Day 6 起持续追加。
> 数据流图见第 2 节，技术路线及理由见第 1 节，云端数据库 Schema 见 3.1 节，云函数分层见第 6 节。
