# experiment/instruments/agent-runners/config.py
import os
from pathlib import Path


def get_agent_config(agent_name: str, custom_model: str = None):
    """Return the runtime configuration for an agent, including its model, mount paths, and tool instructions."""

    configs = {
        "claude": {
            "image": "local/claude-sandbox:latest",
            "model": custom_model or "claude-sonnet-4-6",
            "auth_volume": f"{Path.home() / '.claude_agent_home'}:/home/codex_agent",
            "env_vars": {},
            "memory_filename": "CLAUDE.md",
            "result_format": "json",
            "command_template": """claude -p "$(cat /workspace/.agent_instruction.md)" \
                --model {model} \
                --effort high \
                --no-session-persistence \
                --dangerously-skip-permissions \
                --disallowedTools "WebSearch,WebFetch,Bash(curl *),Bash(wget *),Bash(apt *),Bash(apt-get *),Bash(sudo *),Bash(git reset *),Bash(git clean *),Bash(rm -rf *)" \
                --output-format json \
                """,
        },
        "codex": {
            "image": "local/codex-sandbox:latest",
            "model": custom_model or "gpt-5.3-codex",
            "auth_volume": (
                f"{Path.home() / '.codex-docker-api-home'}:" "/home/codex_agent/.codex"
            ),
            "env_vars": {},
            "memory_filename": "AGENTS.md",
            "result_format": "jsonl",
            "command_template": """codex exec "$(cat /workspace/.agent_instruction.md)" \
                --model {model} \
                --sandbox danger-full-access \
                --ephemeral \
                --ignore-user-config \
                --ignore-rules \
                -c web_search=disabled \
                -c 'approval_policy="never"' \
                -c agents.enabled=true \
                -c model_context_window=400000 \
                -c model_max_output_tokens=128000 \
                -c model_reasoning_effort=high \
                --json \
                --output-last-message /workspace/.agent_final_message.txt
            """,
        },
    }

    if agent_name not in configs:
        raise ValueError(f"不支持的 Agent: {agent_name}")

    return configs[agent_name]
