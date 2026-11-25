import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../api/client";
import { ToastProvider } from "../../../components/ui/toast";

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
      <ToastProvider>
        <Users />
      </ToastProvider>
    </MemoryRouter>
  );
}

async function openMenu(user, name) {
  await user.click(await screen.findByRole("button", { name: `Actions for ${name}` }));
  return screen.getByRole("menu");
}

describe("Users admin page", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.patch.mockReset();
  });

  it("disables Disable and the role selector for your own account", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({ data: [ME, OTHER_SUPER, STAFF] });
    renderUsers();
    await screen.findByText("Me Admin");

    expect(screen.getByLabelText("Role for Me Admin")).toBeDisabled();
    const menu = await openMenu(user, "Me Admin");
    expect(within(menu).getByRole("menuitem", { name: "Disable" })).toBeDisabled();
  });

  it("disables Disable/demote on another account when it is the last active Super Admin", async () => {
    // ME is downgraded to ADMIN here so the guard being tested is
    // OTHER_SUPER's (the lone active SUPER_ADMIN), not the separate
    // self-protection guard covered by the test above.
    const user = userEvent.setup();
    api.get.mockResolvedValue({ data: [{ ...ME, role: "ADMIN" }, OTHER_SUPER, STAFF] });
    renderUsers();
    await screen.findByText("Other Super");

    const roleOptions = [...screen.getByLabelText("Role for Other Super").querySelectorAll("option")];
    expect(roleOptions.find((o) => o.value === "ADMIN").disabled).toBe(true);
    const menu = await openMenu(user, "Other Super");
    expect(within(menu).getByRole("menuitem", { name: "Disable" })).toBeDisabled();
  });

  it("asks for confirmation before disabling another user's account", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({ data: [ME, STAFF] });
    renderUsers();
    await screen.findByText("Staff One");

    const menu = await openMenu(user, "Staff One");
    await user.click(within(menu).getByRole("menuitem", { name: "Disable" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("re-syncs from the server if a role change fails, instead of leaving a stale value", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValueOnce({ data: [ME, STAFF] });
    renderUsers();
    await screen.findByText("Staff One");
    const select = screen.getByLabelText("Role for Staff One");
    expect(select.value).toBe("STAFF");

    api.patch.mockRejectedValueOnce({ response: { status: 400, data: { detail: "Cannot disable or demote the last active Super Admin" } } });
    api.get.mockResolvedValueOnce({ data: [ME, STAFF] }); // reload after failure returns the unchanged state

    await user.selectOptions(select, "ADMIN");

    await waitFor(() => expect(screen.getByText(/cannot disable or demote/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByLabelText("Role for Staff One").value).toBe("STAFF"));
  });
});
