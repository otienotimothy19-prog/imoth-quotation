import { useState } from "react";

// Makes commonly insured in Kenya, grouped the way people look for them.
export const VEHICLE_MAKES = {
  "Cars, SUVs & Pickups": [
    "Toyota", "Nissan", "Mazda", "Subaru", "Mitsubishi", "Honda", "Isuzu", "Suzuki",
    "Volkswagen", "Mercedes-Benz", "BMW", "Audi", "Land Rover", "Lexus", "Hyundai", "Kia",
    "Peugeot", "Ford", "Volvo", "Jeep", "Porsche", "Daihatsu", "Chevrolet", "Renault",
    "Skoda", "Jaguar", "Mini", "Infiniti", "Mahindra", "Chery", "Haval", "Great Wall",
    "BYD", "Tesla",
  ],
  "Trucks & Buses": [
    "Isuzu (Truck/Bus)", "Mitsubishi Fuso", "Hino", "Scania", "Mercedes-Benz (Truck/Bus)",
    "MAN", "Volvo (Truck/Bus)", "DAF", "Iveco", "Tata", "Ashok Leyland", "FAW", "Foton",
    "Sinotruk (Howo)", "Shacman", "UD Trucks", "Yutong", "King Long", "Higer",
  ],
  "Motorcycles & Tuk Tuks": [
    "Bajaj", "TVS", "Honda (Motorcycle)", "Yamaha", "Haojue", "Suzuki (Motorcycle)",
    "Kawasaki", "Hero", "Lifan", "Piaggio", "KTM", "Royal Enfield",
  ],
};

const ALL_MAKES = new Set(Object.values(VEHICLE_MAKES).flat());
const OTHER = "__other__";

// Dropdown of vehicle makes with an "Other" choice that opens a text box,
// so an unlisted make can still be entered. `value`/`onChange` carry the
// make as plain text, exactly like the text box it replaces.
export default function VehicleMakeSelect({ value, onChange, id }) {
  const [typingOther, setTypingOther] = useState(() => !!value && !ALL_MAKES.has(value));
  const selectValue = typingOther ? OTHER : value || "";

  return (
    <>
      <select
        id={id}
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setTypingOther(true);
            onChange("");
          } else {
            setTypingOther(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">Select make</option>
        {Object.entries(VEHICLE_MAKES).map(([group, makes]) => (
          <optgroup key={group} label={group}>
            {makes.map((make) => (
              <option key={make} value={make}>
                {make}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={OTHER}>Other (type it in)</option>
      </select>
      {typingOther && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type the vehicle make"
          aria-label="Vehicle make"
          maxLength={100}
          autoFocus
          style={{ marginTop: 8 }}
        />
      )}
    </>
  );
}
