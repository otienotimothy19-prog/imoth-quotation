"""Single source of truth for vehicle-age calculation. A vehicle's age is
always derived from its year of manufacture and the current calendar year
-- never accepted as a client-supplied value -- so that eligibility, rates
and quotation records can't be manipulated by sending a different age in
the request payload, browser dev tools, or a direct API call.
"""
from datetime import datetime, timezone

MIN_MANUFACTURE_YEAR = 1960


def current_year() -> int:
    return datetime.now(timezone.utc).year


def calculate_vehicle_age(year_of_manufacture: int) -> int:
    """Calendar-year age: current year minus year of manufacture. This is a
    calendar-year difference, not an exact month/day age."""
    return current_year() - year_of_manufacture
