import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../api/client";
import QuoteWizard from "../QuoteWizard";

vi.mock("../../../api/client", async () => {
  const actual = await vi.importActual("../../../api/client");
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

const CURRENT_YEAR = new Date().getFullYear();

async function fillDetailsAndContinue(user) {
  await user.type(screen.getByPlaceholderText("e.g. John Mwangi"), "Jane Doe");
  await user.type(screen.getByPlaceholderText("07XX XXX XXX"), "0712345678");
  await user.type(screen.getByPlaceholderText("e.g. KCZ 538G"), "KAA 1A");
  await user.type(screen.getByPlaceholderText(`e.g. ${CURRENT_YEAR - 5}`), String(CURRENT_YEAR - 5));
  await user.click(screen.getByRole("button", { name: /save & continue/i }));
}

describe("QuoteWizard cover step", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
  });

  it("shows an optional tonnage field for commercial vehicles but not for private", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QuoteWizard />
      </MemoryRouter>
    );
    await fillDetailsAndContinue(user);

    expect(screen.queryByLabelText("Vehicle Tonnage")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Vehicle Class"), "commercial");
    expect(screen.queryByLabelText("Vehicle Tonnage")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /own goods/i }));
    expect(screen.getByLabelText("Vehicle Tonnage")).toBeInTheDocument();
  });

  it("does not show the tonnage field for Commercial Institutional, only the institutional intake fields", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QuoteWizard />
      </MemoryRouter>
    );
    await fillDetailsAndContinue(user);

    await user.selectOptions(screen.getByLabelText("Vehicle Class"), "commercial");
    await user.click(screen.getByRole("button", { name: /commercial institutional/i }));

    expect(screen.queryByLabelText("Vehicle Tonnage")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Institution Type")).toBeInTheDocument();
    expect(screen.getByLabelText("Vehicle Type")).toBeInTheDocument();
    expect(screen.getByLabelText("Passenger Category")).toBeInTheDocument();
    expect(screen.getByLabelText("Passenger Seats (excluding the driver)")).toBeInTheDocument();
  });

  it("does not show the tonnage field for PSV, only the passenger count", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QuoteWizard />
      </MemoryRouter>
    );
    await fillDetailsAndContinue(user);

    await user.selectOptions(screen.getByLabelText("Vehicle Class"), "psv");
    expect(screen.getByLabelText("Number of Passengers")).toBeInTheDocument();
    expect(screen.queryByLabelText("Vehicle Tonnage")).not.toBeInTheDocument();
  });

  it("sends the entered tonnage as options.tonnage when comparing quotes", async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ data: { options: [], ineligible_options: [] } });
    render(
      <MemoryRouter>
        <QuoteWizard />
      </MemoryRouter>
    );
    await fillDetailsAndContinue(user);

    await user.selectOptions(screen.getByLabelText("Vehicle Class"), "commercial");
    await user.click(screen.getByRole("button", { name: /own goods/i }));
    await user.type(screen.getByPlaceholderText("e.g. 1500000"), "1500000");
    await user.type(screen.getByLabelText("Vehicle Tonnage"), "5");
    await user.click(screen.getByRole("button", { name: /get quotes/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/api/quotes/compare",
        expect.objectContaining({ category: "commercial", commercial_use: "own_goods", options: { tonnage: 5 } })
      )
    );
  });

  it("omits tonnage from options when left blank", async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ data: { options: [], ineligible_options: [] } });
    render(
      <MemoryRouter>
        <QuoteWizard />
      </MemoryRouter>
    );
    await fillDetailsAndContinue(user);

    await user.selectOptions(screen.getByLabelText("Vehicle Class"), "commercial");
    await user.click(screen.getByRole("button", { name: /own goods/i }));
    await user.type(screen.getByPlaceholderText("e.g. 1500000"), "1500000");
    await user.click(screen.getByRole("button", { name: /get quotes/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/quotes/compare", expect.objectContaining({ options: {} })));
  });

  it("shows only 'Commercial' as the Vehicle Class label, with no sub-branches enumerated", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QuoteWizard />
      </MemoryRouter>
    );
    await fillDetailsAndContinue(user);

    const option = screen.getByRole("option", { name: "Commercial" });
    expect(option).toBeInTheDocument();
    expect(option.textContent).toBe("Commercial");
  });

  it("shows exactly 4 Commercial sub-branch cards, including Commercial Tuk Tuk", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QuoteWizard />
      </MemoryRouter>
    );
    await fillDetailsAndContinue(user);

    await user.selectOptions(screen.getByLabelText("Vehicle Class"), "commercial");

    expect(screen.getByRole("button", { name: /^Own Goods/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^General Cartage/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Commercial Institutional/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Commercial Tuk Tuk/ })).toBeInTheDocument();
  });

  it("Commercial Tuk Tuk shows an optional tonnage field but no passenger-count field", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QuoteWizard />
      </MemoryRouter>
    );
    await fillDetailsAndContinue(user);

    await user.selectOptions(screen.getByLabelText("Vehicle Class"), "commercial");
    await user.click(screen.getByRole("button", { name: /^Commercial Tuk Tuk/ }));

    expect(screen.getByLabelText("Vehicle Tonnage")).toBeInTheDocument();
    expect(screen.queryByLabelText("Number of Passengers")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Passenger Seats/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Institution Type")).not.toBeInTheDocument();
  });

  it("sends commercial_use: commercial_tuktuk with empty options when tonnage is left blank", async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ data: { options: [], ineligible_options: [] } });
    render(
      <MemoryRouter>
        <QuoteWizard />
      </MemoryRouter>
    );
    await fillDetailsAndContinue(user);

    await user.selectOptions(screen.getByLabelText("Vehicle Class"), "commercial");
    await user.click(screen.getByRole("button", { name: /^Commercial Tuk Tuk/ }));
    await user.type(screen.getByPlaceholderText("e.g. 1500000"), "300000");
    await user.click(screen.getByRole("button", { name: /get quotes/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/api/quotes/compare",
        expect.objectContaining({ category: "commercial", commercial_use: "commercial_tuktuk", options: {} })
      )
    );
  });

  it("sends the entered tonnage for Commercial Tuk Tuk too, since it's also rated by carrying capacity", async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ data: { options: [], ineligible_options: [] } });
    render(
      <MemoryRouter>
        <QuoteWizard />
      </MemoryRouter>
    );
    await fillDetailsAndContinue(user);

    await user.selectOptions(screen.getByLabelText("Vehicle Class"), "commercial");
    await user.click(screen.getByRole("button", { name: /^Commercial Tuk Tuk/ }));
    await user.type(screen.getByPlaceholderText("e.g. 1500000"), "300000");
    await user.type(screen.getByLabelText("Vehicle Tonnage"), "0.5");
    await user.click(screen.getByRole("button", { name: /get quotes/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/api/quotes/compare",
        expect.objectContaining({ category: "commercial", commercial_use: "commercial_tuktuk", options: { tonnage: 0.5 } })
      )
    );
  });

  it("requires selecting a commercial use before comparing quotes", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QuoteWizard />
      </MemoryRouter>
    );
    await fillDetailsAndContinue(user);

    await user.selectOptions(screen.getByLabelText("Vehicle Class"), "commercial");
    await user.type(screen.getByPlaceholderText("e.g. 1500000"), "1500000");
    await user.click(screen.getByRole("button", { name: /get quotes/i }));

    expect(screen.getByText(/select what this commercial vehicle is used for/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
