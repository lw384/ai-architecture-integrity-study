"""
generate-gemini.py
Reproducible Gemini experiment runner (Single Generation Mode)
"""

import os
import re
import json
import argparse
from datetime import datetime, UTC
from pathlib import Path

from dotenv import load_dotenv
from google import genai


# ==============================
# Load environment FIRST
# ==============================

load_dotenv()


# ==============================
# Global Config
# ==============================

DEFAULT_MODEL = "gemini-2.5-flash"
DEFAULT_TEMPERATURE = 0
DEFAULT_TOP_P = 1.0
DEFAULT_MAX_TOKENS = 8192


# ==============================
# Path Resolution
# ==============================

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
BASE_PATH = PROJECT_ROOT / "CRM" / "baseline-ai" / "Gemini"
SPEC_PATH = PROJECT_ROOT / "CRM" / "specs" / "contact-spec-v0.1.md"
TEMPLATE_PATH = (
    PROJECT_ROOT / "experiments" / "templates" / "backend-generation-prompt.txt"
)


# ==============================
# Helpers
# ==============================
def compile_prompt(template_path: Path, spec_path: Path) -> str:
    if not template_path.exists():
        raise FileNotFoundError(f"Template not found at {template_path}")

    if not spec_path.exists():
        raise FileNotFoundError(f"Spec not found at {spec_path}")

    template = template_path.read_text(encoding="utf-8")
    spec = spec_path.read_text(encoding="utf-8")

    if "{{CONTACT_SPEC}}" not in template:
        raise ValueError("Template missing {{CONTACT_SPEC}} placeholder")

    return template.replace("{{CONTACT_SPEC}}", spec)


def read_prompt(prompt_path: Path) -> str:
    if not prompt_path.exists():
        raise FileNotFoundError(f"Prompt not found at {prompt_path}")
    return prompt_path.read_text(encoding="utf-8")


def save_json(path: Path, data: dict):
    path.write_text(json.dumps(data, indent=4), encoding="utf-8")


def write_generated_files(output_text: str, target_root: Path):
    """
    Parse LLM output formatted as:

    ---FILE: path/to/file.ts---
    file content

    And write them to target_root.
    """

    pattern = r"---FILE:\s*(.*?)---\n(.*?)(?=(---FILE:|\Z))"

    matches = re.findall(pattern, output_text, re.DOTALL)

    if not matches:
        print("⚠️ No structured files found in output.")
        return

    for match in matches:
        relative_path = match[0].strip()
        file_content = match[1].strip()

        file_path = target_root / relative_path

        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(file_content, encoding="utf-8")

        print(f"📄 Created: {file_path}")


# ==============================
# Main
# ==============================


def main():

    parser = argparse.ArgumentParser(description="Run Gemini generation experiment")

    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--temperature", type=float, default=DEFAULT_TEMPERATURE)
    parser.add_argument("--top_p", type=float, default=DEFAULT_TOP_P)
    parser.add_argument("--max_tokens", type=int, default=DEFAULT_MAX_TOKENS)
    parser.add_argument(
        "--generation",
        default="generation-1",
        help="Target generation folder",
    )

    args = parser.parse_args()

    # --------------------------
    # Setup Gemini Client
    # --------------------------

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not set in environment")

    client = genai.Client(api_key=api_key)

    # --------------------------
    # Target generation folder
    # --------------------------

    generation_path = BASE_PATH / args.generation
    metadata_path = generation_path / "metadata"

    metadata_path.mkdir(parents=True, exist_ok=True)

    # --------------------------
    # Read Prompt
    # --------------------------

    compiled_prompt = compile_prompt(TEMPLATE_PATH, SPEC_PATH)

    compiled_prompt_path = metadata_path / "compiled_prompt.txt"
    compiled_prompt_path.write_text(compiled_prompt, encoding="utf-8")

    prompt = compiled_prompt

    # --------------------------
    # Call Gemini
    # --------------------------

    response = client.models.generate_content(
        model=args.model,
        contents=prompt,
        config={
            "temperature": args.temperature,
            "top_p": args.top_p,
            "max_output_tokens": args.max_tokens,
        },
    )

    output_text = response.text

    # --------------------------
    # Save Output
    # --------------------------

    (metadata_path / "raw-output.txt").write_text(output_text, encoding="utf-8")

    backend_path = generation_path / "backend"

    write_generated_files(output_text, backend_path)

    # --------------------------
    # Save metadata
    # --------------------------

    usage = getattr(response, "usage_metadata", None)

    if usage:
        usage_serializable = {
            "prompt_token_count": getattr(usage, "prompt_token_count", None),
            "candidates_token_count": getattr(usage, "candidates_token_count", None),
            "total_token_count": getattr(usage, "total_token_count", None),
        }
    else:
        usage_serializable = None

    run_config = {
        "model": args.model,
        "temperature": args.temperature,
        "top_p": args.top_p,
        "max_output_tokens": args.max_tokens,
        "template_used": str(TEMPLATE_PATH),
        "spec_used": str(SPEC_PATH),
        "compiled_prompt_path": str(compiled_prompt_path),
        "generation_folder": str(generation_path),
        "timestamp_utc": datetime.now(UTC).isoformat(),
        "usage_metadata": usage_serializable,
    }

    save_json(metadata_path / "run_config.json", run_config)

    print(f"✅ Generation complete: {generation_path}")


if __name__ == "__main__":
    main()
