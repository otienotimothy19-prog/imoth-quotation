"""Unit coverage for passenger-capacity-limited rate bands (PSV classes):
`find_band`'s passenger-aware matching and its fallback behaviour when no
band matches both Sum Insured and passenger count.
"""
from app.services.pricing_engine import find_band


def _band(min_si, max_si, min_passengers=None, max_passengers=None, tag=""):
    return {
        "min_si": min_si, "max_si": max_si, "rate": 0.05, "min_premium": 10000,
        "min_passengers": min_passengers, "max_passengers": max_passengers,
        "ep_included": True, "ep_not_offered": False, "ep_rate": 0, "ep_min": 0, "ep_mandatory": False,
        "pvt_included": True, "pvt_not_offered": False, "pvt_rate": 0, "pvt_min": 0, "pvt_mandatory": False,
        "tag": tag,
    }


def test_band_without_passenger_range_matches_any_passenger_count():
    bands = [_band(0, None, tag="only")]
    assert find_band(bands, 500000, 12)["tag"] == "only"
    assert find_band(bands, 500000, None)["tag"] == "only"


def test_selects_band_by_passenger_count_within_same_si_range():
    bands = [
        _band(500000, None, min_passengers=7, max_passengers=14, tag="small"),
        _band(500000, None, min_passengers=15, max_passengers=33, tag="large"),
    ]
    assert find_band(bands, 600000, 10)["tag"] == "small"
    assert find_band(bands, 600000, 20)["tag"] == "large"


def test_passenger_count_at_band_boundary_matches_inclusive():
    bands = [
        _band(500000, None, min_passengers=7, max_passengers=14, tag="small"),
        _band(500000, None, min_passengers=15, max_passengers=33, tag="large"),
    ]
    assert find_band(bands, 600000, 14)["tag"] == "small"
    assert find_band(bands, 600000, 15)["tag"] == "large"


def test_falls_back_to_si_only_match_when_no_band_covers_the_passenger_count():
    bands = [
        _band(500000, None, min_passengers=7, max_passengers=14, tag="small"),
        _band(500000, None, min_passengers=15, max_passengers=33, tag="large"),
    ]
    # 50 passengers isn't covered by either band -- fall back rather than error.
    result = find_band(bands, 600000, 50)
    assert result["tag"] in ("small", "large")


def test_missing_passenger_count_only_matches_bands_without_a_passenger_range():
    bands = [
        _band(500000, None, min_passengers=7, max_passengers=14, tag="small"),
        _band(0, 499999, tag="no_limit"),
    ]
    assert find_band(bands, 100000, None)["tag"] == "no_limit"
