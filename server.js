const express = require("express");

const app = express();
const PORT = process.env.PORT || 10000;

// Root test
app.get("/", (req, res) => {
  res.send("API is running");
});

// Arrivals test route
app.get("/arrivals", (req, res) => {
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
