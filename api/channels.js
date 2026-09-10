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
        water_level_flood: {
          channelId: 3489676,
          readKey: "",
          name: "Water Level & Flood Monitoring",
          fields: {
            field1: { label: "Humidity", unit: "%", min: 0, max: 100, warning: 85, critical: 95, thresholdDir: "above", calibrated: true },
            field2: { label: "Temperature", unit: "°C", min: -10, max: 60, warning: 38, critical: 45, thresholdDir: "above", calibrated: true },
            field4: { label: "Water Level", unit: "m", min: 0, max: 10, warning: 2.0, critical: 3.5, thresholdDir: "above", calibrated: true }
          }
        },
        forest_fire: {
          channelId: 0,
          readKey: "",
          name: "Forest Fire & Weather Station",
          fields: {
            field1: { label: "Temperature", unit: "°C", min: -10, max: 60, warning: 38, critical: 45, thresholdDir: "above" },
            field2: { label: "Humidity", unit: "%", min: 0, max: 100, warning: 25, critical: 15, thresholdDir: "below" },
            field3: { label: "Wind Speed", unit: "km/h", min: 0, max: 150, warning: 30, critical: 50, thresholdDir: "above" }
          }
        },
        air_pollution: {
          channelId: 0,
          readKey: "",
          name: "Air Quality Monitoring",
          fields: {
            field1: { label: "PM2.5", unit: "µg/m³", min: 0, max: 500, warning: 35, critical: 75, thresholdDir: "above" },
            field2: { label: "PM10", unit: "µg/m³", min: 0, max: 1000, warning: 75, critical: 150, thresholdDir: "above" }
          }
        }
      }
    };
    return res.status(200).json(fallbackConfig);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read channel configuration', details: err.message });
  }
};
