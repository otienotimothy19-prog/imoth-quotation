// The customer-facing steps shown in the progress sidebar. Only the two
// anonymous steps are tracked here -- once a quote is selected, the
// customer moves into acceptance (personal details, documents,
// confirmation), which is no longer broken out as its own numbered steps;
// QuoteShell shows those later pages as "Step 2 of 2 -- complete" instead.
export const QUOTE_STEPS = [
  { key: "vehicle-cover", label: "Vehicle & Cover", sub: "Vehicle and cover details" },
  { key: "compare", label: "Compare Quotes", sub: "Compare eligible insurers" },
];
