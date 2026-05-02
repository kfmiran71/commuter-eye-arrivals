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

async function fetchFeeds() {
  const feeds = [];

  const responses = await Promise.allSettled(
  FEEDS.map(url =>
    fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*"
      }
    })
  )
);

for (const res of responses) {
  if (res.status !== "fulfilled") continue;

  try {
    const buffer = Buffer.from(await res.value.arrayBuffer());
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
    feeds.push(feed);
  } catch (err) {
    console.log("⚠️ Skipping bad feed");
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

       const arrivalTime = new Date(time * 1000);

if (arrivalTime > new Date()) {
  arrivals.push({
    route,
    arrival_time: arrivalTime.toISOString()
  });
}
      }
    }
  }

  
  const unique = [];
  const seen = new Set();

  for (const a of arrivals.sort((a, b) =>
  new Date(a.arrival_time) - new Date(b.arrival_time)
)) {
    const key = `${a.route}-${a.arrival_time}`;
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
arrivals.sort((a, b) =>
  new Date(a.arrival_time) - new Date(b.arrival_time)
);

const stationName = STATION_NAMES[stopId] || stopId;

const final = arrivals.map(a => ({
  platform_id: stopId,
  station: stationName,
  direction,
  route: a.route,
  arrival_time: a.arrival_time
}));

return res.json(final);
    
 
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
     
      if (!grouped[a.route]) {
        grouped[a.route] = [];
      }

      grouped[a.route].push(a.time);
    }

    const stationName = STATION_NAMES[stopId] || stopId;

    const flat = Object.entries(grouped)
  .flatMap(([route, times]) => {
    const sorted = (times || [])
      .sort((a, b) => a - b)
      .slice(0, 3);

    const cleaned = sorted.map(t => t === 0 ? "Now" : t + " min");
const first_arrival = sorted[0] ?? 9999;
   return cleaned.map(time => ({
  platform_id: stopId,
  station: stationName,
  direction,
  route,
  first_arrival,
  time
}));
  })
  .sort((a, b) => (a.first_arrival ?? 9999) - (b.first_arrival ?? 9999));

    res.json(flat);
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});
app.get("/push-arrivals", async (req, res) => {
  try {
    const stopId = req.query.stop;
if (!stopId) {
  return res.status(400).json({ error: "Missing stopId" });
}
const baseUrl = `${req.protocol}://${req.get("host")}`;

const response = await fetch(
  `${baseUrl}/arrivals?stop=${stopId}`
);
if (!response.ok) {
  const text = await response.text();
  console.log("ARRIVALS ERROR:", text);
  return res.status(500).json({ error: "Arrivals fetch failed" });
}
const arrivals = await response.json();
console.log("ARRIVALS DATA:", arrivals);
    const GLIDE_API_URL = `https://api.glideapp.io/api/function/mutateTables?apiKey=${process.env.GLIDE_API_KEY}`;
    const GLIDE_API_KEY = process.env.GLIDE_API_KEY;

    const glideRes = await fetch(GLIDE_API_URL, {
  method: "POST",
  headers: {
  "Content-Type": "application/json"
},
  body: JSON.stringify({
    appID: process.env.GLIDE_APP_ID,
    mutations: [
      {
  kind: "add-row",
  tableName: "Arrivals",
  columnValues: {
  "Name": "TEST123"
}
}
    ]
  })
});
const glideText = await glideRes.text();

console.log("GLIDE STATUS:", glideRes.status);
console.log("GLIDE RESPONSE:", glideText);

return res.json({
  success: glideRes.ok,
  glide_status: glideRes.status,
  glide_response: glideText
});

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/glide-test", async (req, res) => {
  try {
    const response = await fetch(
      `https://api.glideapp.io/api/function/mutateTables?apiKey=${process.env.GLIDE_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          appID: process.env.GLIDE_APP_ID,
          mutations: [
            {
              kind: "add-row",
              tableName: "Arrivals",
              columnValues: {
                "Name": "TEST123"
              }
            }
          ]
        })
      }
    );

    const text = await response.text();

    return res.json({
      status: response.status,
      ok: response.ok,
      response: text
    });

  } catch (err) {
    return res.json({
      error: err.message
    });
  }
});
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
