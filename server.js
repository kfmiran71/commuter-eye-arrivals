const express = require("express");
const GtfsRealtimeBindings = require("gtfs-realtime-bindings");
const fs = require("fs");

const stopsData = fs.readFileSync("stops.txt", "utf8");
const STATION_NAMES = {};

stopsData.split("\n").slice(1).forEach(line => {
  const cols = line.split(",");
  const stopId = cols[0];
  const stopName = cols[2];

  if (stopId && stopName) {
    STATION_NAMES[stopId] = stopName;
  }
});

const app = express();
const PORT = process.env.PORT || 8080;

const FEEDS = [
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g"
];

function getMinutesUntil(timestamp) {
  const now = Date.now();
  const arrival = timestamp * 1000;
  return Math.round((arrival - now) / 60000);
}

async function fetchFeeds() {
  const feeds = [];

  for (const url of FEEDS) {
    try {
      const response = await fetch(url);
      const buffer = Buffer.from(await response.arrayBuffer());
      const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
      feeds.push(feed);
    } catch {
      console.log("⚠️ Skipping bad feed:", url);
    }
  }

  return feeds;
}

function extractArrivals(feed, stopId) {
  const arrivals = [];

  for (const entity of feed.entity) {
    if (!entity.tripUpdate) continue;

    const route = entity.tripUpdate.trip.routeId;

    for (const stopTime of entity.tripUpdate.stopTimeUpdate || []) {
      if (stopTime.stopId === stopId) {
        const time =
          stopTime.arrival?.time || stopTime.departure?.time;

        if (!time) continue;

        const minutes = getMinutesUntil(time);

        if (minutes >= 0) {
          arrivals.push({ route, time: minutes });
        }
      }
    }
  }

  return arrivals;
}

app.get("/arrivals", async (req, res) => {
  try {
    const stopId = req.query.stop;

    if (!stopId) {
      return res.status(400).json({ error: "Missing stop parameter" });
    }

    const baseStop = stopId.slice(0, -1);
    const directionCode = stopId.slice(-1);
    const direction = directionCode === "N" ? "Uptown" : "Downtown";

    const feeds = await fetchFeeds();

    let arrivals = [];

    for (const feed of feeds) {
      arrivals = arrivals.concat(extractArrivals(feed, stopId));
    }

    const grouped = {};

    for (const a of arrivals) {
      if (!grouped[a.route]) {
        grouped[a.route] = [];
      }
      grouped[a.route].push(a.time);
    }

    for (const route in grouped) {
      const times = grouped[route].sort((a, b) => a - b);

      const under30 = times.filter(t => t <= 30);
      const over30 = times.filter(t => t > 30);

      let final = [];

      if (under30.length >= 3) {
        final = under30.slice(0, 3);
      } else if (under30.length >= 1) {
        final = [...under30, ...over30.slice(0, 1)];
      } else {
        final = over30.slice(0, 2);
      }

      grouped[route] = final;
    }

    const stationName = STATION_NAMES[baseStop] || baseStop;

    const trains = Object.entries(grouped).map(([route, times]) => ({
      route,
      times
    }));

    res.json({
      station: stationName,
      direction,
      trains
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
