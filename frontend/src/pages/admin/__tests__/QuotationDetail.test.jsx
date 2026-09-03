import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, downloadBlob } from "../../../api/client";
import QuotationDetail from "../QuotationDetail";

vi.mock("../../../api/client", async () => {
  const actual = await vi.importActual("../../../api/client");
  return { ...actual, api: { get: vi.fn(), post: vi.fn() }, downloadBlob: vi.fn() };
});

const QUOTATION = {
  id: "q1",
  quotation_number: "IMQ-2026-001",
  status: "GENERATED",
  client: { full_name: "Jane Doe", phone: "0712345678", email: "jane@example.com", id_or_passport: "123" },
  vehicle: { registration_no: "KAA 1A", make: "Toyota", model: "Vitz", year_of_manufacture: 2020, age_years: 6 },
  items: [{ label: "Basic Premium", amount: 40000 }],
  levies: 180,
  stamp_duty: 40,
  total_premium: 40220,
  risk_note: null,
};

function mockDetailLoad() {
  api.get.mockImplementation((url) => {
    if (url === "/api/admin/quotations/q1") return Promise.resolve({ data: QUOTATION });
    if (url === "/api/admin/quotations/q1/emails") return Promise.resolve({ data: [] });
    if (url === "/api/admin/quotations/q1/audit") return Promise.resolve({ data: [] });
    if (url === "/api/admin/quotations/q1/documents") return Promise.resolve({ data: { uploaded_count: 0, required_count: 3, all_uploaded: false, documents: [] } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/admin/quotations/q1"]}>
      <Routes>
        <Route path="/admin/quotations/:id" element={<QuotationDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("QuotationDetail admin page", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    downloadBlob.mockReset();
  });

  it("downloads the PDF via an authenticated blob request, named after the quotation number", async () => {
    const user = userEvent.setup();
    mockDetailLoad();
    const fakeBlob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    api.get.mockImplementation((url, config) => {
      if (url === "/api/admin/quotations/q1/pdf") {
        expect(config).toEqual({ responseType: "blob" });
        return Promise.resolve({ data: fakeBlob });
      }
      if (url === "/api/admin/quotations/q1") return Promise.resolve({ data: QUOTATION });
      if (url === "/api/admin/quotations/q1/emails") return Promise.resolve({ data: [] });
      if (url === "/api/admin/quotations/q1/audit") return Promise.resolve({ data: [] });
      if (url === "/api/admin/quotations/q1/documents") return Promise.resolve({ data: { uploaded_count: 0, required_count: 3, all_uploaded: false, documents: [] } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    renderDetail();
    await screen.findByText("IMQ-2026-001");

    await user.click(screen.getByRole("button", { name: /download pdf/i }));

    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(fakeBlob, "IMQ-2026-001.pdf"));
    // Never a plain <a href> to the protected endpoint -- that would 401
    // because a bare navigation can't carry the admin bearer token.
    expect(screen.queryByRole("link", { name: /download pdf/i })).not.toBeInTheDocument();
  });

  it("shows an error and does not crash if the PDF download fails", async () => {
    const user = userEvent.setup();
    mockDetailLoad();
    api.get.mockImplementation((url) => {
      if (url === "/api/admin/quotations/q1/pdf") return Promise.reject({ response: { status: 404, data: { detail: "PDF not available" } } });
      if (url === "/api/admin/quotations/q1") return Promise.resolve({ data: QUOTATION });
      if (url === "/api/admin/quotations/q1/emails") return Promise.resolve({ data: [] });
      if (url === "/api/admin/quotations/q1/audit") return Promise.resolve({ data: [] });
      if (url === "/api/admin/quotations/q1/documents") return Promise.resolve({ data: { uploaded_count: 0, required_count: 3, all_uploaded: false, documents: [] } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    renderDetail();
    await screen.findByText("IMQ-2026-001");
    await user.click(screen.getByRole("button", { name: /download pdf/i }));

    expect(await screen.findByText("PDF not available")).toBeInTheDocument();
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it("asks for confirmation before rejecting a client document", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    api.get.mockImplementation((url) => {
      if (url === "/api/admin/quotations/q1") return Promise.resolve({ data: QUOTATION });
      if (url === "/api/admin/quotations/q1/emails") return Promise.resolve({ data: [] });
      if (url === "/api/admin/quotations/q1/audit") return Promise.resolve({ data: [] });
      if (url === "/api/admin/quotations/q1/documents")
        return Promise.resolve({
          data: {
            uploaded_count: 1,
            required_count: 3,
            all_uploaded: false,
            documents: [{ id: "d1", document_type: "LOGBOOK", label: "Vehicle Logbook", original_filename: "logbook.pdf", status: "ACTIVE", verification_status: "PENDING", uploaded_at: "2026-01-01T00:00:00Z" }],
          },
        });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    renderDetail();
    await screen.findByText("IMQ-2026-001");
    await user.click(screen.getByRole("button", { name: "Documents" }));
    await user.click(await screen.findByRole("button", { name: /reject/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
