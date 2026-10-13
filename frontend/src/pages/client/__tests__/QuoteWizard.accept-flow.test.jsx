import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuoteWizard from "../QuoteWizard";

vi.mock("../../../api/client", async () => {
  const actual = await vi.importActual("../../../api/client");
  return { ...actual, api: { post: vi.fn() } };
});

import { api } from "../../../api/client";

const CURRENT_YEAR = new Date().getFullYear();

function renderWizard() {
  return render(
    <MemoryRouter>
      <QuoteWizard />
    </MemoryRouter>
  );
}

function fillVehicleAndCover() {
  fireEvent.change(screen.getByPlaceholderText(/KCZ 538G/i), { target: { value: "KAA 123A" } });
  fireEvent.change(screen.getByPlaceholderText(`e.g. ${CURRENT_YEAR - 5}`), { target: { value: String(CURRENT_YEAR - 4) } });
  fireEvent.change(screen.getByPlaceholderText(/1500000/), { target: { value: "1500000" } });
}

describe("QuoteWizard (Vehicle & Cover -> Compare Quotes)", () => {
  beforeEach(() => {
    api.post.mockReset();
  });

  it("asks only for vehicle and cover details -- no personal information -- on the first step", () => {
    renderWizard();
    expect(screen.getByText(/tell us about your vehicle/i)).toBeInTheDocument();
    expect(screen.getByText(/registration number/i)).toBeInTheDocument();
    expect(screen.queryByText(/full name/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^phone number$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/id \/ passport number/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/kra pin/i)).not.toBeInTheDocument();
  });

  it("sends checked optional protections to the pricing API", async () => {
    api.post.mockResolvedValue({ data: { options: [], ineligible_options: [] } });
    renderWizard();
    fillVehicleAndCover();
    const pvt = screen.getByRole('checkbox', { name: /PVT/ });
    const ep = screen.getByRole('checkbox', { name: /Excess Protector/ });
    expect(pvt).not.toBeChecked();
    expect(ep).not.toBeChecked();
    fireEvent.click(pvt);
    fireEvent.click(ep);
    fireEvent.click(screen.getByRole('button', { name: /compare quotes/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/quotes/compare',
      expect.objectContaining({ options: { pvt: true, ep: true } })));
  });

  it("compares quotes with no client field in the request body", async () => {
    api.post.mockResolvedValueOnce({
      data: {
        options: [
          {
            offer_id: "offer-1", offer_token: "offer-token",
            insurer_id: "insurer-1",
            insurer_name: "Test Insurer",
            motor_class_id: "class-1",
            motor_class_label: "Comprehensive Private",
            cover_type: "comprehensive",
            max_age: 15,
            basic_premium: 45000,
            subtotal: 45000,
            levies: 200,
            stamp_duty: 40,
            total_premium: 45240,
            tonnage_required: false,
          },
        ],
        ineligible_options: [],
      },
    });

    renderWizard();
    fillVehicleAndCover();
    fireEvent.click(screen.getByRole("button", { name: /compare quotes/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/quotes/compare", expect.any(Object)));

    const [, body] = api.post.mock.calls[0];
    expect(body).not.toHaveProperty("client");
    expect(body.vehicle.registration_no).toBe("KAA 123A");
    expect(body.sum_insured).toBe(1500000);

    await waitFor(() => expect(screen.getByText("Test Insurer")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /accept this quote/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download quote/i })).toBeInTheDocument();
  });
});
