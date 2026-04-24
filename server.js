const express = require("express");

const app = express();
const PORT = process.env.PORT || 10000;

// Root test
app.get("/", (req, res) => {
  res.send("API is running");
});

// Arrivals test route
const GtfsRealtimeBindings = require("gtfs-realtime-bindings");


const MTA_FEED = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs";
const API_KEY = process.env.MTA_API_KEY;

app.get("/arrivals", async (req, res) => {
  const stopId = req.query.stop || req.query.stop_id;

  if (!stopId) {
    return res.json({ error: "Missing stop parameter" });
  }

  try {
    const response = await fetch(MTA_FEED, {
      headers: {
        "x-api-key": API_KEY,
      },
    });

    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buffer)
    );

    const arrivals = [];

    feed.entity.forEach((entity) => {
      if (entity.tripUpdate) {
        entity.tripUpdate.stopTimeUpdate.forEach((update) => {
          if (update.stopId === stopId && update.arrival) {
            arrivals.push({
              route: entity.tripUpdate.trip.routeId,
              time: update.arrival.time.low * 1000,
            });
          }
        });
      }
    });

    arrivals.sort((a, b) => a.time - b.time);

    const now = Date.now();

    const formatted = arrivals.slice(0, 5).map((a) => ({
      route: a.route,
      minutes: Math.round((a.time - now) / 60000),
    }));

    res.json({
      stop: stopId,
      arrivals: formatted,
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
  console.log("QUERY:", req.query);

  const stopId = req.query.stop || req.query.stop_id;

  if (!stopId) {
    return res.json({ error: "Missing stop parameter" });
  }

  res.json({
    message: "Success",
    received_stop: stopId
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
