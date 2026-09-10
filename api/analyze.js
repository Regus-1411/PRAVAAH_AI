const HAZARD_ALIAS = {
  flood: "flood",
  fire: "forest_fire",
  forest_fire: "forest_fire",
  pollution: "air_pollution",
  air_pollution: "air_pollution",
  weather: "extreme_weather",
  extreme_weather: "extreme_weather",
  landslide: "landslide",
  gas: "gas_leak",
  gas_leak: "gas_leak",
};

const HAZARD_NAMES = {
  flood: "Flood",
  forest_fire: "Forest Fire",
  air_pollution: "Air Pollution",
  extreme_weather: "Extreme Weather",
  landslide: "Landslide",
  gas_leak: "Gas Leak",
};

const ACTIONS = {
  flood: {
    HIGH: [
      "Evacuate immediately to higher ground",
      "Contact local emergency services (112)",
      "Avoid floodwater — even 6 inches can knock you down",
      "Move valuables and documents to upper floors",
      "Turn off electricity at the main breaker",
    ],
    MEDIUM: [
      "Monitor water levels continuously",
      "Prepare an emergency kit (food, water, documents)",
      "Keep emergency contacts readily available",
      "Avoid low-lying roads and underpasses",
    ],
    LOW: [
      "Stay informed via local weather alerts",
      "Check drainage systems around your property",
      "Review your household emergency plan",
    ],
  },
  forest_fire: {
    HIGH: [
      "Evacuate the area immediately",
      "Call fire emergency services (101)",
      "Close all windows and doors to slow smoke infiltration",
      "Avoid areas downwind of the fire",
      "Do not attempt to fight the fire yourself",
    ],
    MEDIUM: [
      "Stay indoors and keep windows closed",
      "Monitor local fire and forestry alerts",
      "Prepare to evacuate at short notice",
      "Clear dry vegetation immediately around your property",
    ],
    LOW: [
      "Avoid open burning in the area",
      "Stay alert to local fire-risk warnings",
      "Keep an emergency bag ready",
    ],
  },
  air_pollution: {
    HIGH: [
      "Stay indoors with windows and doors shut",
      "Use N95 masks if outdoor exposure is unavoidable",
      "Cancel all outdoor exercise or strenuous activity",
      "Children, elderly, and those with asthma must remain inside",
      "Run air purifiers if available",
    ],
    MEDIUM: [
      "Limit time spent outdoors, especially for exercise",
      "Wear a mask when going outside",
      "Keep children indoors during peak hours",
      "Monitor the AQI via local authority updates",
    ],
    LOW: [
      "Air quality is acceptable — routine precautions apply",
      "Sensitive individuals may still feel mild effects",
    ],
  },
  extreme_weather: {
    HIGH: [
      "Seek shelter immediately inside a solid building",
      "Stay away from windows and exterior walls",
      "Avoid all outdoor and non-essential travel",
      "Call emergency services if in immediate danger (112)",
      "Do not drive through flooded or storm-damaged roads",
    ],
    MEDIUM: [
      "Secure all loose outdoor objects",
      "Monitor official weather bulletins",
      "Postpone non-essential travel and outdoor plans",
    ],
    LOW: [
      "Weather conditions are normal",
      "Stay updated on routine forecasts",
    ],
  },
  landslide: {
    HIGH: [
      "Evacuate the slope area immediately — do not delay",
      "Move to stable ground away from the slide path",
      "Listen for unusual sounds (trees cracking, boulders knocking)",
      "Alert neighbours and notify emergency services (112)",
      "Stay away from the slide area even after movement stops",
    ],
    MEDIUM: [
      "Inspect slope and retaining walls for new cracks",
      "Ensure surface drainage channels are clear",
      "Stay alert during and after heavy rainfall",
      "Prepare an emergency kit and plan an evacuation route",
    ],
    LOW: [
      "Exercise caution on steep terrain after heavy rainfall",
      "Check ground conditions before outdoor activities",
    ],
  },
  gas_leak: {
    HIGH: [
      "Evacuate the area immediately — do not use any electrical switches or lighters",
      "Call emergency services (112) from a safe distance away",
      "Do not re-enter until the area is officially cleared",
      "Move upwind of the gas source",
      "Keep all flames and sparks away from the hazard zone",
    ],
    MEDIUM: [
      "Ventilate the area by opening windows and doors",
      "Shut off the gas source if it is safe to do so",
      "Alert neighbours and notify local authorities",
      "Avoid all sparks or open flames in the vicinity",
    ],
    LOW: [
      "Investigate the source of any gas odour",
      "Ensure adequate ventilation in the area",
      "Contact your gas provider to inspect connections and equipment",
    ],
  },
};

function limit(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function riskLevel(score) {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

function predictFlood(d) {
  const rainfall = Number(d.rainfall) || 0;
  const water = Number(d.water != null ? d.water : d.water_level) || 0;
  const humidity = Number(d.humidity) || 60;

  const score = limit(rainfall * 0.45 + water * 15 + humidity * 0.1);
  const risk = riskLevel(score);

  let msg = "";
  if (risk === "HIGH") {
    msg = `Critical flood surge imminent (${water.toFixed(1)}m water level, ${rainfall.toFixed(0)}mm rainfall). Immediate evacuation from low-lying zones required.`;
  } else if (risk === "MEDIUM") {
    msg = `Moderate flood risk detected. Rising water level (${water.toFixed(1)}m) and persistent rainfall (${rainfall.toFixed(0)}mm). Continuous monitoring advised.`;
  } else {
    msg = `Normal hydrology. Water level (${water.toFixed(1)}m) and rainfall (${rainfall.toFixed(0)}mm) remain within safe baseline limits.`;
  }

  return {
    score: Math.round(score * 100) / 100,
    risk,
    affected_area: Math.round(score * 0.25 * 100) / 100,
    message: msg,
  };
}

function predictFire(d) {
  const temperature = Number(d.temperature) || 30;
  const humidity = Number(d.humidity) || 60;
  const wind = Number(d.wind != null ? d.wind : d.wind_speed) || 10;
  const rainfall = Number(d.rainfall) || 0;

  const dryness = Math.max(0, 100 - humidity);
  let rawScore = dryness * 0.45 + temperature * 1.0 + wind * 1.5;
  if (rainfall > 0) {
    rawScore -= Math.min(rawScore, rainfall * 1.5);
  }
  const score = limit(rawScore);
  const risk = riskLevel(score);

  let msg = "";
  if (risk === "HIGH") {
    msg = `Severe wildfire danger! Extreme dry heat (${temperature.toFixed(1)}°C, ${humidity.toFixed(0)}% humidity) and high winds (${wind.toFixed(1)} km/h) favor rapid spread.`;
  } else if (risk === "MEDIUM") {
    msg = `Elevated fire weather warning. Warm and dry conditions (${temperature.toFixed(1)}°C, ${humidity.toFixed(0)}% humidity). Maintain perimeter vigilance.`;
  } else {
    msg = `Low fire hazard. Humidity (${humidity.toFixed(0)}%) and ambient conditions are sufficient to prevent ignition.`;
  }

  return {
    score: Math.round(score * 100) / 100,
    risk,
    affected_area: Math.round(score * 0.15 * 100) / 100,
    message: msg,
  };
}

function predictPollution(d) {
  const pm25 = Number(d.pm25) || 30;
  const pm10 = Number(d.pm10) || 50;
  const co = Number(d.co) || 1.0;
  const no2 = Number(d.no2) || 20.0;

  const score = limit(pm25 * 0.7 + pm10 * 0.2 + co * 3 + no2 * 0.3);
  const risk = riskLevel(score);

  let msg = "";
  if (risk === "HIGH") {
    msg = `Hazardous air quality alert! PM2.5 (${pm25.toFixed(1)} µg/m³) and PM10 (${pm10.toFixed(1)} µg/m³) exceed critical health limits. Stay indoors and use N95 respirators.`;
  } else if (risk === "MEDIUM") {
    msg = `Moderate air pollution advisory. PM2.5 at ${pm25.toFixed(1)} µg/m³. Sensitive populations should limit prolonged outdoor exertion.`;
  } else {
    msg = `Good air quality. Particulate levels (PM2.5: ${pm25.toFixed(1)} µg/m³, PM10: ${pm10.toFixed(1)} µg/m³) are well within clean air standards.`;
  }

  return {
    score: Math.round(score * 100) / 100,
    risk,
    affected_area: Math.round(score * 0.1 * 100) / 100,
    message: msg,
  };
}

function predictWeather(d) {
  const rainfall = Number(d.rainfall) || 0;
  const wind = Number(d.wind != null ? d.wind : d.wind_speed) || 10;
  const pressure = Number(d.pressure) || 1013;

  const score = limit(rainfall * 0.5 + wind * 1.5 + Math.abs(pressure - 1013) * 0.8);
  const risk = riskLevel(score);

  let msg = "";
  if (risk === "HIGH") {
    msg = `Severe storm warning! Intense winds (${wind.toFixed(1)} km/h), heavy rain (${rainfall.toFixed(0)}mm), and pressure anomaly (${pressure.toFixed(0)} hPa). Seek shelter immediately.`;
  } else if (risk === "MEDIUM") {
    msg = `Adverse weather watch. Gusty winds (${wind.toFixed(1)} km/h) and precipitation (${rainfall.toFixed(0)}mm) may cause localized disruptions.`;
  } else {
    msg = `Favorable meteorological conditions. Atmospheric pressure (${pressure.toFixed(0)} hPa) and wind speeds (${wind.toFixed(1)} km/h) are stable.`;
  }

  return {
    score: Math.round(score * 100) / 100,
    risk,
    affected_area: Math.round(score * 0.2 * 100) / 100,
    message: msg,
  };
}

function predictLandslide(d) {
  const rainfall = Number(d.rainfall) || 0;
  const slope = Number(d.slope) || 10;
  const soil = Number(d.soil != null ? d.soil : d.soil_moisture) || 30;

  const score = limit(rainfall * 0.35 + slope * 1.2 + soil * 0.4);
  const risk = riskLevel(score);

  let msg = "";
  if (risk === "HIGH") {
    msg = `Critical landslide danger! Saturated soil (${soil.toFixed(0)}%) on steep terrain (${slope.toFixed(0)}°) under heavy rainfall (${rainfall.toFixed(0)}mm). Immediate slope evacuation advised.`;
  } else if (risk === "MEDIUM") {
    msg = `Moderate slope instability watch. Terrain slope of ${slope.toFixed(0)}° with elevated soil moisture (${soil.toFixed(0)}%). Avoid prone embankments.`;
  } else {
    msg = `Stable terrain conditions. Soil moisture (${soil.toFixed(0)}%) and slope gradient (${slope.toFixed(0)}°) show no active shear risk.`;
  }

  return {
    score: Math.round(score * 100) / 100,
    risk,
    affected_area: Math.round(score * 0.08 * 100) / 100,
    message: msg,
  };
}

function predictGasLeak(d) {
  const gas = Number(d.gas != null ? d.gas : d.gas_concentration) || 0;
  const wind = Number(d.wind != null ? d.wind : d.wind_speed) || 10;

  let score = gas * 2;
  if (wind > 20) score += 10;
  score = limit(score);
  const risk = riskLevel(score);

  let msg = "";
  if (risk === "HIGH") {
    msg = `Toxic gas emergency alert! Dangerous concentration (${gas.toFixed(1)}) with rapid wind dispersion (${wind.toFixed(1)} km/h). Evacuate upwind immediately!`;
  } else if (risk === "MEDIUM") {
    msg = `Elevated gas concentration detected (${gas.toFixed(1)}). Ventilate enclosures and inspect leak isolation points.`;
  } else {
    msg = `Safe atmosphere. Gas concentration (${gas.toFixed(1)}) is within normal non-hazardous baseline levels.`;
  }

  return {
    score: Math.round(score * 100) / 100,
    risk,
    affected_area: Math.round(score * 0.05 * 100) / 100,
    message: msg,
  };
}

const PREDICTORS = {
  flood: predictFlood,
  forest_fire: predictFire,
  air_pollution: predictPollution,
  extreme_weather: predictWeather,
  landslide: predictLandslide,
  gas_leak: predictGasLeak,
};

module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = req.body || {};
    const hazardParam = (data.hazard || "").toLowerCase().trim();
    const canonicalHazard = HAZARD_ALIAS[hazardParam];

    if (!canonicalHazard) {
      return res.status(400).json({ error: `Unknown hazard type: '${data.hazard}'` });
    }

    const predictor = PREDICTORS[canonicalHazard];
    const pred = predictor(data);
    const actions = (ACTIONS[canonicalHazard] && ACTIONS[canonicalHazard][pred.risk]) || [];

    const alertLevel = pred.risk === "HIGH" ? "CRITICAL" : pred.risk === "MEDIUM" ? "WARNING" : "ADVISORY";
    const displayName = HAZARD_NAMES[canonicalHazard] || canonicalHazard;
    const headline =
      pred.risk === "HIGH"
        ? `EMERGENCY ALERT: ${displayName} Risk is HIGH`
        : pred.risk === "MEDIUM"
        ? `WARNING ADVISORY: Elevated ${displayName} Risk`
        : `ADVISORY ALERT: ${displayName} Risk is LOW`;

    return res.status(200).json({
      hazard: canonicalHazard,
      hazard_name: displayName,
      risk: pred.risk,
      alert_level: alertLevel,
      headline,
      score: pred.score,
      area: pred.affected_area,
      message: pred.message,
      evacuation: pred.risk === "HIGH",
      actions,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: "Analysis execution failed", details: err.message });
  }
};
