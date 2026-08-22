// Frontend functional acceptance for T3's controlled Deal stage UI.
// Overlaid into:
//   <workspace>/frontend/src/test/acceptance/T3/deal-stage.render.test.jsx
// Both prompt strategies run the same UI assertions. Deal fixtures expose the
// two documented/observed T2 relationship representations so T3 measures the
// shared state-machine behaviour rather than a strategy's field naming.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SnackbarProvider } from "notistack";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routeDefinitions } from "routes/route-registry";
import {
  actionNamePattern,
  findActionButton,
  findRouteDefinition,
  normalizeStage,
} from "./acceptance-adapter";

const COMPANY_ID = "10000000-0000-4000-8000-000000000001";
const CONTACT_ID = "20000000-0000-4000-8000-000000000001";
const COMPANY = { id: COMPANY_ID, name: "Acceptance Pipeline Company" };
const CONTACT = {
  id: CONTACT_ID,
  name: "Acceptance Pipeline Contact",
  email: "pipeline-contact@test.local",
  phone: "+44 2000 000001",
  companies: [{ ...COMPANY, isPrimary: true }],
};

const STAGES = [
  "lead",
  "qualified",
  "active",
  "negotiation",
  "closed_won",
  "closed_lost",
];

function deal(stage, overrides = {}) {
  const index = STAGES.indexOf(stage) + 1;
  const defaultLinks = [{ contactId: CONTACT_ID, role: "owner" }];
  const contactLinks =
    overrides.contactLinks ??
    overrides.contacts?.map((contact) => ({
      contactId: contact.contactId ?? contact.id,
      role: contact.role ?? null,
    })) ??
    defaultLinks;
  const contacts =
    overrides.contacts ??
    contactLinks.map((link) => ({
      id: link.contactId,
      name: CONTACT.name,
      role: link.role,
    }));

  return {
    id: `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name: `Acceptance ${stage} Deal`,
    value: 10000 + index,
    stage,
    companyId: COMPANY_ID,
    company: COMPANY,
    expectedCloseDate: "2026-10-31",
    primaryContactId: CONTACT_ID,
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
    ...overrides,
    // Strategy adapter — Structured fixes `contactLinks`; Minimal leaves the
    // representation open and the baseline-compatible UI consumes `contacts`.
    // Both are derived from one canonical link set so zero-link cases agree.
    contactLinks,
    contacts,
  };
}

describe("T3 Deal stage frontend acceptance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // UI requirements 30/31: create uses a controlled selector containing only
  // lead and qualified, and lead is selected by default.
  it("offers only lead and qualified on create with lead selected by default", async () => {
    stubApi({ deals: [] });
    const user = userEvent.setup();
    const page = await renderDealsPage();
    const add = await findActionButton("create_deal");
    await user.click(add);

    const dialog = await screen.findByRole("dialog");
    const stageControl = within(dialog).getByRole("combobox", {
      name: /stage/i,
    });
    expect(controlValue(stageControl)).toContain("lead");

    const options = await openStageOptions(user, stageControl);
    expect(options).toEqual(expect.arrayContaining(["lead", "qualified"]));
    for (const forbidden of [
      "active",
      "negotiation",
      "closed_won",
      "closed_lost",
    ]) {
      expect(options).not.toContain(forbidden);
    }
    page.unmount();
  });

  // UI requirement 32: only matrix-allowed targets (plus an optional current
  // no-op value) are selectable for an existing Deal.
  it.each([
    ["lead", ["qualified", "closed_lost"]],
    ["active", ["negotiation", "closed_lost"]],
  ])(
    "shows only valid next stages when editing %s",
    async (stage, expected) => {
      stubApi({ deals: [deal(stage)] });
      const user = userEvent.setup();
      const page = await renderDealsPage();
      const dialog = await openOnlyDealForEdit(user);
      const stageControl = within(dialog).getByRole("combobox", {
        name: /stage/i,
      });
      const options = await openStageOptions(user, stageControl);

      expect(options).toEqual(expect.arrayContaining(expected));
      for (const candidate of STAGES) {
        if (candidate !== stage && !expected.includes(candidate)) {
          expect(options).not.toContain(candidate);
        }
      }
      page.unmount();
    },
  );

  // UI requirement 34: active is normally valid from qualified, but must not
  // be offered when this Deal has zero linked Contacts.
  it("does not offer active for a qualified Deal with zero linked Contacts", async () => {
    stubApi({
      deals: [deal("qualified", { contactLinks: [], primaryContactId: null })],
    });
    const user = userEvent.setup();
    const page = await renderDealsPage();
    const dialog = await openOnlyDealForEdit(user);
    const stageControl = within(dialog).getByRole("combobox", {
      name: /stage/i,
    });
    const options = await openStageOptions(user, stageControl);

    expect(options).not.toContain("active");
    expect(options).toContain("closed_lost");
    page.unmount();
  });

  // UI requirements 35/36: won has no transition action; lost exposes lead as
  // its only target (the current lost value may remain visible as a no-op).
  it("disables transitions for closed_won and only offers lead from closed_lost", async () => {
    stubApi({ deals: [deal("closed_won")] });
    const user = userEvent.setup();
    let page = await renderDealsPage();
    let dialog = await openOnlyDealForEdit(user);
    const wonControl = within(dialog).queryByRole("combobox", {
      name: /stage/i,
    });
    if (wonControl) {
      expect(
        wonControl.disabled ||
          wonControl.getAttribute("aria-disabled") === "true",
      ).toBe(true);
    } else {
      expect(within(dialog).queryByText(/transition.*stage/i)).toBeNull();
    }
    page.unmount();

    stubApi({ deals: [deal("closed_lost")] });
    page = await renderDealsPage();
    dialog = await openOnlyDealForEdit(user);
    const lostControl = within(dialog).getByRole("combobox", {
      name: /stage/i,
    });
    const options = await openStageOptions(user, lostControl);
    expect(options).toContain("lead");
    for (const candidate of STAGES) {
      if (candidate !== "lead" && candidate !== "closed_lost") {
        expect(options).not.toContain(candidate);
      }
    }
    page.unmount();
  });

  // UI requirement 33: selecting negotiation without a date is blocked inline.
  it("requires an expected close date when negotiation is selected", async () => {
    stubApi({ deals: [deal("active", { expectedCloseDate: null })] });
    const user = userEvent.setup();
    const page = await renderDealsPage();
    const dialog = await openOnlyDealForEdit(user);
    const stageControl = within(dialog).getByRole("combobox", {
      name: /stage/i,
    });

    await selectStage(user, stageControl, "negotiation");
    await user.click(
      within(dialog).getByRole("button", { name: /save|update/i }),
    );

    await waitFor(() => {
      expect(
        within(dialog).queryAllByText(
          /expected.*close.*required|close.*date.*required/i,
        ).length,
      ).toBeGreaterThan(0);
    });
    page.unmount();
  });

  // UI requirement 37: a backend transition error is shown inline and the
  // visible/stored stage is not advanced optimistically.
  it("shows a transition API error inline and leaves the stage unchanged", async () => {
    const leadDeal = deal("lead");
    stubApi({ deals: [leadDeal], rejectStageMutation: true });
    const user = userEvent.setup();
    const page = await renderDealsPage();
    const dialog = await openOnlyDealForEdit(user);
    const stageControl = within(dialog).getByRole("combobox", {
      name: /stage/i,
    });

    await selectStage(user, stageControl, "qualified");
    await user.click(
      within(dialog).getByRole("button", { name: /save|update/i }),
    );

    await waitFor(() => {
      expect(
        within(dialog).getByText("Transition blocked by acceptance test"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(leadDeal.name).closest("tr") ?? document.body,
    ).toHaveTextContent(/lead/i);
    page.unmount();
  });
});

async function renderDealsPage() {
  const entry = findRouteDefinition(routeDefinitions, "deals");
  const pageModule = await entry.loader();
  const DealsPage = pageModule.default;
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={["/deals"]}>
          <Routes>
            <Route path="/deals" element={<DealsPage />} />
          </Routes>
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

async function openOnlyDealForEdit(user) {
  await screen.findByText(/Acceptance .* Deal/i);
  const edit = screen.getAllByRole("button", {
    name: actionNamePattern("edit"),
  })[0];
  await user.click(edit);
  return screen.findByRole("dialog");
}

async function openStageOptions(user, stageControl) {
  await user.click(stageControl);
  const optionElements = await screen.findAllByRole("option");
  return optionElements.map((option) => normalizeStage(option.textContent));
}

async function selectStage(user, stageControl, target) {
  await user.click(stageControl);
  const options = await screen.findAllByRole("option");
  const targetOption = options.find(
    (option) => normalizeStage(option.textContent) === target,
  );
  expect(targetOption, `expected a ${target} stage option`).toBeTruthy();
  await user.click(targetOption);
}

function controlValue(control) {
  return normalizeStage(control.value || control.textContent || "");
}

function stubApi({ deals = [], rejectStageMutation = false } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init = {}) => {
      const url = typeof input === "string" ? input : (input?.url ?? "");
      const method = String(init.method ?? "GET").toUpperCase();

      if (method !== "GET" && /\/api\/deals\//.test(url)) {
        if (rejectStageMutation) {
          return jsonResponse(
            {
              success: false,
              statusCode: 422,
              code: "INVALID_STAGE_TRANSITION",
              message: "Transition blocked by acceptance test",
            },
            422,
          );
        }
        const id = url.match(/\/api\/deals\/([^/]+)/)?.[1];
        const current = deals.find((item) => item.id === id) ?? deals[0];
        const body = init.body ? JSON.parse(init.body) : {};
        return jsonResponse({ ...current, ...body });
      }
      if (/\/api\/deals\/[^/?]+/.test(url)) {
        const id = url.match(/\/api\/deals\/([^/?]+)/)?.[1];
        return jsonResponse(deals.find((item) => item.id === id) ?? deals[0]);
      }
      if (/\/api\/deals(?:\?|$)/.test(url)) {
        return jsonResponse(page(deals));
      }
      if (/\/api\/companies(?:\?|$)/.test(url)) {
        return jsonResponse(page([COMPANY]));
      }
      if (/\/api\/contacts(?:\?|$)/.test(url)) {
        return jsonResponse(page([CONTACT]));
      }

      throw new Error(`Unexpected fetch call in T3 acceptance test: ${url}`);
    }),
  );
}

function page(items) {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 100,
    totalPages: items.length > 0 ? 1 : 0,
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 400 ? "Request failed" : "OK",
    text: async () => JSON.stringify(body),
  };
}
