import fs from "node:fs";
import path from "node:path";
import { screen } from "@testing-library/react";
import adapterContract from "./adapter-contract.json";

type RouteDefinition = {
  path?: string;
  title?: string;
  loader?: () => Promise<unknown>;
  [key: string]: unknown;
};

type AdapterContract = {
  version: string;
  ui_action_names: Record<
    "create_deal" | "create_contact" | "save" | "edit",
    string[]
  >;
};

type AdapterReport = {
  version: string;
  route_resolved: Record<string, string>;
  method_resolved: Record<string, string>;
  field_mappings_used: string[];
  discoveries: Array<Record<string, unknown>>;
  unresolved: Array<Record<string, unknown>>;
};

const reportPath = path.resolve(
  process.cwd(),
  process.env.ACCEPTANCE_ADAPTER_REPORT ?? "acceptance-adapter-report.json",
);
const contract = adapterContract as AdapterContract;
const report: AdapterReport = {
  version: contract.version,
  route_resolved: {},
  method_resolved: {},
  field_mappings_used: [],
  discoveries: [],
  unresolved: [],
};

writeReport();

function writeReport(): void {
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
}

export function recordUnresolved(
  kind: string,
  semanticTarget: string,
  attempted: unknown,
): never {
  report.unresolved.push({ kind, semantic_target: semanticTarget, attempted });
  writeReport();
  throw new Error(
    `[acceptance-adapter:${contract.version}] unresolved ${kind} for ${semanticTarget}`,
  );
}

export function findRouteDefinition(
  definitions: RouteDefinition[],
  semanticPath: string,
): RouteDefinition {
  const normalizedTarget = normalizeRoute(semanticPath);
  const singularTarget = normalizedTarget.replace(/s(?=\/|$)/g, "");
  const candidates = definitions.filter((definition) => {
    const candidate = normalizeRoute(String(definition.path ?? ""));
    const singularCandidate = candidate.replace(/s(?=\/|$)/g, "");
    return (
      candidate === normalizedTarget ||
      singularCandidate === singularTarget ||
      (normalizedTarget.indexOf(":id") < 0 &&
        new RegExp(`${singularTarget}s?$`, "i").test(String(definition.title ?? "")))
    );
  });

  const resolved = candidates.find((candidate) => typeof candidate.loader === "function");
  if (!resolved) {
    return recordUnresolved(
      "frontend_route",
      semanticPath,
      definitions.map((definition) => definition.path),
    );
  }

  const pathValue = String(resolved.path);
  report.route_resolved[semanticPath] = pathValue;
  report.discoveries.push({
    kind: "frontend_route",
    semantic_target: semanticPath,
    resolved: pathValue,
  });
  writeReport();
  return resolved;
}

export function actionNamePattern(
  action: keyof typeof contract.ui_action_names,
): RegExp {
  const names = contract.ui_action_names[action];
  if (!names?.length) return recordUnresolved("ui_action", action, []);
  report.discoveries.push({ kind: "ui_action", semantic_target: action, candidates: names });
  writeReport();
  return new RegExp(names.map(escapeRegExp).join("|"), "i");
}

export async function findActionButton(
  action: keyof typeof contract.ui_action_names,
): Promise<HTMLElement> {
  const pattern = actionNamePattern(action);
  try {
    return await screen.findByRole("button", { name: pattern });
  } catch {
    return recordUnresolved("ui_action", action, contract.ui_action_names[action]);
  }
}

export async function findOptionByName(
  semanticTarget: string,
  name: string | RegExp,
): Promise<HTMLElement> {
  try {
    return await screen.findByRole("option", { name });
  } catch {
    return recordUnresolved("ui_option", semanticTarget, String(name));
  }
}

export function normalizeStage(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeRoute(value: string): string {
  return value.replace(/^\/+|\/+$/g, "").toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
