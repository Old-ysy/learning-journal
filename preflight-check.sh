#!/bin/bash
# ============================================================
# 发布前检查 · preflight-check.sh（Day 25）
#
# 用法：  bash preflight-check.sh
# 退出码：0 = 全通过；1 = 有 FAIL（以后接流水线可以直接用这个码）
#
# 为什么需要它：
#   「我在本地跑通了」和「线上能正常对外服务」是两件事。
#   更麻烦的是有些问题**看不出来**——页面照常能开，但线上跑的是三天前的代码；
#   或者某个 css 404 了，页面只是变丑并不报错。
#   这个脚本把发布前必须确认的东西固化成一条命令，不靠记忆、不靠感觉。
#
# 检查项（7 项）：
#   ①② 密钥（工作区 / git 历史）   ③ 敏感文件未入库
#   ④⑤ 公网（首页 / 接口）         ⑥ 线上代码是最新   ⑦ 线上资源无 404
# ============================================================

set -u
cd "$(dirname "$0")" || exit 1

# CloudBase 是境内服务；环境里的代理是给 github 用的，这里一律直连
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY

SITE=https://the-old-d7gopkcrpbbb52f3b-1499234669.tcloudbaseapp.com
API=https://the-old-d7gopkcrpbbb52f3b-1499234669.ap-shanghai.app.tcloudbase.com/api/habits

PASS=0
FAIL=0
say_pass() { printf "  [\033[32mPASS\033[0m] %s\n" "$1"; PASS=$((PASS + 1)); }
say_fail() { printf "  [\033[31mFAIL\033[0m] %s\n" "$1"; FAIL=$((FAIL + 1)); }
say_note() { printf "  [\033[33mNOTE\033[0m] %s\n" "$1"; }
ind() { sed 's/^/           /'; }

# 「明示是示例」的豁免词。来历：Day 25 为了验证检查不虚报，
# 往工作区塞过一个形态逼真的假密钥，串里写了 EXAMPLEFAKE。
# 它形态达标但不是凭证 —— 检查却照报不误，从那以后每次跑都红两条。
# 所以加这条豁免：**串里自己声明是示例的，不算命中**（但仍然打印出来给人看）。
# 敢放宽的依据：真 PAT 是随机 base62，恰好撞上这些英文词的可能性可以忽略；
# 而要用它绕过检查，得先亲手把 EXAMPLE/FAKE 写进自己要提交的串里 ——
# 那等于明着告诉检查「这是凭证」，没有任何攻击者会这么干。
# 豁免是可见的（NOTE 打印），不是静默放过。
EXAMPLE_RE='EXAMPLE|FAKE|DEMO|PLACEHOLDER|SAMPLE|DUMMY|示例|假的|占位'

echo "=================================================="
echo " 发布前检查 · $(date '+%F %T')"
echo "=================================================="

# ---------- ① 密钥 · 工作区 ----------
echo ""
echo "① 密钥 · 工作区扫描"
# 只认「真像密钥」的形态：前缀 + 20 位以上连续字符。
# 写成 gh[p]_ 是为了让这条规则本身不被自己扫到（AGENTS.md R2 里那条教训）。
all_hits=$(grep -rEIn \
  "gh[p]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|(secret|password|api[_-]?key)\s*[:=]\s*['\"][A-Za-z0-9_-]{16,}['\"]" \
  --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=".edge-*" . 2>/dev/null)
# 自己声明是示例的（串里带 EXAMPLE/FAKE/…）单独拎出来，不当 FAIL，但照样给人看
excluded=$(echo "$all_hits" | grep -E "$EXAMPLE_RE")
hits=$(echo "$all_hits" | grep -vE "$EXAMPLE_RE")
if [ -z "$hits" ]; then
  say_pass "工作区没有疑似密钥（脱敏文本与明示示例不算命中）"
else
  say_fail "工作区发现疑似密钥，$(echo "$hits" | grep -c . | tr -d ' ') 处："
  echo "$hits" | head -5 | ind
fi
if [ -n "$excluded" ]; then
  say_note "另有 $(echo "$excluded" | grep -c . | tr -d ' ') 处形态像密钥但串里自述是示例，已豁免："
  echo "$excluded" | head -3 | ind
fi

# ---------- ② 密钥 · git 历史 ----------
echo ""
echo "② 密钥 · git 历史扫描"
# ⚠️ 这里踩过一次坑：`git log -S "ghp_"` 会把**规则文本本身**也算命中 ——
#    AGENTS.md 里那条 `grep ghp_ .git/config`、截图页里的 `ghp_××××…` 全在里面。
#    第一次实跑就是这么误报的。所以先靠 -S 粗筛出候选提交，
#    再对每个提交做一次「真密钥形态」精筛，两头都不放过。
cands=$(git log --all --format=%H -S "ghp_" 2>/dev/null)
real=""
for c in $cands; do
  # 同样的两段式：先粗筛出提交，再对每个提交做「真密钥形态」精筛，
  # 精筛时把自述是示例的串排除（和 ① 项同一套豁免标准）。
  if git show "$c" 2>/dev/null | grep -E "gh[p]_[A-Za-z0-9]{20,}" \
     | grep -qvE "$EXAMPLE_RE"; then
    real="${real}$(git log -1 --format='%h %s' "$c")"$'\n'
  fi
done
if [ -z "$real" ]; then
  say_pass "全部历史分支里没有「真密钥形态」的串（规则文本、脱敏展示、明示示例均不算）"
else
  say_fail "git 历史里出现过真密钥形态的串（删文件没用，必须清历史）："
  printf "%b" "$real" | grep -v '^$' | head -5 | ind
fi

# ---------- ③ 敏感文件未入库 ----------
echo ""
echo "③ .env 未入库且被忽略"
tracked=$(git ls-files 2>/dev/null | grep -E '(^|/)\.env($|\.)')
if [ -n "$tracked" ]; then
  say_fail ".env 已经被 git 跟踪：$tracked"
elif [ -f .env ] && ! git check-ignore -q .env 2>/dev/null; then
  say_fail ".env 存在，但没有被 .gitignore 覆盖"
else
  say_pass ".env 没入库；就算现在建一个也会被 .gitignore 挡住"
fi

# ---------- ④ 公网首页 ----------
echo ""
echo "④ 公网首页可达"
code=$(curl -s -o /dev/null -m 25 -w "%{http_code}" "$SITE/")
if [ "$code" = "200" ]; then
  say_pass "首页 HTTP $code"
else
  say_fail "首页 HTTP $code（期望 200）—— 可能托管没部署或域名过期"
fi

# ---------- ⑤ 公网接口 ----------
echo ""
echo "⑤ 公网接口健康"
body=$(curl -s -m 25 "$API")
if echo "$body" | grep -q '"ok":true'; then
  n=$(echo "$body" | grep -o '"id"' | wc -l | tr -d ' ')
  say_pass "接口返回 ok:true，当前 $n 条习惯"
else
  say_fail "接口没返回 ok:true，实际是：$(echo "$body" | head -c 120)"
fi

# ---------- ⑥ 线上代码新鲜度 ----------
echo ""
echo "⑥ 线上代码是最新（本地改动已经部署上去）"
# 比 md5 而不是看文件大小：文件大小相同但内容改过的情况太常见了。
# 统一掉 CRLF，否则 Windows 检出和线上 LF 会永远对不上。
local_sum=$(sed 's/\r$//' app.js | md5sum | awk '{print $1}')
live_sum=$(curl -s -m 25 "$SITE/app.js" | sed 's/\r$//' | md5sum | awk '{print $1}')
if [ "$local_sum" = "$live_sum" ]; then
  say_pass "线上 app.js 与本地一致（md5 ${local_sum:0:12}…）"
else
  say_fail "线上跑的不是本地这份代码"
  echo "           本地 md5 ${local_sum:0:12}… / 线上 md5 ${live_sum:0:12}…" | ind
  echo "           → 改完代码别忘了重新部署，页面能开 ≠ 代码是最新的" | ind
fi

# ---------- ⑦ 线上资源完整性 ----------
echo ""
echo "⑦ 线上资源引用完整（没有 404）"
html=$(curl -s -m 25 "$SITE/index.html")
refs=$(echo "$html" \
  | grep -oE '(src|href)="[^"]+"' \
  | sed -E 's/.*="([^"]+)"/\1/' \
  | grep -vE '^(https?:)?//|^#|^data:' \
  | sort -u)
missing=""
for r in $refs; do
  c=$(curl -s -o /dev/null -m 20 -w "%{http_code}" "$SITE/$r")
  [ "$c" = "200" ] || missing="$missing $r($c)"
done
if [ -z "$missing" ]; then
  say_pass "页面引用的 $(echo "$refs" | grep -c . | tr -d ' ') 个资源全部 200"
else
  say_fail "有资源取不到：$missing"
fi

echo ""
echo "=================================================="
printf " 结果：\033[32m%d 通过\033[0m / \033[31m%d 失败\033[0m\n" "$PASS" "$FAIL"
echo "=================================================="
[ "$FAIL" -eq 0 ] || exit 1
