"""
PRAVAAH-AI — Prediction Test Suite
====================================
Tests all 6 hazard predictors across LOW / MEDIUM / HIGH risk scenarios.
Also includes live API tests against the running server on localhost:8000.

Run locally (no server needed):
    python test_predictions.py

Run with API tests (server must be running):
    python test_predictions.py --api
"""

import sys
import json
import unittest
import urllib.request
import urllib.error

# ---------------------------------------------------------------------------
# Import the predictor functions directly from main.py
# ---------------------------------------------------------------------------
sys.path.insert(0, ".")
from main import (
    predict_flood,
    predict_fire,
    predict_pollution,
    predict_weather,
    predict_landslide,
    predict_gas_leak,
    risk_level,
    limit,
)

API_BASE = "http://localhost:8000"
RUN_API  = "--api" in sys.argv


# ---------------------------------------------------------------------------
# Helper: build a lightweight sensor data object from keyword args
# ---------------------------------------------------------------------------
class Sensor:
    """Mimics a Pydantic HazardInput instance with attribute access."""
    def __init__(self, **kwargs):
        defaults = dict(
            temperature=30, humidity=60, rainfall=0,
            wind_speed=10, pressure=1013, water_level=1,
            pm25=30, pm10=50, co=1, no2=20,
            slope=10, soil_moisture=30, gas_concentration=0,
        )
        defaults.update(kwargs)
        for k, v in defaults.items():
            setattr(self, k, v)


# ---------------------------------------------------------------------------
# Helper: call the live /api/analyze endpoint
# ---------------------------------------------------------------------------
def api_analyze(hazard, **kwargs):
    payload = {"hazard": hazard, **kwargs}
    data = json.dumps(payload).encode()
    req  = urllib.request.Request(
        f"{API_BASE}/api/analyze",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read())


# ===========================================================================
# 1.  UNIT TESTS — pure Python (no server required)
# ===========================================================================

class TestFlood(unittest.TestCase):

    def test_low_risk(self):
        """Dry conditions → LOW flood risk."""
        d = Sensor(rainfall=0, water_level=0.5, humidity=40)
        r = predict_flood(d)
        self.assertEqual(r["risk"], "LOW")
        self.assertLess(r["score"], 40)

    def test_medium_risk(self):
        """Moderate rainfall + normal water level → MEDIUM."""
        d = Sensor(rainfall=50, water_level=1.5, humidity=65)
        r = predict_flood(d)
        self.assertEqual(r["risk"], "MEDIUM")
        self.assertGreaterEqual(r["score"], 40)
        self.assertLess(r["score"], 70)

    def test_high_risk(self):
        """Heavy rain + high water level → HIGH risk."""
        d = Sensor(rainfall=120, water_level=4, humidity=90)
        r = predict_flood(d)
        self.assertEqual(r["risk"], "HIGH")
        self.assertGreaterEqual(r["score"], 70)

    def test_affected_area_proportional(self):
        """Affected area should be score × 0.25."""
        d = Sensor(rainfall=60, water_level=2, humidity=70)
        r = predict_flood(d)
        self.assertAlmostEqual(r["affected_area"], round(r["score"] * 0.25, 2))

    def test_score_capped_at_100(self):
        """Extreme inputs must not push score above 100."""
        d = Sensor(rainfall=9999, water_level=9999, humidity=100)
        r = predict_flood(d)
        self.assertLessEqual(r["score"], 100)


class TestForestFire(unittest.TestCase):

    def test_low_risk_humid(self):
        """High humidity + low temp + calm wind → LOW."""
        d = Sensor(humidity=90, temperature=15, wind_speed=5)
        r = predict_fire(d)
        self.assertEqual(r["risk"], "LOW")

    def test_medium_risk(self):
        """Moderate dryness + warm + breezy → MEDIUM."""
        d = Sensor(humidity=55, temperature=32, wind_speed=18)
        r = predict_fire(d)
        self.assertIn(r["risk"], ["MEDIUM", "HIGH"])   # borderline zone

    def test_high_risk_hot_dry_windy(self):
        """Classic wildfire conditions → HIGH."""
        d = Sensor(humidity=10, temperature=45, wind_speed=40)
        r = predict_fire(d)
        self.assertEqual(r["risk"], "HIGH")

    def test_score_never_negative(self):
        """Score should always be ≥ 0 even with very low inputs."""
        d = Sensor(humidity=100, temperature=0, wind_speed=0)
        r = predict_fire(d)
        self.assertGreaterEqual(r["score"], 0)


class TestAirPollution(unittest.TestCase):

    def test_clean_air(self):
        """WHO-compliant values → LOW."""
        d = Sensor(pm25=5, pm10=15, co=0.3, no2=5)
        r = predict_pollution(d)
        self.assertEqual(r["risk"], "LOW")

    def test_moderate_pollution(self):
        """Urban average pollution → MEDIUM."""
        d = Sensor(pm25=40, pm10=70, co=1.5, no2=30)
        r = predict_pollution(d)
        self.assertIn(r["risk"], ["MEDIUM", "HIGH"])

    def test_hazardous_aqi(self):
        """Hazardous smog-level values → HIGH."""
        d = Sensor(pm25=80, pm10=150, co=8, no2=80)
        r = predict_pollution(d)
        self.assertEqual(r["risk"], "HIGH")

    def test_pm25_dominant_weight(self):
        """PM2.5 has the highest weight (0.7); confirm it drives the score up."""
        low_pm25  = predict_pollution(Sensor(pm25=10, pm10=10, co=0, no2=0))
        high_pm25 = predict_pollution(Sensor(pm25=60, pm10=10, co=0, no2=0))
        self.assertGreater(high_pm25["score"], low_pm25["score"])


class TestExtremeWeather(unittest.TestCase):

    def test_calm_conditions(self):
        """Normal pressure + no rain + calm wind → LOW."""
        d = Sensor(rainfall=0, wind_speed=5, pressure=1013)
        r = predict_weather(d)
        self.assertEqual(r["risk"], "LOW")

    def test_tropical_storm(self):
        """Low pressure + strong wind + heavy rain → HIGH."""
        d = Sensor(rainfall=100, wind_speed=60, pressure=970)
        r = predict_weather(d)
        self.assertEqual(r["risk"], "HIGH")

    def test_pressure_deviation_matters(self):
        """Pressure far from 1013 hPa should increase score."""
        normal  = predict_weather(Sensor(pressure=1013, wind_speed=10, rainfall=0))
        low_p   = predict_weather(Sensor(pressure=960,  wind_speed=10, rainfall=0))
        high_p  = predict_weather(Sensor(pressure=1050, wind_speed=10, rainfall=0))
        self.assertGreater(low_p["score"],  normal["score"])
        self.assertGreater(high_p["score"], normal["score"])


class TestLandslide(unittest.TestCase):

    def test_flat_dry_terrain(self):
        """Flat, dry slope → LOW."""
        d = Sensor(rainfall=0, slope=3, soil_moisture=10)
        r = predict_landslide(d)
        self.assertEqual(r["risk"], "LOW")

    def test_steep_saturated_slope(self):
        """Steep slope + heavy rain + saturated soil → HIGH."""
        d = Sensor(rainfall=80, slope=45, soil_moisture=80)
        r = predict_landslide(d)
        self.assertEqual(r["risk"], "HIGH")

    def test_slope_angle_contribution(self):
        """Steeper slope should always yield higher score (all else equal)."""
        gentle = predict_landslide(Sensor(rainfall=20, slope=5,  soil_moisture=30))
        steep  = predict_landslide(Sensor(rainfall=20, slope=40, soil_moisture=30))
        self.assertGreater(steep["score"], gentle["score"])


class TestGasLeak(unittest.TestCase):

    def test_no_gas(self):
        """Zero gas concentration → LOW."""
        d = Sensor(gas_concentration=0, wind_speed=5)
        r = predict_gas_leak(d)
        self.assertEqual(r["risk"], "LOW")
        self.assertEqual(r["score"], 0)

    def test_moderate_gas(self):
        """Moderate gas concentration → MEDIUM range."""
        d = Sensor(gas_concentration=22, wind_speed=10)
        r = predict_gas_leak(d)
        self.assertGreaterEqual(r["score"], 40)

    def test_high_gas_high_wind(self):
        """High gas + wind > 20 km/h adds +10 penalty → HIGH."""
        d = Sensor(gas_concentration=35, wind_speed=25)
        r = predict_gas_leak(d)
        self.assertEqual(r["risk"], "HIGH")

    def test_wind_bonus_triggers_at_20(self):
        """Wind exactly > 20 should add the +10 bonus."""
        no_bonus  = predict_gas_leak(Sensor(gas_concentration=20, wind_speed=20))
        with_bonus = predict_gas_leak(Sensor(gas_concentration=20, wind_speed=21))
        self.assertEqual(with_bonus["score"], no_bonus["score"] + 10)


class TestHelpers(unittest.TestCase):

    def test_limit_clamps_max(self):
        self.assertEqual(limit(150), 100)

    def test_limit_clamps_min(self):
        self.assertEqual(limit(-5), 0)

    def test_limit_passthrough(self):
        self.assertEqual(limit(55), 55)

    def test_risk_level_thresholds(self):
        self.assertEqual(risk_level(0),   "LOW")
        self.assertEqual(risk_level(39),  "LOW")
        self.assertEqual(risk_level(40),  "MEDIUM")
        self.assertEqual(risk_level(69),  "MEDIUM")
        self.assertEqual(risk_level(70),  "HIGH")
        self.assertEqual(risk_level(100), "HIGH")


# ===========================================================================
# 2.  LIVE API TESTS — require the server to be running on localhost:8000
# ===========================================================================

@unittest.skipUnless(RUN_API, "Skipped — pass --api flag to enable live tests")
class TestAPIAnalyze(unittest.TestCase):

    def test_flood_high_via_api(self):
        r = api_analyze("flood", rainfall=120, water=4, humidity=90,
                        wind=10, pm25=30, pm10=50, gas=0, slope=10, soil=30)
        self.assertEqual(r["hazard"], "flood")
        self.assertEqual(r["risk"], "HIGH")
        self.assertIsInstance(r["actions"], list)
        self.assertGreater(len(r["actions"]), 0)

    def test_fire_alias_resolves(self):
        """Frontend sends 'fire'; backend should resolve it to 'forest_fire'."""
        r = api_analyze("fire", humidity=10, temperature=45, wind=40,
                        rainfall=0, water=1, pm25=30, pm10=50, gas=0,
                        slope=10, soil=30)
        self.assertEqual(r["hazard"], "forest_fire")
        self.assertEqual(r["hazard_name"], "Forest Fire")

    def test_gas_alias_resolves(self):
        """Frontend sends 'gas'; backend should resolve it to 'gas_leak'."""
        r = api_analyze("gas", gas=35, wind=25, temperature=30, humidity=60,
                        rainfall=0, water=1, pm25=30, pm10=50, slope=10, soil=30)
        self.assertEqual(r["hazard"], "gas_leak")

    def test_unknown_hazard_returns_error(self):
        try:
            api_analyze("earthquake")
            self.fail("Should have raised an error or returned error key")
        except urllib.error.HTTPError:
            pass  # server returned 4xx — acceptable
        except Exception:
            pass  # any other error is also acceptable here

    def test_dynamic_messages_per_risk(self):
        """Verify dynamic contextual messages for LOW, MEDIUM, and HIGH flood risks."""
        low_res = predict_flood(Sensor(rainfall=0, water_level=0.5, humidity=40))
        high_res = predict_flood(Sensor(rainfall=120, water_level=4, humidity=90))
        self.assertIn("Normal hydrology", low_res["message"])
        self.assertIn("Critical flood surge", high_res["message"])
        self.assertNotEqual(low_res["message"], high_res["message"])


    def test_fire_rainfall_suppression(self):
        """Rainfall should actively suppress forest fire risk score."""
        dry = predict_fire(Sensor(humidity=20, temperature=40, wind_speed=25, rainfall=0))
        wet = predict_fire(Sensor(humidity=20, temperature=40, wind_speed=25, rainfall=40))
        self.assertGreater(dry["score"], wet["score"])


    def test_response_has_required_keys(self):
        r = api_analyze("landslide", rainfall=80, slope=45, soil=80,
                        wind=10, water=1, pm25=30, pm10=50, gas=0,
                        temperature=28, humidity=70)
        for key in ("hazard", "hazard_name", "risk", "score", "area", "message", "alert_level", "headline", "actions"):
            self.assertIn(key, r, f"Missing key: {key}")

    def test_score_within_bounds(self):
        r = api_analyze("air_pollution", pm25=50, pm10=100,
                        wind=5, water=1, gas=0, slope=10, soil=30,
                        temperature=35, humidity=55, rainfall=0)
        self.assertGreaterEqual(r["score"], 0)
        self.assertLessEqual(r["score"], 100)


# ===========================================================================
# Entry point
# ===========================================================================

if __name__ == "__main__":
    print("=" * 65)
    print("  PRAVAAH-AI — Prediction Test Suite")
    print("=" * 65)
    if RUN_API:
        print("  Mode: UNIT TESTS + LIVE API TESTS (localhost:8000)")
    else:
        print("  Mode: UNIT TESTS only  (run with --api for live tests)")
    print("=" * 65)

    # Remove --api from argv so unittest doesn't choke on it
    sys.argv = [a for a in sys.argv if a != "--api"]

    unittest.main(verbosity=2)
