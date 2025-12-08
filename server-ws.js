// ================================
//  AIR-MONITOR main server
// ================================

const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const fs = require("fs");

// 🔑 ВСТАВ СВІЙ ТОКЕН СЮДИ (У ЛАПКАХ!)
const ALERTS_TOKEN = "ТУТ_ТВІЙ_ТОКЕН";
const ALERTS_URL =
  "https://api.alerts.in.ua/v1/alerts/active.json?token=" + ALERTS_TOKEN;

// ================================
// 1. HTTP + WS server
// ================================
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// роздаємо всі файли з поточної папки
app.use(express.static("."));

// ================================
// 2. Збереження цілей
// ================================
const TARGETS_FILE = "./targets.json";
let targets = [];

try {
  const raw = fs.readFileSync(TARGETS_FILE, "utf8");
  targets = JSON.parse(raw);
} catch {
  targets = [];
}

function saveTargets() {
  fs.writeFile(TARGETS_FILE, JSON.stringify(targets, null, 2), () => {});
}

function broadcast(obj) {
  const json = JSON.stringify(obj);
  wss.clients.forEach((ws) => {
    if (ws.readyState === 1) {
      ws.send(json);
    }
  });
}

// ================================
// 3. WS логіка (адмін + глядач)
// ================================
let lastAlerts = [];

wss.on("connection", (ws) => {
  // при підключенні віддаємо поточний стан цілей
  ws.send(JSON.stringify({ type: "state", targets }));

  // і поточний стан тривог, якщо є
  if (lastAlerts.length) {
    ws.send(JSON.stringify({ type: "alerts", regions: lastAlerts }));
  }

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.role === "admin") {
      if (msg.action === "add" && msg.target) {
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
        targets = targets.filter((t) => t.id !== msg.id);
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

// ================================
// 4. Рух цілей
// ================================
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

// ================================
// 5. Тривоги alerts.in.ua
// ================================
async function fetchAlerts() {
  try {
    const response = await fetch(ALERTS_URL);

    if (!response.ok) {
      console.log("🛑 ALERT API ERROR:", response.status);
      return;
    }

    const json = await response.json();

    if (!json.alerts || !Array.isArray(json.alerts)) {
      console.log("UNEXPECTED ALERTS FORMAT:", json);
      return;
    }

    const active = json.alerts
      .filter((a) => a.alert_type === "air_raid")
      .map((a) => {
        if (a.location_raion) return a.location_raion.toLowerCase();
        if (a.location_oblast) return a.location_oblast.toLowerCase();
        return null;
      })
      .filter(Boolean);

    lastAlerts = active;

    broadcast({
      type: "alerts",
      regions: active,
    });

    console.log("🔔 ACTIVE ALERT REGIONS:", active);
  } catch (e) {
    console.log("ALERT FETCH FAILED:", e);
  }
}

// кожні 15 секунд опитуємо API
setInterval(fetchAlerts, 15000);
fetchAlerts();

// ================================
// 6. Запуск сервера
// ================================
server.listen(PORT, () => {
  console.log("🌐 SERVER RUNNING ON PORT", PORT);
});
