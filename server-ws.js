// ================================
//  AIR-MONITOR — сервер
// ================================

const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const fs = require("fs");

// -------------------------------------------------------
// 🔥 1) СТАБІЛЬНИЙ FETCH (000% не впаде на Render)
// -------------------------------------------------------
let fetch;
try {
  fetch = global.fetch; // якщо Node 18+ — вже є
  if (!fetch) throw new Error("no fetch");
} catch {
  fetch = (...args) =>
    import("node-fetch").then(({ default: f }) => f(...args));
  console.log("⚠️ Using node-fetch fallback");
}

// -------------------------------------------------------
// 🔑 2) ТВОЙ ТОКЕН
// -------------------------------------------------------
const ALERTS_TOKEN = "ВСТАВ_СЮДИ_СВІЙ_ТОКЕН";
const ALERTS_URL =
  "https://api.alerts.in.ua/v1/alerts/active.json?token=" + ALERTS_TOKEN;

// -------------------------------------------------------
// 3) HTTP + WS сервер
// -------------------------------------------------------
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// 🔥 ВАЖЛИВО: віддаємо ВСІ твої файли
app.use(express.static("."));

// -------------------------------------------------------
// 4) ЗБЕРІГАННЯ ЦІЛЕЙ
// -------------------------------------------------------
const TARGETS_FILE = "./targets.json";
let targets = [];

try {
  targets = JSON.parse(fs.readFileSync(TARGETS_FILE, "utf8"));
} catch {
  targets = [];
}

function saveTargets() {
  fs.writeFile(TARGETS_FILE, JSON.stringify(targets, null, 2), () => {});
}

function broadcast(obj) {
  const json = JSON.stringify(obj);
  wss.clients.forEach((ws) => {
    if (ws.readyState === 1) ws.send(json);
  });
}

// -------------------------------------------------------
// 5) WebSocket логіка
// -------------------------------------------------------

let lastAlerts = [];

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "state", targets }));
  ws.send(JSON.stringify({ type: "alerts", regions: lastAlerts }));

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.role === "admin") {
      if (msg.action === "add") {
        const t = {
          id: Date.now(),
          type: msg.target.type,
          lat: msg.target.lat,
          lon: msg.target.lon,
          dx: msg.target.dx,
          dy: msg.target.dy,
          speed: msg.target.speed,
        };

        targets.push(t);
        saveTargets();
        broadcast({ type: "state", targets });
      }

      if (msg.action === "remove") {
        targets = targets.filter((x) => x.id !== msg.id);
        saveTargets();
        broadcast({ type: "state", targets });
      }

      if (msg.action === "clear") {
        targets = [];
        saveTargets();
        broadcast({ type: "state", targets });
      }
    }
  });
});

// -------------------------------------------------------
// 6) РУХ ЦІЛЕЙ
// -------------------------------------------------------
setInterval(() => {
  targets.forEach((t) => {
    if (t.type === "iskander") {
      t.lat += t.dx * (t.speed / 5);
      t.lon += t.dy * (t.speed / 5);
      t.dy += 0.001;
    } else if (t.type === "x101") {
      t.lat += t.dx * (t.speed / 10);
      t.lon += t.dy * (t.speed / 10);
    } else if (t.type === "shahed" || t.type === "kalibr") {
      t.lat += t.dx * 0.15;
      t.lon += t.dy * 0.15;
    }
  });

  broadcast({ type: "state", targets });
}, 1000);

// -------------------------------------------------------
// 7) ОТРИМАННЯ ТРИВОГ
// -------------------------------------------------------
async function fetchAlerts() {
  try {
    console.log("📡 Fetching alerts…");

    const response = await fetch(ALERTS_URL);

    if (!response.ok) {
      console.log("🛑 ALERT API ERROR:", response.status);
      return;
    }

    const json = await response.json();

    if (!json.alerts || !Array.isArray(json.alerts)) {
      console.log("❗ Unexpected alerts format:", json);
      return;
    }

    const active = json.alerts
      .filter((a) => a.alert_type === "air_raid")
      .map((a) =>
        a.location_raion
          ? a.location_raion.toLowerCase()
          : a.location_oblast.toLowerCase()
      );

    lastAlerts = active;

    broadcast({ type: "alerts", regions: active });

    console.log("🔔 ACTIVE regions:", active);
  } catch (e) {
    console.log("❗ ALERT FETCH FAILED:", e);
  }
}

setInterval(fetchAlerts, 15000);
fetchAlerts();

// -------------------------------------------------------
// 8) СТАРТ
// -------------------------------------------------------
server.listen(PORT, () => {
  console.log("🌐 SERVER STARTED ON PORT", PORT);
});




