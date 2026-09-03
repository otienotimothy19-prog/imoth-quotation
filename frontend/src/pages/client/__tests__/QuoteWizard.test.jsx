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
    expect(screen.getByLabelText("Vehicle Tonnage")).toBeInTheDocument();
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
    await user.type(screen.getByPlaceholderText("e.g. 1500000"), "1500000");
    await user.type(screen.getByLabelText("Vehicle Tonnage"), "5");
    await user.click(screen.getByRole("button", { name: /get quotes/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/api/quotes/compare",
        expect.objectContaining({ category: "commercial", options: { tonnage: 5 } })
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
    await user.type(screen.getByPlaceholderText("e.g. 1500000"), "1500000");
    await user.click(screen.getByRole("button", { name: /get quotes/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/quotes/compare", expect.objectContaining({ options: {} })));
  });
});
