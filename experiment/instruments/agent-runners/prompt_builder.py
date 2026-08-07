# experiment/instruments/agent-runners/pipeline/prompt_builder.py
import sys
import re
from pathlib import Path

def build_mega_prompt(root_dir: Path, task: str, strategy: str, interface: str) -> str:
    print("🧩 [1/4] 读取提示词上下文...")
    prompt_parts = []

    # # a. 读取 Prompt 策略 (System Prompt)
    # strategy_file = root_dir / f"experiment/design/tasks/{}{strategy}.md"
    # if strategy_file.exists():
    #     prompt_parts.append("【角色与规范】\n" + strategy_file.read_text())

    # print("strategy_file:", strategy_file)
    # # b. 读取 接口文档 (Context)
    # if interface:
    #     interface_file = root_dir / f"docs/interface/{interface}"
    #     if interface_file.exists():
    #         prompt_parts.append("【接口文档】\n" + interface_file.read_text())
    #     else:
    #         print(f"⚠️ 警告: 找不到接口文档 {interface_file}")

    #
    task_file = root_dir / f"experiment/design/tasks/{task}_{strategy}.md"
    if task_file.exists():
        raw_content = task_file.read_text(encoding="utf-8")

        cleaned_content = re.sub(r"<!--.*?-->", "", raw_content, flags=re.DOTALL)

        prompt_parts.append(cleaned_content.strip())
    else:
        print(f"❌ 错误: 找不到任务文件 {task_file}")
        sys.exit(1)

    return "\n\n".join(prompt_parts)


def append_observability_tail(prompt: str) -> str:
    observability_tail = """

## 6. Runtime Observability (Runner-Appended)

After finishing the implementation, include two machine-readable blocks at the very end of your response.

1) Cost block:
- If /cost is supported in your runtime, execute /cost and paste the raw output.
- If /cost is unavailable, write COST_UNAVAILABLE.

Format exactly:
[COST_BEGIN]
<raw /cost output or COST_UNAVAILABLE>
[COST_END]

2) Action summary block:
Summarize the concrete actions you performed.

Format exactly:
[ACTIONS_BEGIN]
- edited: <file path>
- ran: <command>
- verified: <result>
[ACTIONS_END]
""".strip()

    return f"{prompt}\n\n{observability_tail}\n"


def has_strict_terminal_output_requirement(prompt: str) -> bool:
    normalized = prompt.lower()

    if "output exactly [task_completed]" in normalized:
        return True

    patterns = [
        r"output\s+exactly\s*\[task_completed\]",
        r"do\s+not\s+print\s+.*output\s+exactly",
        r"terminate\s+your\s+process\s+immediately",
    ]

    return any(re.search(pattern, normalized) for pattern in patterns)