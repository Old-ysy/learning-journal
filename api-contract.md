# API 契约（api-contract.md）· Day 15

> 作用：前后端对接口的「合同」。Day 16-20 每加一个真实接口，先改这份文档再写代码（同 R4 规则的精神：文档与实现不分叉）。
> 现状：`/api/health`（Day 15）、`GET /api/habits`（Day 17）、`POST /api/habits`（Day 18）是真的，其余是 Day 19+ 的预留规划。

## 一、通用约定

| 项 | 约定 |
|---|---|
| API 基础地址 | `https://the-old-d7gopkcrpbbb52f3b-1499234669.ap-shanghai.app.tcloudbase.com`（CloudBase HTTP 网关默认域名，云函数路由挂在 `/api/*`） |
| 前端 mock 版页面 | `https://the-old-d7gopkcrpbbb52f3b-1499234669.tcloudbaseapp.com/`（静态托管，Day 8 的 dashboard mock 版） |
| 环境 ID | `the-old-d7gopkcrpbbb52f3b`（上海地域 · 体验版 · 到期 2027-04-01） |
| 数据格式 | 请求与响应都是 `application/json; charset=utf-8` |
| 时间格式 | ISO 8601 UTC（如 `2026-10-01T08:00:00.000Z`），前端负责转本地显示 |
| 习惯 id | 服务端生成的字符串（现有 `h_` 前缀规则沿用） |
| 日期 key | `YYYY-MM-DD`（与现有 localStorage records 一致） |

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

| 接口 | 方法 | 用途 | 对应现有前端行为 |
|---|---|---|---|
| /api/habits/:id/toggle | POST | 打卡/取消打卡 | `toggleHabit()` |
| /api/habits/:id | DELETE | 删除习惯（带确认） | 删除按钮 |

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
