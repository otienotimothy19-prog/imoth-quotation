import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../api/client";
import Quotations from "../Quotations";

vi.mock("../../../api/client", async () => {
  const actual = await vi.importActual("../../../api/client");
  return { ...actual, api: { get: vi.fn() } };
});

function pageOf(items, total) {
  return { data: { items, total, page: 1, page_size: 20 } };
}

describe("Quotations admin page", () => {
  beforeEach(() => {
    api.get.mockReset();
  });

  it("search always queries page 1, even when currently on a later page", async () => {
    const user = userEvent.setup();
    // First load (page 1): enough total to make a page 2 available.
    api.get.mockResolvedValueOnce(pageOf([{ id: "q1", quotation_number: "Q-1", client_name: "A", registration_no: "KAA 1", insurer_name: "Ins", vehicle_class_label: "Private", status: "GENERATED", total_premium: 1000, has_risk_note: false }], 40));

    render(
      <MemoryRouter>
        <Quotations />
      </MemoryRouter>
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(api.get.mock.calls[0][1].params.page).toBe(1);

    // Go to page 2.
    api.get.mockResolvedValueOnce(pageOf([{ id: "q2", quotation_number: "Q-2", client_name: "B", registration_no: "KAA 2", insurer_name: "Ins", vehicle_class_label: "Private", status: "GENERATED", total_premium: 2000, has_risk_note: false }], 40));
    await user.click(screen.getByText("Next →"));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(api.get.mock.calls[1][1].params.page).toBe(2);

    // Now search -- this must go back to page 1, not stay on page 2.
    api.get.mockResolvedValueOnce(pageOf([], 0));
    await user.type(screen.getByPlaceholderText(/Quotation #, client/i), "KAA 1");
    await user.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
    const lastCallParams = api.get.mock.calls[2][1].params;
    expect(lastCallParams.page).toBe(1);
    expect(lastCallParams.q).toBe("KAA 1");
  });

  it("supports pressing Enter to search", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue(pageOf([], 0));
    render(
      <MemoryRouter>
        <Quotations />
      </MemoryRouter>
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));

    await user.type(screen.getByPlaceholderText(/Quotation #, client/i), "Q-9{Enter}");
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(api.get.mock.calls[1][1].params.q).toBe("Q-9");
    expect(api.get.mock.calls[1][1].params.page).toBe(1);
  });

  it("shows an error state when the list fails to load, and clears it on a successful retry", async () => {
    const user = userEvent.setup();
    api.get.mockRejectedValueOnce({ response: { status: 500, data: {} } });
    render(
      <MemoryRouter>
        <Quotations />
      </MemoryRouter>
    );

    expect(await screen.findByText(/server had a problem/i)).toBeInTheDocument();

    api.get.mockResolvedValueOnce(pageOf([], 0));
    await user.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() => expect(screen.queryByText(/server had a problem/i)).not.toBeInTheDocument());
  });
});
