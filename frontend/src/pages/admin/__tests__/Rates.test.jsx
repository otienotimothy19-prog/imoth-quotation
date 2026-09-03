import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../api/client";
import Rates from "../Rates";

vi.mock("../../../api/client", async () => {
  const actual = await vi.importActual("../../../api/client");
  return { ...actual, api: { get: vi.fn(), put: vi.fn(), patch: vi.fn(), post: vi.fn() } };
});

const INSURER = { id: "ins1", name: "Test Insurer" };
const BANDED_CLASS = { id: "cls1", label: "Private Car", category: "private", active: true, flat_only: null };
const FLAT_CLASS = { id: "cls2", label: "TPO Flat", category: "tpo", active: true, flat_only: { premium: 3100, rate_on_si: null, min_premium: null, note: "Annual TPO" } };
const PSV_CLASS = { id: "cls3", label: "PSV Chauffeur Driven", category: "psv", active: true, flat_only: null };
const COMMERCIAL_CLASS = { id: "cls4", label: "Commercial General Cartage", category: "commercial", active: true, flat_only: null };
const INSTITUTIONAL_CLASS = {
  id: "cls5",
  label: "Commercial Institutional",
  category: "institutional",
  active: true,
  flat_only: null,
  pll_options: [
    { key: "student", label: "School students", rate: 250 },
    { key: "corporate", label: "Corporate / general hire", rate: 500 },
  ],
};

function mockBaseCalls() {
  api.get.mockImplementation((url, config) => {
    if (url === "/api/admin/insurers") return Promise.resolve({ data: [INSURER] });
    if (url === "/api/admin/motor-classes" && config?.params?.insurer_id === "ins1") {
      return Promise.resolve({ data: [BANDED_CLASS, FLAT_CLASS, PSV_CLASS, COMMERCIAL_CLASS, INSTITUTIONAL_CLASS] });
    }
    if (url === "/api/admin/rates/cls1") {
      return Promise.resolve({
        data: {
          motor_class_id: "cls1",
          flat_only: null,
          has_lr_toggle: false,
          bands: [
            {
              min_si: 500000, max_si: 999999, rate: 0.06, min_premium: 37500,
              min_passengers: null, max_passengers: null,
              ep_included: false, ep_not_offered: false, ep_rate: 0.0025, ep_min: 5000, ep_mandatory: false,
              pvt_included: true, pvt_not_offered: false, pvt_rate: 0, pvt_min: 0, pvt_mandatory: false,
            },
          ],
          bands_alt: null,
        },
      });
    }
    if (url === "/api/admin/rates/cls1/versions") return Promise.resolve({ data: [] });
    if (url === "/api/admin/rates/cls2") return Promise.resolve({ data: { motor_class_id: "cls2", flat_only: FLAT_CLASS.flat_only, bands: [], bands_alt: null } });
    if (url === "/api/admin/rates/cls2/versions") return Promise.resolve({ data: [] });
    if (url === "/api/admin/rates/cls3") {
      return Promise.resolve({
        data: {
          motor_class_id: "cls3",
          flat_only: null,
          has_lr_toggle: false,
          bands: [
            {
              min_si: 500000, max_si: null, rate: 0.05, min_premium: 35000,
              min_passengers: null, max_passengers: null,
              ep_included: false, ep_not_offered: false, ep_rate: 0.005, ep_min: 10000, ep_mandatory: false,
              pvt_included: false, pvt_not_offered: false, pvt_rate: 0.005, pvt_min: 10000, pvt_mandatory: false,
            },
          ],
          bands_alt: null,
        },
      });
    }
    if (url === "/api/admin/rates/cls3/versions") return Promise.resolve({ data: [] });
    if (url === "/api/admin/rates/cls4") {
      return Promise.resolve({
        data: {
          motor_class_id: "cls4",
          flat_only: null,
          has_lr_toggle: false,
          bands: [
            {
              min_si: 500000, max_si: null, rate: 0.045, min_premium: 30000,
              min_passengers: null, max_passengers: null, min_tonnage: null, max_tonnage: null,
              ep_included: false, ep_not_offered: false, ep_rate: 0.005, ep_min: 10000, ep_mandatory: false,
              pvt_included: false, pvt_not_offered: false, pvt_rate: 0.005, pvt_min: 10000, pvt_mandatory: false,
            },
          ],
          bands_alt: null,
        },
      });
    }
    if (url === "/api/admin/rates/cls4/versions") return Promise.resolve({ data: [] });
    if (url === "/api/admin/rates/cls5") {
      return Promise.resolve({
        data: {
          motor_class_id: "cls5",
          flat_only: null,
          has_lr_toggle: false,
          bands: [
            {
              min_si: 500000, max_si: null, rate: 0.0325, min_premium: 30000,
              min_passengers: null, max_passengers: null,
              ep_included: false, ep_not_offered: false, ep_rate: 0.005, ep_min: 5000, ep_mandatory: false,
              pvt_included: false, pvt_not_offered: false, pvt_rate: 0.0025, pvt_min: 3500, pvt_mandatory: false,
            },
          ],
          bands_alt: null,
        },
      });
    }
    if (url === "/api/admin/rates/cls5/versions") return Promise.resolve({ data: [] });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

async function selectInsurerAndClass(user, className) {
  await screen.findByRole("option", { name: "Test Insurer" });
  await user.selectOptions(screen.getByLabelText("Insurer"), "ins1");
  await waitFor(() => expect(screen.getByLabelText("Motor Class")).not.toBeDisabled());
  await user.selectOptions(screen.getByLabelText("Motor Class"), screen.getByRole("option", { name: new RegExp(className) }));
}

describe("Rates admin page", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.put.mockReset();
    api.patch.mockReset();
    api.post.mockReset();
  });

  it("Included / Not Offered / Mandatory are mutually exclusive for a rate band", async () => {
    const user = userEvent.setup();
    mockBaseCalls();
    render(
      <MemoryRouter>
        <Rates />
      </MemoryRouter>
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/api/admin/insurers"));
    await selectInsurerAndClass(user, "Private Car");

    const card = (await screen.findByText("Band 1")).closest(".rate-band-card");
    const epGroup = within(card).getByText("Excess Protector").closest(".cover-group");

    const included = within(epGroup).getByLabelText("Included");
    const notOffered = within(epGroup).getByLabelText("Not offered");
    const mandatory = within(epGroup).getByLabelText("Mandatory");

    // Band starts as ep_not_offered: false, ep_included: false -> "optional".
    expect(within(epGroup).getByLabelText("Optional (customer choice)")).toBeChecked();

    await user.click(mandatory);
    expect(mandatory).toBeChecked();
    expect(included).not.toBeChecked();
    expect(notOffered).not.toBeChecked();

    await user.click(included);
    expect(included).toBeChecked();
    expect(mandatory).not.toBeChecked();
    expect(notOffered).not.toBeChecked();

    await user.click(notOffered);
    expect(notOffered).toBeChecked();
    expect(included).not.toBeChecked();
    expect(mandatory).not.toBeChecked();
  });

  it("requires a change reason before saving standard bands", async () => {
    const user = userEvent.setup();
    mockBaseCalls();
    render(
      <MemoryRouter>
        <Rates />
      </MemoryRouter>
    );
    await selectInsurerAndClass(user, "Private Car");
    await screen.findByText("Band 1");

    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByText(/reason for this rate change/i)).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });

  it("flat-rate editing requires either a fixed premium or a rate on sum insured", async () => {
    const user = userEvent.setup();
    mockBaseCalls();
    render(
      <MemoryRouter>
        <Rates />
      </MemoryRouter>
    );
    await selectInsurerAndClass(user, "TPO Flat");
    await screen.findByText("Flat-Rate Product");

    // Clear the pre-filled fixed premium, leave rate-on-SI blank too.
    const premiumInput = screen.getByLabelText(/fixed premium/i);
    await user.clear(premiumInput);
    await user.type(screen.getByPlaceholderText(/2027 rate card update/i), "test change");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/provide either a fixed premium or a rate/i)).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("saves a flat-rate change with the reason recorded", async () => {
    const user = userEvent.setup();
    mockBaseCalls();
    api.patch.mockResolvedValue({ data: {} });
    render(
      <MemoryRouter>
        <Rates />
      </MemoryRouter>
    );
    await selectInsurerAndClass(user, "TPO Flat");
    await screen.findByText("Flat-Rate Product");

    await user.type(screen.getByPlaceholderText(/2027 rate card update/i), "annual review");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/api/admin/motor-classes/cls2",
        expect.objectContaining({ change_reason: "annual review", flat_only: expect.objectContaining({ premium: 3100 }) })
      )
    );
  });

  it("shows passenger-limit fields for PSV bands but not for non-PSV bands", async () => {
    const user = userEvent.setup();
    mockBaseCalls();
    render(
      <MemoryRouter>
        <Rates />
      </MemoryRouter>
    );

    await selectInsurerAndClass(user, "Private Car");
    const privateCard = (await screen.findByText("Band 1")).closest(".rate-band-card");
    expect(within(privateCard).queryByLabelText("Minimum Passengers")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Motor Class"), screen.getByRole("option", { name: /PSV Chauffeur Driven/ }));
    const psvCard = (await screen.findByText("Band 1")).closest(".rate-band-card");
    expect(within(psvCard).getByLabelText("Minimum Passengers")).toBeInTheDocument();
    expect(within(psvCard).getByLabelText("Maximum Passengers")).toBeInTheDocument();
  });

  it("saves passenger limits entered on a PSV band", async () => {
    const user = userEvent.setup();
    mockBaseCalls();
    api.put.mockResolvedValue({ data: {} });
    render(
      <MemoryRouter>
        <Rates />
      </MemoryRouter>
    );
    await selectInsurerAndClass(user, "PSV Chauffeur Driven");
    const card = (await screen.findByText("Band 1")).closest(".rate-band-card");
    const bandsCard = screen.getByText("Standard Bands").closest(".card");

    await user.type(within(card).getByLabelText("Minimum Passengers"), "7");
    await user.type(within(card).getByLabelText("Maximum Passengers"), "14");
    await user.type(within(bandsCard).getByPlaceholderText(/2027 rate card update/i), "split by passenger count");
    await user.click(within(bandsCard).getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        "/api/admin/rates/cls3",
        expect.objectContaining({
          bands: [expect.objectContaining({ min_passengers: 7, max_passengers: 14 })],
        })
      )
    );
  });

  it("offers a Comprehensive vs Third Party choice when adding a new rate for an insurer", async () => {
    const user = userEvent.setup();
    mockBaseCalls();
    render(
      <MemoryRouter>
        <Rates />
      </MemoryRouter>
    );
    await screen.findByRole("option", { name: "Test Insurer" });
    await user.selectOptions(screen.getByLabelText("Insurer"), "ins1");
    await user.click(screen.getByRole("button", { name: "+ Add New Rate" }));

    expect(screen.getByRole("button", { name: /comprehensive \(sum-insured bands\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /third party \(flat rate\)/i })).toBeInTheDocument();
  });

  it("creates a Third Party class with the entered premium and switches straight to editing it", async () => {
    const user = userEvent.setup();
    mockBaseCalls();
    api.post.mockResolvedValue({ data: { id: "new-tpo", flat_only: { premium: 3200 } } });
    api.get.mockImplementation((url, config) => {
      if (url === "/api/admin/insurers") return Promise.resolve({ data: [INSURER] });
      if (url === "/api/admin/motor-classes" && config?.params?.insurer_id === "ins1") {
        return Promise.resolve({
          data: [BANDED_CLASS, FLAT_CLASS, PSV_CLASS, { id: "new-tpo", label: "New TPO", category: "tpo", active: true, flat_only: { premium: 3200 } }],
        });
      }
      if (url === "/api/admin/rates/new-tpo") {
        return Promise.resolve({
          data: { motor_class_id: "new-tpo", flat_only: { premium: 3200, rate_on_si: null, min_premium: null, note: "" }, bands: [], bands_alt: null },
        });
      }
      if (url === "/api/admin/rates/new-tpo/versions") return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    render(
      <MemoryRouter>
        <Rates />
      </MemoryRouter>
    );
    await screen.findByRole("option", { name: "Test Insurer" });
    await user.selectOptions(screen.getByLabelText("Insurer"), "ins1");
    await user.click(screen.getByRole("button", { name: "+ Add New Rate" }));
    await user.click(screen.getByRole("button", { name: /third party \(flat rate\)/i }));

    await user.type(screen.getByLabelText(/code \(unique/i), "tpo_new");
    await user.type(screen.getByLabelText("Label"), "New TPO");
    await user.type(screen.getByLabelText(/^fixed premium/i), "3200");
    await user.click(screen.getByRole("button", { name: "Create Class" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/api/admin/motor-classes",
        expect.objectContaining({
          insurer_id: "ins1",
          code: "tpo_new",
          category: "tpo",
          flat_only: expect.objectContaining({ premium: 3200, rate_on_si: null }),
        })
      )
    );
    expect(await screen.findByText("Flat-Rate Product")).toBeInTheDocument();
  });

  it("creates a Comprehensive class without flat_only and switches straight to its band editor", async () => {
    const user = userEvent.setup();
    mockBaseCalls();
    api.post.mockResolvedValue({ data: { id: "new-comp" } });
    api.get.mockImplementation((url, config) => {
      if (url === "/api/admin/insurers") return Promise.resolve({ data: [INSURER] });
      if (url === "/api/admin/motor-classes" && config?.params?.insurer_id === "ins1") {
        return Promise.resolve({ data: [BANDED_CLASS, FLAT_CLASS, PSV_CLASS] });
      }
      if (url === "/api/admin/rates/new-comp") {
        return Promise.resolve({ data: { motor_class_id: "new-comp", flat_only: null, has_lr_toggle: false, bands: [], bands_alt: null } });
      }
      if (url === "/api/admin/rates/new-comp/versions") return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    render(
      <MemoryRouter>
        <Rates />
      </MemoryRouter>
    );
    await screen.findByRole("option", { name: "Test Insurer" });
    await user.selectOptions(screen.getByLabelText("Insurer"), "ins1");
    await user.click(screen.getByRole("button", { name: "+ Add New Rate" }));
    await user.click(screen.getByRole("button", { name: /comprehensive \(sum-insured bands\)/i }));

    await user.type(screen.getByLabelText(/code \(unique/i), "comp_new");
    await user.type(screen.getByLabelText("Label"), "New Comprehensive");
    await user.click(screen.getByRole("button", { name: "Create Class" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/api/admin/motor-classes",
        expect.objectContaining({ insurer_id: "ins1", code: "comp_new", flat_only: null })
      )
    );
    expect(await screen.findByText("Standard Bands")).toBeInTheDocument();
  });

  it("shows tonnage-limit fields for commercial bands but not for private bands", async () => {
    const user = userEvent.setup();
    mockBaseCalls();
    render(
      <MemoryRouter>
        <Rates />
      </MemoryRouter>
    );

    await selectInsurerAndClass(user, "Private Car");
    const privateCard = (await screen.findByText("Band 1")).closest(".rate-band-card");
    expect(within(privateCard).queryByLabelText("Minimum Tonnage")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Motor Class"), screen.getByRole("option", { name: /Commercial General Cartage/ }));
    const commercialCard = (await screen.findByText("Band 1")).closest(".rate-band-card");
    expect(within(commercialCard).getByLabelText("Minimum Tonnage")).toBeInTheDocument();
    expect(within(commercialCard).getByLabelText("Maximum Tonnage")).toBeInTheDocument();
  });

  it("saves tonnage limits entered on a commercial band", async () => {
    const user = userEvent.setup();
    mockBaseCalls();
    api.put.mockResolvedValue({ data: {} });
    render(
      <MemoryRouter>
        <Rates />
      </MemoryRouter>
    );
    await selectInsurerAndClass(user, "Commercial General Cartage");
    const card = (await screen.findByText("Band 1")).closest(".rate-band-card");
    const bandsCard = screen.getByText("Standard Bands").closest(".card");

    await user.type(within(card).getByLabelText("Minimum Tonnage"), "3");
    await user.type(within(card).getByLabelText("Maximum Tonnage"), "8");
    await user.type(within(bandsCard).getByPlaceholderText(/2027 rate card update/i), "split by tonnage");
    await user.click(within(bandsCard).getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        "/api/admin/rates/cls4",
        expect.objectContaining({
          bands: [expect.objectContaining({ min_tonnage: 3, max_tonnage: 8 })],
        })
      )
    );
  });

  it("shows the Passenger Legal Liability editor pre-filled with existing tiered options for an institutional class", async () => {
    const user = userEvent.setup();
    mockBaseCalls();
    render(
      <MemoryRouter>
        <Rates />
      </MemoryRouter>
    );
    await selectInsurerAndClass(user, "Commercial Institutional");

    await screen.findByText("Passenger Legal Liability (PLL)");
    expect(screen.getByDisplayValue("student")).toBeInTheDocument();
    expect(screen.getByDisplayValue("School students")).toBeInTheDocument();
    expect(screen.getByDisplayValue("250")).toBeInTheDocument();
    expect(screen.getByDisplayValue("corporate")).toBeInTheDocument();
    expect(screen.getByDisplayValue("500")).toBeInTheDocument();
  });

  it("does not show the Passenger Legal Liability editor for a private (non-passenger) class", async () => {
    const user = userEvent.setup();
    mockBaseCalls();
    render(
      <MemoryRouter>
        <Rates />
      </MemoryRouter>
    );
    await selectInsurerAndClass(user, "Private Car");
    await screen.findByText("Standard Bands");
    expect(screen.queryByText("Passenger Legal Liability (PLL)")).not.toBeInTheDocument();
  });

  it("saves a new tiered Passenger Legal Liability rate (school vs corporate)", async () => {
    const user = userEvent.setup();
    mockBaseCalls();
    api.patch.mockResolvedValue({ data: {} });
    render(
      <MemoryRouter>
        <Rates />
      </MemoryRouter>
    );
    await selectInsurerAndClass(user, "PSV Chauffeur Driven");
    await screen.findByText("Passenger Legal Liability (PLL)");

    await user.click(screen.getByRole("radio", { name: /tiered options/i }));
    await user.click(screen.getByRole("button", { name: "+ Add Option" }));
    await user.type(screen.getByLabelText("Key"), "student");
    await user.type(screen.getByLabelText("Label"), "School students");
    await user.type(screen.getByLabelText("Rate per seat (KES)"), "250");

    const pllCard = screen.getByText("Passenger Legal Liability (PLL)").closest(".card");
    await user.type(within(pllCard).getByPlaceholderText(/updated pll rates/i), "add school rate");
    await user.click(within(pllCard).getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/api/admin/motor-classes/cls3",
        expect.objectContaining({
          pll_per_seat: null,
          pll_options: [{ key: "student", label: "School students", rate: 250 }],
          change_reason: "add school rate",
        })
      )
    );
  });
});
