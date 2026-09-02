"""Insurer / motor-class / rate-band seed data.

This is a direct, faithful port of the ``INSURERS`` JavaScript object from
the legacy single-page tool (``legacy/imoth_motor_quotation_reference.html``,
compiled from Pioneer, Kenya Orient, Monarch, CIC, Definite, Directline, APA
and Britam 2026/2027 rate cards / binder terms). Do not hand-edit rates here
after go-live -- use the Admin > Rates screens, which write to the database
and version every change. This module only seeds the initial state.
"""

LEVY_RATE = 0.0045  # PHCF 0.25% + Training Levy 0.20%
STAMP_DUTY = 40.0
PRIVATE_AGE_LIMIT_FOR_EP_PVT = 15


def band(min_si, max_si, rate, min_premium, **opts):
    b = {
        "min_si": min_si,
        "max_si": max_si,
        "rate": rate,
        "min_premium": min_premium,
        "ep_included": True,
        "pvt_included": True,
        "ep_rate": 0,
        "ep_min": 0,
        "pvt_rate": 0,
        "pvt_min": 0,
        "ep_not_offered": False,
        "pvt_not_offered": False,
        # ep_mandatory / pvt_mandatory: charged automatically as a separate
        # line item regardless of customer opt-in (distinct from
        # ep_included/pvt_included, which bakes the charge into the base
        # rate with no separate line at all).
        "ep_mandatory": False,
        "pvt_mandatory": False,
    }
    b.update(opts)
    return b


def flat(premium=None, note="", rate_on_si=None, min_premium=None):
    return {
        "flat": True,
        "premium": premium,
        "rate_on_si": rate_on_si,
        "min_premium": min_premium,
        "note": note,
    }


INSURERS = {
    "pioneer": {
        "name": "Pioneer General Insurance",
        "classes": {
            "private": {
                "label": "Motor Private – Comprehensive", "category": "private", "max_age": 15, "min_si": 500000,
                "excess": ["Accidental Damage/Partial Theft – 2.5% of value, Min 30,000 / Max 100,000", "Total Theft (with ATD) – 10% of value, Min 30,000", "Total Theft (without ATD) – 20% of value, Min 30,000", "Third Party Property Damage – Nil", "Young Driver (<21yrs) / Novice (<2yrs) – Kshs 5,000 additional each"],
                "benefits": ["Windscreen & Radio free limit Kshs 100,000 (+10% above limit)", "Medical Expenses Kshs 30,000", "Recovery Kshs 30,000", "Repair Authority Kshs 50,000", "Courtesy Car: 4,500 (10 days) / 7,500 (20 days)"],
                "limits": ["Third Party Property Damage – Kshs 3,000,000", "Passenger Legal Liability – any one person Kshs 3,000,000 / any one event Kshs 20,000,000", "Third Party Person Injury – any one person Kshs 3,000,000 / unlimited any one event"],
                "bands": [
                    band(500000, 999999, 0.06, 37500, ep_included=False, ep_rate=0.0025, ep_min=5000, pvt_included=False, pvt_rate=0.0025, pvt_min=2500),
                    band(1000000, 1499999, 0.05, 37500),
                    band(1500000, 2499999, 0.04, 37500),
                    band(2500000, 4999999, 0.0325, 37500),
                    band(5000000, None, 0.03, 37500),
                ],
            },
            "commercial_hybrid": {
                "label": "Motor Commercial Hybrid (Own Goods / Gen. Cartage)", "category": "commercial", "max_age": 15, "min_si": 500000,
                "excess": ["Own Damage/Partial Theft – 5% Min 30,000", "Theft with ATD – 10% Min 30,000", "Theft without ATD – 20% Min 30,000"],
                "benefits": ["Excess Protector & PVT inclusive of the basic rate", "TPO by tonnage also available: up to 3T Kshs 7,500 / 4–8T Kshs 10,000 / 9–15T Kshs 15,000 / above 15T Kshs 20,000"],
                "limits": ["Comprehensive on vehicle, standard commercial limits apply"],
                "bands": [band(500000, 4999999, 0.045, 50000)],
            },
            # Farm & Warehouses and Construction are separate products per
            # the 2025 rating-card correction -- previously incorrectly
            # combined into a single "special_type" class (now deactivated
            # by migration). PVT is free up to KSh 5,000,000 on both, per
            # the supplied rating card; the additional PVT percentage above
            # KSh 5,000,000 was not stated in the source and is therefore
            # not implemented -- see the completion report.
            "special_farm_warehouses": {
                "label": "Special Type – Farm & Warehouses", "category": "special", "max_age": 15, "min_si": 500000,
                "excess": ["As per Pioneer commercial excess schedule"], "benefits": ["Owner-operated plant/farm risks", "PVT free up to Kshs 5,000,000 (additional rate above this threshold not yet on file)"], "limits": ["Comprehensive on vehicle"],
                "bands": [band(500000, None, 0.025, 37500, ep_included=False, ep_rate=0.005, ep_min=5000, pvt_included=True)],
            },
            "special_construction": {
                "label": "Special Type – Construction", "category": "special", "max_age": 15, "min_si": 500000,
                "excess": ["As per Pioneer commercial excess schedule"], "benefits": ["PVT free up to Kshs 5,000,000 (additional rate above this threshold not yet on file)"], "limits": ["Comprehensive on vehicle"],
                "bands": [band(500000, None, 0.03, 37500, ep_included=False, ep_rate=0.005, ep_min=5000, pvt_included=True)],
            },
            "asset": {
                "label": "Asset Cover (Max 3 years, new units)", "category": "asset", "max_age": 3, "min_si": 500000,
                "excess": ["Standard commercial excess schedule applies"], "benefits": ["Zero-mileage / showroom-condition unit"], "limits": ["Comprehensive on vehicle"],
                "bands": [band(500000, None, 0.045, 40000)],
            },
            "psv_uber": {
                "label": "PSV – Uber / Online Platform Taxis", "category": "psv", "max_age": 15, "min_si": 500000,
                "excess": ["Standard Pioneer commercial excess schedule applies"],
                "benefits": ["PVT included in rate (free)", "No Excess Protector offered for this class", "No TPO cover available — comprehensive only"],
                "limits": ["Comprehensive on vehicle, standard PSV limits"],
                "pll_per_seat": 500,
                "bands": [band(500000, None, 0.06, 40000, ep_included=True, ep_not_offered=True, pvt_included=True)],
            },
            "chauffeur_tour_tsv": {
                "label": "Chauffeur Driven – Tour Vans (TSV)", "category": "psv", "max_age": 15, "min_si": 500000,
                "excess": ["Standard Pioneer commercial excess schedule applies"],
                "benefits": ["Excess Protector & PVT included in rate", "No TPO cover available — comprehensive only"],
                "limits": ["Comprehensive on vehicle"],
                "pll_per_seat": 500,
                "bands": [band(500000, None, 0.05, 40000)],
            },
            "school_bus": {
                "label": "School Bus / Van", "category": "institutional", "max_age": 15, "min_si": 500000,
                "excess": ["Standard Pioneer commercial excess schedule applies"],
                "benefits": ["Excess Protector & PVT included in rate (PVT free up to Kshs 5,000,000; additional rate above this threshold not yet on file)", "PLL free for the school's own students; Kshs 250/seat for affiliated group hire; Kshs 500/head for non-affiliated hire"],
                "limits": ["Comprehensive on vehicle"],
                "pll_options": [
                    {"key": "student", "label": "Own students (free)", "rate": 0},
                    {"key": "affiliated", "label": "Affiliated group hire", "rate": 250},
                    {"key": "nonaffiliated", "label": "Non-affiliated / general hire", "rate": 500},
                ],
                "bands": [band(500000, None, 0.035, 37500)],
            },
            "motorcycle_corporate": {
                "label": "Motorcycle – Corporate & Delivery", "category": "motorcycle", "max_age": None, "min_si": 0,
                "excess": [], "benefits": ["TPO flat premium also available at Kshs 3,000/yr"], "limits": [],
                "bands": [band(0, None, 0.03, 5000)],
            },
            "tuktuk_corporate": {
                "label": "Tuk Tuk – Corporate & Delivery", "category": "tuktuk", "max_age": None, "min_si": 0,
                "excess": [], "benefits": ["TPO flat premium also available at Kshs 5,000/yr"], "limits": [],
                "bands": [band(0, None, 0.03, 10000)],
            },
        },
    },

    "kenyaorient": {
        "name": "Kenya Orient Insurance Ltd",
        "classes": {
            "private": {
                "label": "Motor Private – Comprehensive (Standard)", "category": "private", "max_age": 15, "min_si": 500000,
                "excess": ["Accidental Damage/Partial Theft – 2.5% of value, Min 30,000 / Max 100,000", "Total Theft (with ATD) – 10% Min 30,000", "Total Theft (without ATD) – 20% Min 30,000", "Third Party Property Damage – Kshs 30,000", "Young Driver (<21) – Kshs 5,000 additional", "Novice Driver (<2yrs) – Kshs 5,000 additional"],
                "benefits": ["Windscreen & Radio free limit Kshs 50,000 (charge 10% above)", "Medical Expenses Kshs 30,000", "Recovery Kshs 30,000", "Repair Authority Kshs 50,000"],
                "limits": ["Third Party Property Damage – Kshs 3,000,000", "Passenger Legal Liability – any one person Kshs 3,000,000 / any one event Kshs 20,000,000", "Third Party Person Injury – any one person Kshs 3,000,000 / Unlimited any one event", "Third Party Annual (TPO) – Kshs 3,100"],
                "bands": [
                    band(500000, 999999, 0.0375, 40000),
                    band(1000000, 1999999, 0.035, 40000),
                    band(2000000, 2999999, 0.0325, 40000),
                    band(3000000, None, 0.03, 40000),
                ],
            },
            "commercial": {
                "label": "Motor Commercial (Own Goods & General Cartage)", "category": "commercial", "max_age": 20, "min_si": 500000,
                "excess": ["Own Damage/Partial Theft – 5% Min 30,000", "Theft with ATD – 10% Min 30,000", "Theft without ATD – 20% Min 30,000", "Third Party Property Damage – Kshs 10,000", "Young Driver (<25) – Kshs 10,000 additional", "Novice Driver (<3yrs) – Kshs 10,000 additional"],
                "benefits": ["General Cartage & Own Goods PVT 0.35% Min Kshs 3,000"], "limits": ["Third Party Property Damage – Kshs 5,000,000"],
                "bands": [band(500000, None, 0.045, 60000, pvt_included=False, pvt_rate=0.0035, pvt_min=3000)],
            },
            "tpo_private": {
                "label": "Third Party Only – Private", "category": "tpo", "max_age": None, "min_si": 0,
                "excess": [], "benefits": [], "limits": ["Annual Third Party Only premium"],
                "flat_only": flat(3100, "Annual TPO premium"),
            },
        },
    },

    "monarch": {
        "name": "Monarch Insurance Company Ltd",
        "classes": {
            "private": {
                "label": "Private Car – Comprehensive", "category": "private", "max_age": 15, "min_si": 500000,
                "excess": ["Excess Protector 0.25% Min 3,000"], "benefits": ["Windscreen & Radio limits per policy schedule"], "limits": ["Standard Monarch private car limits"],
                "bands": [
                    band(500000, 2500000, 0.035, 20000, ep_included=False, ep_rate=0.0025, ep_min=3000, pvt_included=False, pvt_rate=0.0025, pvt_min=2500),
                    band(2500001, None, 0.03, 20000, ep_included=False, ep_rate=0.0025, ep_min=3000, pvt_included=False, pvt_rate=0.0025, pvt_min=2500),
                ],
            },
            # Monarch's dedicated older-vehicle private-car product: max age 20
            # (vs the standard 15-year product above), for vehicles valued at
            # KSh 400,000 and above. Only one documented band is available
            # (400,000-499,999) -- since no further-band figures above
            # 499,999 were supplied, that band's rate/min-premium/EP/PVT
            # terms are applied uniformly to the whole KSh 400,000-and-above
            # range this product covers, rather than inventing additional
            # bands. See the completion report for this documented gap.
            "private_400_499": {
                "label": "Private Car (Max Age 20yrs, SI 400,000 and above)", "category": "private", "max_age": 20, "min_si": 400000,
                "excess": ["No Excess Protector available"], "benefits": [], "limits": [],
                "bands": [band(400000, None, 0.06, 30000, ep_included=False, ep_not_offered=True, pvt_included=False, pvt_rate=0.0025, pvt_min=2500)],
            },
            "commercial_own_goods": {
                "label": "Commercial Own Goods", "category": "commercial", "max_age": 20, "min_si": 500000,
                "excess": [], "benefits": [], "limits": [],
                "bands": [
                    band(500000, 2500000, 0.0325, 30000, ep_included=False, ep_rate=0.005, ep_min=5000, pvt_included=False, pvt_rate=0.0025, pvt_min=3500),
                    band(2500001, None, 0.03, 30000, ep_included=False, ep_rate=0.005, ep_min=5000, pvt_included=False, pvt_rate=0.0025, pvt_min=3500),
                ],
            },
            "commercial_general_cartage": {
                "label": "Commercial General Cartage", "category": "commercial", "max_age": 20, "min_si": 500000,
                "excess": [], "benefits": [], "limits": [],
                "bands": [
                    band(500000, 2500000, 0.0325, 30000, ep_included=False, ep_rate=0.005, ep_min=5000, pvt_included=False, pvt_rate=0.0025, pvt_min=3500),
                    band(2500001, None, 0.03, 30000, ep_included=False, ep_rate=0.005, ep_min=5000, pvt_included=False, pvt_rate=0.0025, pvt_min=3500),
                ],
            },
            "commercial_institutional": {
                "label": "Commercial Institutional", "category": "institutional", "max_age": 20, "min_si": 500000,
                "excess": [], "benefits": ["Passenger Legal Liability – Kshs 500/person (organised groups) or Kshs 250/student"], "limits": [],
                "pll_options": [
                    {"key": "organised", "label": "Organised group / general hire", "rate": 500},
                    {"key": "student", "label": "Students", "rate": 250},
                ],
                "bands": [
                    band(500000, 2500000, 0.0325, 30000, ep_included=False, ep_rate=0.005, ep_min=5000, pvt_included=False, pvt_rate=0.0025, pvt_min=3500),
                    band(2500001, None, 0.03, 30000, ep_included=False, ep_rate=0.005, ep_min=5000, pvt_included=False, pvt_rate=0.0025, pvt_min=3500),
                ],
            },
            "psv_chauffeur": {
                "label": "PSV Chauffeur Driven", "category": "psv", "max_age": 15, "min_si": 500000,
                "excess": [], "benefits": ["Passenger Legal Liability – Kshs 500/person"], "limits": [], "pll_per_seat": 500,
                "bands": [band(500000, None, 0.05, 35000, ep_included=False, ep_rate=0.005, ep_min=10000, pvt_included=False, pvt_rate=0.0035, pvt_min=3500)],
            },
            "tuktuk_commercial": {
                "label": "Tuk Tuk – Commercial", "category": "tuktuk", "max_age": 10, "min_si": 250000,
                "excess": [], "benefits": [], "limits": [],
                "bands": [band(250000, None, 0.04, 10000, ep_included=False, ep_rate=0.005, ep_min=5000, pvt_included=False, pvt_rate=0.0035, pvt_min=3500)],
            },
            "tuktuk_psv": {
                "label": "Tuk Tuk – PSV", "category": "tuktuk", "max_age": 10, "min_si": 250000,
                "excess": [], "benefits": ["No Excess Protector"], "limits": [],
                "bands": [band(250000, None, 0.05, 15000, ep_included=True, pvt_included=False, pvt_rate=0.0035, pvt_min=3500)],
            },
            "private_hire_tours": {
                "label": "Private Hire – Tours (TSV)", "category": "psv", "max_age": 20, "min_si": 500000,
                "excess": [], "benefits": ["Passenger Legal Liability – Kshs 500/person"], "limits": [], "pll_per_seat": 500,
                "bands": [band(500000, None, 0.04, 35000, ep_included=False, ep_rate=0.005, ep_min=5000, pvt_included=False, pvt_rate=0.0035, pvt_min=3500)],
            },
            "motorcycle_private": {
                "label": "Motorcycle – Private", "category": "motorcycle", "max_age": None, "min_si": 80000,
                "excess": [], "benefits": ["No Excess Protector"], "limits": [],
                "bands": [band(80000, None, 0.04, 5000, ep_included=True, pvt_included=False, pvt_rate=0.0025, pvt_min=2500)],
            },
            "motorcycle_psv": {
                "label": "Motorcycle – PSV (Boda Boda)", "category": "motorcycle", "max_age": 7, "min_si": 80000,
                "excess": [], "benefits": ["Passenger Legal Liability – Kshs 500/person"], "limits": [], "pll_per_seat": 500,
                "bands": [band(80000, None, 0.04, 6000, ep_included=True, pvt_included=True)],
            },
        },
    },

    "cic": {
        "name": "CIC General Insurance Ltd",
        "classes": {
            "private": {
                "label": "Motor Private – Comprehensive", "category": "private", "max_age": 15, "min_si": 500000,
                "excess": ["Own Damage & Partial Theft – 2.5% Min 20,000 / Max 100,000", "Theft with ATD – 10% Min 20,000", "Theft with Tracking Device – 2.5% Min 20,000", "Theft without ATD – 20% Min 20,000", "Third Party Property Damage – Kshs 7,500", "New/Young Drivers – Kshs 5,000 additional"],
                "benefits": ["Courtesy Car: 3,000 (10 days) / 6,000 (20 days)", "AA Kenya Rescue – Kshs 7,500/yr (payable direct to provider)", "Inclusive Own Damage Excess Waiver & PVT"],
                "limits": ["Third Party Property Damage – Kshs 20,000,000", "Death/Injury to third parties – any one person Kshs 5,000,000 / unlimited per event", "Passenger Liability – any one person Kshs 5,000,000 / any one event Kshs 50,000,000", "Windscreen/Radio Cassette – Kshs 100,000 each (+10% charge above limit)"],
                "bands": [
                    band(500000, 1000000, 0.055, 40000),
                    band(1000001, 1500000, 0.045, 40000),
                    band(1500001, 2500000, 0.0425, 40000),
                    band(2500001, 5000000, 0.035, 40000),
                    band(5000001, None, 0.0325, 40000),
                ],
            },
            "institutional": {
                "label": "Commercial – Institutional Vehicle (School/Religious/Company Bus)", "category": "institutional", "max_age": 20, "min_si": 500000,
                "excess": ["Own Damage & Partial Theft – 5% Min 20,000 / Max 150,000", "Theft (alternators/starters) – 10% Min 20,000", "Third Party Property Damage – Kshs 10,000", "Young/New Drivers – Kshs 10,000 additional"],
                "benefits": ["Alternators & starters covered free if fully reinforced", "PLL – Kshs 200/seat for organised groups; free for students & school employees"],
                "limits": ["Third Party Property Damage – Kshs 20,000,000", "Passenger Liability – any one person Kshs 5,000,000 / any one event Kshs 50,000,000"],
                "pll_options": [
                    {"key": "organised", "label": "Organised groups", "rate": 200},
                    {"key": "student", "label": "Students / school employees", "rate": 0},
                ],
                "bands": [band(500000, None, 0.035, 30000)],
            },
            "hybrid_zero_trucks": {
                "label": "Commercial Hybrid – Zero Mileage Trucks (new units)", "category": "commercial", "max_age": None, "min_si": 500000,
                "excess": ["Own Damage & Partial Theft – 5% Min 30,000 / Max 150,000", "Third Party Property Damage – up to 20t Kshs 20,000 / over 20t Kshs 30,000"],
                "benefits": ["Inclusive Own Damage Excess Protection & Terrorism/Political Violence extension", "PLL Kshs 500/seat (optional – not for drivers & loaders)"], "limits": ["Passenger Liability any one event – Kshs 50,000,000"], "pll_per_seat": 500,
                "bands": [band(500000, None, 0.045, 50000)],
            },
            "hybrid_nonzero_trucks": {
                "label": "Commercial Hybrid – Non-Zero Mileage Trucks (1–15yrs)", "category": "commercial", "max_age": 15, "min_si": 500000,
                "excess": ["Own Damage & Partial Theft – 5% Min 30,000 / Max 150,000", "Third Party Property Damage – up to 20t Kshs 20,000 / over 20t Kshs 30,000"],
                "benefits": ["Rate depends on 3-yr Loss Ratio (LR): <60% = 5%, >60% = 6%"], "limits": ["Passenger Liability any one event – Kshs 50,000,000"],
                "bands": [band(500000, None, 0.05, 50000)],
                "bands_alt": [band(500000, None, 0.06, 50000)],
                "has_lr_toggle": True,
            },
            "hybrid_zero_pickups": {
                "label": "Commercial Hybrid – Zero Mileage Pick-Ups (new units)", "category": "commercial", "max_age": None, "min_si": 500000,
                "excess": ["Own Damage & Partial Theft – 5% Min 30,000 / Max 150,000"], "benefits": ["Inclusive Own Damage Excess Protection"], "limits": [],
                "bands": [band(500000, None, 0.04, 50000)],
            },
            "hybrid_nonzero_pickups": {
                "label": "Commercial Hybrid – Non-Zero Mileage Pick-Ups (1–15yrs)", "category": "commercial", "max_age": 15, "min_si": 500000,
                "excess": ["Own Damage & Partial Theft – 5% Min 30,000 / Max 150,000"], "benefits": ["Rate depends on 3-yr Loss Ratio (LR): <60% = 4.95%, >60% = 5%"], "limits": [],
                "bands": [band(500000, None, 0.0495, 50000)],
                "bands_alt": [band(500000, None, 0.05, 50000)],
                "has_lr_toggle": True,
            },
            "motorcycle_corporate": {
                "label": "Motorcycle – Corporate", "category": "motorcycle", "max_age": None, "min_si": 0,
                "excess": ["Own Damage & Partial Theft – 5% Min 10,000", "Theft – 10% Min 15,000", "Third Party Property Damage – Kshs 2,500"], "benefits": [], "limits": ["Third Party Bodily Injury – any one person Kshs 1,000,000 / unlimited any event"],
                "bands": [band(0, None, 0.03, 5000)],
            },
        },
    },

    "definite": {
        "name": "Definite Assurance Company Ltd",
        "note": "Definite binder terms 2026.",
        "classes": {
            "private": {
                "label": "Motor Private – Comprehensive", "category": "private", "max_age": 15, "min_si": 500000,
                "excess": [], "benefits": ["PVT inclusive of rate; Excess Protector optional add-on"], "limits": [],
                "bands": [band(500000, None, 0.0325, 30000, ep_included=False, ep_rate=0.0025, ep_min=3000, pvt_included=True)],
            },
            "commercial_hybrid": {
                "label": "Motor Commercial – Hybrid", "category": "commercial", "max_age": 15, "min_si": 500000,
                "excess": [], "benefits": ["No dedicated Excess Protector – flat 0.35% Min 5,000 charged instead"], "limits": [],
                "bands": [
                    band(500000, 2000000, 0.0425, 35000, ep_included=False, ep_rate=0.0035, ep_min=5000, pvt_included=True),
                    band(2000001, None, 0.04, 35000, ep_included=False, ep_rate=0.0035, ep_min=5000, pvt_included=True),
                ],
            },
            "commercial_institutional": {
                "label": "Motor Commercial – Institutional", "category": "institutional", "max_age": 15, "min_si": 500000,
                "excess": [], "benefits": ["Excess Protector & PVT inclusive"], "limits": ["Passenger Legal Liability – Kshs 250/passenger"],
                "pll_per_seat": 250,
                "bands": [band(500000, None, 0.0325, 35000)],
            },
            "psv_chauffeur_taxi": {
                "label": "PSV Chauffeur Driven / Taxi", "category": "psv", "max_age": 15, "min_si": 500000,
                "excess": [], "benefits": ["PVT inclusive of rate", "No Excess Protector offered for this class"], "limits": ["Passenger Legal Liability – Kshs 500/passenger"],
                "pll_per_seat": 500,
                "bands": [band(500000, None, 0.055, 40000, ep_included=False, ep_not_offered=True, pvt_included=True)],
            },
            # Definite's binder terms do not state Excess Protector or PVT
            # cover for tuk-tuk, tours/TSV, motorcycle, matatu or bus classes
            # -- rather than invent unstated cover, these are stored as not
            # offered on this product. See the completion report.
            "tuktuk_commercial": {
                "label": "Tuk Tuk – Commercial", "category": "tuktuk", "max_age": 10, "min_si": 250000,
                "excess": [], "benefits": [], "limits": [],
                "bands": [band(250000, None, 0.04, 15000, ep_included=False, ep_not_offered=True, pvt_included=False, pvt_not_offered=True)],
            },
            "tuktuk_psv": {
                "label": "Tuk Tuk – PSV", "category": "tuktuk", "max_age": 10, "min_si": 250000,
                "excess": [], "benefits": [], "limits": ["Passenger Legal Liability – Kshs 500/passenger"],
                "pll_per_seat": 500,
                "bands": [band(250000, None, 0.04, 20000, ep_included=False, ep_not_offered=True, pvt_included=False, pvt_not_offered=True)],
            },
            "private_hire_tours_tsv": {
                "label": "Private Hire – Tours (TSV)", "category": "psv", "max_age": 15, "min_si": 750000,
                "excess": [], "benefits": [], "limits": ["Passenger Legal Liability – Kshs 500/passenger"],
                "pll_per_seat": 500,
                "bands": [band(750000, None, 0.045, 40000, ep_included=False, ep_rate=0.005, ep_min=5000, pvt_included=False, pvt_not_offered=True)],
            },
            "motorcycle_private": {
                "label": "Motorcycle – Private", "category": "motorcycle", "max_age": None, "min_si": 150000,
                "excess": [], "benefits": [], "limits": [],
                "bands": [band(150000, None, 0.03, 5000, ep_included=False, ep_not_offered=True, pvt_included=False, pvt_not_offered=True)],
            },
            "motorcycle_psv": {
                "label": "Motorcycle – PSV (Boda Boda)", "category": "motorcycle", "max_age": 5, "min_si": 150000,
                "excess": [], "benefits": [], "limits": ["Passenger Legal Liability – Kshs 500/person"],
                "pll_per_seat": 500,
                "bands": [band(150000, None, 0.04, 7000, ep_included=False, ep_not_offered=True, pvt_included=False, pvt_not_offered=True)],
            },
            "psv_matatu": {
                "label": "PSV Matatu (7–35 Passengers)", "category": "psv", "max_age": 15, "min_si": 750000,
                "excess": [], "benefits": [], "limits": [],
                "bands": [band(750000, None, 0.04, 30000, ep_included=False, ep_not_offered=True, pvt_included=False, pvt_not_offered=True)],
            },
            "psv_bus": {
                "label": "PSV Bus (36+ Passengers)", "category": "psv", "max_age": 15, "min_si": 750000,
                "excess": [], "benefits": [], "limits": [],
                "bands": [band(750000, None, 0.045, 30000, ep_included=False, ep_not_offered=True, pvt_included=False, pvt_not_offered=True)],
            },
        },
    },

    "apa": {
        "name": "APA Insurance Ltd",
        "disclaimer": "APA's 12 Jan 2026 circular states these RETAIL rates do NOT apply to supporters with Binder Contracts or corporate clients — confirm binder terms with APA before quoting a binder client on these figures.",
        "classes": {
            "private": {
                "label": "Private Car – Comprehensive (Retail)", "category": "private", "max_age": 12, "min_si": 600000,
                "excess": ["Own Damage & Partial Theft – 2.5% Min 20,000", "Theft with ATD – 10% Min 20,000", "Theft without ATD – 20% Min 20,000", "Theft with Tracking Device – 2.5% Min 20,000", "Third Party Property Damage – Kshs 7,500", "Young(<25)/Novice(<2yrs) Drivers – Kshs 5,000 additional each"],
                "benefits": ["Windscreen/Radio free limit Kshs 50,000 (SI ≤2.5M) or 100,000 (SI >2.5M), +10% above limit", "Political Violence/Terrorism optional – 0.25% Min 2,500", "Excess Protector (Material Damage) optional – 0.25% SI Min 5,000", "Excess Protector (Full) optional – 1% SI Min 10,000"],
                "limits": ["Third Party Property Damage – up to Kshs 20,000,000", "Third Party Bodily Injury – up to Kshs 3,000,000/person"],
                "bands": [
                    band(600000, 1000000, 0.0725, 50000, ep_included=False, ep_rate=0.0025, ep_min=5000, pvt_included=True),
                    band(1000001, 1500000, 0.06, 50000, ep_included=False, ep_rate=0.0025, ep_min=5000, pvt_included=True),
                    band(1500001, 2500000, 0.055, 50000, ep_included=False, ep_rate=0.0025, ep_min=5000, pvt_included=True),
                    band(2500001, 5000000, 0.0425, 50000, ep_included=False, ep_rate=0.0025, ep_min=5000, pvt_included=True),
                    band(5000001, 10000000, 0.03, 50000, ep_included=False, ep_rate=0.0025, ep_min=5000, pvt_included=True),
                    band(10000001, None, 0.03, 50000, ep_included=False, ep_rate=0.0025, ep_min=5000, pvt_included=True),
                ],
            },
            "commercial_own_goods": {
                "label": "Motor Commercial (Own Goods, Retail)", "category": "commercial", "max_age": 15, "min_si": 600000,
                "excess": ["Own Damage & Partial Theft – 5% Min 30,000", "Theft with ATD – 10% Min 30,000", "Theft without ATD – 20% Min 30,000", "Third Party Property Damage – Kshs 10,000", "Young(<25)/Novice(<1yr) Drivers – Kshs 10,000 additional each"],
                "benefits": ["Excess Protector (Full) NOT COVERED under retail terms", "PLL charged at Kshs 500/passenger × permitted capacity"], "limits": ["Third Party Property Damage – up to Kshs 20,000,000"],
                "bands": [
                    band(600000, 1000000, 0.0725, 75000, ep_included=False, ep_rate=0.0025, ep_min=5000, pvt_included=True),
                    band(1000001, 2500000, 0.056, 75000, ep_included=False, ep_rate=0.0025, ep_min=5000, pvt_included=True),
                    band(2500001, 5000000, 0.0525, 75000, ep_included=False, ep_rate=0.0025, ep_min=5000, pvt_included=True),
                    band(5000001, None, 0.0425, 75000, ep_included=False, ep_rate=0.0025, ep_min=5000, pvt_included=True),
                ],
            },
            "commercial_private_hire": {
                "label": "Commercial – Private Hire (Chauffeur Driven, Retail)", "category": "commercial", "max_age": 12, "min_si": 1500000,
                "excess": ["Same excess schedule as Commercial Own Goods"], "benefits": ["No TPO proposals accepted for this class"], "limits": [],
                "bands": [
                    band(1500000, 2500000, 0.0575, 50000, ep_included=False, ep_rate=0.0025, ep_min=5000, pvt_included=True),
                    band(2500001, None, 0.055, 50000, ep_included=False, ep_rate=0.0025, ep_min=5000, pvt_included=True),
                ],
            },
            "commercial_online_hailed": {
                "label": "Commercial – Private Hire Online-Hailed (Uber/Bolt, Retail)", "category": "commercial", "max_age": 12, "min_si": 0,
                "excess": ["Same excess schedule as Commercial Own Goods"], "benefits": [], "limits": [],
                "bands": [band(0, None, 0.0825, 75000, ep_included=False, ep_rate=0.0035, ep_min=5000, pvt_included=True)],
            },
            "tpo_private": {
                "label": "Third Party Only (with supporting non-motor business)", "category": "tpo", "max_age": None, "min_si": 0,
                "excess": [], "benefits": [], "limits": [],
                "flat_only": flat(12000, "Annual TPO — requires supporting non-motor business"),
            },
        },
    },

    "britam": {
        "name": "Britam General Insurance (K) Ltd",
        "classes": {
            "private": {
                "label": "Private Car – Comprehensive", "category": "private", "max_age": 15, "min_si": 0,
                "excess": ["Own Damage & Partial Theft – 2.5% Min 30,000 / Max 100,000", "Theft with ATD – 10% Min 20,000", "Theft without ATD – 20% Min 20,000", "Theft with Tracking Device – 2.5% Min 20,000", "Third Party Property Damage – Kshs 5,000", "New & Young Drivers – Kshs 5,000 each additional"],
                "benefits": ["Free: Death/Fatal Accident cover for named driver Kshs 100,000", "Free: Forced ATM withdrawal cover Kshs 10,000", "Windscreen/Radio Cassette free limit Kshs 50,000 (100,000 if SI>3M)"],
                "limits": ["Third Party Property Damage – Kshs 20,000,000", "Passenger Liability – any one person Kshs 5,000,000 / any one event Kshs 20,000,000"],
                "bands": [
                    # EP/PVT are mandatory for Britam private car (per the
                    # binder terms), so they are always charged as a
                    # separate line via ep_mandatory/pvt_mandatory rather
                    # than depending on customer opt-in. The below-1.5M band
                    # has no documented EP/PVT minimum premium -- stored as
                    # 0 (no floor) rather than an invented figure; see the
                    # completion report.
                    band(0, 1499999, 0.04, 42500, ep_included=False, ep_rate=0.005, ep_min=0, ep_mandatory=True, pvt_included=False, pvt_rate=0.0025, pvt_min=0, pvt_mandatory=True),
                    band(1500000, 2999999, 0.035, 42500, ep_included=False, ep_rate=0.005, ep_min=2500, ep_mandatory=True, pvt_included=False, pvt_rate=0.0025, pvt_min=2500, pvt_mandatory=True),
                    band(3000000, None, 0.03, 42500),
                ],
            },
            "commercial_general_cartage": {
                "label": "Motor Commercial – General Cartage", "category": "commercial", "max_age": 15, "min_si": 0,
                "excess": ["Own Damage & Partial Theft – 5% Min 30,000 / Max 150,000", "Theft with ATD – 10% Min 30,000", "Theft without ATD – 20% Min 40,000", "Third Party Property Damage – Kshs 10,000", "New/Young Drivers – Kshs 10,000 additional"],
                "benefits": ["Free: Forced ATM withdrawal Kshs 10,000", "Free: Fatal PA cover for named driver Kshs 150,000", "PLL optional Kshs 1,000/passenger", "EP and PVT are mandatory and always included in the premium (combined standard rate 5.5% before minimum-premium effects)"], "limits": ["Third Party Property Damage – Kshs 30,000,000"],
                "bands": [band(0, None, 0.05, 75000, ep_included=False, ep_rate=0.0025, ep_min=5000, ep_mandatory=True, pvt_included=False, pvt_rate=0.0025, pvt_min=3000, pvt_mandatory=True)],
            },
            "commercial_own_goods": {
                "label": "Motor Commercial – Own Goods", "category": "commercial", "max_age": 15, "min_si": 0,
                "excess": ["Own Damage & Partial Theft – 5% Min 20,000 / Max 150,000", "Theft with ATD – 10% Min 20,000", "Theft without ATD – 20% Min 20,000", "Third Party Property Damage – Kshs 10,000", "New/Young Drivers – Kshs 10,000 additional"],
                "benefits": ["Free: Forced ATM withdrawal Kshs 10,000", "Free: Fatal PA cover for named driver Kshs 150,000", "PLL optional Kshs 1,000/passenger", "EP and PVT are mandatory and always included in the premium"], "limits": ["Third Party Property Damage – Kshs 20,000,000"],
                "bands": [band(0, None, 0.04, 50000, ep_included=False, ep_rate=0.0025, ep_min=5000, ep_mandatory=True, pvt_included=False, pvt_rate=0.0025, pvt_min=3000, pvt_mandatory=True)],
            },
            "tpo_private": {
                "label": "Third Party Only – Private", "category": "tpo", "max_age": None, "min_si": 0,
                "excess": [], "benefits": [], "limits": [],
                "flat_only": flat(15000, "Annual TPO premium"),
            },
            "tpft_private": {
                "label": "Third Party, Fire & Theft – Private", "category": "tpo", "max_age": None, "min_si": 0,
                "excess": [], "benefits": [], "limits": [],
                "flat_only": flat(rate_on_si=0.04, min_premium=45000, note="4% of sum insured, minimum Kshs 45,000"),
            },
        },
    },

    "directline": {
        "name": "Directline Assurance Company Ltd",
        "disclaimer": "Directline binder is a Third Party Only (TPO) scheme — no comprehensive/own-damage cover is offered. Rates shown are net of commission.",
        "classes": {
            "tpo_private": {"label": "Motor Private – TPO", "category": "tpo", "max_age": None, "min_si": 0, "excess": ["Third Party Injury/Death – Kshs 10,000 each claim", "Third Party Property Damage – Kshs 10,000", "Young/Novice Drivers – Kshs 10,000 each claim"], "benefits": [], "limits": ["Bodily Injury/Death – Kshs 3,000,000", "Property Damage – Kshs 1,000,000", "Geographical area – East Africa"], "flat_only": flat(3200, "Annual (1-month TOR = Kshs 550)")},
            "tpo_commercial": {"label": "Motor Commercial (General Cartage/Own Goods, 1–10T) – TPO", "category": "tpo", "max_age": None, "min_si": 0, "excess": ["Third Party Injury/Death – Kshs 30,000", "Third Party Property Damage – Kshs 30,000"], "benefits": [], "limits": ["Bodily Injury/Death – Kshs 3,000,000", "Property Damage – Kshs 1,000,000"], "flat_only": flat(3800, "Annual (1-month TOR = Kshs 800)")},
            "tpo_commercial_tractor": {"label": "Motor Commercial – Tractors – TPO", "category": "tpo", "max_age": None, "min_si": 0, "excess": [], "benefits": [], "limits": [], "flat_only": flat(2784, "Annual premium")},
            "tpo_commercial_tanker": {"label": "Motor Commercial – Tankers – TPO", "category": "tpo", "max_age": None, "min_si": 0, "excess": [], "benefits": [], "limits": [], "flat_only": flat(13783, "Annual premium")},
            "tpo_motorcycle_psv": {"label": "Motorcycle – PSV Boda – TPO", "category": "tpo", "max_age": None, "min_si": 0, "excess": ["Third Party Injury/Death – Kshs 7,500", "Third Party Property Damage – Kshs 7,500"], "benefits": [], "limits": [], "flat_only": flat(3200, "Annual (1-month = Kshs 500)")},
            "tpo_motorcycle_private": {"label": "Motorcycle – Private – TPO (1 month)", "category": "tpo", "max_age": None, "min_si": 0, "excess": [], "benefits": [], "limits": [], "flat_only": flat(1870, "Annual premium")},
            "tpo_psv_unmarked_4": {"label": "PSV Unmarked 4 PAX – TPO", "category": "tpo", "max_age": None, "min_si": 0, "excess": [], "benefits": [], "limits": [], "flat_only": flat(6899, "Annual premium")},
            "tpo_psv_taxi_4": {"label": "PSV Taxi 4 PAX – TPO", "category": "tpo", "max_age": None, "min_si": 0, "excess": [], "benefits": [], "limits": [], "flat_only": flat(8721, "Annual premium")},
            "tpo_psv_tsv_9": {"label": "PSV Unmarked TSV 9 PAX – TPO", "category": "tpo", "max_age": None, "min_si": 0, "excess": [], "benefits": [], "limits": [], "flat_only": flat(11006, "Annual premium")},
            "tpo_psv_tsv_8": {"label": "PSV Unmarked TSV 8 PAX – TPO", "category": "tpo", "max_age": None, "min_si": 0, "excess": [], "benefits": [], "limits": [], "flat_only": flat(10512, "Annual premium")},
            "tpo_tuktuk_commercial": {"label": "Tuk Tuk – Commercial – TPO", "category": "tpo", "max_age": None, "min_si": 0, "excess": [], "benefits": [], "limits": [], "flat_only": flat(2784, "Annual premium")},
            "tpo_psv_tuktuk": {"label": "PSV Tuk Tuk – TPO", "category": "tpo", "max_age": None, "min_si": 0, "excess": [], "benefits": [], "limits": [], "flat_only": flat(4000, "Annual premium")},
        },
    },

    "star_discover": {
        "name": "Star Discover",
        "note": (
            "Star Discover's binder also documents Commercial Own Goods, Commercial "
            "General Cartage, Institutional/School Buses, Special Types, Corporate "
            "Motorcycles and Private TPO products, but no rate percentages, minimum "
            "premiums, minimum values or maximum ages were supplied for them -- these "
            "motor classes have not been created here to avoid inventing figures. "
            "Send the relevant rate pages to add them."
        ),
        "classes": {
            "private": {
                "label": "Private Car – Comprehensive", "category": "private", "max_age": 15, "min_si": 500000,
                "excess": [], "benefits": [], "limits": [],
                # Only the 500,000-1,499,999 band restates EP/PVT terms in
                # the source; the higher bands are silent on EP/PVT, so they
                # are stored as not offered rather than assumed to carry the
                # first band's terms forward. See the completion report.
                "bands": [
                    band(500000, 1499999, 0.04, 37500, ep_included=False, ep_rate=0.0025, ep_min=2500, pvt_included=False, pvt_rate=0.0025, pvt_min=2500),
                    band(1500000, 2499999, 0.035, 37500, ep_included=False, ep_not_offered=True, pvt_included=False, pvt_not_offered=True),
                    band(2500000, 3499999, 0.0325, 37500, ep_included=False, ep_not_offered=True, pvt_included=False, pvt_not_offered=True),
                    band(3500000, None, 0.03, 37500, ep_included=False, ep_not_offered=True, pvt_included=False, pvt_not_offered=True),
                ],
            },
            "private_selected_models": {
                "label": "Private Car – Selected Models (Probox, Succeed, Wish, Vitz, Isis, Sienta)",
                "category": "private", "max_age": None, "min_si": 0,
                "excess": [], "benefits": ["Declaration form mandatory"], "limits": [],
                "bands": [band(0, None, 0.045, 45000, ep_included=False, ep_not_offered=True, pvt_included=False, pvt_not_offered=True)],
            },
        },
    },
}


CATEGORY_LABELS = {
    "private": "Private Car",
    "commercial": "Commercial (Own Goods / Gen. Cartage / Hybrid)",
    "institutional": "Institutional / School Bus",
    "psv": "PSV / Chauffeur Driven",
    "tuktuk": "Tuk Tuk",
    "motorcycle": "Motorcycle",
    "asset": "Asset (New Units)",
    "special": "Special Type (Farm/Construction)",
    "tpo": "Third Party Only",
}
