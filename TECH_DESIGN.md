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

### 3.2 待办的 localStorage Schema（Day 29 起）

待办（todo）和习惯是**两类条目**，各用各的 key，互不污染：

| key | 存什么 | 谁写 |
|---|---|---|
| `habits` | 习惯 + 打卡记录（Day 6 起，**Day 29 一行未改**） | `save()` |
| `todos` | 今日待办（Day 29 新增） | `saveTodos()` |

```json
{
  "todos": [
    {
      "id": "t_1729920000000ab3",
      "text": "交计算方法作业",
      "dueDate": "2026-10-28",
      "done": false,
      "createdAt": "2026-10-28",
      "completedAt": null
    }
  ]
}
```

设计说明：

- **独立 key，不塞进 `habits`**：Day 20 划的边界是「列表来自云端、打卡/删除本地行为」。待办是纯本地新功能，塞进 habits 会让两种结构互相拖累，也违背 R4「文档与实现不分叉」的初衷。
- **`dueDate` 必填、默认今天、可改**：默认今天让「逾期」自然产生——昨天没做完的，今天打开就是逾期，逾期功能才有真实触发场景。
- **`completedAt` 记完成日期**：需求第 4 条「哪天清了几项」靠它按日期 group 推导，**不单独建日志 key**，省一个结构、省一份维护成本。
- **`text` 1–50 字**：习惯名上限是 20（一条短语），待办往往是一整句，放宽到 50。
- **排序规则（渲染时算，不落盘）**：
  1. 未完成 > 已完成
  2. 未完成内部：`dueDate <= 今天`（今日到期 + 已逾期）置顶，`dueDate > 今天` 排后面
  3. 同组按 `dueDate` 升序，再按创建时间
- **N 的口径**：`N = 未完成 且 dueDate <= 今天` 的条数（今日到期 + 逾期）。因为 `dueDate` 必填，不存在「无日期」灰区。
- **读取失败不拖垮主页面**：`loadTodos()` 的异常在内部吞掉（只 console.error），待办坏了不能让习惯列表跟着进 error 状态——两者是独立的数据源。

### 3.3 学习计划与「今日清单」（Day 30 起 v1.3.0；v1.5.0 改为用户可编辑）

**v1.5.0 的核心转变：计划本身也是用户数据，不再是写死的配置。**

v1.4.0 及以前，`plan.js` 是唯一数据源，用户只能勾选、只能加「我的计划」，改考试日期 / 换科目 / 删掉不要的项都得改代码重新部署——那不叫能自己用的工具。现在反过来：`plan.js` 降级成**出厂模板**，只在「第一次打开」和「用户点恢复默认」时被读一次，之后一切读写都指向 localStorage。

| key | 存什么 | 谁写 |
|---|---|---|
| `plan-data` | 阶段 + 清单项 + 六级考试日期，全量（v1.5.0 新增） | `savePlan()` |
| `daily-log` | 每一项的打卡日期（Day 30 新增，key = `task.id`） | `saveDailyLog()` |
| `custom-plan` | **已废弃**，只读一次做迁移，之后不再写 | `migrateOldCustom()` |

```json
// plan-data
{
  "version": 2,
  "phases": [
    {
      "id": "c1",
      "track": "course",
      "name": "数字逻辑冲刺",
      "start": "2026-10-31",
      "end": "2026-11-11",
      "main": "数字逻辑",
      "secondary": "离散数学",
      "examName": "数字逻辑考试",
      "examDate": "2026-11-11"
    }
  ],
  "cetExam": { "name": "六级考试", "date": "2026-12-12" },
  "tasks": [
    { "id": "words", "name": "背单词", "group": "daily" },
    { "id": "course-c1-main", "name": "数字逻辑", "group": "phase" },
    { "id": "tk_8f2a1b", "name": "复习图论", "group": "mine" }
  ],
  "bound": { "course": "c1", "cet": "0" }
}
```

**字段含义**

| 字段 | 说明 |
|---|---|
| `phases[].track` | `course` = 课内复习（参与「现在主攻」和阶段列表）；`cet` = 六级轨道（独立显示，不排课内队） |
| `phases[].id` | 一旦生成不再变。种子用 `c1/c2/c3` 和 `0/1/2`，新增用 `ph_` 前缀 |
| `tasks[].id` | **就是打卡 key**，所以改名、换组都不会丢历史记录 |
| `tasks[].group` | 只有 `phase` / `daily` / `mine` 三种，对应页面上的三个分组 |
| `bound` | 上次同步进清单的是哪个阶段。用来判断「阶段是不是换人了」 |

**打卡 key 命名**（沿用 v1.4.0，历史记录一条不丢）

| 来源 | key 形态 | 例子 |
|---|---|---|
| 每日固定 | 英文短标识 | `words` |
| 阶段主攻 | `course-<阶段id>-main` | `course-c1-main` |
| 阶段次攻 | `course-<阶段id>-sec` | `course-c1-sec` |
| 六级阶段 | `cet-<阶段id>` | `cet-0` |
| 用户新增 | `tk_<随机串>` | `tk_8f2a1b` |
| v1.4.0 迁移来的 | 保留 `custom-<老id>` | `custom-cp_8f2a1b` |

**阶段任务怎么进清单（`syncPhaseTasks`）**

`main` / `secondary` / 六级 `main` 会被同步成 `tasks` 里 `group = 'phase'` 的条目，两种情形分开处理：

- **阶段换人了**（`phases[].id` ≠ `bound`）→ 先删旧阶段那几条，再把新阶段的写进去；
- **同一阶段、只是改了科目名** → 只更新名字，不重建；
- **用户手动删掉了某条** → 不重建（否则每次刷新都复活，删不掉）。

这是「自动生成」和「用户可编辑」能共存的关键：**重建的触发条件是阶段切换，不是每次渲染**。

**编辑上的约束**

- 清单项：名字 1–20 字，同组不许重名（不同组允许），上限 30 条。
- 阶段：上限 12 个；阶段名 1–20 字；日期必须 `YYYY-MM-DD`，非法值直接拒绝并保留原值。
- 删除清单项 / 删除阶段只动 `plan-data`，**不动 `daily-log`**：那天做过是事实，不因为今天不想看了就被抹掉。
- 所有写路径都先过 `sanitizePlan()`：脏条目逐条丢弃而不是整块报错，宁可少一条也不能白屏。

**为什么计划要落盘（推翻 v1.4.0 的决定）**

v1.4.0 写的理由是「计划是已经说好的安排，不是随手改的内容」。这个判断错在：说好的安排也会变——考试改期、老师加课、六级换节奏。把它写死在代码里，等于每次变动都要找开发者，工具就失去了独立性。落盘之后代价只有一个「换设备数据不同步」，而这一点在 v1.2.0 就明确不做多端同步，属于已经接受的范围。

**其他约定**

- **阶段状态每次渲染现算**：已完成 / 进行中 / 未开始 一律按 `todayStr()` 比日期算，**不存状态字段**。存下来第二天就失真。
- **日期统一 `YYYY-MM-DD` 字符串比较**：不转 `Date` 对象比大小。只有算「还剩几天」时才转 `Date`。
- **恢复默认不清打卡记录**：只重置 `plan-data`，`daily-log` 保持原样——日期记录和计划是两件事。

**统计视图的口径（v1.6.0）**

统计页的「今日清单」块不新增任何存储，全部从 `daily-log` 现算：

| 指标 | 算法 |
|---|---|
| 每日条数 | 那天有几个 key 被勾（同一 key 重复日期去重） |
| 连续天数 | `dailyStreak(key)`：从今天往前不间断，今天没勾算 0 |
| 累计次数 | 该 key 的日期数组长度（合法日期才算） |
| 7 格窗口 | 前 6 天到今天的固定 7 天，左旧右新 |
| 档位 | 1 项 / 2 项 / 3 项 / ≥4 项 → lv1–lv4 |

**只统计当前清单里还在的项**：删掉的项记录仍留在 `daily-log`（加回来能接上），但不进统计面板，也不计入「今日完成数」的分母。日期字符串先过 `isDayStr()`（月份 1–12、日 1–31），`2026-13-99` 这类格式合法但日历非法的值同样丢弃。

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

#### 6.2.2 运行时：一次 GET 请求怎么穿过四层（Day 19 余力加练）

上一张是**静态**结构（代码放在哪），这张是**动态**流程（跑起来的时候怎么走），两张配合看才完整。
以 `GET /api/habits?id=h_seed_001` 为例：

```
 ① index.js        exports.main(event)
                   取出 method = event.httpMethod（'GET'），分流到 handleGet
                        │
                        ▼
 ② handlers        handleGet(event)
    habits.js      读参数 queryStringParameters.id
                   调 repo.findById(id)   ← 只说「要什么」，不说「怎么查」
                        │
                        ▼
 ③ repo            findById(id)
    habits.js      db.from('habits').select(...).eq('id', id)
                   ↑ 整个项目里 SQL 只在这一层出现
                   原样返回 { data, error }，自己不做任何判断
                        │
                        │ 数据原路往上返回
                        ▼
 ④ handlers        handleGet 接着执行（回到调用点的下一行）
    habits.js      这一步才是「翻译」，repo 不管、也不该它管：
                     error 非空  → fail('INTERNAL', '数据库查询失败：…')
                     数组是空的  → fail('NOT_FOUND', '习惯不存在：' + id)
                     查到了      → toApiHabit(data[0])
                                   snake_case → camelCase，records 合并成日期数组
                        │
                        ▼
 ⑤ 网关            浏览器收到 {"ok":true,"data":{"id":"h_seed_001",...}}

   全程 lib/ 的工具随叫随到：log() 记日志、fail() 造错误、toApiHabit() 转字段。
   它们不属于任何一层，所以链条上的每一环都能直接调用。
```

**这张图里最值得记住的是 ③ 和 ④ 的分工**：repo 只回答「查到了几条」，
至于「一条都没有该算 404 还是算异常」「要不要把 `created_at` 转成 `createdAt`」，全是 handlers 的事。
这两个职责原先是混在一起的，拆开之后 repository（仓库）这个名字才立得住——
它像个保管员，只负责把东西取出来递上去，不负责替你决定怎么处置。

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
