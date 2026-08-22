#!/usr/bin/env python3
# experiment/instruments/agent-runners/acceptance_runner.py
#
# Runs the task's independent functional acceptance suite (experiment/
# instruments/tests/<task_id>/) against the agent's produced workspace,
# separately from harness/core/evaluate.mjs (architecture integrity). See
# experiment/Readme-CN.md for how this fits into the pipeline.
#
# The suite source lives outside baseline/ and outside the workspace so the
# agent never sees it. This module overlays it into a throwaway copy of the
# workspace, runs it there, and discards the copy — the archived workspace
# commit stays exactly what the agent produced.

import json
import re
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

from docker_runner import DEFAULT_RUNTIME_IMAGE, run_workspace_container_command


def resolve_test_suite(root_dir: Path, task_id: str):
    """Locate the acceptance suite for one task, if any is defined."""
    suite_dir = root_dir / "experiment" / "instruments" / "tests" / task_id
    config_path = suite_dir / "test.config.json"

    if not config_path.exists():
        return None, None

    config = json.loads(config_path.read_text(encoding="utf-8"))
    return suite_dir, config


def write_json(path: Path, data) -> None:
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def make_throwaway_copy(workspace_dir: Path, run_id: str) -> Path:
    """Copy the workspace so acceptance testing can't touch the archived commit."""
    tmp_dir = workspace_dir.parent / f".acceptance-tmp-{run_id}"

    if tmp_dir.exists():
        shutil.rmtree(tmp_dir)

    shutil.copytree(
        workspace_dir,
        tmp_dir,
        ignore=shutil.ignore_patterns(".git", "node_modules", "dist", "coverage", "build"),
    )

    return tmp_dir


def resolve_test_compose_file(
    root_dir: Path, workspace_dir: Path, db_config: dict
) -> Path:
    compose_file = workspace_dir / db_config["compose_file"]

    if not compose_file.exists():
        compose_file = root_dir / "baseline" / db_config["compose_file"]
    return compose_file


def ensure_test_database(root_dir: Path, workspace_dir: Path, db_config: dict) -> dict:
    """Start the docker-compose test database profile and wait for it to be healthy."""
    compose_file = resolve_test_compose_file(root_dir, workspace_dir, db_config)
    container_name = db_config.get("container_name", "crm_baseline_db_test")

    existing_health = subprocess.run(
        ["docker", "inspect", "--format={{.State.Health.Status}}", container_name],
        capture_output=True,
        text=True,
        check=False,
    )
    if existing_health.returncode == 0:
        if existing_health.stdout.strip() == "healthy":
            return {
                "status": "ok",
                "container_name": container_name,
                "started_by_runner": False,
            }
        return {
            "status": "error",
            "reason": "existing_test_database_not_healthy",
            "container_name": container_name,
            "health": existing_health.stdout.strip(),
        }

    up_result = subprocess.run(
        [
            "docker", "compose",
            "-f", str(compose_file),
            "--profile", db_config["compose_profile"],
            "up", "-d", db_config["compose_service"],
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    if up_result.returncode != 0:
        return {
            "status": "error",
            "reason": "docker_compose_up_failed",
            "stdout": up_result.stdout,
            "stderr": up_result.stderr,
        }

    deadline = time.monotonic() + db_config.get("health_check_timeout_seconds", 60)

    while time.monotonic() < deadline:
        health = subprocess.run(
            ["docker", "inspect", "--format={{.State.Health.Status}}", container_name],
            capture_output=True,
            text=True,
            check=False,
        )

        if health.returncode == 0 and health.stdout.strip() == "healthy":
            return {
                "status": "ok",
                "container_name": container_name,
                "started_by_runner": True,
            }

        time.sleep(2)

    return {
        "status": "error",
        "reason": "db_not_healthy_before_timeout",
        "container_name": container_name,
        "started_by_runner": True,
    }


def stop_test_database(root_dir: Path, workspace_dir: Path, db_config: dict) -> dict:
    """Stop the dedicated acceptance database container after a test run."""
    compose_file = resolve_test_compose_file(root_dir, workspace_dir, db_config)
    result = subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            str(compose_file),
            "--profile",
            db_config["compose_profile"],
            "stop",
            db_config["compose_service"],
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    return {
        "status": "ok" if result.returncode == 0 else "error",
        "exit_code": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }


def overlay_suite_files(
    suite_dir: Path,
    tmp_dir: Path,
    suite: dict,
    adapter_version: str | None,
) -> Path:
    """Copy this suite's spec files into the throwaway workspace copy."""
    project_dir = tmp_dir / suite["workspace_subdir"]
    dest_dir = project_dir / suite["overlay_dir"]
    dest_dir.mkdir(parents=True, exist_ok=True)

    for filename in suite["spec_files"]:
        shutil.copy2(suite_dir / filename, dest_dir / filename)

    if adapter_version:
        adapter_dir = suite_dir.parent / "_adapter" / adapter_version
        contract_path = adapter_dir / "contract.json"
        module_path = adapter_dir / f"{suite['id']}.ts"
        if not contract_path.exists() or not module_path.exists():
            raise FileNotFoundError(
                f"Acceptance adapter {adapter_version!r} does not define "
                f"contract.json and {suite['id']}.ts under {adapter_dir}"
            )
        contract = json.loads(contract_path.read_text(encoding="utf-8"))
        if contract.get("version") != adapter_version:
            raise ValueError(
                f"Acceptance adapter directory {adapter_version!r} contains "
                f"contract version {contract.get('version')!r}"
            )
        shutil.copy2(contract_path, dest_dir / "adapter-contract.json")
        shutil.copy2(module_path, dest_dir / "acceptance-adapter.ts")

    return project_dir


def read_adapter_report(report_path: Path, expected_version: str | None) -> dict:
    """Read the suite-side discovery trace without letting it affect status."""
    if not expected_version:
        return {
            "version": None,
            "status": "not_configured",
            "route_resolved": {},
            "method_resolved": {},
            "field_mappings_used": [],
            "discoveries": [],
            "unresolved": [],
        }
    if not report_path.exists():
        return {
            "version": expected_version,
            "status": "report_missing",
            "route_resolved": {},
            "method_resolved": {},
            "field_mappings_used": [],
            "discoveries": [],
            "unresolved": [
                {
                    "kind": "adapter_report",
                    "semantic_target": "suite",
                    "attempted": str(report_path.name),
                }
            ],
        }

    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        return {
            "version": expected_version,
            "status": "report_invalid",
            "route_resolved": {},
            "method_resolved": {},
            "field_mappings_used": [],
            "discoveries": [],
            "unresolved": [
                {
                    "kind": "adapter_report",
                    "semantic_target": "suite",
                    "attempted": f"invalid JSON: {error}",
                }
            ],
        }

    report.setdefault("route_resolved", {})
    report.setdefault("method_resolved", {})
    report.setdefault("field_mappings_used", [])
    report.setdefault("discoveries", [])
    report.setdefault("unresolved", [])
    report["status"] = (
        "version_mismatch"
        if report.get("version") != expected_version
        else "unresolved"
        if report["unresolved"]
        else "resolved"
    )
    if report["status"] == "version_mismatch":
        report["unresolved"].append(
            {
                "kind": "adapter_version",
                "semantic_target": expected_version,
                "attempted": report.get("version"),
            }
        )
    return report


FAILURE_PATTERNS = (
    (
        "harness_context",
        re.compile(
            r"theme(?:\.vars)?\.palette|reading ['\"]palette['\"]|"
            r"must be used (?:within|inside) .*provider|could not find.*context",
            re.IGNORECASE,
        ),
    ),
    (
        "route_variance",
        re.compile(
            r"expected 2\d\d .* got 404|cannot (?:get|post|patch|put)|"
            r"unexpected .*\/api\/",
            re.IGNORECASE,
        ),
    ),
    (
        "selector_variance",
        re.compile(
            r"unable to find (?:an element with|role=)|expected .* route-registry entry|"
            r"expected an accessible .*selector",
            re.IGNORECASE,
        ),
    ),
    (
        "status_variance",
        re.compile(r"expected 2\d\d .* got 2\d\d|expected 200 .* got 201", re.IGNORECASE),
    ),
    (
        "field_variance",
        re.compile(r"tohaveproperty|expected .* received: undefined|cannot read properties of undefined", re.IGNORECASE),
    ),
)


def classify_failed_assertions(summary: dict | None) -> list[dict]:
    """Classify failure evidence conservatively; unknown means behavioural review."""
    classifications = []
    for detail in (summary or {}).get("failed_details", []):
        messages = "\n".join(detail.get("failure_messages") or [])
        classification = "behaviour_or_unclassified"
        for candidate, pattern in FAILURE_PATTERNS:
            if pattern.search(messages):
                classification = candidate
                break
        classifications.append(
            {
                "id": detail.get("id"),
                "classification": classification,
                "automatic": True,
                "review_required": classification != "status_variance",
            }
        )
    return classifications


def run_command_in_container(
    command: str,
    workspace_dir: Path,
    workspace_subdir: str,
    image: str,
    env_overrides: dict[str, str],
    timeout_seconds: int,
    run_id: str,
) -> dict:
    """Run one acceptance command in an ephemeral Linux container."""
    started_at = time.monotonic()

    try:
        result = run_workspace_container_command(
            workspace_dir=workspace_dir,
            run_id=run_id,
            image=image,
            command=command,
            working_directory=f"/workspace/{workspace_subdir}",
            env=env_overrides,
            timeout_seconds=timeout_seconds,
            add_host_gateway=True,
        )

        return {
            "command": command,
            "runtime": "docker",
            "image": image,
            "exit_code": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "timed_out": False,
            "duration_seconds": round(time.monotonic() - started_at, 3),
        }
    except subprocess.TimeoutExpired as error:
        return {
            "command": command,
            "runtime": "docker",
            "image": image,
            "exit_code": None,
            "stdout": error.stdout or "",
            "stderr": error.stderr or "",
            "timed_out": True,
            "duration_seconds": round(time.monotonic() - started_at, 3),
        }


def parse_jest_style_report(report_path: Path):
    """Jest's --json and Vitest's --reporter=json share this result shape."""
    if not report_path.exists():
        return None

    try:
        data = json.loads(report_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None

    failed_assertions = [
        assertion
        for test_result in data.get("testResults", [])
        for assertion in test_result.get("assertionResults", [])
        if assertion.get("status") == "failed"
    ]
    def suite_messages(test_result: dict) -> list[str]:
        values = [test_result.get("message")]
        failure_message = test_result.get("failureMessage")
        values.extend(
            failure_message
            if isinstance(failure_message, list)
            else [failure_message]
        )
        return [value for value in values if isinstance(value, str) and value]

    suite_failures = [
        {
            "id": test_result.get("name") or test_result.get("testFilePath") or "suite collection",
            "failure_messages": suite_messages(test_result),
        }
        for test_result in data.get("testResults", [])
        if test_result.get("status") == "failed"
        and not any(
            assertion.get("status") == "failed"
            for assertion in test_result.get("assertionResults", [])
        )
    ]
    failed_ids = [
        assertion.get("fullName") or assertion.get("title")
        for assertion in failed_assertions
    ]
    failed_details = [
        {
            "id": assertion.get("fullName") or assertion.get("title"),
            "failure_messages": assertion.get("failureMessages", []),
        }
        for assertion in failed_assertions
    ] + suite_failures

    return {
        "total": data.get("numTotalTests", 0),
        "passed": data.get("numPassedTests", 0),
        "failed": data.get("numFailedTests", 0),
        "failed_suites": len(suite_failures),
        "failed_ids": failed_ids,
        "failed_details": failed_details,
    }


def run_suite(
    suite_dir: Path,
    tmp_dir: Path,
    suite: dict,
    image: str,
    run_id: str,
    shared_env: dict[str, str],
    adapter_version: str | None,
) -> dict:
    project_dir = overlay_suite_files(
        suite_dir, tmp_dir, suite, adapter_version=adapter_version
    )
    timeout_seconds = suite.get("timeout_seconds", 300)
    suite_run_id = f"{run_id}-{suite['id']}"
    adapter_report_file = suite.get(
        "adapter_report_file", "acceptance-adapter-report.json"
    )

    install_result = run_command_in_container(
        command=suite["commands"]["install"],
        workspace_dir=tmp_dir,
        workspace_subdir=suite["workspace_subdir"],
        image=image,
        env_overrides={},
        timeout_seconds=timeout_seconds,
        run_id=f"{suite_run_id}-install",
    )

    if install_result["timed_out"] or install_result["exit_code"] != 0:
        return {
            "suite_id": suite["id"],
            "status": "error",
            "reason": "install_failed",
            "install": install_result,
            "test": None,
            "summary": None,
        }

    test_result = run_command_in_container(
        command=suite["commands"]["test"],
        workspace_dir=tmp_dir,
        workspace_subdir=suite["workspace_subdir"],
        image=image,
        env_overrides={
            **shared_env,
            **suite.get("env", {}),
            "ACCEPTANCE_ADAPTER_REPORT": adapter_report_file,
            "ACCEPTANCE_ADAPTER_VERSION": adapter_version or "none",
        },
        timeout_seconds=timeout_seconds,
        run_id=f"{suite_run_id}-test",
    )

    summary = None
    if suite.get("json_report_file"):
        summary = parse_jest_style_report(project_dir / suite["json_report_file"])

    adapter = read_adapter_report(
        project_dir / adapter_report_file, expected_version=adapter_version
    )
    failure_classifications = classify_failed_assertions(summary)
    for failure in failure_classifications:
        classification = failure["classification"]
        if classification in {"route_variance", "field_variance", "selector_variance"}:
            inferred = {
                "kind": "failure_triage",
                "semantic_target": failure.get("id"),
                "attempted": classification,
                "source": "automatic_failure_classification",
            }
            if inferred not in adapter["unresolved"]:
                adapter["unresolved"].append(inferred)
                adapter["status"] = "unresolved"

    if test_result["timed_out"]:
        status = "error"
    elif summary is not None:
        status = (
            "pass"
            if summary["failed"] == 0
            and summary.get("failed_suites", 0) == 0
            and summary["total"] > 0
            else "fail"
        )
    else:
        # No structured report available; fall back to the process exit code.
        status = "pass" if test_result["exit_code"] == 0 else "fail"

    reason = None
    if adapter.get("unresolved") and status == "pass":
        status = "fail"
        reason = "adapter_unresolved"

    return {
        "suite_id": suite["id"],
        "status": status,
        "reason": reason,
        "install": install_result,
        "test": test_result,
        "summary": summary,
        "failure_classifications": failure_classifications,
        "adapter": adapter,
    }


def summarize_suite_for_result(suite_result: dict) -> dict:
    summary = suite_result.get("summary") or {}
    adapter = suite_result.get("adapter") or {}

    if suite_result["status"] == "error":
        outcome = "infrastructure_error"
    elif adapter.get("unresolved"):
        outcome = "adapter_unresolved"
    elif suite_result["status"] == "fail":
        outcome = "behaviour_or_test_fail"
    elif adapter.get("field_mappings_used") or adapter.get("discoveries"):
        outcome = "adapted_pass"
    else:
        outcome = "pass"

    return {
        "suite_id": suite_result["suite_id"],
        "status": suite_result["status"],
        "reason": suite_result.get("reason"),
        "total": summary.get("total"),
        "passed": summary.get("passed"),
        "failed": summary.get("failed"),
        "failed_ids": summary.get("failed_ids"),
        "failure_classifications": suite_result.get("failure_classifications", []),
        "outcome": outcome,
        "adapter_unresolved_count": len(adapter.get("unresolved") or []),
        "coverage_dir": suite_result.get("coverage_dir"),
    }


def summarize_adapter(adapter_version: str | None, suite_results: list[dict]) -> dict:
    suite_adapters = [
        {
            "suite_id": result["suite_id"],
            **(result.get("adapter") or {}),
        }
        for result in suite_results
    ]
    return {
        "version": adapter_version,
        "route_resolved": {
            result["suite_id"]: (result.get("adapter") or {}).get(
                "route_resolved", {}
            )
            for result in suite_results
        },
        "method_resolved": {
            result["suite_id"]: (result.get("adapter") or {}).get(
                "method_resolved", {}
            )
            for result in suite_results
        },
        "field_mappings_used": sorted(
            {
                mapping
                for result in suite_results
                for mapping in (result.get("adapter") or {}).get(
                    "field_mappings_used", []
                )
            }
        ),
        "unresolved": [
            {"suite_id": result["suite_id"], **item}
            for result in suite_results
            for item in (result.get("adapter") or {}).get("unresolved", [])
        ],
        "suites": suite_adapters,
    }


def overall_status(suite_results: list[dict]) -> str:
    if any(result["status"] == "error" for result in suite_results):
        return "error"

    if any(result["status"] == "fail" for result in suite_results):
        return "fail"

    return "pass"


def run_functional_tests(
    root_dir: Path,
    workspace_dir: Path,
    task_archive_dir: Path,
    task_id: str,
    run_id: str,
    image: str = DEFAULT_RUNTIME_IMAGE,
) -> dict:
    """Run one task's acceptance suite (if any) and archive normalized results.

    Returns a dict with test_status / test_result_file / test_execution_file,
    the shape write_task_manifest() in run_pipeline.py expects.
    """
    test_result_path = task_archive_dir / "test_result.json"
    test_execution_path = task_archive_dir / "test_execution.json"

    suite_dir, config = resolve_test_suite(root_dir, task_id)

    if config is None:
        write_json(
            test_result_path,
            {
                "status": "skipped",
                "run_id": run_id,
                "task_id": task_id,
                "adapter_version": None,
                "reason": "no acceptance suite defined for this task",
            },
        )
        return {
            "test_status": "skipped",
            "test_result_file": "test_result.json",
            "test_execution_file": None,
        }

    adapter_version = config.get("adapter_version")
    started_at = datetime.now(timezone.utc).isoformat()

    tmp_dir = make_throwaway_copy(workspace_dir, run_id)
    db_status = None
    suite_results = []

    try:
        if config.get("db"):
            db_status = ensure_test_database(root_dir, workspace_dir, config["db"])

            if db_status["status"] != "ok":
                write_json(
                    test_execution_path,
                    {
                        "run_id": run_id,
                        "started_at": started_at,
                        "completed_at": datetime.now(timezone.utc).isoformat(),
                        "task_id": task_id,
                        "adapter_version": adapter_version,
                        "db": db_status,
                        "suites": [],
                    },
                )
                write_json(
                    test_result_path,
                    {
                        "status": "error",
                        "run_id": run_id,
                        "started_at": started_at,
                        "completed_at": datetime.now(timezone.utc).isoformat(),
                        "task_id": task_id,
                        "adapter_version": adapter_version,
                        "reason": "test_database_unavailable",
                    },
                )
                return {
                    "test_status": "error",
                    "test_result_file": "test_result.json",
                    "test_execution_file": "test_execution.json",
                }

        shared_env = {}
        if config.get("db"):
            shared_env = {
                "DB_HOST": config["db"].get(
                    "container_host", "host.docker.internal"
                ),
                "DB_PORT": str(config["db"].get("host_port", 5435)),
            }

        suite_results = [
            run_suite(
                suite_dir=suite_dir,
                tmp_dir=tmp_dir,
                suite=suite,
                image=image,
                run_id=run_id,
                shared_env=shared_env,
                adapter_version=adapter_version,
            )
            for suite in config["suites"]
        ]

        # Coverage is produced inside the throwaway workspace. Archive it
        # before the finally block removes that workspace, keeping backend and
        # frontend reports separate under the task's artifact directory.
        for suite, suite_result in zip(config["suites"], suite_results):
            source = tmp_dir / suite["workspace_subdir"] / "coverage"
            relative_destination = Path("coverage") / suite["id"]
            destination = task_archive_dir / relative_destination

            if source.exists():
                shutil.copytree(source, destination, dirs_exist_ok=True)
                suite_result["coverage_dir"] = str(relative_destination)
            else:
                suite_result["coverage_dir"] = None
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        if (
            db_status
            and db_status.get("started_by_runner")
        ):
            db_status["shutdown"] = stop_test_database(
                root_dir, workspace_dir, config["db"]
            )

    write_json(
        test_execution_path,
        {
            "run_id": run_id,
            "started_at": started_at,
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "task_id": task_id,
            "adapter_version": adapter_version,
            "runtime": {"type": "docker", "image": image},
            "db": db_status,
            "suites": suite_results,
        },
    )

    status = overall_status(suite_results)
    adapter_summary = summarize_adapter(adapter_version, suite_results)
    write_json(
        test_result_path,
        {
            "status": status,
            "run_id": run_id,
            "started_at": started_at,
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "task_id": task_id,
            "adapter_version": adapter_version,
            "adapter": adapter_summary,
            "suites": [summarize_suite_for_result(result) for result in suite_results],
        },
    )

    return {
        "test_status": status,
        "test_result_file": "test_result.json",
        "test_execution_file": "test_execution.json",
    }
