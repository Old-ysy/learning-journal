# 今日打卡 · 习惯追踪器

一个纯本地的习惯打卡工具：只让你看到两件事——**今天做了什么**、**已经坚持了 N 天**。

> 完整的产品与技术文档见：`research.md`（调研）、`PRD.md`（需求）、`TECH_DESIGN.md`（技术设计）、`AGENTS.md`（协作规则）

---

## 运行方式

### 方式一：一行命令起本地服务（推荐）

```bash
python -m http.server 8000
```

然后浏览器打开 <http://localhost:8000>

> Windows 若提示找不到 python，把命令换成：
> ```bash
> py -m http.server 8000
> ```

### 方式二：直接双击打开

双击 `index.html` 用浏览器打开即可——本项目无构建步骤、无依赖，两种方式都能跑。

### 主视图 Demo（Day 8 · mock 数据版）

<http://localhost:8000/dashboard.html>

- 用 `mock-data.js` 里 8 个假习惯渲染，不读写 localStorage
- 支持 4 种页面状态切换，改 URL 参数即可：
  - `?state=success`（默认，有数据列表）
  - `?state=loading`（骨架屏）
  - `?state=empty`（空状态）
  - `?state=error`（错误 + 重试按钮）

### 停止服务

回到终端按 `Ctrl + C`。

---

## 项目结构

```
.
├── index.html        # 页面骨架（用户本地版，Day 7）
├── dashboard.html    # 主视图 mock 数据版（Day 8，含 4 种页面状态）
├── style.css         # 全部样式（单文件）
├── app.js            # 用户版逻辑：状态 / 事件 / 渲染 / 存储
├── dashboard.js      # 主视图逻辑：4 种状态渲染出口
├── mock-data.js      # 假数据（8 个习惯 + 错误对象）
├── research.md       # Day 3 调研（3 个同类产品对比、不做清单）
├── PRD.md            # Day 4 需求（6 项功能、12 条验收标准）
├── TECH_DESIGN.md    # Day 5 技术设计（技术路线、数据流图、数据结构）
├── AGENTS.md         # Day 6 协作规则
└── README.md         # 本文件（Day 7 运行说明）
```

---

## 功能

| # | 功能 | 说明 |
|---|---|---|
| F1 | 添加习惯 | 输入 1-20 字符，回车或点按钮；**最多 12 个** |
| F2 | 勾选 / 撤销 | 点复选框或点名字都能勾；再点一次撤销 |
| F3 | 连续天数 | 🔥 N 天，按自然日计算，断一天重新计 |
| F4 | 删除习惯 | 点 × 后二次确认 |
| F5 | 本地持久化 | 数据存 localStorage，刷新 / 重开浏览器不丢 |
| F6 | 空状态 | 没有习惯时显示引导文案 |

---

## 数据存在哪

全部存在浏览器的 `localStorage`，key 为 **`habits`**，格式（TECH_DESIGN.md 第 3 节）：

```json
{
  "habits": [
    {
      "id": "h_1695200000000",
      "name": "跑步 30 分钟",
      "createdAt": "2026-09-20",
      "records": ["2026-09-20", "2026-09-21"]
    }
  ]
}
```

在浏览器控制台执行下面任一行即可查看当前数据：

```js
localStorage.getItem('habits')   // 原始 JSON 字符串
__habits()                       // 解析后的对象（app.js 提供的调试函数）
```

> ⚠️ 数据只在这台设备的这个浏览器里。换浏览器、清缓存、无痕模式都会看不到数据——这是 Day 7 MVP 的已知取舍，Day 23 接入数据库后解决。

---

## 已知不做（本期范围外）

登录账号、云端同步、通知提醒、统计图表、社交、习惯分类、自定义频率、补打卡、主题切换、数据导出——完整清单见 `PRD.md` 第 7 节。

---

## 开发记录

| Day | 内容 |
|---|---|
| Day 2 | 建仓库、首次提交、`.gitignore` |
| Day 3 | 调研（`research.md`） |
| Day 4 | PRD（`PRD.md`） |
| Day 5 | 技术设计（`TECH_DESIGN.md`） |
| Day 6 | 协作规则（`AGENTS.md`） |
| Day 7 | **MVP 上线**（本文件 + `index.html` / `style.css` / `app.js`） |
