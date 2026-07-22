#!/usr/bin/env bash
# experiment/instruments/agent-runners/run_pipeline.sh
set -euo pipefail

# === 变量初始化 ===
AGENT_NAME="claude"
TARGET_MODEL="claude-sonnet-4-6" # 在这里指定你要测试的模型
EXPERIMENT_ID="run_${AGENT_NAME}_$(date +%Y%m%d_%H%M%S)"
# 自动定位项目根目录
ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
BASELINE_DIR="${BASELINE_DIR:-$ROOT_DIR/baseline}"
WORKSPACE_DIR="$ROOT_DIR/experiment/workspace/$EXPERIMENT_ID"
IMAGE_NAME="local/${AGENT_NAME}-sandbox:latest"

echo "🚀 开始实验 | Agent: $AGENT_NAME | ID: $EXPERIMENT_ID"
echo "📦 Baseline 源目录: $BASELINE_DIR"

# 1. 检查环境变量
if [ -z "${CLAUDE_API_KEY:-}" ]; then
  echo "❌ 错误: 未检测到 CLAUDE_API_KEY 环境变量。"
  echo "请先执行: export CLAUDE_API_KEY='your-key-here'"
  exit 1
fi

# 2. 构建或更新沙盒镜像
echo "📦 [1/3] 检查并构建 Claude 沙盒镜像..."
docker build -t "$IMAGE_NAME" -f "$ROOT_DIR/experiment/instruments/agent-images/Dockerfile.claude" "$ROOT_DIR"

# 3. 准备隔离工作区
echo "📁 [2/3] 克隆 baseline 到隔离工作区..."
if [ ! -d "$BASELINE_DIR" ]; then
  echo "❌ 错误: baseline 目录不存在: $BASELINE_DIR"
  exit 1
fi
mkdir -p "$WORKSPACE_DIR"
cp -a "$BASELINE_DIR/"* "$WORKSPACE_DIR/"

# 4. 组装提示词
# 注意：最后一句“任务完成后退出”很重要，防止 CLI 在容器中一直挂起等待输入
TASK_PROMPT="你现在是一个高级架构师。请打开 frontend/src/routes/router.jsx 文件。在此文件的 import 区域下方添加一行注释：// TODO: Claude Code 已接入路由系统。修改文件后请立即退出。"

# 5. 启动容器并运行 Claude
echo "🤖 [3/3] 启动容器，Claude 正在接管工作区..."
docker run --rm \
  --name "${AGENT_NAME}-run-$EXPERIMENT_ID" \
  -v "$WORKSPACE_DIR":/workspace \
  -v "$HOME/.claude_agent_home:/home/codex_agent" \
  -w /workspace \
  -e CLAUDE_API_KEY="$CLAUDE_API_KEY" \
  "$IMAGE_NAME" \
 bash -c "claude -p \"$TASK_PROMPT\" --model $TARGET_MODEL --dangerously-skip-permissions"

echo "✅ 实验结束！"
echo "🔍 请检查 Claude 是否成功修改了文件："
echo "   cat $WORKSPACE_DIR/frontend/src/routes/router.jsx"