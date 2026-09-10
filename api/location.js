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

  const { latitude, longitude, accuracy } = req.body || {};
  return res.status(200).json({
    status: "received",
    latitude: latitude || 0,
    longitude: longitude || 0,
    accuracy: accuracy || null,
    timestamp: new Date().toISOString()
  });
};
