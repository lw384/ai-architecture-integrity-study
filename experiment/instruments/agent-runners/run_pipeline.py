
import argparse
from pathlib import Path
import subprocess
import shutil
from datetime import datetime

from config import get_agent_config
from prompt_builder import build_mega_prompt
from docker_runner import run_agent_task
from evaluator import run_harness_evaluation

INITIAL_MEMORY_TEMPLATE = Path("experiment/design/memory/initial_memory.md")

# 工具函数
def git(workspace_dir: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=workspace_dir,
        check=True,
        text=True,
        capture_output=True,
    )

def load_initial_memory_content(root_dir: Path) -> str:
    template_path = root_dir / INITIAL_MEMORY_TEMPLATE

    if not template_path.exists():
        raise FileNotFoundError(f"Memory template not found: {template_path}")

    content = template_path.read_text(encoding="utf-8").strip()
    if not content:
        raise ValueError(f"Memory template is empty: {template_path}")

    return content + "\n"

# 首次实验：拉取baseline代码
def create_new_workspace(root_dir, baseline_dir, args, config):

    # 1. 生成本次“实验会话”的唯一目录
    session_id = (
        f"session_"
        f"{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    )
    # 工作区路径
    workspace_dir = root_dir / "experiment" / "workspace" / session_id

    # 2. 复制 baseline 内容到这个长期保留的 workspace
    #    注意：不要把 baseline 自己的 .git 一起复制
    shutil.copytree(
        baseline_dir,
        workspace_dir,
        ignore=shutil.ignore_patterns(".git"),
    )

    # 3. 在 workspace 内建立“本 session 自己的”Git 历史
    git(workspace_dir, "init", "-q")
    git(workspace_dir, "add", "-A")
    git(workspace_dir, "commit", "-m", "chore: baseline snapshot")
    git(workspace_dir, "tag", "baseline")

    # 4. 若本实验条件启用记忆，先创建 agent 对应的原生文件
    if args.write_memory_md:
        memory_filename = config["memory_filename"]
        memory_path = workspace_dir / memory_filename

        initial_memory_content = load_initial_memory_content(root_dir)
        memory_path.write_text(initial_memory_content, encoding="utf-8")
        git(workspace_dir, "add", memory_filename)
        git(workspace_dir, "commit", "-m", "docs: initialize agent memory")
        git(workspace_dir, "tag", "baseline-with-memory")

    return workspace_dir, session_id

# T2 之后的任务需要依赖上一次实验的结果
def reuse_existing_workspace(
    workspace_dir: str,
    from_tag: str | None,
    force: bool,
    task_id: str,
) -> tuple[Path, str]:
    if not workspace_dir.exists():
        raise FileNotFoundError(f"workspace 不存在: {workspace_dir}")

    if not (workspace_dir / ".git").exists():
        raise ValueError(f"无GIT,不能复用: {workspace_dir}")

    if from_tag:
        result = subprocess.run(
            ["git", "rev-parse", "--verify", f"refs/tags/{from_tag}"],
            cwd=workspace_dir,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise ValueError(f"tag 不存在: {from_tag}")

        git(workspace_dir, "checkout", from_tag)

    completed_tag = f"task-{task_id}-done"
    result = subprocess.run(
        ["git", "rev-parse", "--verify", f"refs/tags/{completed_tag}"],
        cwd=workspace_dir,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode == 0 and not force:
        raise ValueError(
            f"{completed_tag} 已存在；若确认重跑，请显式传入 --force"
        )

    return workspace_dir.name

# 读取 tag 或 HEAD
def read_current_tag_or_head(workspace_dir):
    result = subprocess.run(
        ["git", "tag", "--points-at", "HEAD"],
        cwd=workspace_dir,
        capture_output=True,
        text=True,
        check=True,
    )

    tags = result.stdout.strip().splitlines()
    if tags:
        return tags[0]

    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=workspace_dir,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()

# tag 是否存在
def tag_exists(workspace_dir, tag_name):
    result = subprocess.run(
        ["git", "rev-parse", "--verify", f"refs/tags/{tag_name}"],
        cwd=workspace_dir,
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode == 0

# 提交修改并打 tag
def commit_and_tag_task(workspace_dir, task_id, force):
    task_tag = f"task-{task_id}-done"

    if tag_exists(workspace_dir, task_tag):
        if not force:
            raise ValueError(
                f"tag 已存在: {task_tag}；如确认覆盖，请使用 --force"
            )
        if tag_exists(workspace_dir, task_tag):
            git(workspace_dir, "tag", "-d", task_tag)

    # 提交 agent 在 workspace 中的全部改动
    git(workspace_dir, "add", "-A")

    staged_changes = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        cwd=workspace_dir,
        check=False,
    )

    if staged_changes.returncode == 0:
        raise RuntimeError(
            f"Agent 宣称完成 {task_id}，但 workspace 没有任何可提交的改动"
        )

    if staged_changes.returncode != 1:
        raise RuntimeError("无法检查 Git 暂存区状态")

    git(workspace_dir, "commit", "-m", f"task: {task_id} completed")

    post_commit = git(
        workspace_dir,
        "rev-parse",
        "HEAD",
    ).stdout.strip()

    git(workspace_dir, "tag", task_tag)

    return post_commit, task_tag

# 初始化 session_manifest.yaml
def initialize_session_manifest(
    workspace_dir,
    session_archive_dir,
    session_id,
    args,
    config,

):
    manifest_path = session_archive_dir / "session_manifest.yaml"

    if manifest_path.exists():
        return

    manifest_path.write_text(
        "\n".join(
            [
                f"session_id: {session_id}",
                f"workspace_dir: {workspace_dir}",
                f"created_at: {datetime.now().isoformat()}",
                "initial_config:",
                f"  agent: {args.agent}",
                f"  model: {config['model']}",
                f"  strategy: {args.strategy}",
                f"  write_memory_md: {str(args.write_memory_md).lower()}",
                f"  memory_filename: {config['memory_filename'] if args.write_memory_md else 'none'}",
                "",
            ]
        ),
        encoding="utf-8",
    )
def write_task_manifest(
    task_archive_dir,
    session_id,
    task_id,
    run_id,
    start_tag,
    post_commit,
    current_tag,
    requested_from_tag,
    harness_run,
):
    manifest_path = task_archive_dir / "task_manifest.yaml"

    manifest_path.write_text(
        "\n".join(
            [
                f"session_id: {session_id}",
                f"task_id: {task_id}",
                f"run_id: {run_id}",
                f"start_ref: {start_tag}",
                f"post_commit: {post_commit}",
                f"post_tag: {current_tag}",
                "execution_file: execution.json",
                f"requested_from_tag: {requested_from_tag or 'none'}",
                "prompt_file: prompt.md",
                "execution_file: execution.json",
                f"harness_status: {harness_run['harness_status']}",
                "harness_execution_file: harness_execution.json",
                f"harness_evaluation_file: {'harness_evaluation.json' if harness_run['harness_status'] == 'success' else 'none'}",
                                "",
            ]
        ),
        encoding="utf-8",
    )

#  实验最开始确定的baseline的路径
#  执行参数
#  1. prompt 类型： minimal / structured ;
#  2. task_id: T0 / T1 / T2 / ... ;
#  3. agent_name: claude code / codex;
#  创建容器
#  执行任务
#  任务完成，调用评估
#  输出： 归档到 reports/experiments/<session_id>/<task_id> 下
def main():
    # 可选的参数
    parser = argparse.ArgumentParser(description="AI 架构完整性对照实验流水线")
    parser.add_argument("--agent", choices=["claude", "codex"], default="claude")
    parser.add_argument("--model", help="覆盖默认模型 (可选)") # 调用的模型暂时为固定某一个模型
    parser.add_argument("--strategy", choices=["minimal", "structured"], required=True)
    parser.add_argument("--task", required=True, help="本次要执行的 task,如 T1")
    parser.add_argument("--from-workspace",help="复用哪个 workspace 目录;不给则新建")
    parser.add_argument("--from-tag",help="从哪个 git tag 起跑;不给则用 workspace HEAD",)
    parser.add_argument("--force", action="store_true",help="覆盖已存在的 tag / 归档,不询问")
    parser.add_argument("--write-memory-md", action="store_true",help="仅在新建 workspace 时生效,不影响复用",)
    args = parser.parse_args()

    # 路径
    root_dir = Path(__file__).resolve().parent.parent.parent.parent
    baseline_dir = root_dir / "baseline" # 最一开始起点代码仓库

    # === 获取 agent 配置 ===
    config = get_agent_config(args.agent, args.model)

    # === 确定 workspace ===
    workspace_dir = None
    if args.from_workspace:
        # 读取 workspace 目录,并复用
        workspace_dir = Path(args.from_workspace).expanduser().resolve()
        session_id = reuse_existing_workspace(
            workspace_dir, args.from_tag, args.force, args.task,
        )
        print(f"♻️  复用 workspace: {workspace_dir}-{session_id}")
    else:
        # 创建新的 workspace (baseline)
        workspace_dir, session_id = create_new_workspace(
            root_dir, baseline_dir, args, config
        )
        print(f"🆕 新建 workspace: {workspace_dir}-{session_id}")

    # === 起点 tag ===
    start_tag = read_current_tag_or_head(workspace_dir)
    print(f"📍 起点: {start_tag}")

    # === Task 归档目录 ===
    session_archive_dir = root_dir / "reports" / "experiments" / session_id
    session_archive_dir.mkdir(parents=True, exist_ok=True)

    # 初次运行实验，需要在 session_manifest.yaml 里记录初始配置
    if not args.from_workspace:
        initialize_session_manifest(
            workspace_dir,
            session_archive_dir,
            session_id,
            args,
            config,
        )

    # === 本次 task 归档目录 ===
    task_archive_dir = session_archive_dir / args.task
    # 如果已有归档,且没有 --force, 则报错
    if task_archive_dir.exists() and not args.force:
        raise FileExistsError(
            f"归档已存在: {task_archive_dir}\n"
            "如确认覆盖，请重新运行并加入 --force"
        )
    task_archive_dir.mkdir(parents=True, exist_ok=True)

    memory_filename = None
    candidate_memory_path = workspace_dir / config["memory_filename"]

    if candidate_memory_path.exists():
        memory_filename = config["memory_filename"]

    # === Prompt ===
    final_prompt = build_mega_prompt(
        root_dir=root_dir,
        task_id=args.task,
        strategy=args.strategy,
        memory_filename=memory_filename,
    )

    print(f"🧩 已加载任务模板: {args.task}_{args.strategy}.md")

    if memory_filename:
        print(f"本次启用 memory 维护: {memory_filename}")
    else:
        print("本次未启用 memory 维护")

    # 本次task prompt 归档
    (task_archive_dir / "prompt.md").write_text(final_prompt, encoding="utf-8")

    # === 执行任务 ===
    run_id = f"{session_id}_{args.task}_{datetime.now().strftime('%H%M%S')}"

    agent_run = run_agent_task(
        workspace_dir=workspace_dir,
        task_artifact_dir=task_archive_dir,
        run_id=run_id,
        agent_name=args.agent,
        final_prompt=final_prompt,
        config=config,
    )

    if agent_run["status"] != "success":
        raise RuntimeError(
            "Agent 未按任务协议成功结束。"
            f"请查看: {task_archive_dir / 'agent_execution.log'}"
        )

    # === Commit + tag ===
    post_commit, current_tag = commit_and_tag_task(
        workspace_dir=workspace_dir,
        task_id=args.task,
        force=args.force,
    )

    print(f"✅ Git commit: {post_commit}")
    print(f"🏷️  Task tag: {current_tag}")



    # # === 评估 ===
    harness_run = run_harness_evaluation(
        root_dir=root_dir,
        baseline_dir=baseline_dir,
        workspace_dir=workspace_dir,
        task_archive_dir=task_archive_dir,
        run_id=run_id,
        task_id=args.task,
        pre_commit=start_tag,
        post_commit=post_commit,
    )

    write_task_manifest(
        task_archive_dir=task_archive_dir,
        session_id=session_id,
        task_id=args.task,
        run_id=run_id,
        start_tag=start_tag,
        post_commit=post_commit,
        current_tag=current_tag,
        requested_from_tag=args.from_tag,
        harness_run=harness_run,
    )

    if harness_run["harness_status"] != "success":
        raise RuntimeError(
            "Harness 运行失败。"
            f"请查看: {harness_run['execution_path']}"
        )
    # # === 提示下一步 ===
    print(f"\n🎉 Task {args.task} 完成")
    print(f"💡 继续下一个 task:")
    # print(f"   python run_pipeline.py --task <TN> --strategy {args.strategy} \\")
    # print(f"     --from-workspace {workspace_dir}")



if __name__ == "__main__":
    main()
