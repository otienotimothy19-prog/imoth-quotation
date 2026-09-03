"""Unit coverage for tonnage-limited rate bands (commercial/goods-carrying
classes): `find_band`'s tonnage-aware matching, its fallback behaviour when
no band matches, and that it composes correctly with passenger-based bands
(a different dimension, used by a different category of class).
"""
from app.services.pricing_engine import find_band


def _band(min_si, max_si, min_tonnage=None, max_tonnage=None, min_passengers=None, max_passengers=None, tag=""):
    return {
        "min_si": min_si, "max_si": max_si, "rate": 0.05, "min_premium": 10000,
        "min_passengers": min_passengers, "max_passengers": max_passengers,
        "min_tonnage": min_tonnage, "max_tonnage": max_tonnage,
        "ep_included": True, "ep_not_offered": False, "ep_rate": 0, "ep_min": 0, "ep_mandatory": False,
        "pvt_included": True, "pvt_not_offered": False, "pvt_rate": 0, "pvt_min": 0, "pvt_mandatory": False,
        "tag": tag,
    }


def test_band_without_tonnage_range_matches_any_tonnage():
    bands = [_band(0, None, tag="only")]
    assert find_band(bands, 500000, tonnage=7.5)["tag"] == "only"
    assert find_band(bands, 500000, tonnage=None)["tag"] == "only"


def test_selects_band_by_tonnage_within_same_si_range():
    bands = [
        _band(500000, None, min_tonnage=0, max_tonnage=3, tag="light"),
        _band(500000, None, min_tonnage=3.01, max_tonnage=8, tag="medium"),
        _band(500000, None, min_tonnage=8.01, max_tonnage=None, tag="heavy"),
    ]
    assert find_band(bands, 600000, tonnage=2)["tag"] == "light"
    assert find_band(bands, 600000, tonnage=5)["tag"] == "medium"
    assert find_band(bands, 600000, tonnage=20)["tag"] == "heavy"


def test_tonnage_at_band_boundary_matches_inclusive():
    bands = [
        _band(500000, None, min_tonnage=0, max_tonnage=3, tag="light"),
        _band(500000, None, min_tonnage=3.01, max_tonnage=8, tag="medium"),
    ]
    assert find_band(bands, 600000, tonnage=3)["tag"] == "light"
    assert find_band(bands, 600000, tonnage=3.01)["tag"] == "medium"


def test_falls_back_to_si_only_match_when_no_band_covers_the_tonnage():
    bands = [
        _band(500000, None, min_tonnage=0, max_tonnage=3, tag="light"),
        _band(500000, None, min_tonnage=3.01, max_tonnage=8, tag="medium"),
    ]
    result = find_band(bands, 600000, tonnage=50)
    assert result["tag"] in ("light", "medium")


def test_missing_tonnage_only_matches_bands_without_a_tonnage_range():
    bands = [
        _band(500000, None, min_tonnage=0, max_tonnage=3, tag="light"),
        _band(0, 499999, tag="no_limit"),
    ]
    assert find_band(bands, 100000, tonnage=None)["tag"] == "no_limit"


def test_tonnage_and_passenger_dimensions_do_not_interfere():
    """A tonnage-banded commercial class and a passenger-banded PSV class
    are independent dimensions; passing one without the other must not
    accidentally disqualify a band that only constrains the other."""
    bands = [_band(500000, None, min_tonnage=3, max_tonnage=8, tag="tonnage_only")]
    assert find_band(bands, 600000, passengers=20, tonnage=5)["tag"] == "tonnage_only"

    bands2 = [_band(500000, None, min_passengers=7, max_passengers=14, tag="passengers_only")]
    assert find_band(bands2, 600000, passengers=10, tonnage=5)["tag"] == "passengers_only"
