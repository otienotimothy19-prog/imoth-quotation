import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../api/client";

vi.mock("../../../api/client", async () => {
  const actual = await vi.importActual("../../../api/client");
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } };
});

const AUTH_MOCK = { user: { id: "me", full_name: "Me Admin", role: "SUPER_ADMIN" }, ready: true, loggingOut: false };
vi.mock("../../../context/AuthContext", () => ({ useAuth: () => AUTH_MOCK }));

// Imported after the mocks above are set up.
const { default: Users } = await import("../Users");

const ME = { id: "me", full_name: "Me Admin", email: "me@imoth.co.ke", role: "SUPER_ADMIN", is_active: true };
const OTHER_SUPER = { id: "other-super", full_name: "Other Super", email: "other@imoth.co.ke", role: "SUPER_ADMIN", is_active: true };
const STAFF = { id: "staff1", full_name: "Staff One", email: "staff@imoth.co.ke", role: "STAFF", is_active: true };

function renderUsers() {
  return render(
    <MemoryRouter>
      <Users />
    </MemoryRouter>
  );
}

describe("Users admin page", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.patch.mockReset();
  });

  it("disables Disable and the role selector for your own account", async () => {
    api.get.mockResolvedValue({ data: [ME, OTHER_SUPER, STAFF] });
    renderUsers();
    await screen.findByText("Me Admin");

    const myRow = screen.getByText("Me Admin").closest("tr");
    expect(myRow.querySelector("select")).toBeDisabled();
    expect(myRow.querySelector("button")).toBeDisabled();
  });

  it("disables Disable/demote on another account when it is the last active Super Admin", async () => {
    // ME is downgraded to ADMIN here so the guard being tested is
    // OTHER_SUPER's (the lone active SUPER_ADMIN), not the separate
    // self-protection guard covered by the test above.
    api.get.mockResolvedValue({ data: [{ ...ME, role: "ADMIN" }, OTHER_SUPER, STAFF] });
    renderUsers();
    const otherRow = (await screen.findByText("Other Super")).closest("tr");

    await waitFor(() => expect(otherRow.querySelector("button")).toBeDisabled());
    const roleOptions = [...otherRow.querySelectorAll("select option")];
    const adminOption = roleOptions.find((o) => o.value === "ADMIN");
    expect(adminOption.disabled).toBe(true);
  });

  it("asks for confirmation before disabling another user's account", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    api.get.mockResolvedValue({ data: [ME, STAFF] });
    renderUsers();
    const staffRow = (await screen.findByText("Staff One")).closest("tr");

    await user.click(staffRow.querySelector("button"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("re-syncs from the server if a role change fails, instead of leaving a stale value", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValueOnce({ data: [ME, STAFF] });
    renderUsers();
    const staffRow = (await screen.findByText("Staff One")).closest("tr");
    const select = staffRow.querySelector("select");
    expect(select.value).toBe("STAFF");

    api.patch.mockRejectedValueOnce({ response: { status: 400, data: { detail: "Cannot disable or demote the last active Super Admin" } } });
    api.get.mockResolvedValueOnce({ data: [ME, STAFF] }); // reload after failure returns the unchanged state

    await user.selectOptions(select, "ADMIN");

    await waitFor(() => expect(screen.getByText(/cannot disable or demote/i)).toBeInTheDocument());
    await waitFor(() => expect(select.value).toBe("STAFF"));
  });
});
