# 第 3 周验收表（Day 15 - Day 21）

> 填写人：枸杞泡茶 ｜ 验收时间：2026-10-07 ｜ 范围：Day 15-21（云函数 / 数据库 / 前后端联调 / 上线部署）
> 原则：**每一项都要有可复现的证据**。拿不到证据的不写 PASS，拿不到证据的如实标记 FAIL 或「未执行」。

## 一、验收结果总览

| 结论 | 数量 | 项 |
|---|---|---|
| ✅ PASS | 14 | 1-14 |
| ❌ FAIL | 1 | 15（打卡/删除未写回云端） |
| ⚪ 未执行 | 2 | 16（浏览器控制台实测）、17（演示视频） |

---

## 二、逐项验收（含证据）

### 1. 云函数在线可用 `PASS`

| | |
|---|---|
| **标准** | 公网能调通云函数，返回 `ok: true` |
| **证据** | `curl https://...ap-shanghai.app.tcloudbase.com/api/health` → `{"ok":true,"service":"habit-tracker","api":"health","timestamp":"...","method":"GET"}`（HTTP 200，709ms） |
| **备注** | Day 15 部署，至今未重启过 |

### 2. 数据库有真实数据 `PASS`

| | |
|---|---|
| **标准** | 库里有种子数据，且能被接口读出来 |
| **证据** | `GET /api/habits` → 7 条习惯，打卡记录合计 20 条 |
| **备注** | 无脏数据。Day 21 验收时插入的 `Day21 验收写入` 已用 SQL 清理，清理后复核仍是 7 条 |

### 3. 读接口（GET） `PASS`

| | |
|---|---|
| **标准** | 支持列表 / `?id=` 详情 / `?limit=` 条数限制 |
| **证据** | `GET /api/habits` → HTTP 200、`ok:true`、`data.length = 7` |

### 4. 写接口（POST） `PASS`

| | |
|---|---|
| **标准** | 传合法 name 能新建，返回新 id |
| **证据** | `POST /api/habits {"name":"Day21 验收写入"}` → `{"ok":true,"data":{"id":"h_muxx2po0hyz7","name":"Day21 验收写入"}}`（460ms） |

### 5. 写后可读回 `PASS`

| | |
|---|---|
| **标准** | 用写入返回的 id 去查，能查到同一条 |
| **证据** | `GET /api/habits?id=h_muxx2po0hyz7` → `found: true`、`name: "Day21 验收写入"`；列表条数由 7 变 8 |
| **为什么单独列一项** | 写成功不等于写对。只有读回来才算数 |

### 6. 参数校验 `PASS`

| | |
|---|---|
| **标准** | 空名称被拒绝，给出中文原因 |
| **证据** | `POST {"name":"   "}` → `{"ok":false,"error":{"code":"BAD_REQUEST","message":"习惯名称不能为空"}}` |

### 7. 重名防御 `PASS`

| | |
|---|---|
| **标准** | 同名习惯返回 CONFLICT，且数据库唯一索引兜底 |
| **证据** | 重复 POST 同名 → `{"ok":false,"error":{"code":"CONFLICT","message":"已有同名习惯：Day21 验收写入"}}` |
| **备注** | 函数预检 + `idx_habits_name_unique` 唯一索引两层，防的是并发下的 check-then-act 竞态 |

### 8. 不存在的 id `PASS`

| | |
|---|---|
| **标准** | 返回 NOT_FOUND，不是空数据也不是 500 |
| **证据** | `GET /api/habits?id=h_not_exist_zzz` → `{"ok":false,"error":{"code":"NOT_FOUND"}}` |

### 9. 公网可访问 `PASS`

| | |
|---|---|
| **标准** | 公网 URL 能打开首页，且是 HTML 不是下载 |
| **证据** | `curl https://the-old-d7gopkcrpbbb52f3b-1499234669.tcloudbaseapp.com/` → HTTP 200、`content-type: text/html`；`/app.js` 200（25288B）、`/style.css` 200（10518B） |
| **地址** | `https://the-old-d7gopkcrpbbb52f3b-1499234669.tcloudbaseapp.com/` |

### 10. 页面展示真实数据 `PASS`

| | |
|---|---|
| **标准** | 首页列表不是假数据，是从数据库拉出来的 |
| **证据** | `.workbuddy/tmp/verify-day21-render.js` —— 加载**线上那份 app.js**，用 **Node 真网络**打**线上接口**，结果 6/6 PASS：state.habits = 7 条，渲染出 7 个 li，页脚写入「数据更新于 17:54:08」，来源标签「列表来自云端数据库（只读）」 |
| **为什么值得单列** | curl 只能拿到 HTML 骨架，列表是 JS 拉的。这一项必须跑起来才算数 |

### 11. 跨域许可 `PASS`

| | |
|---|---|
| **标准** | 静态站域名能跨域调到接口 |
| **证据** | 带 `Origin: https://the-old-...tcloudbaseapp.com` 请求接口 → `access-control-allow-origin: https://the-old-...tcloudbaseapp.com`、`access-control-allow-credentials: true` |
| **备注** | Day 20 订正过结论：网关是**查安全域名白名单**回显 ACAO，不是无条件回显 |

### 12. 云函数分层 `PASS`

| | |
|---|---|
| **标准** | SQL 只出现在 repo 层 |
| **证据** | `grep -rn "db\.from" functions/habits/` → 只有 `repo/habits.js` 的 4 处真实调用；`lib/db.js:14` 那处是注释；index.js 与 handlers 里 0 处 |

### 13. 本地回归 `PASS`

| | |
|---|---|
| **标准** | 老功能没被新改动撞倒 |
| **证据** | Day 11 13/13 ｜ Day 12 23/23 ｜ Day 13 43/43 ｜ Day 14 19/19 ｜ Day 20 20/20 —— **共 118 条断言全绿** |
| **备注** | Day 20 接线时靠 `location.protocol` 分流，测试夹具没有 protocol 字段会自动落回本地分支，所以这四套老测试一行没改 |

### 14. 文档与实现一致 `PASS`

| | |
|---|---|
| **标准** | 接口、结构、跨域规则都写进文档了 |
| **证据** | `api-contract.md`（三接口契约 + 错误码 + 跨域规则 + 变更记录）、`TECH_DESIGN.md`（第 6 节分层结构 + 两张图）、`README.md`（三种运行方式含公网版） |

### 15. 打卡 / 删除写回云端 `FAIL`

| | |
|---|---|
| **标准** | 打卡、删除能写进数据库，刷新还在 |
| **实际情况** | **未实现**。Day 20 只做了只读接线：列表来自云端，打卡和删除仍写 localStorage，刷新会被云端数据覆盖 |
| **为什么没做** | Day 20 任务明确「今日不做：改后端代码」；toggle / DELETE 接口在 `api-contract.md` 三节里还是「预留」状态 |
| **已做的兜底** | 页面页脚明写「Day 20 范围：只读接线，打卡 / 删除暂未写入云端」，避免看着像 bug |
| **下一步** | 补 `GRANT DELETE`（anon 目前只有 INSERT,SELECT）+ 实现 toggle / DELETE 接口 |

### 16. 浏览器控制台实测无报错 `未执行`

| | |
|---|---|
| **标准** | 真实浏览器 F12 里无 error |
| **实际情况** | **没做成**。装了 agent-browser + Chromium（155，198MB），但 `open` 冷启动卡住超过 5 分钟，终止了 |
| **替代证据** | 子资源全部 200（无 404 → 不会有资源加载类报错）；app.js 语法检查通过；真实接口往返成功；渲染验证 6/6 |
| **诚实结论** | 这属于「间接推断」，**不等于**真浏览器实测。要补足就在浏览器里打开首页看一眼 F12 |

### 17. 3 分钟演示视频 `未执行`

| | |
|---|---|
| **说明** | 余力加练项，本次未做 |

---

## 三、同伴交叉验证（三行结论）

> ⚠️ 如实说明：本次交叉验证由 **AI 同伴**完成，**不是真人同学**。真人交叉验证待补。

**① 可打开** —— 公网首页 `https://the-old-d7gopkcrpbbb52f3b-1499234669.tcloudbaseapp.com/` 直接访问返回 HTTP 200、`content-type: text/html`，引用的 `app.js` / `style.css` 均 200，无需登录、无需本地环境，换台设备粘贴地址即可打开。

**② 可读写** —— 读：`GET /api/habits` 返回 7 条真实习惯、20 条打卡记录；写：`POST` 新建成功拿到新 id `h_muxx2po0hyz7`，用该 id 回查确认数据一致（写入的测试数据已清理，库恢复 7 条）。读写均为跨 HTTPS 域名调用，网关按白名单回显 ACAO，未被浏览器拦截。

**③ 无报错** —— 接口侧三类错误路径均按契约返回中文错误码（`BAD_REQUEST` / `CONFLICT` / `NOT_FOUND`），无 500、无异常堆栈；前端侧 118 条本地断言全绿，真实数据渲染验证 6/6 通过。⚠️ 真浏览器 F12 实测未完成（Chromium 启动卡住），此项为间接推断，建议人工补一次。

---

## 四、证据速查（可复现命令）

```bash
# ① 公网首页
curl -I https://the-old-d7gopkcrpbbb52f3b-1499234669.tcloudbaseapp.com/

# ② 健康接口
curl https://the-old-d7gopkcrpbbb52f3b-1499234669.ap-shanghai.app.tcloudbase.com/api/health

# ③ 读列表
curl https://the-old-d7gopkcrpbbb52f3b-1499234669.ap-shanghai.app.tcloudbase.com/api/habits

# ④ 写一条（记得清理）
curl -X POST https://the-old-d7gopkcrpbbb52f3b-1499234669.ap-shanghai.app.tcloudbase.com/api/habits \
  -H 'Content-Type: application/json' -d '{"name":"验收测试"}'

# ⑤ 跨域是否放行
curl -D - -o /dev/null https://the-old-d7gopkcrpbbb52f3b-1499234669.ap-shanghai.app.tcloudbase.com/api/habits \
  -H 'Origin: https://the-old-d7gopkcrpbbb52f3b-1499234669.tcloudbaseapp.com' | grep -i access-control

# ⑥ 分层是否守住
grep -rn "db\.from" functions/habits/

# ⑦ 本地回归
node .workbuddy/tmp/test-day11.js   # 13/13
node .workbuddy/tmp/test-day12.js   # 23/23
node .workbuddy/tmp/test-day13.js   # 43/43
node .workbuddy/tmp/test-day14.js   # 19/19
node .workbuddy/tmp/test-day20.js   # 20/20
```
