# experiment/instruments/agent-runners/pipeline/docker_runner.py
import json
import os
import re
import shlex
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_RUNTIME_IMAGE = "node:20-bookworm-slim"


def _container_name(run_id: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_.-]+", "-", run_id).strip("-.")
    return f"runtime-{normalized}"[:128]


def run_workspace_container_command(
    workspace_dir: Path,
    run_id: str,
    image: str,
    command: str | list[str],
    working_directory: str = "/workspace",
    env: dict[str, str] | None = None,
    timeout_seconds: int | None = None,
    add_host_gateway: bool = False,
) -> subprocess.CompletedProcess[str]:
    """Run a non-Agent command in an ephemeral Linux workspace container."""
    rendered_command = command if isinstance(command, str) else shlex.join(command)
    container_name = _container_name(run_id)
    docker_cmd = [
        "docker",
        "run",
        "--rm",
        "--name",
        container_name,
        "--user",
        f"{os.getuid()}:{os.getgid()}",
        "-e",
        "HOME=/tmp/experiment-runtime-home",
        "-e",
        "npm_config_cache=/tmp/experiment-npm-cache",
        "-v",
        f"{workspace_dir.resolve()}:/workspace",
        "-w",
        working_directory,
    ]

    if add_host_gateway:
        docker_cmd.extend(
            ["--add-host", "host.docker.internal:host-gateway"]
        )

    for key, value in (env or {}).items():
        docker_cmd.extend(["-e", f"{key}={value}"])

    docker_cmd.extend([image, "bash", "-lc", rendered_command])
    try:
        return subprocess.run(
            docker_cmd,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired:
        subprocess.run(
            ["docker", "rm", "-f", container_name],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        raise



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

# Parse agent output and return payload, agent_text, and agent_reported_error.
def parse_agent_output(result, config, final_message_file):
    result_format = config["result_format"]

    if result_format == "json":
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError:
            return {
                "payload": None,
                "agent_text": "",
                "agent_reported_error": True,
                "parse_error": "Claude CLI did not return valid JSON",
            }

        return {
            "payload": payload,
            "agent_text": payload.get("result", ""),
            "agent_reported_error": payload.get("is_error", True),
        }

    if result_format == "jsonl":
        events = []

        for line in result.stdout.splitlines():
            if not line.strip():
                continue

            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                return {
                    "payload": None,
                    "agent_text": "",
                    "agent_reported_error": True,
                    "parse_error": "Codex CLI did not return valid JSONL",
                }

        thread_id = next(
            (
                event.get("thread_id")
                for event in events
                if event.get("type") == "thread.started"
            ),
            None,
        )

        completed_turns = [
            event
            for event in events
            if event.get("type") == "turn.completed"
        ]
        usage = completed_turns[-1].get("usage") if completed_turns else None

        agent_text = ""
        if final_message_file.exists():
            agent_text = final_message_file.read_text(encoding="utf-8").strip()
        else:
            messages = [
                event["item"].get("text", "")
                for event in events
                if event.get("type") == "item.completed"
                and event.get("item", {}).get("type") == "agent_message"
            ]
            if messages:
                agent_text = messages[-1]

        return {
            "payload": {
                "thread_id": thread_id,
                "usage": usage,
                "events": events,
            },
            "agent_text": agent_text,
            "agent_reported_error": result.returncode != 0,
        }

    return {
        "payload": None,
        "agent_text": result.stdout,
        "agent_reported_error": result.returncode != 0,
    }

def run_agent_task(
    workspace_dir,
    task_artifact_dir,
    run_id,
    agent_name,
    final_prompt,
    config,
):
    prompt_file = workspace_dir / ".agent_instruction.md"
    final_message_file = workspace_dir / ".agent_final_message.txt"
    final_message_file.unlink(missing_ok=True)

    prompt_file.write_text(final_prompt, encoding="utf-8")

    print(f"🤖 启动 agent: {agent_name} / {config['model']}")
    print(f"🧪 Run ID: {run_id}")
    print(f"📂 Workspace: {workspace_dir}")

    docker_cmd = build_base_docker_cmd(workspace_dir, run_id, config)
    exec_command = config["command_template"].format(model=config["model"])
    docker_cmd.extend([config["image"], "bash", "-c", exec_command])

    started_at = time.monotonic()
    started_at_utc = datetime.now(timezone.utc).isoformat()

    print("🐳 正在启动 Docker 容器并执行任务...")
    try:
        result = subprocess.run(
            docker_cmd,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            check=False,
        )
    finally:
        prompt_file.unlink(missing_ok=True)

    finished_at = time.monotonic()
    finished_at_utc = datetime.now(timezone.utc).isoformat()

    # Parse the output.
    parsed = parse_agent_output(result, config, final_message_file)
    final_message_file.unlink(missing_ok=True)


    payload = parsed["payload"]
    agent_text = parsed["agent_text"]


    completion_marker_found = "[TASK_COMPLETED]" in agent_text
    succeeded = (
        result.returncode == 0
        and not parsed["agent_reported_error"]
        and completion_marker_found
    )

    print(
        f"{'✅' if succeeded else '❌'} Agent 结束: "
        f"status={'success' if succeeded else 'failed'}, "
        f"exit_code={result.returncode}, "
        f"completion_marker={completion_marker_found}"
    )

    if payload:
        print(
            f"📊 turns={payload.get('num_turns')}, "
            f"cost=${payload.get('total_cost_usd')}, "
            f"session_id={payload.get('session_id')}"
        )

    if parsed.get("parse_error"):
        print(f"⚠️ 输出解析失败: {parsed['parse_error']}")

    if config["result_format"] == "json":
        session_id = payload.get("session_id") if payload else None
        thread_id = None
        num_turns = payload.get("num_turns") if payload else None
        total_cost_usd = payload.get("total_cost_usd") if payload else None
        usage = payload.get("usage") if payload else None

    elif config["result_format"] == "jsonl":
        session_id = None
        thread_id = payload.get("thread_id") if payload else None
        num_turns = None
        total_cost_usd = None
        usage = payload.get("usage") if payload else None

    else:
        session_id = None
        thread_id = None
        num_turns = None
        total_cost_usd = None
        usage = None

    metrics = {
        "agent": agent_name,
        "model": config["model"],
        "run_id": run_id,
        "status": "success" if succeeded else "failed",
        "exit_code": result.returncode,
        "completion_marker_found": completion_marker_found,
        "agent_reported_error": parsed["agent_reported_error"],
        "started_at": started_at_utc,
        "finished_at": finished_at_utc,
        "duration_seconds": round(finished_at - started_at, 3),
        "session_id": session_id,
        "thread_id": thread_id,
        "num_turns": num_turns,
        "total_cost_usd": total_cost_usd,
        "usage": usage,
        "parse_error": parsed.get("parse_error"),
        # Persisted for both result formats so any downstream reader (e.g.
        # review_runner.py for insight-only tasks) can get the agent's final
        # text without branching on agent_name/result_format. Previously this
        # only survived inside agent_result for the "json" (claude) format;
        # the "jsonl" (codex) format derived it but discarded it.
        "agent_text": agent_text,
    }

    execution_record = {
        "metrics": metrics,
        "agent_result": payload,
        "stderr": result.stderr,
    }

    if payload is None:
        execution_record["raw_stdout"] = result.stdout

    (task_artifact_dir / "execution.json").write_text(
        json.dumps(execution_record, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return metrics
