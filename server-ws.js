import express from "express";
import fs from "fs";
import { WebSocketServer } from "ws";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 10000;
const ALERTS_TOKEN = process.env.ALERTS_TOKEN;

const app = express();

// ==== STATIC FILES ====
app.use(express.static("."));

// Головна сторінка
app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/index.html");
});

// Адмінка
app.get("/admin", (req, res) => {
  res.sendFile(process.cwd() + "/admin.html");
});

// ==== WEBSOCKET SERVER ==== 
const wss = new WebSocketServer({ noServer: true });

const server = app.listen(PORT, () =>
  console.log(`Server running on PORT ${PORT}`)
);

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

// ==== READ TARGETS.JSON ====
function loadTargets() {
  try {
    const raw = fs.readFileSync("targets.json", "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveTargets(data) {
  fs.writeFileSync("targets.json", JSON.stringify(data, null, 2));
}

// ==== ALERTS FETCH ====
async function fetchAlerts() {
  try {
    const url = `https://api.alerts.in.ua/v1/alerts/active.json?token=${ALERTS_TOKEN}`;
    console.log("ALERT URL:", url);

    const res = await fetch(url);

    if (!res.ok) {
      console.error("ALERT API ERROR:", res.status);
      return [];
    }

    const json = await res.json();

    if (!Array.isArray(json.alerts)) {
      console.log("⚠ Unexpected API structure:", json);
      return [];
    }

    return json.alerts;
  } catch (err) {
    console.error("ALERT FETCH FAILED:", err);
    return [];
  }
}

// ==== WS HANDLING ====
wss.on("connection", (ws) => {
  console.log("Client connected!");

  ws.send(JSON.stringify({ type: "targets", data: loadTargets() }));

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.type === "add") {
        const list = loadTargets();
        list.push(data.target);
        saveTargets(list);
        broadcastTargets();
      }

      if (data.type === "clear") {
        saveTargets([]);
        broadcastTargets();
      }

      if (data.type === "delete") {
        const list = loadTargets().filter((_, i) => i !== data.index);
        saveTargets(list);
        broadcastTargets();
      }
    } catch (err) {
      console.error("WS ERROR:", err);
    }
  });
});

function broadcastTargets() {
  const msg = JSON.stringify({ type: "targets", data: loadTargets() });

  wss.clients.forEach((c) => {
    if (c.readyState === 1) c.send(msg);
  });
}

async function broadcastAlerts() {
  const alerts = await fetchAlerts();

  console.log(
    "ACTIVE ALERTS:",
    alerts.map((a) => a.location_title).join(", ") || "none"
  );

  const msg = JSON.stringify({ type: "alerts", data: alerts });

  wss.clients.forEach((c) => {
    if (c.readyState === 1) c.send(msg);
  });
}

setInterval(broadcastAlerts, 5000);
broadcastAlerts();
