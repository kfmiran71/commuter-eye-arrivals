const express = require("express");
const GtfsRealtimeBindings = require("gtfs-realtime-bindings");
const fs = require("fs");
const stopsData = fs.readFileSync("stops.txt", "utf8");
const STATION_NAMES = {};

stopsData.split("\n").slice(1).forEach(line => {
  const cols = line.split(",");
  const stopId = cols[0];
  const stopName = cols[1];

  if (stopId && stopName) {
    STATION_NAMES[stopId] = stopName;
  }
});
const app = express();
const PORT = 8080;

// MTA ACE feed (A/C/E trains)
const FEEDS = [
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l",
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g",
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
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*"
      }
    });

    const buffer = Buffer.from(await response.arrayBuffer());

    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);

    feeds.push(feed);

  } catch (err) {
    console.log("⚠️ Skipping bad feed:", url);
  }
}

  return feeds;
}
function extractArrivals(feed, stopId, direction) {
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

        if (minutes > 0) {
          arrivals.push({ route, time: minutes });         
        }
      }
    }
  }

  // remove duplicates + sort
  const unique = [];
  const seen = new Set();

  for (const a of arrivals.sort((a, b) => a.time - b.time)) {
    const key = `${a.route}-${a.time}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(a);
    }
  }

  return unique.slice(0, 8);
}

app.get("/arrivals", async (req, res) => {
  try {
    const stopId = req.query.stop;
const baseStop = stopId.slice(0, -1);
const directionCode = stopId.slice(-1);
const direction = directionCode === "N" ? "Uptown" : "Downtown";
const baseStation = stopId.slice(0, -1);

    if (!stopId) {
      return res.status(400).json({ error: "Missing stop parameter" });
    }

    const feeds = await fetchFeeds();

    let arrivals = [];

    for (const feed of feeds) {
      arrivals = arrivals.concat(extractArrivals(feed, stopId));
    }

    // GROUP BY ROUTE
    const grouped = {};
    for (const a of arrivals) {
      if (!grouped[a.route]) {
        grouped[a.route] = [];
      }
      grouped[a.route].push(a.time);
    }

    // SMART FILTERING (IMPROVED)
for (const route in grouped) {
  const times = grouped[route].sort((a, b) => a - b);

  const under30 = times.filter(t => t <= 30);
  const over30 = times.filter(t => t > 30);

  let final = [];

if (under30.length >= 3) {
  final = under30.slice(0, 3);

} else if (under30.length === 2) {
  final = [...under30, ...over30.slice(0, 1)];

} else if (under30.length === 1) {
  final = [...under30, ...over30.slice(0, 1)];

} else {
  final = over30.slice(0, 2);
}
  

  grouped[route] = final;
}

    const stationName = STATION_NAMES[stopId] || stopId;

// convert grouped object → display array
const formatted = Object.entries(grouped)
  .map(([route, times]) => ({
    route,
    rawTimes: times,
    times: times.map(t => t === 0 ? "Now" : t + " min")
  }))
  .sort((a, b) => a.rawTimes[0] - b.rawTimes[0])
  .map(({ route, times }) => ({
    route,
    times
  }));

res.json({
  station: stationName,
  direction,
  trains: formatted.map(({ route, times }) => ({
    route,
    times
  }))
});
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
