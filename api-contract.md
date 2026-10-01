# API 契约（api-contract.md）· Day 15

> 作用：前后端对接口的「合同」。Day 16-20 每加一个真实接口，先改这份文档再写代码（同 R4 规则的精神：文档与实现不分叉）。
> 现状：只有 `/api/health` 是真的，其余是 Day 16-20 的预留规划。

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

## 三、预留接口（Day 16-20 规划，未实现）

| 接口 | 方法 | 用途 | 对应现有前端行为 |
|---|---|---|---|
| /api/habits | GET | 拉取习惯列表（含 records） | `load()` 替代 localStorage 读取 |
| /api/habits | POST | 新建习惯 `{ name }` | `addHabit()` |
| /api/habits/:id/toggle | POST | 打卡/取消打卡 | `toggleHabit()` |
| /api/habits/:id | DELETE | 删除习惯（带确认） | 删除按钮 |

> 数据 schema 沿用 TECH_DESIGN.md 第 3 节，云端只是把 localStorage 的 `habits` 结构搬到服务端，字段不变。

## 四、变更记录

| 日期 | 变更 |
|---|---|
| 2026-10-01（Day 15） | 初版：通用约定 + /api/health + 预留接口规划 |
