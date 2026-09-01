// The four customer-facing steps of the quotation journey. Internally the
// system still has distinct stages (client, vehicle, cover, compare,
// quotation, documents, accept) -- this is purely the presentation layer
// that groups them into what the customer sees.
export const QUOTE_STEPS = [
  { key: "details", label: "Your Details", sub: "Client and vehicle information" },
  { key: "cover", label: "Choose Cover", sub: "Cover details, comparison and selection" },
  { key: "review", label: "Review & Upload", sub: "Quotation review and required documents" },
  { key: "confirm", label: "Confirm", sub: "Declaration and quotation acceptance" },
];
