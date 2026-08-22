// Frontend functional acceptance for T2. Overlaid into:
//   <workspace>/frontend/src/test/acceptance/T2/relationships.render.test.jsx
//
// As with T1, both prompt strategies run these exact UI assertions through the
// central route registry. Deal fixtures expose the two documented/observed
// transport representations so the test measures shared UI behaviour rather
// than one strategy's field naming.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SnackbarProvider } from "notistack";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routeDefinitions } from "routes/route-registry";
import { LayoutSettingsProvider } from "contexts/LayoutSettingsContext";
import ThemeCustomization from "themes";
import {
  findActionButton,
  findOptionByName,
  findRouteDefinition,
} from "./acceptance-adapter";

const COMPANY_A = "10000000-0000-4000-8000-000000000001";
const COMPANY_B = "10000000-0000-4000-8000-000000000002";
const CONTACT_A = "20000000-0000-4000-8000-000000000001";
const CONTACT_B = "20000000-0000-4000-8000-000000000002";
const DEAL_MANY = "30000000-0000-4000-8000-000000000001";
const DEAL_ZERO = "30000000-0000-4000-8000-000000000002";

const companies = [
  { id: COMPANY_A, name: "Acceptance Parent Company" },
  { id: COMPANY_B, name: "Acceptance Subsidiary Company" },
];

const linkedContact = {
  id: CONTACT_A,
  name: "Acceptance Multi Company Contact",
  email: "multi-company@test.local",
  phone: "+44 2000 000001",
  role: "Buyer",
  companies: [
    { ...companies[0], isPrimary: true },
    { ...companies[1], isPrimary: false },
  ],
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

const secondaryCompanyContact = {
  id: CONTACT_B,
  name: "Acceptance Secondary Company Contact",
  email: "secondary-company@test.local",
  phone: "+44 2000 000002",
  role: "Legal",
  companies: [
    { ...companies[0], isPrimary: true },
    { ...companies[1], isPrimary: false },
  ],
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

const dealMany = {
  id: DEAL_MANY,
  name: "Acceptance Deal With Multiple Contacts",
  value: 50000,
  stage: "qualified",
  companyId: COMPANY_A,
  company: companies[0],
  expectedCloseDate: "2026-10-31",
  contactLinks: [
    { contactId: CONTACT_A, role: "decision-maker" },
    { contactId: CONTACT_B, role: "legal" },
  ],
  // Strategy adapter — Minimal leaves the response representation open; the
  // baseline-compatible frontend consumes Contact summaries in `contacts`.
  contacts: [
    { id: CONTACT_A, name: linkedContact.name, role: "decision-maker" },
    { id: CONTACT_B, name: secondaryCompanyContact.name, role: "legal" },
  ],
  primaryContactId: CONTACT_A,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

const dealZero = {
  id: DEAL_ZERO,
  name: "Acceptance Deal With Zero Contacts",
  value: 12000,
  stage: "lead",
  companyId: COMPANY_B,
  company: companies[1],
  expectedCloseDate: null,
  contactLinks: [],
  contacts: [],
  primaryContactId: null,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

describe("T2 relationship frontend acceptance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // UI acceptance 9 and Edge case 3: multi-Company Contacts render and have
  // a visible indication that more than one Company is linked.
  it("renders a multi-Company Contact with a visible multiple-link indication", async () => {
    stubApi();
    const { Component, routePath } = await loadRoute("contacts");
    renderAt("/contacts", routePath, Component);

    await screen.findAllByText(linkedContact.name);
    const multipleLinkSignals = screen.queryAllByText(
      /2\s+compan|multiple compan|additional compan|secondary|Acceptance (Parent|Subsidiary) Company/i,
    );
    expect(
      multipleLinkSignals.length,
      "expected the Contact list to visibly indicate multiple linked Companies",
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/^null$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^undefined$/i)).not.toBeInTheDocument();
  });

  it("renders a multi-Company Contact on the detail view without crashing", async () => {
    stubApi();
    const { Component, routePath } = await loadRoute("contacts/:id");
    renderAt(`/contacts/${CONTACT_A}`, routePath, Component);

    await screen.findAllByText(linkedContact.name);
    expect(screen.queryByText(/^null$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^undefined$/i)).not.toBeInTheDocument();
  });

  // UI acceptance 1: filtering the Company detail's Contact request by the
  // secondary Company must still display the linked Contact.
  it("shows a Contact on the detail page of its secondary Company", async () => {
    stubApi();
    const { Component, routePath } = await loadRoute("companies/:id");
    renderAt(`/companies/${COMPANY_B}`, routePath, Component);

    await screen.findAllByText("Acceptance Subsidiary Company");
    await screen.findAllByText(secondaryCompanyContact.name);
  });

  // UI acceptance 8 and Edge case 4: both many-link and zero-link Deals must
  // render without null/undefined leakage or a component crash.
  it("renders Deals with multiple and zero linked Contacts on list and detail views", async () => {
    stubApi();
    const listRoute = await loadRoute("deals");
    const listRender = renderAt(
      "/deals",
      listRoute.routePath,
      listRoute.Component,
    );

    await screen.findAllByText(dealMany.name);
    await screen.findAllByText(dealZero.name);
    expect(screen.queryByText(/^null$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^undefined$/i)).not.toBeInTheDocument();

    listRender.unmount();
    const detailRoute = await loadRoute("deals/:id");
    renderAt(
      `/deals/${DEAL_MANY}`,
      detailRoute.routePath,
      detailRoute.Component,
    );

    await screen.findAllByText(dealMany.name);
    expect(screen.queryByText(/^null$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^undefined$/i)).not.toBeInTheDocument();
  });

  // UI acceptance 2-4: the existing Contact create/edit surface must expose
  // multi-Company/primary controls and reject a no-Company submission inline.
  it("exposes Company-primary controls and inline validation in the Contact form", async () => {
    stubApi({ emptyContacts: true });
    const user = userEvent.setup();
    const { Component, routePath } = await loadRoute("contacts");
    renderAt("/contacts", routePath, Component);

    const addButton = await findActionButton("create_contact");
    await user.click(addButton);

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getAllByText(/compan/i).length,
      "expected the Contact form to include Company-link controls",
    ).toBeGreaterThan(0);

    const submit = within(dialog).getByRole("button", {
      name: /create|save/i,
    });
    await user.click(submit);

    await waitFor(() => {
      expect(
        within(dialog).queryAllByText(
          /company.*required|select.*company|link.*company|at least one company/i,
        ).length,
      ).toBeGreaterThan(0);
    });

    const addCompany = within(dialog).queryByRole("button", {
      name: /add.*company|link.*company/i,
    });
    if (addCompany) {
      await user.click(addCompany);
    }

    const companyInputs = within(dialog).queryAllByRole("combobox", {
      name: /compan/i,
    });
    expect(
      companyInputs.length,
      "expected an accessible Company selector in the Contact form",
    ).toBeGreaterThan(0);
    await user.click(companyInputs[0]);
    await user.click(
      await findOptionByName("Contact Company selector", companies[0].name),
    );

    // With exactly one linked Company, it must be primary by default. The
    // implementation may use a checked input or a visible Primary badge/text.
    await waitFor(() => {
      const primaryInputs = [
        ...within(dialog).queryAllByRole("radio", { name: /primary/i }),
        ...within(dialog).queryAllByRole("checkbox", { name: /primary/i }),
      ];
      const hasCheckedPrimary = primaryInputs.some((input) => input.checked);
      const hasPrimaryText =
        within(dialog).queryAllByText(/primary/i).length > 0;
      expect(hasCheckedPrimary || hasPrimaryText).toBe(true);
    });
  });

  // UI acceptance 5-7: the Deal form exposes one Company, zero-or-more
  // Contacts, per-link role, and optional primary selection on one surface.
  it("exposes Company, Contact role, and primary controls in the Deal form", async () => {
    stubApi({ emptyDeals: true });
    const user = userEvent.setup();
    const { Component, routePath } = await loadRoute("deals");
    renderAt("/deals", routePath, Component);

    const addButton = await findActionButton("create_deal");
    await user.click(addButton);
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).queryAllByText(/company/i).length).toBeGreaterThan(0);
    expect(within(dialog).queryAllByText(/contact/i).length).toBeGreaterThan(0);

    const submit = within(dialog).getByRole("button", { name: /create|save/i });
    await user.click(submit);
    await waitFor(() => {
      expect(
        within(dialog).queryAllByText(
          /company.*required|select.*company|choose.*company/i,
        ).length,
      ).toBeGreaterThan(0);
    });

    // Shared UI workflow: Minimal loads Contact choices after a Company is
    // selected, while Structured can load them eagerly. Selecting the required
    // Company first is valid for both and mirrors the actual user flow.
    const companyInput = within(dialog).getAllByRole("combobox", {
      name: /company/i,
    })[0];
    await user.click(companyInput);
    await user.click(
      await findOptionByName("Deal Company selector", companies[0].name),
    );

    const addContact = within(dialog).queryByRole("button", {
      name: /add.*contact/i,
    });
    if (addContact) {
      await user.click(addContact);
    }

    const contactInputs = within(dialog).queryAllByRole("combobox", {
      name: /contact/i,
    });
    expect(
      contactInputs.length,
      "expected an accessible Contact selector in the Deal form",
    ).toBeGreaterThan(0);
    await user.click(contactInputs[0]);
    await user.click(
      await findOptionByName("Deal Contact selector", linkedContact.name),
    );

    await waitFor(() => {
      expect(within(dialog).queryAllByText(/role/i).length).toBeGreaterThan(0);
      const primaryInputs = [
        ...within(dialog).queryAllByRole("radio", { name: /primary/i }),
        ...within(dialog).queryAllByRole("checkbox", { name: /primary/i }),
      ];
      if (primaryInputs.length > 0) {
        expect(primaryInputs.filter((input) => input.checked)).toHaveLength(1);
      } else {
        expect(
          within(dialog).queryAllByText(/primary/i).length,
        ).toBeGreaterThan(0);
      }
    });

    const namedRemoveButtons = within(dialog).queryAllByRole("button", {
      name: /remove.*contact|delete.*contact/i,
    });
    const glyphRemoveButtons = within(dialog)
      .queryAllByRole("button")
      .filter((button) => button.textContent?.trim() === "✕");
    // Shared behaviour is removability. Structured supplies an accessible
    // Remove-contact name; the Minimal implementation uses a visible × glyph.
    expect(
      namedRemoveButtons.length + glyphRemoveButtons.length,
      "expected each selected Deal Contact to be removable",
    ).toBeGreaterThan(0);
  });

  // UI acceptance 2/6/7: edit mode must load the existing complete link sets,
  // including both Companies and per-Deal Contact roles.
  it("loads existing relationship links in Contact and Deal edit surfaces", async () => {
    stubApi();
    const user = userEvent.setup();
    const contactRoute = await loadRoute("contacts");
    const contactRender = renderAt(
      "/contacts",
      contactRoute.routePath,
      contactRoute.Component,
    );

    await screen.findByText(linkedContact.name);
    const contactEdit = screen.getAllByRole("button", { name: /edit/i })[0];
    await user.click(contactEdit);
    const contactDialog = await screen.findByRole("dialog");
    expect(
      within(contactDialog).queryAllByText(companies[0].name).length +
        within(contactDialog).queryAllByDisplayValue(companies[0].name).length,
    ).toBeGreaterThan(0);
    expect(
      within(contactDialog).queryAllByText(companies[1].name).length +
        within(contactDialog).queryAllByDisplayValue(companies[1].name).length,
    ).toBeGreaterThan(0);

    contactRender.unmount();
    const dealRoute = await loadRoute("deals");
    renderAt("/deals", dealRoute.routePath, dealRoute.Component);

    await screen.findByText(dealMany.name);
    const dealEdit = screen.getAllByRole("button", { name: /edit/i })[0];
    await user.click(dealEdit);
    const dealDialog = await screen.findByRole("dialog");
    expect(
      within(dealDialog).queryAllByDisplayValue("decision-maker").length +
        within(dealDialog).queryAllByText("decision-maker").length,
    ).toBeGreaterThan(0);
    expect(
      within(dealDialog).queryAllByDisplayValue("legal").length +
        within(dealDialog).queryAllByText("legal").length,
    ).toBeGreaterThan(0);
  });
});

async function loadRoute(expectedPath) {
  const entry = findRouteDefinition(routeDefinitions, expectedPath);
  const pageModule = await entry.loader();
  return { Component: pageModule.default, routePath: `/${entry.path}` };
}

function renderAt(initialPath, routePath, Component) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <LayoutSettingsProvider>
      <ThemeCustomization>
        <QueryClientProvider client={queryClient}>
          <SnackbarProvider>
            <MemoryRouter initialEntries={[initialPath]}>
              <Routes>
                <Route path={routePath} element={<Component />} />
              </Routes>
            </MemoryRouter>
          </SnackbarProvider>
        </QueryClientProvider>
      </ThemeCustomization>
    </LayoutSettingsProvider>,
  );
}

function stubApi(options = {}) {
  const { emptyContacts = false, emptyDeals = false } = options;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = typeof input === "string" ? input : (input?.url ?? "");

      if (url.includes(`/api/companies/${COMPANY_B}`)) {
        return jsonResponse({ ...companies[1] });
      }
      if (url.includes(`/api/companies/${COMPANY_A}`)) {
        return jsonResponse({ ...companies[0] });
      }
      if (/\/api\/companies(?:\?|$)/.test(url)) {
        return jsonResponse(page(companies));
      }
      if (url.includes(`/api/contacts/${CONTACT_A}`)) {
        return jsonResponse(linkedContact);
      }
      if (url.includes(`/api/contacts/${CONTACT_B}`)) {
        return jsonResponse(secondaryCompanyContact);
      }
      if (/\/api\/contacts(?:\?|$)/.test(url)) {
        if (url.includes(`companyId=${COMPANY_B}`)) {
          return jsonResponse(page([secondaryCompanyContact]));
        }
        return jsonResponse(page(emptyContacts ? [] : [linkedContact]));
      }
      if (url.includes(`/api/deals/${DEAL_MANY}`)) {
        return jsonResponse(dealMany);
      }
      if (url.includes(`/api/deals/${DEAL_ZERO}`)) {
        return jsonResponse(dealZero);
      }
      if (/\/api\/deals(?:\?|$)/.test(url)) {
        return jsonResponse(page(emptyDeals ? [] : [dealMany, dealZero]));
      }

      throw new Error(`Unexpected fetch call in T2 acceptance test: ${url}`);
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
    text: async () => JSON.stringify(body),
  };
}
