# API 契约（api-contract.md）· Day 15

> 作用：前后端对接口的「合同」。Day 16-20 每加一个真实接口，先改这份文档再写代码（同 R4 规则的精神：文档与实现不分叉）。
> 现状：`/api/health`（Day 15）、`GET /api/habits`（Day 17）、`POST /api/habits`（Day 18）、`PATCH /api/habits`（Day 22）、`DELETE /api/habits`（Day 22）是真的；`/api/habits/:id/toggle` 仍是 Day 23+ 的预留。

## 一、通用约定

| 项 | 约定 |
|---|---|
| API 基础地址 | `https://the-old-d7gopkcrpbbb52f3b-1499234669.ap-shanghai.app.tcloudbase.com`（CloudBase HTTP 网关默认域名，云函数路由挂在 `/api/*`） |
| 前端线上页面 | `https://the-old-d7gopkcrpbbb52f3b-1499234669.tcloudbaseapp.com/`（静态托管，Day 20 起部署真实 `index.html`，列表从云端拉数） |
| 环境 ID | `the-old-d7gopkcrpbbb52f3b`（上海地域 · 体验版 · 到期 2027-04-01） |
| 数据格式 | 请求与响应都是 `application/json; charset=utf-8` |
| 时间格式 | ISO 8601 UTC（如 `2026-10-01T08:00:00.000Z`），前端负责转本地显示 |
| 习惯 id | 服务端生成的字符串（现有 `h_` 前缀规则沿用） |
| 日期 key | `YYYY-MM-DD`（与现有 localStorage records 一致） |

### 跨域（CORS）规则 · Day 20 实测订正

网关**按环境的「安全域名」白名单回显** `Access-Control-Allow-Origin`，
响应同时带 `Access-Control-Allow-Credentials: true`。
白名单在 CloudBase 控制台「环境 → 安全配置 → 安全域名」维护
（MCP：`manageEnv(action=addSecurityDomain)`）。当前环境白名单里的 USER 条目就是静态托管域名。

| 请求来源 Origin | 是否拿到 ACAO | 说明 |
|---|---|---|
| 静态托管默认域名（`.tcloudbaseapp.com`） | ✅ 回显 | 开通托管时自动加入白名单，`Type: USER` |
| `http://127.0.0.1:<port>` / `http://localhost:<port>` | ✅ 回显 | 本地调试默认放行 |
| 白名单外的任意 https 域名 | ❌ 一个 CORS 头都没有 | 浏览器直接拦，**前端代码改不了** |
| `null`（`file://` 双击打开、`about:blank`） | ❌ 不回显 | Day 18 这条结论依然成立 |

> ⚠️ **订正 Day 18 的记录**：当时只拿 `http://127.0.0.1:8000` 测过一条就归纳成
> 「网关回显式 ACAO」，并据此推断正式 https 域名也能通过。Day 20 改用**真实静态托管域名**
> 复测才发现规律其实是「查白名单」，不是「只要是 http(s) 就回显」。
> 单点归纳写成的结论，第二天就把整个上午带偏了。
>
> 顺带：静态托管的 CDN 域名是系统内置域名，**不允许手动挂 `/api` 路由**
> （`VerifyHTTPServiceRoute` 报 `system internal domain`）。
> 所以「让页面和接口同源」这条路在平台上走不通，前端只能老老实实走跨域调用。

### 成功响应形状

```json
{ "ok": true, "data": { ... } }
```

### 错误响应形状

```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "人话描述" } }
```

| code | 含义 | HTTP 语义对应 |
|---|---|---|
| `BAD_REQUEST` | 参数缺失/格式错 | 400 |
| `NOT_FOUND` | 资源不存在（如 habitId 无效） | 404 |
| `CONFLICT` | 与现有资源冲突（如重名习惯） | 409 |
| `INTERNAL` | 服务端自身错误 | 500 |

> 注：云函数 HTTP 访问层默认可能统一 200，业务错误靠 `ok` 字段区分；Day 16 接入时再定状态码映射，先以 `ok` 为准。

### 错误文案约定 · Day 23

**一句话：响应里的 `message` 一律中文人话，且不含任何原始错误内容。**

原因有两个：① 用户要的是"我现在该怎么办"，不是数据库内部细节；② 表名、字段名、约束名暴露到公网等于给攻击者递地图。

| 规则 | 说明 |
|---|---|
| 只给人话 | `message` 里不许出现英文技术词、表名、约束名、IP、端口 |
| 原文进日志 | 原始错误截断 300 字符写进 `log()`，排查去云函数日志看，不回给用户 |
| 说清下一步 | 文案写"用户现在能做什么"，不写"系统哪里坏了" |
| 冲突不是故障 | 重名这类用户改一下就能过的，返 `CONFLICT`（4xx），不返 `INTERNAL`（5xx） |

三类错误的分工：

| 类型 | code | 文案要求 | 例子 |
|---|---|---|---|
| 参数错 | `BAD_REQUEST` | 明确指出哪一项错了、正确的做法是什么 | `习惯名称最多 20 个字`、`删除必须指定 id，不支持批量删除` |
| 资源不存在 | `NOT_FOUND` | 说清楚找的是哪个，绝不静默 | `习惯不存在：h_xxx` |
| 服务端出错 | `INTERNAL` | 通用兜底 + 已记录，不暴露原因 | `数据读取失败，请稍后重试` |

已知数据库错误的翻译（实现在 `functions/habits/lib/errors.js` 的 `translateDbError`）：

| 原始错误 | 对外文案 |
|---|---|
| `42501` permission denied | 服务端缺少这项操作的权限，问题已记录，请稍后重试 |
| `23503` violates foreign key | 该数据仍被其它记录引用，暂不能删除 |
| `23505` duplicate key | 已存在相同的数据，请勿重复提交（业务路径已先返 `CONFLICT`，这是兜底） |
| `57014` / timeout | 数据库响应超时，请稍后重试 |
| `ECONNREFUSED` / `ENOTFOUND` / `ECONNRESET` | 数据库连接异常，请稍后重试 |
| `23502` violates not-null | 服务端数据不完整，问题已记录，请稍后重试 |
| `22P02` invalid input syntax | 服务端数据格式有误，问题已记录，请稍后重试 |
| 翻译不了 | 按操作类型兜底：读/写/改/删 →「数据〇〇失败，请稍后重试」 |

> 改前长这样：`"数据库删除失败：update or delete on table \"habits\" violates foreign key constraint \"records_habit_id_fkey\" on table \"records\""`
> 改后长这样：`"该数据仍被其它记录引用，暂不能删除"`

## 二、已实现接口

### GET /api/health（Day 15）

健康检查。不查库、不鉴权、无副作用，用来确认「云函数部署 + 公网可访问 + JSON 格式」三件事。

**请求**：无参数。

**响应**：

```json
{
  "ok": true,
  "service": "habit-tracker",
  "api": "health",
  "timestamp": "2026-10-01T08:00:00.000Z",
  "method": "GET"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| ok | boolean | 恒为 true；false 或超时即链路故障 |
| service | string | 服务标识，用于确认没打错环境 |
| timestamp | string | 服务端当前时间，可顺带校对客户端时钟 |
| method | string | 回显请求方法（GET/POST 都应返回 200） |

**验证**：浏览器直接打开公网地址应返回上述 JSON；截图要求带地址栏。

**实测（2026-10-01 部署当天）**：

- `GET https://the-old-d7gopkcrpbbb52f3b-1499234669.ap-shanghai.app.tcloudbase.com/api/health`
  → `{"ok":true,"service":"habit-tracker","api":"health","timestamp":"2026-10-01T08:54:16.282Z","method":"GET"}`
- `POST` 同地址 → `method` 回显 `POST`，链路一致
- 部署路径：本地 `functions/health/` → 云函数 `health`（Nodejs18.15，Event 型）→ 网关路由 `/api/health`（匿名访问，auth=false）

### GET /api/habits（Day 17）

读接口：拉取习惯列表（含每个习惯的打卡记录）。对应课程模板的「GET 热榜 / 收藏列表」，本项目的列表 = 习惯列表。

**查询参数**（都可选）：

| 参数 | 类型 | 说明 |
|---|---|---|
| id | string | 传了则只返回该习惯（详情），如 `?id=h_seed_001` |
| limit | number | 限制返回的习惯条数（1-50），如 `?limit=3`。Day 17 余力加练 |

**响应**（列表）：

```json
{
  "ok": true,
  "data": [
    {
      "id": "h_seed_001",
      "name": "每天 8 杯水",
      "createdAt": "2026-09-20",
      "records": ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]
    }
  ]
}
```

**响应**（`?id=` 详情）：`data` 为单个对象而非数组，字段同上；id 不存在时返回 `{ok:false, error:{code:"NOT_FOUND"}}`。

**字段映射说明（数据库 → 接口）**：

| 数据库列（snake_case） | 接口字段（camelCase） | 转换 |
|---|---|---|
| habits.id | id | 原样 |
| habits.name | name | 原样 |
| habits.created_at | createdAt | 改名（沿用 localStorage 时代的前端字段约定） |
| records 表多行 | records 数组 | 每行 done_on 取出来塞进数组（还原 localStorage 时代的形状） |

**实现**：Event 云函数 `habits`（Nodejs18.15，@cloudbase/node-sdk 的 `app.rdb()` 查 PG，外键嵌套查询一次拿两表数据）→ 网关路由 `/api/habits`（匿名访问）。云函数服务端身份绕过 RLS。

### POST /api/habits（Day 18）

写接口：新建一个习惯。对应课程模板的「收藏写入」，本项目的写入 = 新建习惯。

**请求体**（`application/json`）：

```json
{ "name": "每天散步 20 分钟" }
```

| 字段 | 类型 | 必填 | 校验规则 |
|---|---|---|---|
| name | string | 是 | 去首尾空格后非空；长度 1-20 字符（与前端 `MAX_NAME_LEN` 一致） |

**响应（成功）**：

```json
{
  "ok": true,
  "data": {
    "id": "h_l9x2k4a7b1c3",
    "name": "每天散步 20 分钟",
    "createdAt": "2026-10-04",
    "records": []
  }
}
```

`data` 形状与 GET 返回的单个习惯**完全一致**（同一个字段映射层），前端拿到后可直接 push 进本地列表，不需要二次转换。

**响应（失败）**：

| code | 触发条件 | message 示例 |
|---|---|---|
| `BAD_REQUEST` | name 缺失 / 非字符串 / 去空格后为空 | 「习惯名称不能为空」 |
| `BAD_REQUEST` | 请求体不是合法 JSON | 「请求体必须是合法的 JSON」 |
| `BAD_REQUEST` | name 超过 20 字符 | 「习惯名称最多 20 个字」 |
| `CONFLICT` | 已存在同名习惯（防重复提交） | 「已有同名习惯：每天散步 20 分钟」 |
| `INTERNAL` | 数据库写入失败 | 「数据库写入失败：…」 |

> `CONFLICT` 为 Day 18 新增错误码（HTTP 语义 409），用于表达「请求本身合法，但与现有资源冲突」。

**防重复提交的机制**（今日一问的答案）：

正常提交重复的防御分两层——

1. **函数层：写入前先查同名**（`WHERE name = $1`），命中则返回 `CONFLICT` 并带上已存在的名字。这是人话级的拦截，消息能直接展示给用户。
2. **数据库层：`habits.name` 建唯一索引**（migration `20261004...add_habits_name_unique`）。这是真正的铁律——即使两个请求同时挤过第 1 层的检查（竞态窗口），第二条 INSERT 也会被唯一约束挡下来，函数捕获 `23505` 错误码转成 `CONFLICT`。

只做第 1 层是「检查后写入」（check-then-act），并发下不可靠；两层都做，第 2 层兜底，才是真防住。

**注意**：加唯一索引前需要先清理历史数据里的重名（种子 6 条无重名，实测确认）。

**实现**：同一个 Event 云函数 `habits` 的 POST 分支（复用同一路由 `/api/habits`，按 HTTP 方法分流）→ 网关路由 `/api/habits`（匿名访问）。

**实测（2026-10-04 部署当天）**：

| 场景 | 结果 |
|---|---|
| `POST {"name":"每天散步 20 分钟"}` | `{"ok":true,"data":{"id":"h_mutg1brj2478","name":"每天散步 20 分钟","createdAt":"2026-10-04","records":[]}}` ✅ |
| 数据库行数 | habits 6 → **7 行**（`SELECT * FROM habits` 确认新行在库）✅ |
| 读回 `?id=h_mutg1brj2478` | 返回刚写入的那条 ✅ |
| 重复提交同名 | `{"ok":false,"error":{"code":"CONFLICT","message":"已有同名习惯：每天散步 20 分钟"}}` ✅ |
| `{}` 缺 name | `BAD_REQUEST`「习惯名称不能为空」✅ |
| `{"name":"   "}` 全空格 | `BAD_REQUEST`「习惯名称不能为空」✅ |
| 21 字超长 | `BAD_REQUEST`「习惯名称最多 20 个字」✅ |
| `not json` 非法请求体 | `BAD_REQUEST`「请求体必须是合法的 JSON」✅ |

### ⚠️ Day 18 踩坑：云函数写库的 GRANT 权限（Day 19 写 toggle/DELETE 必读）

首次 POST 返回 `permission denied for table habits`。排查结论：

- **`app.rdb()` 免密访问用的角色是 `anon`，不是 `service_role`。** Day 16 建表时平台自动 GRANT 给 `anon` 的只有 `SELECT`（所以 Day 17 读接口一路正常，直到 Day 18 第一次写才暴露）。
- 修复：`GRANT INSERT ON TABLE habits TO anon`（走 `managePgDatabase action=execute`）。
- **Day 19 写 toggle / DELETE 接口前，先补相应权限**：
  - toggle 打卡（写 `records` 表）→ `GRANT INSERT, DELETE ON TABLE records TO anon`
  - 删除习惯（写 `habits` 表）→ `GRANT DELETE ON TABLE habits TO anon`
- 权限与 RLS 是两件事：本例 RLS 全程关闭，纯粹是表级 GRANT 没给写权限。

### PATCH /api/habits（Day 22）

改接口：修改一个已存在习惯的名称。今日主任务 ①。

**为什么用 `?id=` 而不是 `/api/habits/:id`**：网关路由是**精确路径** `/api/habits`（`queryGateway listRoutes` 确认，不带通配符），
子路径 `/api/habits/h_xxx` 匹配不到云函数。所以沿用 GET 详情已有的 `?id=` 风格，靠 HTTP 方法区分操作，网关侧零改动。

**请求**：`PATCH /api/habits?id=h_seed_001`

| 参数 | 位置 | 必填 | 说明 |
|---|---|---|---|
| id | query `?id=` 或 body 里的 `id` | 是 | 两者都传时以 query 为准 |
| name | body | 是 | 新名称，校验规则与 POST 完全一致（去空格非空，1-20 字） |

```json
{ "name": "每天 6 杯水" }
```

**响应（成功）**：

```json
{
  "ok": true,
  "data": { "id": "h_seed_001", "name": "每天 6 杯水", "createdAt": "2026-09-20", "records": [] },
  "changed": { "name": { "from": "每天 8 杯水", "to": "每天 6 杯水" } }
}
```

| 字段 | 说明 |
|---|---|
| data | 修改**后**的完整习惯，形状与 GET 详情一致（改完再读回一次，不是拿请求体拼出来的） |
| changed | 变更前后对照。让调用方一眼看到「改了什么」，不需要自己记着旧值 |

**响应（失败）**：

| code | 触发条件 | message 示例 |
|---|---|---|
| `BAD_REQUEST` | 缺少 id | 「缺少参数 id」 |
| `BAD_REQUEST` | name 缺失 / 空 / 超 20 字（同 POST） | 「习惯名称不能为空」 |
| `BAD_REQUEST` | 请求体不是合法 JSON / 不是对象 | 「请求体必须是合法的 JSON」 |
| `NOT_FOUND` | id 不存在 | 「习惯不存在：h_xxx」 |
| `CONFLICT` | 新名字与**另一个**习惯重名 | 「已有同名习惯：每天 6 杯水」 |
| `INTERNAL` | 数据库写入失败 | 「数据库更新失败：…」 |

> **关于「改成自己现在的名字」**：允许，返回 `ok:true` 且 `changed.name.from === changed.name.to`，
> 不报 CONFLICT。重名检查排除自己 —— 否则「保存但没改动」会被误判成冲突。

### DELETE /api/habits（Day 22）

删接口：删除一个习惯。今日主任务 ②。

**请求**：`DELETE /api/habits?id=h_seed_001`（无请求体）

| 参数 | 位置 | 必填 | 说明 |
|---|---|---|---|
| id | query `?id=` 或 body 里的 `id` | **是（强制）** | 缺 id 直接拒绝，见下方「确认机制」 |

**响应（成功）**：

```json
{
  "ok": true,
  "data": { "id": "h_seed_001", "name": "每天 8 杯水", "createdAt": "2026-09-20", "deletedRecords": 7 }
}
```

| 字段 | 说明 |
|---|---|
| data | **删除前**的快照：删了什么名字的习惯、连带删了多少条打卡记录。删完数据就没了，这份快照是唯一的留痕 |
| deletedRecords | 被外键 `ON DELETE CASCADE` 连带删掉的 records 行数 |

**响应（失败）**：

| code | 触发条件 | message 示例 |
|---|---|---|
| `BAD_REQUEST` | 缺少 id | 「删除必须指定 id，不支持批量删除」 |
| `NOT_FOUND` | id 不存在 | 「习惯不存在：h_xxx」 |
| `INTERNAL` | 数据库删除失败 | 「数据库删除失败：…」 |

#### ⚠️ 删除的三道确认（今日一问的答案）

删除比新增危险，因为它**不可逆、有连带、且失败往往静默**。本项目在三层各加一道确认：

| 层 | 确认手段 | 防的事 |
|---|---|---|
| 前端交互 | `window.confirm('确定删除这个习惯吗？删除后记录不保留。')`（app.js:623） | 手滑点错 |
| 服务端入参 | **缺 id 直接 `BAD_REQUEST`，拒绝批量删除**。没有「不带条件就删全部」的入口 | 一个误请求清空整表 |
| 服务端执行 | 先 `findById` 读到才删；读不到返回 `NOT_FOUND`，**不做「删了但不知道删没删成」** | 静默失败：调用方以为删了，其实没删 |

再加一条留痕：响应返回删除前快照（名字 + 连带记录数），云函数日志 `delete_done` 同步记一条，
数据虽然没了，但「删过什么、删了多少」可追溯。

> **级联提醒**：`records.habit_id → habits.id` 外键是 `ON DELETE CASCADE`，
> 删一个习惯会连带删掉它的全部打卡记录。所以 `anon` 角色除了 habits 的 DELETE，
> 还必须拿到 records 的 DELETE 权限（Day 22 已 `GRANT`），否则级联会因权限不足报错。

### ⚠️ Day 22 踩坑预告：GRANT 要一次补齐（Day 23 写 toggle 必读）

Day 22 补权限时确认的现状（`information_schema.role_table_grants`）：

| 表 | anon 原有 | Day 22 补后 |
|---|---|---|
| habits | `INSERT,SELECT` | `DELETE,INSERT,SELECT,UPDATE` |
| records | `SELECT` | `DELETE,SELECT,INSERT` |

- PATCH 需要 `habits.UPDATE`；DELETE 需要 `habits.DELETE` **加上 `records.DELETE`**（级联）。
- `records.INSERT` 本计划 Day 23 做 toggle 时再给，Day 22 为了**验证级联删除**（先插 3 条记录再删，
  看 `deletedRecords` 是否真等于 3）提前加上了 —— 顺带让 Day 23 少一道准备工作。
- 权限与 RLS 依旧是两件事：本例 RLS 全程关闭，纯粹表级 GRANT。

## 三、预留接口（Day 19+ 规划，未实现）

### ℹ️ Day 19 代码重构（**契约零变更**）

Day 19 把 `functions/habits/index.js`（231 行单文件）拆成四层，**只动内部结构，接口契约一字未改**：

```
index.js           入口：按 HTTP 方法分流
handlers/habits.js 编排：读参数 → 调 repo → 组装响应
repo/habits.js     数据访问：全项目唯一的 SQL 所在地
lib/db.js          连接：唯一 require('@cloudbase/node-sdk') 的文件
lib/{response,log,format,validate,request}.js  公共工具
```

详见 TECH_DESIGN.md 第 6 节。以下全部保持不变：接口路径、请求参数、响应字段名与拼写、
错误码（BAD_REQUEST / NOT_FOUND / CONFLICT / INTERNAL）、每一句中文错误文案。

验证方式（三层）：本地回归 73/73、新旧差分对比 26/26 一致、部署后公网回归 29/29。

| 接口 | 方法 | 用途 | 状态 |
|---|---|---|---|
| /api/habits | PATCH | 改习惯名（`?id=`） | ✅ **Day 22 已实现**（见第二节） |
| /api/habits | DELETE | 删习惯（`?id=`，带三道确认） | ✅ **Day 22 已实现**（见第二节） |
| /api/habits/:id/toggle | POST | 打卡/取消打卡 | ⬜ 待 Day 23。落地形式待定：网关是精确路由，大概率同样走 `?id=` + POST，或新增 `/api/habits/toggle` 路由 |

> 数据 schema 沿用 TECH_DESIGN.md 第 3 节，云端只是把 localStorage 的 `habits` 结构搬到服务端，字段不变。

### Day 16 数据库就绪备注（2026-10-02）

- CloudBase PG 已建表：`habits` + `records`（migration `20261002105543_create_habits_records`，建表 SQL 见 `db/schema.sql`）
- 种子数据：6 个习惯 + 20 条打卡（`db/seed.sql`，幂等可重跑）
- **Day 17 写读接口时注意**：平台对 `public.*` 表默认启用 RLS 且无策略，浏览器直连（`app.rdb()`）会被拒；云函数用服务端凭据（admin/service_role）访问不受影响，接口走云函数即可。若后续要前端直连，先 `CREATE POLICY`。

## 四、变更记录

| 日期 | 变更 |
|---|---|
| 2026-10-01（Day 15） | 初版：通用约定 + /api/health + 预留接口规划 |
| 2026-10-02（Day 16） | 数据库备注：PG 建表完成（habits/records），seed 已跑，RLS 注意事项 |
| 2026-10-03（Day 17） | GET /api/habits 契约：列表 + ?id= 详情 + ?limit= 条数限制；字段映射表（snake_case → camelCase） |
| 2026-10-04（Day 18） | POST /api/habits 契约：新建习惯（name 校验 + 同名冲突 CONFLICT）；新增 CONFLICT 错误码；防重复提交两层机制说明 |
| 2026-10-05（Day 19） | **契约未变**。仅重构云函数内部结构（拆为 index/handlers/repo/lib 四层），见 TECH_DESIGN.md 第 6 节 |
| 2026-10-06（Day 20） | **契约未变**。前端正式接线：公网页面从 GET /api/habits 取数；新增「跨域（CORS）规则」小节，并订正 Day 18 记录的 ACAO 结论（白名单机制，而非笼统回显） |
| 2026-10-08（Day 22） | 新增 `PATCH /api/habits`（改习惯名，响应带 `changed` 前后对照）与 `DELETE /api/habits`（删习惯，响应带删除前快照 `deletedRecords`）；删除的三道确认机制；都走 `?id=` + 方法分流（网关是精确路由，子路径不通）；补 `anon` 的 UPDATE/DELETE 权限（含 records 级联所需） |
| 2026-10-09（Day 23） | **响应字段未变**。新增「错误文案约定」小节：所有 `message` 统一中文人话且不含原始错误内容，原文只进日志；新增 `lib/errors.js` 做翻译与兜底；请求日志补齐「结果」（`request_done` 带 ok / code / ms） |
