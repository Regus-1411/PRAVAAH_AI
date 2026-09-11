const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const configPath = path.join(process.cwd(), 'backend', 'channels.json');
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      return res.status(200).json(JSON.parse(data));
    }

    // Fallback embedded config
    const fallbackConfig = {
      pollIntervalSeconds: 15,
      alerting: { deduplicationMinutes: 5, maxAlertHistory: 50 },
      channels: {
        flood: {
          channelId: 3489676,
          apiKey: "EGH2VVJOOL78IB6L",
          name: "Water Level & Flood Monitoring",
          hazard: "flood",
          pollIntervalSeconds: 15,
          fields: {
            field1: { label: "Humidity", inputId: "humidity", unit: "%", min: 0, max: 100, warning: 85, critical: 95, thresholdDir: "above" },
            field2: { label: "Temperature", inputId: "temperature", unit: "°C", min: -10, max: 60, warning: 38, critical: 45, thresholdDir: "above" },
            field3: { label: "Rainfall", inputId: "rainfall", unit: "mm", min: 0, max: 500, warning: 50, critical: 100, thresholdDir: "above" },
            field4: { label: "Water Level", inputId: "water", unit: "m", min: 0, max: 10, warning: 2.0, critical: 3.5, thresholdDir: "above" },
            field5: { label: "Flood Risk", inputId: "flood_risk", unit: "%", min: 0, max: 100, warning: 50, critical: 75, thresholdDir: "above" }
          }
        },
        fire: {
          channelId: 3489733,
          apiKey: "D8B576260M8YV521",
          name: "Forest Fire Monitoring",
          hazard: "fire",
          pollIntervalSeconds: 15,
          fields: {
            field1: { label: "Temperature", inputId: "temperature", unit: "°C", min: -10, max: 60, warning: 40, critical: 50, thresholdDir: "above" },
            field2: { label: "Gas", inputId: "gas", unit: "ppm", min: 0, max: 1000, warning: 300, critical: 600, thresholdDir: "above" },
            field3: { label: "Smoke", inputId: "smoke", unit: "ppm", min: 0, max: 500, warning: 50, critical: 100, thresholdDir: "above" },
            field4: { label: "Humidity", inputId: "humidity", unit: "%", min: 0, max: 100, warning: 25, critical: 15, thresholdDir: "below" },
            field5: { label: "Flame Detection", inputId: "flame", unit: "", min: 0, max: 1, warning: 1, critical: 1, thresholdDir: "above" }
          }
        },
        pollution: {
          channelId: 3489752,
          apiKey: "22HNY3TXBA09U4G6",
          name: "Air Pollution Monitoring",
          hazard: "pollution",
          pollIntervalSeconds: 15,
          fields: {
            field1: { label: "Temperature", inputId: "temperature", unit: "°C", min: -10, max: 60, warning: 38, critical: 45, thresholdDir: "above" },
            field2: { label: "CO", inputId: "co", unit: "ppm", min: 0, max: 100, warning: 9, critical: 35, thresholdDir: "above" },
            field3: { label: "Humidity", inputId: "humidity", unit: "%", min: 0, max: 100, warning: 80, critical: 90, thresholdDir: "above" },
            field4: { label: "AQI", inputId: "aqi", unit: "Index", min: 0, max: 500, warning: 100, critical: 200, thresholdDir: "above" },
            field5: { label: "Risk Score", inputId: "pollution_risk", unit: "%", min: 0, max: 100, warning: 50, critical: 75, thresholdDir: "above" }
          }
        },
        air_pollution: {
          channelId: 3489752,
          apiKey: "22HNY3TXBA09U4G6",
          name: "Air Pollution Monitoring",
          hazard: "pollution",
          pollIntervalSeconds: 15,
          fields: {
            field1: { label: "Temperature", inputId: "temperature", unit: "°C", min: -10, max: 60, warning: 38, critical: 45, thresholdDir: "above" },
            field2: { label: "CO", inputId: "co", unit: "ppm", min: 0, max: 100, warning: 9, critical: 35, thresholdDir: "above" },
            field3: { label: "Humidity", inputId: "humidity", unit: "%", min: 0, max: 100, warning: 80, critical: 90, thresholdDir: "above" },
            field4: { label: "AQI", inputId: "aqi", unit: "Index", min: 0, max: 500, warning: 100, critical: 200, thresholdDir: "above" },
            field5: { label: "Risk Score", inputId: "pollution_risk", unit: "%", min: 0, max: 100, warning: 50, critical: 75, thresholdDir: "above" }
          }
        }
      }
    };
    return res.status(200).json(fallbackConfig);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read channel configuration', details: err.message });
  }
};
