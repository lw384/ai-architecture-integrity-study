# experiment/instruments/agent-runners/pipeline/docker_runner.py
import subprocess
import shutil
from pathlib import Path

def setup_and_run_agent(root_dir: Path, workspace_dir: Path, run_id: str, agent_name: str, final_prompt: str, config: dict):
    baseline_dir = root_dir / "baseline"

    print("📁 [2/4] 克隆 baseline 到隔离工作区并初始化 Git...")
    shutil.copytree(baseline_dir, workspace_dir)

    # 建立 Git 追踪以便后续查看 diff
    subprocess.run(["git", "init", "-q"], cwd=workspace_dir)
    subprocess.run(["git", "add", "."], cwd=workspace_dir)
    subprocess.run(["git", "commit", "-q", "-m", "chore: initial baseline snapshot"], cwd=workspace_dir)

    # 写入提示词到容器共享空间
    prompt_file = workspace_dir / ".agent_instruction.md"
    prompt_file.write_text(final_prompt)

    print(f"🤖 [3/4] 启动 {agent_name.upper()} 容器执行任务...")

    # 组装基础 Docker 命令
    docker_cmd = [
        "docker", "run", "--rm",
        "--name", f"agent-{run_id}",
        "-v", f"{workspace_dir}:/workspace",
        "-v", config["auth_volume"],
        "-w", "/workspace"
    ]

    # 注入特殊环境变量
    for key, val in config["env_vars"].items():
        if val:
            docker_cmd.extend(["-e", f"{key}={val}"])

    # 格式化并追加执行指令
    exec_command = config["command_template"].format(model=config["model"])
    docker_cmd.extend([config["image"], "bash", "-c", exec_command])

    # 运行容器
    subprocess.run(docker_cmd, check=True)


    # 运行容器并捕获终端输出 (stdout 和 stderr)
    print("   [⏳ 等待 Agent 执行完成...]")
    result = subprocess.run(docker_cmd, capture_output=True, text=True)

    # 1. 把完整的执行日志存盘 (极其珍贵的分析数据)
    log_file = workspace_dir / "agent_execution.log"
    log_file.write_text(result.stdout + "\n" + result.stderr)

    # 2. 从日志中提取 Token 和轮次 (以 Claude Code 假设的输出为例)
    metrics = {
        "total_tokens": 0,
        "turns": 0,
        "status": "success" if result.returncode == 0 else "failed"
    }

    # 举例：用正则匹配日志里的 Token 消耗
    token_match = re.search(r"Tokens used:\s*(\d+)", result.stdout)
    if token_match:
        metrics["total_tokens"] = int(token_match.group(1))

    # 将 metrics 写入一个 json 文件，供后续分析
    import json
    (workspace_dir / "execution_metrics.json").write_text(json.dumps(metrics, indent=2))