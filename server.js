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
function getBullet(route) {
  if (route === "1" || route === "2" || route === "3") return "🔴";
  if (route === "4" || route === "5" || route === "6") return "🟢";
  if (route === "A" || route === "C" || route === "E") return "🔵";
  return "⚪";
}

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

  
  const unique = [];
  const seen = new Set();

  for (const a of arrivals.sort((a, b) => a.time - b.time)) {
    const key = `${a.route}-${a.time}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(a);
    }
  }

  return unique;
}

app.get("/arrivals", async (req, res) => {
  try {
    const stopId = req.query.stop;
    const selectedRoute = req.query.route;
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

    
    const grouped = {};
   for (const a of arrivals) {

  
  if (selectedRoute && a.route !== selectedRoute) continue;

  if (!grouped[a.route]) {
    grouped[a.route] = [];
  }

  grouped[a.route].push(a.time);
}

    
for (const route in grouped) {
  const times = grouped[route].sort((a, b) => a - b);

  const sorted = times.sort((a, b) => a - b);
const final = sorted.slice(0, 3);
  

  grouped[route] = final;
}

    const stationName = STATION_NAMES[stopId] || stopId;


const routeId = req.query.route;

const times = (grouped[routeId] || [])
  .sort((a, b) => a - b)
  .slice(0, 3);

const cleaned = times.map(t => t === 0 ? "Now" : t + " min");

const result = {
  route: routeId,
  time1: cleaned[0] || null,
  time2: cleaned[1] || null,
  time3: cleaned[2] || null,
  times_text: cleaned.join(" • ")
};




res.json({
  platform_id: stopId,
  station: stationName,
  direction,
  trains: Object.entries(grouped).map(([route, times]) => {
    const cleaned = (times || [])
      .sort((a, b) => a - b)
      .slice(0, 3)
      .map(t => t === 0 ? "Now" : t + " min");

    return {
      route,
      times: cleaned
    };
  })
});
  } catch (err) {
  res.status(500).json({
    error: err.message
  });
}
});
app.get("/arrivals-flat", async (req, res) => {
  try {
    const stopId = req.query.stop;
    const selectedRoute = req.query.route;
    const directionCode = stopId.slice(-1);
    const direction = directionCode === "N" ? "Uptown" : "Downtown";

    if (!stopId) {
      return res.status(400).json({ error: "Missing stop parameter" });
    }

    const feeds = await fetchFeeds();

    let arrivals = [];

    for (const feed of feeds) {
      arrivals = arrivals.concat(extractArrivals(feed, stopId));
    }

    const grouped = {};

    for (const a of arrivals) {
      if (selectedRoute && a.route !== selectedRoute) continue;

      if (!grouped[a.route]) {
        grouped[a.route] = [];
      }

      grouped[a.route].push(a.time);
    }

    const stationName = STATION_NAMES[stopId] || stopId;

    const flat = Object.entries(grouped)
  .map(([route, times]) => {
    const sorted = (times || [])
      .sort((a, b) => a - b)
      .slice(0, 3);

    const cleaned = sorted.map(t => t === 0 ? "Now" : t + " min");

   return {
  platform_id: stopId,
  station: stationName,
  direction,
  route,
  times: cleaned.join(" · ")
};
  })
  .sort((a, b) => (a.first_arrival ?? 9999) - (b.first_arrival ?? 9999));

    res.json(flat);
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
