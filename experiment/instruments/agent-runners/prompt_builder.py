# experiment/instruments/agent-runners/pipeline/prompt_builder.py
import sys
from pathlib import Path

def build_mega_prompt(root_dir: Path, task: str, strategy: str, interface: str) -> str:
    """按顺序组装 角色规范 -> 接口文档 -> 具体任务 -> 系统收尾指令"""
    print("🧩 [1/4] 正在组装提示词上下文...")
    prompt_parts = []

    # a. 读取 Prompt 策略 (System Prompt)
    strategy_file = root_dir / f"experiment/design/prompts/{strategy}.md"
    if strategy_file.exists():
        prompt_parts.append("【角色与规范】\n" + strategy_file.read_text())

    # b. 读取 接口文档 (Context)
    if interface:
        interface_file = root_dir / f"docs/interface/{interface}"
        if interface_file.exists():
            prompt_parts.append("【接口文档】\n" + interface_file.read_text())
        else:
            print(f"⚠️ 警告: 找不到接口文档 {interface_file}")

    # c. 读取 任务要求 (User Intent)
    task_file = root_dir / f"experiment/design/tasks/{task}_{strategy}.md"
    if task_file.exists():
        prompt_parts.append("【具体任务】\n" + task_file.read_text())
    else:
        print(f"❌ 错误: 找不到任务文件 {task_file}")
        sys.exit(1)

    # d. 强制收尾指令
    prompt_parts.append("【系统指令】\n以上是完整上下文。请执行代码修改，修改完成后务必立即退出程序！")

    return "\n\n".join(prompt_parts)