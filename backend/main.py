import json
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List

app = FastAPI(title="PRAVAAH-AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class HazardInput(BaseModel):
    """Used by the original POST /predict endpoint."""
    hazard: str

    # Weather
    temperature: Optional[float] = 30
    humidity: Optional[float] = 60
    rainfall: Optional[float] = 0
    wind_speed: Optional[float] = 10
    pressure: Optional[float] = 1013

    # Flood
    water_level: Optional[float] = 1

    # Pollution
    pm25: Optional[float] = 30
    pm10: Optional[float] = 50
    co: Optional[float] = 1
    no2: Optional[float] = 20

    # Landslide
    slope: Optional[float] = 10
    soil_moisture: Optional[float] = 30

    # Gas leak
    gas_concentration: Optional[float] = 0


class AnalyzeInput(BaseModel):
    """
    Frontend-facing model for POST /api/analyze.
    Field names match the HTML input IDs (wind, water, gas, soil, pressure, co, no2)
    rather than the verbose backend names.
    """
    hazard: str
    temperature: Optional[float] = 30
    humidity: Optional[float] = 60
    rainfall: Optional[float] = 0
    wind: Optional[float] = 10          # maps to wind_speed
    water: Optional[float] = 1          # maps to water_level
    pm25: Optional[float] = 30
    pm10: Optional[float] = 50
    co: Optional[float] = 1.0           # Carbon Monoxide (ppm)
    no2: Optional[float] = 20.0         # Nitrogen Dioxide (ppb)
    pressure: Optional[float] = 1013.0  # Barometric pressure (hPa)
    gas: Optional[float] = 0            # maps to gas_concentration
    slope: Optional[float] = 10
    soil: Optional[float] = 30          # maps to soil_moisture


class LocationInput(BaseModel):
    """Receives live GPS coordinates from the frontend."""
    latitude: float
    longitude: float
    accuracy: Optional[float] = None


# ---------------------------------------------------------------------------
# Lookup tables
# ---------------------------------------------------------------------------

# Normalize the short/alias hazard names the frontend sends into canonical keys
HAZARD_ALIAS = {
    "flood":           "flood",
    "fire":            "forest_fire",
    "forest_fire":     "forest_fire",
    "pollution":       "air_pollution",
    "air_pollution":   "air_pollution",
    "weather":         "extreme_weather",
    "extreme_weather": "extreme_weather",
    "landslide":       "landslide",
    "gas":             "gas_leak",
    "gas_leak":        "gas_leak",
}

HAZARD_NAMES = {
    "flood":           "Flood",
    "forest_fire":     "Forest Fire",
    "air_pollution":   "Air Pollution",
    "extreme_weather": "Extreme Weather",
    "landslide":       "Landslide",
    "gas_leak":        "Gas Leak",
}

# Recommended action lists per hazard per risk level
ACTIONS: dict[str, dict[str, List[str]]] = {
    "flood": {
        "HIGH": [
            "Evacuate immediately to higher ground",
            "Contact local emergency services (112)",
            "Avoid floodwater — even 6 inches can knock you down",
            "Move valuables and documents to upper floors",
            "Turn off electricity at the main breaker",
        ],
        "MEDIUM": [
            "Monitor water levels continuously",
            "Prepare an emergency kit (food, water, documents)",
            "Keep emergency contacts readily available",
            "Avoid low-lying roads and underpasses",
        ],
        "LOW": [
            "Stay informed via local weather alerts",
            "Check drainage systems around your property",
            "Review your household emergency plan",
        ],
    },
    "forest_fire": {
        "HIGH": [
            "Evacuate the area immediately",
            "Call fire emergency services (101)",
            "Close all windows and doors to slow smoke infiltration",
            "Avoid areas downwind of the fire",
            "Do not attempt to fight the fire yourself",
        ],
        "MEDIUM": [
            "Stay indoors and keep windows closed",
            "Monitor local fire and forestry alerts",
            "Prepare to evacuate at short notice",
            "Clear dry vegetation immediately around your property",
        ],
        "LOW": [
            "Avoid open burning in the area",
            "Stay alert to local fire-risk warnings",
            "Keep an emergency bag ready",
        ],
    },
    "air_pollution": {
        "HIGH": [
            "Stay indoors with windows and doors shut",
            "Use N95 masks if outdoor exposure is unavoidable",
            "Cancel all outdoor exercise or strenuous activity",
            "Children, elderly, and those with asthma must remain inside",
            "Run air purifiers if available",
        ],
        "MEDIUM": [
            "Limit time spent outdoors, especially for exercise",
            "Wear a mask when going outside",
            "Keep children indoors during peak hours",
            "Monitor the AQI via local authority updates",
        ],
        "LOW": [
            "Air quality is acceptable — routine precautions apply",
            "Sensitive individuals may still feel mild effects",
        ],
    },
    "extreme_weather": {
        "HIGH": [
            "Seek shelter immediately inside a solid building",
            "Stay away from windows and exterior walls",
            "Avoid all outdoor and non-essential travel",
            "Call emergency services if in immediate danger (112)",
            "Do not drive through flooded or storm-damaged roads",
        ],
        "MEDIUM": [
            "Secure all loose outdoor objects",
            "Monitor official weather bulletins",
            "Postpone non-essential travel and outdoor plans",
            "Have emergency supplies and important documents ready",
        ],
        "LOW": [
            "Stay updated on the latest weather forecasts",
            "Standard weather precautions apply",
        ],
    },
    "landslide": {
        "HIGH": [
            "Evacuate slopes, hill-sides, and valley areas immediately",
            "Call emergency services (112)",
            "Avoid rivers and streams downstream of unstable slopes",
            "Watch for sudden changes in water flow or colour",
            "Do not return until officially cleared by authorities",
        ],
        "MEDIUM": [
            "Avoid hiking or travel near steep or saturated slopes",
            "Monitor rainfall levels and ground stability reports",
            "Identify and prepare an evacuation route in advance",
        ],
        "LOW": [
            "Exercise caution on steep terrain after heavy rainfall",
            "Check ground conditions before outdoor activities",
        ],
    },
    "gas_leak": {
        "HIGH": [
            "Evacuate the area immediately — do not use any electrical switches or lighters",
            "Call emergency services (112) from a safe distance away",
            "Do not re-enter until the area is officially cleared",
            "Move upwind of the gas source",
            "Keep all flames and sparks away from the hazard zone",
        ],
        "MEDIUM": [
            "Ventilate the area by opening windows and doors",
            "Shut off the gas source if it is safe to do so",
            "Alert neighbours and notify local authorities",
            "Avoid all sparks or open flames in the vicinity",
        ],
        "LOW": [
            "Investigate the source of any gas odour",
            "Ensure adequate ventilation in the area",
            "Contact your gas provider to inspect connections and equipment",
        ],
    },
}


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def limit(value, minimum=0, maximum=100):
    return max(minimum, min(maximum, value))


def risk_level(score):
    if score >= 70:
        return "HIGH"
    elif score >= 40:
        return "MEDIUM"
    return "LOW"


# ---------------------------------------------------------------------------
# Hazard scoring functions with dynamic contextual alert messages
# ---------------------------------------------------------------------------

def predict_flood(data):
    rainfall = getattr(data, "rainfall", 0) or 0
    water_level = getattr(data, "water_level", 1) or 0
    humidity = getattr(data, "humidity", 60) or 0

    score = rainfall * 0.45 + water_level * 15 + humidity * 0.10
    score = limit(score)
    risk = risk_level(score)

    if risk == "HIGH":
        msg = f"Critical flood surge imminent ({water_level:.1f}m water level, {rainfall:.0f}mm rainfall). Immediate evacuation from low-lying zones required."
    elif risk == "MEDIUM":
        msg = f"Moderate flood risk detected. Rising water level ({water_level:.1f}m) and persistent rainfall ({rainfall:.0f}mm). Continuous monitoring advised."
    else:
        msg = f"Normal hydrology. Water level ({water_level:.1f}m) and rainfall ({rainfall:.0f}mm) remain within safe baseline limits."

    return {
        "score": round(score, 2),
        "risk": risk,
        "affected_area": round(score * 0.25, 2),
        "message": msg,
    }


def predict_fire(data):
    temperature = getattr(data, "temperature", 30) or 0
    humidity = getattr(data, "humidity", 60) or 0
    wind_speed = getattr(data, "wind_speed", 10) or 0
    rainfall = getattr(data, "rainfall", 0) or 0

    dryness = max(0, 100 - humidity)
    raw_score = dryness * 0.45 + temperature * 1.0 + wind_speed * 1.5
    if rainfall > 0:
        raw_score -= min(raw_score, rainfall * 1.5)
    score = limit(raw_score)
    risk = risk_level(score)

    if risk == "HIGH":
        msg = f"Severe wildfire danger! Extreme dry heat ({temperature:.1f}°C, {humidity:.0f}% humidity) and high winds ({wind_speed:.1f} km/h) favor rapid spread."
    elif risk == "MEDIUM":
        msg = f"Elevated fire weather warning. Warm and dry conditions ({temperature:.1f}°C, {humidity:.0f}% humidity). Maintain perimeter vigilance."
    else:
        msg = f"Low fire hazard. Humidity ({humidity:.0f}%) and ambient conditions are sufficient to prevent ignition."

    return {
        "score": round(score, 2),
        "risk": risk,
        "affected_area": round(score * 0.15, 2),
        "message": msg,
    }


def predict_pollution(data):
    pm25 = getattr(data, "pm25", 30) or 0
    pm10 = getattr(data, "pm10", 50) or 0
    co = getattr(data, "co", 1.0) or 0
    no2 = getattr(data, "no2", 20.0) or 0

    score = pm25 * 0.7 + pm10 * 0.2 + co * 3 + no2 * 0.3
    score = limit(score)
    risk = risk_level(score)

    if risk == "HIGH":
        msg = f"Hazardous air quality alert! PM2.5 ({pm25:.1f} µg/m³) and PM10 ({pm10:.1f} µg/m³) exceed critical health limits. Stay indoors and use N95 respirators."
    elif risk == "MEDIUM":
        msg = f"Moderate air pollution advisory. PM2.5 at {pm25:.1f} µg/m³. Sensitive populations should limit prolonged outdoor exertion."
    else:
        msg = f"Good air quality. Particulate levels (PM2.5: {pm25:.1f} µg/m³, PM10: {pm10:.1f} µg/m³) are well within clean air standards."

    return {
        "score": round(score, 2),
        "risk": risk,
        "affected_area": round(score * 0.10, 2),
        "message": msg,
    }


def predict_weather(data):
    rainfall = getattr(data, "rainfall", 0) or 0
    wind_speed = getattr(data, "wind_speed", 10) or 0
    pressure = getattr(data, "pressure", 1013) or 1013

    score = rainfall * 0.5 + wind_speed * 1.5 + abs(pressure - 1013) * 0.8
    score = limit(score)
    risk = risk_level(score)

    if risk == "HIGH":
        msg = f"Severe storm warning! Intense winds ({wind_speed:.1f} km/h), heavy rain ({rainfall:.0f}mm), and pressure anomaly ({pressure:.0f} hPa). Seek shelter immediately."
    elif risk == "MEDIUM":
        msg = f"Adverse weather watch. Gusty winds ({wind_speed:.1f} km/h) and precipitation ({rainfall:.0f}mm) may cause localized disruptions."
    else:
        msg = f"Favorable meteorological conditions. Atmospheric pressure ({pressure:.0f} hPa) and wind speeds ({wind_speed:.1f} km/h) are stable."

    return {
        "score": round(score, 2),
        "risk": risk,
        "affected_area": round(score * 0.20, 2),
        "message": msg,
    }


def predict_landslide(data):
    rainfall = getattr(data, "rainfall", 0) or 0
    slope = getattr(data, "slope", 10) or 0
    soil_moisture = getattr(data, "soil_moisture", 30) or 0

    score = rainfall * 0.35 + slope * 1.2 + soil_moisture * 0.4
    score = limit(score)
    risk = risk_level(score)

    if risk == "HIGH":
        msg = f"Critical landslide danger! Saturated soil ({soil_moisture:.0f}%) on steep terrain ({slope:.0f}°) under heavy rainfall ({rainfall:.0f}mm). Immediate slope evacuation advised."
    elif risk == "MEDIUM":
        msg = f"Moderate slope instability watch. Terrain slope of {slope:.0f}° with elevated soil moisture ({soil_moisture:.0f}%). Avoid prone embankments."
    else:
        msg = f"Stable terrain conditions. Soil moisture ({soil_moisture:.0f}%) and slope gradient ({slope:.0f}°) show no active shear risk."

    return {
        "score": round(score, 2),
        "risk": risk,
        "affected_area": round(score * 0.08, 2),
        "message": msg,
    }


def predict_gas_leak(data):
    gas_conc = getattr(data, "gas_concentration", 0) or 0
    wind_speed = getattr(data, "wind_speed", 10) or 0

    score = gas_conc * 2
    if wind_speed > 20:
        score += 10
    score = limit(score)
    risk = risk_level(score)

    if risk == "HIGH":
        msg = f"Toxic gas emergency alert! Dangerous concentration ({gas_conc:.1f}) with rapid wind dispersion ({wind_speed:.1f} km/h). Evacuate upwind immediately!"
    elif risk == "MEDIUM":
        msg = f"Elevated gas concentration detected ({gas_conc:.1f}). Ventilate enclosures and inspect leak isolation points."
    else:
        msg = f"Safe atmosphere. Gas concentration ({gas_conc:.1f}) is within normal non-hazardous baseline levels."

    return {
        "score": round(score, 2),
        "risk": risk,
        "affected_area": round(score * 0.05, 2),
        "message": msg,
    }


PREDICTORS = {
    "flood":           predict_flood,
    "forest_fire":     predict_fire,
    "air_pollution":   predict_pollution,
    "extreme_weather": predict_weather,
    "landslide":       predict_landslide,
    "gas_leak":        predict_gas_leak,
}


def generate_response(risk):
    if risk == "HIGH":
        return {"alert": True, "action": "IMMEDIATE RESPONSE REQUIRED", "evacuation": True}
    if risk == "MEDIUM":
        return {"alert": True, "action": "MONITOR SITUATION", "evacuation": False}
    return {"alert": False, "action": "NORMAL MONITORING", "evacuation": False}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"system": "PRAVAAH-AI", "status": "online"}


@app.post("/predict")
def predict(data: HazardInput):
    """Original endpoint using verbose field names."""
    predictor = PREDICTORS.get(data.hazard.lower())
    if predictor is None:
        return {"error": f"Unknown hazard: {data.hazard}"}
    result = predictor(data)
    return {
        "hazard": data.hazard,
        "prediction": result,
        "response": generate_response(result["risk"]),
    }


@app.post("/api/analyze")
def analyze(data: AnalyzeInput):
    """
    Frontend-facing endpoint.
    Accepts field names from the HTML form (wind, water, gas, soil, pressure, co, no2),
    maps them to internal names, and returns an enriched alert response.
    """
    hazard_key = HAZARD_ALIAS.get(data.hazard.lower())
    if hazard_key is None:
        return {"error": f"Unknown hazard type: '{data.hazard}'"}

    class _Sensor:
        pass

    d = _Sensor()
    d.temperature       = data.temperature if data.temperature is not None else 30.0
    d.humidity          = data.humidity if data.humidity is not None else 60.0
    d.rainfall          = data.rainfall if data.rainfall is not None else 0.0
    d.wind_speed        = data.wind if data.wind is not None else 10.0
    d.water_level       = data.water if data.water is not None else 1.0
    d.pm25              = data.pm25 if data.pm25 is not None else 30.0
    d.pm10              = data.pm10 if data.pm10 is not None else 50.0
    d.co                = data.co if data.co is not None else 1.0
    d.no2               = data.no2 if data.no2 is not None else 20.0
    d.pressure          = data.pressure if data.pressure is not None else 1013.0
    d.gas_concentration = data.gas if data.gas is not None else 0.0
    d.slope             = data.slope if data.slope is not None else 10.0
    d.soil_moisture     = data.soil if data.soil is not None else 30.0

    result = PREDICTORS[hazard_key](d)
    risk   = result["risk"]

    alert_level = "CRITICAL" if risk == "HIGH" else ("WARNING" if risk == "MEDIUM" else "ADVISORY")
    headline = f"{alert_level} ALERT: {HAZARD_NAMES.get(hazard_key, hazard_key)} Risk is {risk}"

    return {
        "hazard":        hazard_key,
        "hazard_name":   HAZARD_NAMES.get(hazard_key, hazard_key),
        "risk":          risk,
        "score":         result["score"],
        "area":          result["affected_area"],
        "message":       result["message"],
        "alert_level":   alert_level,
        "headline":      headline,
        "evacuation":    risk == "HIGH",
        "actions":       ACTIONS.get(hazard_key, {}).get(risk, []),
    }


@app.post("/api/location")
def receive_location(location: LocationInput):  # noqa: F811
    """
    Receives live GPS coordinates streamed from the frontend's
    navigator.geolocation.watchPosition() via sendGPS().
    """
    print(
        f"[GPS] Lat: {location.latitude:.6f} | "
        f"Lon: {location.longitude:.6f} | "
        f"Accuracy: {location.accuracy}m"
    )
    return {
        "status":    "received",
        "latitude":  location.latitude,
        "longitude": location.longitude,
    }


# ---------------------------------------------------------------------------
# Serve the frontend
# Must be mounted LAST so all API routes take priority over static file lookup.
# Visiting http://localhost:8000 will serve frontend/index.html
# ---------------------------------------------------------------------------


@app.get("/api/channels")
def get_channels():
    """Serves ThingSpeak channel config + alert thresholds from channels.json."""
    cfg_path = os.path.join(os.path.dirname(__file__), "channels.json")
    try:
        with open(cfg_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"error": "channels.json not found", "channels": {}}


app.mount(
    "/",
    StaticFiles(directory="../frontend", html=True),
    name="frontend",
)
