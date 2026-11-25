import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VehicleMakeSelect from "./VehicleMakeSelect";

function Harness({ initial = "" }) {
  const [make, setMake] = useState(initial);
  return (
    <>
      <VehicleMakeSelect id="make" value={make} onChange={setMake} />
      <output data-testid="value">{make}</output>
    </>
  );
}

test("picking a listed make sets it as the value", async () => {
  render(<Harness />);
  await userEvent.selectOptions(screen.getByRole("combobox"), "Toyota");
  expect(screen.getByTestId("value")).toHaveTextContent("Toyota");
  expect(screen.queryByPlaceholderText("Type the vehicle make")).not.toBeInTheDocument();
});

test("Other opens a text box for an unlisted make", async () => {
  render(<Harness />);
  await userEvent.selectOptions(screen.getByRole("combobox"), "Other (type it in)");
  await userEvent.type(screen.getByPlaceholderText("Type the vehicle make"), "Proton");
  expect(screen.getByTestId("value")).toHaveTextContent("Proton");
});

test("an existing unlisted make shows in the Other text box", () => {
  render(<Harness initial="Proton" />);
  expect(screen.getByPlaceholderText("Type the vehicle make")).toHaveValue("Proton");
});
