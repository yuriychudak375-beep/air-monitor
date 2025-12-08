const express = require("express");
const WebSocket = require("ws");
const http = require("http");

const ALERTS_TOKEN = process.env.ALERTS_TOKEN;

if (!ALERTS_TOKEN) {
  console.error("❌ ERROR: ALERTS_TOKEN is missing. Add it in Render → Environment.");
}

const app = express();
app.use(express.static(".")); // serve HTML files normally

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// === Fetch function using BUILT-IN fetch ===
async function fetchAlerts() {
  const url = `https://api.alerts.in.ua/v1/alerts/active.json?token=${ALERTS_TOKEN}`;
  console.log("ALERT URL:", url);

  try {
    const res = await fetch(url);

    if (!res.ok) {
      console.error("❌ ALERT API ERROR:", res.status);
      return [];
    }

    const data = await res.json();

    // API повертає { alerts: [...] }
    return data.alerts || [];

  } catch (err) {
    console.error("❌ ALERT FETCH FAILED:", err);
    return [];
  }
}

// === Broadcast alerts to all clients ===
async function broadcastAlerts() {
  const alerts = await fetchAlerts();

  const msg = JSON.stringify({
    type: "alert_update",
    alerts: alerts,
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// Run every 10 seconds
setInterval(broadcastAlerts, 10000);

// Required WebSocket handler
wss.on("connection", (ws) => {
  console.log("Client connected");
});

// Start server
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("Server running on port", PORT));
