# experiment/instruments/agent-runners/pipeline/docker_runner.py
import json
import re
import selectors
import subprocess
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path


def summarize_workspace_changes(workspace_dir: Path) -> str:
    result = subprocess.run(
        ["git", "status", "--short"],
        cwd=workspace_dir,
        capture_output=True,
        text=True,
        check=False,
    )

    if result.returncode != 0:
        return "git status unavailable"

    changed_lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]

    if not changed_lines:
        return "no file changes yet"

    preview = ", ".join(changed_lines[:5])
    extra_count = len(changed_lines) - 5
    extra_suffix = f" (+{extra_count} more)" if extra_count > 0 else ""

    return f"{len(changed_lines)} changed: {preview}{extra_suffix}"


def run_with_live_output(
    docker_cmd: list[str],
    workspace_dir: Path,
    heartbeat_seconds: int,
) -> subprocess.CompletedProcess[str]:
    process = subprocess.Popen(
        docker_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    if process.stdout is None:
        raise RuntimeError("Failed to capture Docker process output stream")

    output_chunks: list[str] = []
    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ)
    started_at = time.monotonic()
    last_output_at = started_at

    try:
        while True:
            events = selector.select(timeout=heartbeat_seconds)

            if events:
                for key, _ in events:
                    line = key.fileobj.readline()

                    if line == "":
                        selector.unregister(key.fileobj)
                        continue

                    print(f"   [agent] {line}", end="")
                    output_chunks.append(line)
                    last_output_at = time.monotonic()
            elif process.poll() is None:
                elapsed_seconds = int(time.monotonic() - started_at)
                quiet_seconds = int(time.monotonic() - last_output_at)
                workspace_summary = summarize_workspace_changes(workspace_dir)
                print(
                    "   [heartbeat] "
                    f"agent still running | elapsed={elapsed_seconds}s | "
                    f"quiet={quiet_seconds}s | {workspace_summary}"
                )

            if process.poll() is not None:
                break

        remaining_output = process.stdout.read()
        if remaining_output:
            print(f"   [agent] {remaining_output}", end="")
            output_chunks.append(remaining_output)
    finally:
        selector.close()
        process.stdout.close()

    return subprocess.CompletedProcess(
        args=docker_cmd,
        returncode=process.wait(),
        stdout="".join(output_chunks),
        stderr="",
    )


def run_git_capture(workspace_dir: Path, args: list[str]) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=workspace_dir,
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout if result.returncode == 0 else ""


def persist_workspace_change_artifacts(workspace_dir: Path) -> None:
    (workspace_dir / "workspace_git_status.txt").write_text(
        run_git_capture(workspace_dir, ["status", "--short"]),
        encoding="utf-8",
    )
    (workspace_dir / "workspace_diff_stat.txt").write_text(
        run_git_capture(workspace_dir, ["diff", "--stat"]),
        encoding="utf-8",
    )
    (workspace_dir / "workspace_diff.patch").write_text(
        run_git_capture(workspace_dir, ["diff"]),
        encoding="utf-8",
    )


def extract_int_metric(text: str, patterns: list[str]) -> int | None:
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if not match:
            continue

        return int(match.group(1).replace(",", ""))

    return None


def extract_float_metric(text: str, patterns: list[str]) -> float | None:
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if not match:
            continue

        return float(match.group(1))

    return None


def build_metrics(
    agent_name: str,
    model: str,
    result: subprocess.CompletedProcess[str],
    started_at_utc: str,
    finished_at_utc: str,
    started_at: float,
    finished_at: float,
) -> dict[str, object]:
    merged_output = f"{result.stdout}\n{result.stderr}".strip()
    input_tokens = extract_int_metric(
        merged_output,
        [
            r"input\s+tokens?\s*[:=]\s*([0-9,]+)",
            r"prompt\s+tokens?\s*[:=]\s*([0-9,]+)",
        ],
    )
    output_tokens = extract_int_metric(
        merged_output,
        [
            r"output\s+tokens?\s*[:=]\s*([0-9,]+)",
            r"completion\s+tokens?\s*[:=]\s*([0-9,]+)",
        ],
    )
    total_tokens = extract_int_metric(
        merged_output,
        [
            r"total\s+tokens?\s*[:=]\s*([0-9,]+)",
            r"tokens\s+used\s*[:=]\s*([0-9,]+)",
        ],
    )
    total_cost_usd = extract_float_metric(
        merged_output,
        [
            r"total\s+cost\s*[:=]\s*\$?([0-9]+(?:\.[0-9]+)?)",
            r"cost\s*[:=]\s*\$?([0-9]+(?:\.[0-9]+)?)",
            r"spend\s*[:=]\s*\$?([0-9]+(?:\.[0-9]+)?)",
        ],
    )

    if total_tokens is None and input_tokens is not None and output_tokens is not None:
        total_tokens = input_tokens + output_tokens

    return {
        "agent": agent_name,
        "model": model,
        "status": "success" if result.returncode == 0 else "failed",
        "exit_code": result.returncode,
        "started_at_utc": started_at_utc,
        "finished_at_utc": finished_at_utc,
        "duration_seconds": round(finished_at - started_at, 3),
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "total_cost_usd": total_cost_usd,
        "cost_source": "parsed_from_agent_output",
        "notes": [
            "If token/cost fields are null, the agent CLI did not print usage lines in stdout/stderr.",
            "For strict accounting, enable an explicit cost print step in your agent command or prompt policy.",
        ],
    }


def write_execution_log(
    workspace_dir: Path,
    docker_cmd: list[str],
    result: subprocess.CompletedProcess[str],
    started_at_utc: str,
    finished_at_utc: str,
    started_at: float,
    finished_at: float,
) -> None:
    header = {
        "command": docker_cmd,
        "exit_code": result.returncode,
        "started_at_utc": started_at_utc,
        "finished_at_utc": finished_at_utc,
        "duration_seconds": round(finished_at - started_at, 3),
    }

    log_file = workspace_dir / "agent_execution.log"
    log_file.write_text(
        "# Agent Execution Metadata\n"
        f"{json.dumps(header, ensure_ascii=False, indent=2)}\n\n"
        "# STDOUT\n"
        f"{result.stdout}\n\n"
        "# STDERR\n"
        f"{result.stderr}\n",
        encoding="utf-8",
    )


def build_base_docker_cmd(workspace_dir: Path, run_id: str, config: dict) -> list[str]:
    docker_cmd = [
        "docker",
        "run",
        "--rm",
        "--name",
        f"agent-{run_id}",
        "-v",
        f"{workspace_dir}:/workspace",
        "-v",
        config["auth_volume"],
        "-w",
        "/workspace",
    ]

    for key, val in config["env_vars"].items():
        if val:
            docker_cmd.extend(["-e", f"{key}={val}"])

    return docker_cmd


def query_cost_in_container(
    workspace_dir: Path,
    run_id: str,
    agent_name: str,
    config: dict,
) -> dict[str, object]:
    cost_result = {
        "agent": agent_name,
        "status": "skipped",
        "reason": "unsupported-agent",
        "exit_code": None,
        "raw_stdout": "",
        "raw_stderr": "",
        "total_tokens": None,
        "total_cost_usd": None,
    }

    if agent_name != "claude":
        return cost_result

    docker_cmd = build_base_docker_cmd(workspace_dir, f"{run_id}-cost", config)
    cost_exec_command = "claude -c -p '/cost' --dangerously-skip-permissions"
    docker_cmd.extend([config["image"], "bash", "-c", cost_exec_command])

    result = subprocess.run(docker_cmd, capture_output=True, text=True, check=False)

    merged_output = f"{result.stdout}\n{result.stderr}".strip()
    total_tokens = extract_int_metric(
        merged_output,
        [
            r"total\s+tokens?\s*[:=]\s*([0-9,]+)",
            r"tokens\s+used\s*[:=]\s*([0-9,]+)",
        ],
    )
    total_cost_usd = extract_float_metric(
        merged_output,
        [
            r"total\s+cost\s*[:=]\s*\$?([0-9]+(?:\.[0-9]+)?)",
            r"cost\s*[:=]\s*\$?([0-9]+(?:\.[0-9]+)?)",
            r"spend\s*[:=]\s*\$?([0-9]+(?:\.[0-9]+)?)",
        ],
    )

    status = "ok" if result.returncode == 0 and (total_tokens is not None or total_cost_usd is not None) else "unavailable"
    reason = "parsed" if status == "ok" else "missing-token-cost-lines"

    cost_result = {
        "agent": agent_name,
        "status": status,
        "reason": reason,
        "exit_code": result.returncode,
        "raw_stdout": result.stdout,
        "raw_stderr": result.stderr,
        "total_tokens": total_tokens,
        "total_cost_usd": total_cost_usd,
        "command": docker_cmd,
    }

    (workspace_dir / "cost_query.log").write_text(
        "# Cost Query Command\n"
        f"{json.dumps(docker_cmd, ensure_ascii=False, indent=2)}\n\n"
        "# STDOUT\n"
        f"{result.stdout}\n\n"
        "# STDERR\n"
        f"{result.stderr}\n",
        encoding="utf-8",
    )
    (workspace_dir / "cost_query.json").write_text(
        json.dumps(cost_result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return cost_result


def setup_and_run_agent(
    baseline_dir: Path,
    workspace_dir: Path,
    run_id: str,
    agent_name: str,
    final_prompt: str,
    config: dict,
    live_output: bool = False,
    heartbeat_seconds: int = 30,
):
    print(f"📁 [2/4] 从 {baseline_dir} 克隆 baseline 到隔离工作区并初始化 Git...")
    shutil.copytree(baseline_dir, workspace_dir)

    # 建立 Git 追踪以便后续查看 diff
    subprocess.run(["git", "init", "-q"], cwd=workspace_dir, check=True)
    subprocess.run(["git", "add", "."], cwd=workspace_dir, check=True)
    subprocess.run(
        ["git", "commit", "-q", "-m", "chore: initial baseline snapshot"],
        cwd=workspace_dir,
        check=True,
    )

    # 写入提示词到容器共享空间
    prompt_file = workspace_dir / ".agent_instruction.md"
    prompt_file.write_text(final_prompt)

    print(f"🤖 [3/4] 启动 {agent_name.upper()} 容器执行任务...")

    # 组装基础 Docker 命令
    docker_cmd = build_base_docker_cmd(workspace_dir, run_id, config)

    # 格式化并追加执行指令
    exec_command = config["command_template"].format(model=config["model"])
    docker_cmd.extend([config["image"], "bash", "-c", exec_command])

    print("   [⏳ 等待 Agent 执行完成...]")
    started_at = time.monotonic()
    started_at_utc = datetime.now(timezone.utc).isoformat()
    if live_output:
        result = run_with_live_output(docker_cmd, workspace_dir, heartbeat_seconds)
    else:
        result = subprocess.run(docker_cmd, capture_output=True, text=True, check=False)
    finished_at = time.monotonic()
    finished_at_utc = datetime.now(timezone.utc).isoformat()

    # 1) 存盘完整日志（含执行元信息）
    write_execution_log(
        workspace_dir,
        docker_cmd,
        result,
        started_at_utc,
        finished_at_utc,
        started_at,
        finished_at,
    )

    # 2) 输出结构化指标（token/cost 尽力从 stdout/stderr 抽取）
    metrics = build_metrics(
        agent_name,
        config["model"],
        result,
        started_at_utc,
        finished_at_utc,
        started_at,
        finished_at,
    )
    (workspace_dir / "execution_metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # 2.5) 单独执行一次成本查询并落盘（不依赖模型在主回复中输出）
    cost_query_result = query_cost_in_container(workspace_dir, run_id, agent_name, config)
    if cost_query_result["status"] == "ok":
        print("   [cost] cost query completed and parsed.")
    elif cost_query_result["status"] == "unavailable":
        print("   [cost] cost query executed but no parseable token/cost lines were found.")

    # 3) 保存代码变更痕迹，方便复盘 agent 自主执行过程
    persist_workspace_change_artifacts(workspace_dir)

    if result.returncode != 0:
        raise subprocess.CalledProcessError(
            result.returncode,
            docker_cmd,
            output=result.stdout,
            stderr=result.stderr,
        )
