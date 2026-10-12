#!/bin/bash
# ============================================================
# 静态托管回退 · rollback-static.sh（Day 26）
#
# 用法（两步，中间那步是上传）：
#   bash rollback-static.sh prep   <标签或提交>   # ① 从 git 取出那一版的文件，放好
#   <用 CloudBase 控制台 / CLI / MCP 把这两个目录里的文件上传上去>
#   bash rollback-static.sh verify <标签或提交>   # ② 轮询线上，确认真的退回来了
#
# 为什么拆成两步：
#   上传这一步要走 CloudBase（控制台或 tcb CLI），不在本脚本能力范围内。
#   拆开之后，脚本负责「取对文件」和「确认退成功」两件最容易搞错的事，
#   上传那一棒交给人 —— 出事时你不用现想命令，照着打印出来的清单做就行。
#
# 计时口径：从 prep 敲下的那一刻，到 verify 确认线上已经回到目标版本。
#   包含人去上传的那段时间，不含「判断该不该回滚」的思考时间。
#
# 只回退静态托管的前端文件。云函数回退 / 数据恢复见 ROLLBACK.md（今天不实操）。
# ============================================================

set -u
cd "$(dirname "$0")" || exit 1

# CloudBase 是境内服务；环境里的代理是给 github 用的，这里一律直连
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY

SITE=https://the-old-d7gopkcrpbbb52f3b-1499234669.tcloudbaseapp.com
FILES="index.html app.js style.css dashboard.js mock-data.js"
STAMP=.workbuddy/tmp/rollback-start.txt

sub=${1:-}
target=${2:-}

now_ms() { date +%s%3N; }
die() { printf "\033[31m%s\033[0m\n" "$1"; exit 1; }

[ -n "$sub" ]   || die "用法：bash rollback-static.sh prep|verify <标签或提交>"
[ -n "$target" ] || die "缺目标版本。例：bash rollback-static.sh prep v0.9"

# 目标必须是一个真实存在的版本，且能取到文件 —— 打错标签比不回滚更糟
commit=$(git rev-parse --verify "${target}^{commit}" 2>/dev/null) \
  || die "找不到版本「$target」。用 git tag 看看有哪些标签。"
[ -n "$(git show "$commit:app.js" 2>/dev/null)" ] \
  || die "版本「$target」里没有 app.js，可能不是这个项目的版本。"

case "$sub" in

  prep)
    echo "=================================================="
    echo " 回退准备 · 目标 ${target}"
    echo "=================================================="
    git log -1 --format=' 版本：%h  %s%n 提交：%ad%n 作者：%an' --date=iso "$commit" | sed 's/^/ /'
    echo ""
    echo " 线上现在是什么版本（用于对比）："
    for f in $FILES; do
      live=$(curl -s -m 20 "$SITE/$f?nocache=$(date +%s%N)" | sed 's/\r$//' | md5sum | awk '{print $1}')
      echo "   $f  线上 ${live:0:12}…"
    done
    echo ""

    now_ms > "$STAMP"      # 计时起点：从这里开始算回滚耗时
    outdir=".workbuddy/tmp/rollback-${target}"
    mkdir -p "$outdir"
    echo " 取出的文件（放到 $outdir/）："
    for f in $FILES; do
      git show "$commit:$f" > "$outdir/$f" 2>/dev/null || die "取 $f 失败，中止。"
      size=$(wc -c < "$outdir/$f" | tr -d ' ')
      [ "$size" -gt 0 ] || die "$f 取出来是空的，中止 —— 宁可不回滚，也不要传空文件上去。"
      printf "   %-14s %8s bytes   md5 %s\n" \
        "$f" "$size" "$(sed 's/\r$//' "$outdir/$f" | md5sum | awk '{print $1}')"
    done
    echo ""
    echo " 下一步：把上面这 $(echo "$FILES" | wc -w | tr -d ' ') 个文件上传到静态托管根目录（覆盖同名文件）"
    echo " 传完执行：bash rollback-static.sh verify ${target}"
    ;;

  verify)
    [ -f "$STAMP" ] || die "没找到计时起点（$STAMP），先跑 prep 再跑 verify。"
    start=$(cat "$STAMP")
    outdir=".workbuddy/tmp/rollback-${target}"
    [ -d "$outdir" ] || die "没找到 $outdir，先跑 prep。"
    echo "=================================================="
    echo " 回退验证 · 目标 ${target}"
    echo "=================================================="
    allok=1
    for f in $FILES; do
      want=$(sed 's/\r$//' "$outdir/$f" | md5sum | awk '{print $1}')
      # CDN 有缓存，最多等 30 秒，每 2 秒探一次（带 cache-buster 取源站）
      got=""
      for i in $(seq 1 15); do
        got=$(curl -s -m 20 "$SITE/$f?nocache=$(date +%s%N)" | sed 's/\r$//' | md5sum | awk '{print $1}')
        [ "$got" = "$want" ] && break
        sleep 2
      done
      if [ "$got" = "$want" ]; then
        printf "  \033[32m✓\033[0m %-14s 线上已是目标版本  md5 %s…\n" "$f" "${want:0:12}"
      else
        printf "  \033[31m✗\033[0m %-14s 线上仍不是目标版本（期望 %s… 实际 %s…）\n" \
          "$f" "${want:0:12}" "${got:0:12}"
        allok=0
      fi
    done
    end=$(now_ms)
    ms=$((end - start))
    printf "\n 耗时：%d.%03d 秒（从 prep 到线上确认）\n" $((ms / 1000)) $((ms % 1000))
    if [ "$allok" -eq 1 ]; then
      printf " \033[32m回退完成：线上 = %s\033[0m\n" "$target"
    else
      printf " \033[31m回退未完成：还有文件没退回去，不要就此收工\033[0m\n" "$target"
      exit 1
    fi
    ;;

  *)
    die "未知子命令「$sub」。只能是 prep 或 verify。"
    ;;
esac
