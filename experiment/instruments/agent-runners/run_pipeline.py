#!/usr/bin/env python3
# experiment/instruments/agent-runners/run_pipeline.py
import argparse
from datetime import datetime
from pathlib import Path

# 引入我们的自建模块
from config import get_agent_config
from prompt_builder import build_mega_prompt
from docker_runner import setup_and_run_agent
# from evaluator import run_harness_evaluation

def main():
    parser = argparse.ArgumentParser(description="AI 架构完整性对照实验流水线")
    parser.add_argument("--agent", choices=["claude", "codex"], default="claude")
    parser.add_argument("--model", help="覆盖默认模型 (可选)")
    parser.add_argument("--task", required=True, help="任务编号，如 T1")
    parser.add_argument("--strategy", choices=["minimal", "structured"], required=True)
    parser.add_argument("--interface", help="接口文档名称，如 company.md")
    args = parser.parse_args()

    # 路径与 ID 初始化
    root_dir = Path(__file__).resolve().parent.parent.parent.parent
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_id = f"run_{args.agent}_{args.task}_{args.strategy}_{timestamp}"
    workspace_dir = root_dir / "experiment" / "workspace" / run_id

    print(f"🚀 启动实验 | Agent: {args.agent} | Task: {args.task} | Strategy: {args.strategy}")

    # 1. 获取配置
    config = get_agent_config(args.agent, args.model)

    # 2. 组装 Prompt
    final_prompt = build_mega_prompt(root_dir, args.task, args.strategy, args.interface)

    # 3. 执行容器沙盒
    setup_and_run_agent(root_dir, workspace_dir, run_id, args.agent, final_prompt, config)

    # 4. 运行 Harness 评估
    # run_harness_evaluation(root_dir, workspace_dir)

    print(f"🎉 实验全流程结束！产物位于: {workspace_dir}")

if __name__ == "__main__":
    main()