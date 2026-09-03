import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../api/client";
import Rates from "../Rates";

vi.mock("../../../api/client", async () => {
  const actual = await vi.importActual("../../../api/client");
  return { ...actual, api: { get: vi.fn(), put: vi.fn(), patch: vi.fn() } };
});

const INSURER = { id: "ins1", name: "Test Insurer" };
const BANDED_CLASS = { id: "cls1", label: "Private Car", active: true, flat_only: null };
const FLAT_CLASS = { id: "cls2", label: "TPO Flat", active: true, flat_only: { premium: 3100, rate_on_si: null, min_premium: null, note: "Annual TPO" } };

function mockBaseCalls() {
  api.get.mockImplementation((url, config) => {
    if (url === "/api/admin/insurers") return Promise.resolve({ data: [INSURER] });
    if (url === "/api/admin/motor-classes" && config?.params?.insurer_id === "ins1") {
      return Promise.resolve({ data: [BANDED_CLASS, FLAT_CLASS] });
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
});
