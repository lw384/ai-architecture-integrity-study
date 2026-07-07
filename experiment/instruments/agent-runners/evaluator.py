#!/usr/bin/env python3
# experiment/instruments/agent-runners/evaluator.py

import json
import subprocess
import sys
from pathlib import Path

def run_harness_evaluation(
    root_dir: Path,
    trajectory_dir: Path,
    run_id: str,
    task_id: str,
    pre_commit: str,
    post_commit: str
) -> dict:
    """
    Python wrapper 供实验流水线调用 Node.js Harness
    """
    harness_dir = root_dir / "harness"
    eval_output_path = trajectory_dir / "evaluation.json"
    manifest_path = trajectory_dir / "manifest.json"

    # 1. 写入实验清单 (Manifest)，告诉 Harness 该评测什么
    manifest_data = {
        "status": "ready_for_evaluation",
        "events": ["agent_started", "agent_completed"],
        "task_id": task_id,
        "baseline_commit": "baseline-sha-000", # 在完整版中应从 Git 提取
        "pre_commit": pre_commit,
        "rulepack_id": "rp_ts_react_nest_v1"
    }
    manifest_path.write_text(json.dumps(manifest_data, indent=2), encoding="utf-8")
    print(f"📄 [Evaluator] 实验清单 Manifest 已写入: {manifest_path}")

    # 2. 构造调用 Node.js Harness 的命令
    # (此时仍然使用 CLI 参数传递，后续阶段我们会在 evaluate.mjs 中彻底切换为读 manifest)
    cmd = [
        "node", "core/evaluate.mjs",
        "--target", str(trajectory_dir),
        "--task-config", "mock/mock_task_config.json", # 暂用 mock 配置兜底
        "--rulepack", str(root_dir / "harness" / "rulepacks" / "js-ts-react"), # 若无此目录，可用上一阶段的 rulepacks
        "--baseline", "baseline-sha-000",
        "--pre-commit", pre_commit,
        "--post-commit", post_commit,
        "--run-id", run_id,
        "--trajectory-id", trajectory_dir.name,
        "--output", str(eval_output_path),
        "--mode", "full"
    ]

    print(f"⏳ [Evaluator] 启动 Harness 自动化评估 (Timeout: 10 分钟)...")

    try:
        # cwd=harness_dir: 确保 Harness 内部加载 module 的相对路径完全正确
        result = subprocess.run(
            cmd,
            cwd=str(harness_dir),
            capture_output=True,
            text=True,
            timeout=600  # 10分钟超时，防止某一个 metrics 工具(如 dep-cruiser)死锁
        )

        # 3. 严格的退出码 (Exit Code) 语义处理
        if result.returncode == 0:
            print(f"✅ [Evaluator] 评估顺利完成。")
        elif result.returncode == 1:
            print(f"🚨 [Evaluator] 致命错误：Harness 内部 Bug！\nSTDOUT: {result.stdout}\nSTDERR: {result.stderr}")
            sys.exit(1)  # 必须崩溃 Pipeline，停止实验
        elif result.returncode == 2:
            print(f"⚠️ [Evaluator] 跳过：Target 目录不合法或 Manifest 拒绝评估。\nSTDERR: {result.stderr}")
            return {}    # 跳过本次评估，但不崩溃整体实验循环
        else:
            print(f"💥 [Evaluator] 崩溃：遭遇未知退出码 ({result.returncode})。\nSTDERR: {result.stderr}")
            sys.exit(result.returncode)

    except subprocess.TimeoutExpired:
        print("⏰ [Evaluator] 崩溃：Harness 评估超过 10 分钟未返回，已强制斩断进程防卡死！")
        sys.exit(1)

    # 4. 提取并返回生成的评价产物
    if eval_output_path.exists():
        with open(eval_output_path, "r", encoding="utf-8") as f:
            return json.load(f)
    else:
        print("🚨 [Evaluator] Harness 退出码为 0，但未生成 evaluation.json 文件！")
        sys.exit(1)