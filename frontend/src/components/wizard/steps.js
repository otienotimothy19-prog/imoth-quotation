// The four customer-facing steps of the quotation journey. Personal
// details are collected only after a quote is selected (step 3) -- the
// customer sees only vehicle/cover information and anonymous comparison
// results before that point.
export const QUOTE_STEPS = [
  { key: "vehicle-cover", label: "Vehicle & Cover", sub: "Vehicle and cover details" },
  { key: "compare", label: "Compare Quotes", sub: "Compare eligible insurers" },
  { key: "complete-acceptance", label: "Complete Acceptance", sub: "Your details, documents and confirmation" },
  { key: "confirmation", label: "Confirmation", sub: "Quotation accepted" },
];
