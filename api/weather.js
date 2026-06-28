export default async function handler(req, res) {
  const { zip } = req.query;
  if (!zip || !/^\d{5}$/.test(zip)) {
    return res.status(400).json({ error: "Invalid zip code" });
  }

  try {
    // Geocode zip to lat/lon using Census API (free, no key)
    const geoRes = await fetch(
      `https://geocoding.geo.census.gov/geocoder/locations/address?benchmark=Public_AR_Current&format=json&zip=${zip}`
    );
    const geoData = await geoRes.json();
    const coords = geoData?.result?.addressMatches?.[0]?.coordinates;

    if (!coords) return res.status(404).json({ error: "Zip not found" });

    const { x: lon, y: lat } = coords;

    // Get last 30 days of weather from Open-Meteo (free, no key)
    const end = new Date().toISOString().split("T")[0];
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const weatherRes = await fetch(
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}&daily=precipitation_sum,windspeed_10m_max&timezone=America%2FChicago`
    );
    const weatherData = await weatherRes.json();

    const daily = weatherData.daily;
    let stormDays = 0;
    let maxWindMph = 0;
    let maxRainIn = 0;

    for (let i = 0; i < daily.time.length; i++) {
      const rainMm = daily.precipitation_sum[i] || 0;
      const windKph = daily.windspeed_10m_max[i] || 0;
      const windMph = windKph * 0.621371;
      const rainIn = rainMm / 25.4;

      // Storm = over 0.75 inch rain OR over 35 mph wind
      if (rainIn > 0.75 || windMph > 35) stormDays++;
      maxWindMph = Math.max(maxWindMph, windMph);
      maxRainIn = Math.max(maxRainIn, rainIn);
    }

    return res.status(200).json({
      zip,
      stormDays,
      maxWindMph: Math.round(maxWindMph),
      maxRainInches: maxRainIn.toFixed(1),
      hasStormActivity: stormDays > 0,
    });
  } catch (err) {
    console.error("Weather API error:", err);
    return res.status(500).json({ error: "Could not fetch weather data" });
  }
}
