from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
    Field names match the HTML input IDs (wind, water, gas, soil)
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
# Hazard scoring functions
# ---------------------------------------------------------------------------

def predict_flood(data):
    score = data.rainfall * 0.45 + data.water_level * 15 + data.humidity * 0.10
    score = limit(score)
    return {
        "score": round(score, 2),
        "risk": risk_level(score),
        "affected_area": round(score * 0.25, 2),
        "message": "High flood risk. Consider evacuation from low-lying areas.",
    }


def predict_fire(data):
    dryness = 100 - data.humidity
    score = dryness * 0.45 + data.temperature * 1.0 + data.wind_speed * 1.5
    score = limit(score)
    return {
        "score": round(score, 2),
        "risk": risk_level(score),
        "affected_area": round(score * 0.15, 2),
        "message": "Forest fire risk detected. Monitor fire-prone areas.",
    }


def predict_pollution(data):
    score = data.pm25 * 0.7 + data.pm10 * 0.2 + data.co * 3 + data.no2 * 0.3
    score = limit(score)
    return {
        "score": round(score, 2),
        "risk": risk_level(score),
        "affected_area": round(score * 0.10, 2),
        "message": "Poor air quality detected. Sensitive people should reduce outdoor activity.",
    }


def predict_weather(data):
    score = data.rainfall * 0.5 + data.wind_speed * 1.5 + abs(data.pressure - 1013) * 0.8
    score = limit(score)
    return {
        "score": round(score, 2),
        "risk": risk_level(score),
        "affected_area": round(score * 0.20, 2),
        "message": "Extreme weather conditions may develop. Monitor local warnings.",
    }


def predict_landslide(data):
    score = data.rainfall * 0.35 + data.slope * 1.2 + data.soil_moisture * 0.4
    score = limit(score)
    return {
        "score": round(score, 2),
        "risk": risk_level(score),
        "affected_area": round(score * 0.08, 2),
        "message": "Landslide risk detected. Avoid steep and unstable terrain.",
    }


def predict_gas_leak(data):
    score = data.gas_concentration * 2
    if data.wind_speed > 20:
        score += 10
    score = limit(score)
    return {
        "score": round(score, 2),
        "risk": risk_level(score),
        "affected_area": round(score * 0.05, 2),
        "message": "Possible industrial gas hazard. Move away from the affected area.",
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

@app.get("/")
def home():
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
    Accepts the short field names from the HTML form (wind, water, gas, soil),
    maps them to internal names, and returns a flat response that the JS can
    render directly without digging into nested objects.
    """
    hazard_key = HAZARD_ALIAS.get(data.hazard.lower())
    if hazard_key is None:
        return {"error": f"Unknown hazard type: '{data.hazard}'"}

    # Build a lightweight adapter object so the existing predictor functions
    # work without modification (they read attribute names like data.wind_speed).
    class _Sensor:
        pass

    d = _Sensor()
    d.temperature      = data.temperature
    d.humidity         = data.humidity
    d.rainfall         = data.rainfall
    d.wind_speed       = data.wind          # frontend 'wind'  → backend 'wind_speed'
    d.water_level      = data.water         # frontend 'water' → backend 'water_level'
    d.pm25             = data.pm25
    d.pm10             = data.pm10
    d.co               = 1.0                # not yet exposed in frontend form
    d.no2              = 20.0               # not yet exposed in frontend form
    d.pressure         = 1013.0             # not yet exposed in frontend form
    d.gas_concentration = data.gas          # frontend 'gas'   → backend 'gas_concentration'
    d.slope            = data.slope
    d.soil_moisture    = data.soil          # frontend 'soil'  → backend 'soil_moisture'

    result = PREDICTORS[hazard_key](d)
    risk   = result["risk"]

    return {
        "hazard":      hazard_key,
        "hazard_name": HAZARD_NAMES.get(hazard_key, hazard_key),
        "risk":        risk,
        "score":       result["score"],
        "area":        result["affected_area"],
        "message":     result["message"],
        "actions":     ACTIONS.get(hazard_key, {}).get(risk, []),
    }


@app.post("/api/location")
def receive_location(location: LocationInput):
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
