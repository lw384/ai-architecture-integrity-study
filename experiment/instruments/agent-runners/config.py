# experiment/instruments/agent-runners/config.py
import os
from pathlib import Path

def get_agent_config(agent_name: str, custom_model: str = None):
    """获取指定 Agent 的运行配置，包含模型、挂载路径、工具指令等"""

    configs = {
        "claude": {
            "image": "local/claude-sandbox:latest",
            "model": custom_model or "claude-sonnet-4-6",
            "auth_volume": f"{Path.home() / '.claude_agent_home'}:/home/codex_agent",
            "env_vars": {},
            "memory_filename": "CLAUDE.md",
            # --dangerously-skip-permissions 就是其关闭弹窗的专属工具 Flag
            "result_format": "json",
            "command_template": '''claude -p "$(cat /workspace/.agent_instruction.md)" \
                --model {model} \
                --dangerously-skip-permissions \
                --output-format json \
                --max-budget-usd 12.00\
                --disallowedTools "Bash(curl:*),Bash(wget:*),Bash(apt:*),Bash(apt-get:*),Bash(brew:*),Bash(yum:*),Bash(git reset:*),Bash(git clean:*),Bash(git checkout --:*),Bash(rm -rf:*),Bash(sudo:*)"
                '''
        },
        "codex": {
            "image": "local/codex-sandbox:latest",
            "model": custom_model or "gpt-5.3-codex",
            "auth_volume": (
                f"{Path.home() / '.codex-docker-api-home'}:"
                "/home/codex_agent/.codex"
            ),
            "env_vars": {},
            "memory_filename": "AGENTS.md",
            "result_format": "jsonl",
            "command_template": '''codex exec "$(cat /workspace/.agent_instruction.md)" \\
                --model {model} \\
                --sandbox danger-full-access \\
                --ephemeral \\
                --ignore-user-config \\
                -c model_context_window=400000 \\
            -c model_max_output_tokens=128000 \\
            -c model_reasoning_effort=medium \\
                --json \\
                --output-last-message /workspace/.agent_final_message.txt
            ''',
        },
    }

    if agent_name not in configs:
        raise ValueError(f"不支持的 Agent: {agent_name}")

    return configs[agent_name]