import fs from "node:fs";
import path from "node:path";
import request from "supertest";

type JsonRecord = Record<string, unknown>;
type AdapterContract = {
  version: string;
  route_candidates: Record<"deals" | "contacts" | "companies", string[]>;
  entity_id_fields: Record<"deal" | "contact" | "company", string[]>;
  entity_envelopes: Record<"deal" | "contact" | "company", string[]>;
  field_aliases: Record<string, string[]>;
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
const contract = JSON.parse(
  fs.readFileSync(path.join(__dirname, "adapter-contract.json"), "utf8"),
) as AdapterContract;

const report: AdapterReport = loadExistingReport();

writeReport();

function writeReport(): void {
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
}

function loadExistingReport(): AdapterReport {
  try {
    const existing = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    if (existing.version === contract.version) {
      existing.method_resolved ??= {};
      return existing as AdapterReport;
    }
  } catch {
    // A missing/stale report starts a new trace for this suite process.
  }
  return {
    version: contract.version,
    route_resolved: {},
    method_resolved: {},
    field_mappings_used: [],
    discoveries: [],
    unresolved: [],
  };
}

function uniquePush(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

export function adapterReport(): AdapterReport {
  return report;
}

export function recordDiscovery(
  kind: string,
  semanticTarget: string,
  resolved: unknown,
  attempted?: unknown,
): void {
  report.discoveries.push({
    kind,
    semantic_target: semanticTarget,
    resolved,
    ...(attempted === undefined ? {} : { attempted }),
  });
  writeReport();
}

export function recordFieldMapping(source: string, canonical: string): void {
  uniquePush(report.field_mappings_used, `${source}->${canonical}`);
  writeReport();
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

export async function discoverCollectionRoute(
  httpServer: Parameters<typeof request>[0],
  resource: keyof typeof contract.route_candidates,
): Promise<string> {
  const cached = report.route_resolved[resource];
  if (cached) return cached;

  const candidates = contract.route_candidates[resource] ?? [];
  const attempts: Array<{ path: string; status: number }> = [];

  for (const candidate of candidates) {
    const response = await request(httpServer).get(candidate);
    attempts.push({ path: candidate, status: response.status });

    // A registered collection route may reject an incomplete probe with 4xx.
    // Only 404 is treated as absent; 5xx remains resolved so the real test can
    // expose the implementation failure instead of hiding it as discovery.
    if (response.status !== 404) {
      report.route_resolved[resource] = candidate;
      report.discoveries.push({
        kind: "route",
        semantic_target: resource,
        resolved: candidate,
        attempts,
      });
      writeReport();
      return candidate;
    }
  }

  return recordUnresolved("route", resource, attempts);
}

export async function requestWithDiscoveredMethod(
  httpServer: Parameters<typeof request>[0],
  semanticTarget: string,
  requestPath: string,
  body: string | object | undefined,
  candidates: Array<"post" | "patch" | "put"> = ["post", "patch", "put"],
): Promise<request.Response> {
  const cached = report.method_resolved[semanticTarget]?.toLowerCase() as
    | "post"
    | "patch"
    | "put"
    | undefined;
  if (cached) return request(httpServer)[cached](requestPath).send(body);

  const attempts: Array<{ method: string; status: number }> = [];
  for (const candidate of candidates) {
    const response = await request(httpServer)[candidate](requestPath).send(body);
    attempts.push({ method: candidate.toUpperCase(), status: response.status });
    if (response.status !== 404 && response.status !== 405) {
      report.method_resolved[semanticTarget] = candidate.toUpperCase();
      recordDiscovery(
        "http_method",
        semanticTarget,
        candidate.toUpperCase(),
        attempts,
      );
      return response;
    }
  }
  return recordUnresolved("http_method", semanticTarget, attempts);
}

export function extractEntityId(
  body: unknown,
  entity: keyof typeof contract.entity_id_fields,
): string {
  const response = asRecord(body);
  const fields = contract.entity_id_fields[entity] ?? ["id"];
  const envelopes = contract.entity_envelopes[entity] ?? [];
  const containers = [response, ...envelopes.map((key) => asRecord(response[key]))];

  for (const container of containers) {
    for (const field of fields) {
      const value = container[field];
      if (typeof value === "string" && value.length > 0) {
        if (field !== "id") uniquePush(report.field_mappings_used, `${field}->id`);
        writeReport();
        return value;
      }
    }
  }

  return recordUnresolved("entity_id", entity, {
    fields,
    envelopes,
    observed_keys: Object.keys(response),
  });
}

export function normalizeResponse<T = unknown>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeResponse(item)) as T;
  }
  if (!value || typeof value !== "object" || value instanceof Date) return value;

  const source = value as JsonRecord;
  const normalized: JsonRecord = {};
  for (const [key, item] of Object.entries(source)) {
    normalized[key] = normalizeResponse(item);
  }

  for (const [canonical, aliases] of Object.entries(contract.field_aliases)) {
    if (normalized[canonical] !== undefined) continue;
    const alias = aliases.find(
      (candidate) => candidate !== canonical && normalized[candidate] !== undefined,
    );
    if (alias) {
      normalized[canonical] = normalized[alias];
      uniquePush(report.field_mappings_used, `${alias}->${canonical}`);
    }
  }
  writeReport();
  return normalized as T;
}

export function expectSuccessfulMutation(response: { status: number }): void {
  expect(response.status).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(300);
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}
