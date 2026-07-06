# experiment/instruments/agent-runners/pipeline/config.py
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
            # --dangerously-skip-permissions 就是其关闭弹窗的专属工具 Flag
            "command_template": 'claude -p "$(cat /workspace/.agent_instruction.md)" --model {model} --dangerously-skip-permissions'
        },
        "codex": {
            "image": "local/codex-sandbox:latest",
            "model": custom_model or "code-cushman-001", # 默认模型，可覆盖
            "auth_volume": f"{Path.home() / '.codex-docker-home'}:/home/codex_agent/.codex",
            "env_vars": {
                "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY", "")
            },
            # --sandbox danger-full-access 是 codex 的专属工具 flag
            "command_template": 'codex --sandbox danger-full-access "$(cat /workspace/.agent_instruction.md)"'
        }
    }

    if agent_name not in configs:
        raise ValueError(f"不支持的 Agent: {agent_name}")

    return configs[agent_name]