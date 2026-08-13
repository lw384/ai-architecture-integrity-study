# experiment/instruments/agent-runners/pipeline/prompt_builder.py
import re
from pathlib import Path

def build_mega_prompt(
    root_dir: Path,
    task_id: str,
    strategy: str,
    memory_filename: str | None = None,
) -> str:
    task_file = root_dir / "experiment" / "design" / "tasks" / f"{task_id}_{strategy}.md"

    if not task_file.exists():
        raise FileNotFoundError(f"找不到任务模板: {task_file}")

    raw_content = task_file.read_text(encoding="utf-8")
    task_content = re.sub(r"<!--.*?-->", "", raw_content, flags=re.DOTALL).strip()

    if not task_content:
        raise ValueError(f"任务模板为空: {task_file}")

    prompt_parts = [task_content]

    # add memory instructions if applicable
    if memory_filename:
        prompt_parts.append(
            f"""
                ## Persistent Project Memory

                Before outputting the required completion signal, update the workspace-root
                `{memory_filename}`.

                Record:
                - completed work;
                - key implementation decisions;
                - verification commands and outcomes;
                - unresolved issues or important follow-up work.

                Correct or remove stale information when necessary. This update must be completed
                before you output the required completion signal.
                """.strip()
        )

    # add end-of-task signal
    prompt_parts.append(build_completion_protocol())

    return "\n\n".join(prompt_parts) + "\n"




# set endpoint for agent to know when to stop
def build_completion_protocol() -> str:
    return """
        ## Completion Protocol
        After all required work, verification, and any required updates are
        complete, output exactly this final line and then terminate:

        [TASK_COMPLETED]
        """.strip()