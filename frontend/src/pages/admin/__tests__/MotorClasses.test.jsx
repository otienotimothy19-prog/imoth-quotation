import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../api/client";
import MotorClasses from "../MotorClasses";

vi.mock("../../../api/client", async () => {
  const actual = await vi.importActual("../../../api/client");
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

const INSURER = { id: "ins1", name: "Test Insurer" };
const CLASS = {
  id: "cls1",
  label: "Commercial General Cartage",
  category: "commercial",
  max_age: 20,
  min_si: 500000,
  max_si: null,
  active: true,
  flat_only: null,
  insurer_name: "Test Insurer",
};

function mockBaseCalls(classes = []) {
  api.get.mockImplementation((url) => {
    if (url === "/api/admin/insurers") return Promise.resolve({ data: [INSURER] });
    if (url === "/api/admin/motor-classes") return Promise.resolve({ data: classes });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

async function openAddFormForInsurer(user) {
  await screen.findByRole("option", { name: "Test Insurer" });
  await user.selectOptions(screen.getByLabelText("Filter by Insurer"), "ins1");
  await user.click(screen.getByRole("button", { name: "+ Add Class" }));
}

describe("MotorClasses admin page", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    api.patch.mockReset();
    api.delete.mockReset();
  });

  it("toggling the flat-rate checkbox swaps Sum-Insured fields for fixed-premium/rate fields", async () => {
    const user = userEvent.setup();
    mockBaseCalls();
    render(<MotorClasses />);
    await openAddFormForInsurer(user);

    expect(screen.getByText("Min Sum Insured")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^fixed premium/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /flat-rate product/i }));

    expect(screen.queryByText("Min Sum Insured")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^fixed premium/i)).toBeInTheDocument();
  });

  it("requires a fixed premium or a rate on sum insured before creating a flat-rate class", async () => {
    const user = userEvent.setup();
    mockBaseCalls();
    render(<MotorClasses />);
    await openAddFormForInsurer(user);

    await user.type(screen.getByLabelText(/code \(unique/i), "tpo_test");
    await user.type(screen.getByLabelText("Label"), "Third Party Only - Test");
    await user.click(screen.getByRole("checkbox", { name: /flat-rate product/i }));
    await user.click(screen.getByRole("button", { name: "Save Class" }));

    expect(await screen.findByText(/provide either a fixed premium or a rate/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("creates a flat-rate (third-party) class with the entered premium, without touching Sum-Insured bands", async () => {
    const user = userEvent.setup();
    mockBaseCalls();
    api.post.mockResolvedValue({ data: { id: "new1", flat_only: { premium: 3200 } } });
    render(<MotorClasses />);
    await openAddFormForInsurer(user);

    await user.type(screen.getByLabelText(/code \(unique/i), "tpo_test");
    await user.type(screen.getByLabelText("Label"), "Third Party Only - Test");
    await user.selectOptions(screen.getByLabelText("Category"), "tpo");
    await user.click(screen.getByRole("checkbox", { name: /flat-rate product/i }));
    await user.type(screen.getByLabelText(/^fixed premium/i), "3200");
    await user.click(screen.getByRole("button", { name: "Save Class" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/api/admin/motor-classes",
        expect.objectContaining({
          insurer_id: "ins1",
          code: "tpo_test",
          category: "tpo",
          min_si: 0,
          max_si: null,
          flat_only: expect.objectContaining({ premium: 3200, rate_on_si: null }),
        })
      )
    );
  });

  it("asks for confirmation, then deletes the class and reloads the list", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockBaseCalls([CLASS]);
    api.delete.mockResolvedValue({ data: { deleted: true, id: "cls1" } });
    render(
      <MemoryRouter>
        <MotorClasses />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/api/admin/motor-classes/cls1"));
    expect(await screen.findByText(/deleted/i)).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("does not delete when the confirmation is declined", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    mockBaseCalls([CLASS]);
    render(
      <MemoryRouter>
        <MotorClasses />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("deletes a class that quotations reference and reports how many kept their history", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockBaseCalls([CLASS]);
    api.delete.mockResolvedValue({ data: { deleted: true, id: "cls1", quotations_detached: 3 } });
    render(
      <MemoryRouter>
        <MotorClasses />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/api/admin/motor-classes/cls1"));
    expect(await screen.findByText(/3 quotation\(s\) that referenced it kept their history/i)).toBeInTheDocument();
    confirmSpy.mockRestore();
  });
});
