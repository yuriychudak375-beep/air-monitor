const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const fetch = require("node-fetch");          // <-- ДОДАНО
require("dotenv").config();                   // <-- ДОДАНО

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const ADMIN_PASSWORD = "42Adminpassfrommapofdrones42";

// ======= MIDDLEWARE =======
app.use(express.json());

// ======= ROUTES =======

// Глядацька
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index-ws.html"));
});

// Сторінка логіну
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin-login.html"));
});

app.post("/admin-login", (req, res) => {
  const pass = (req.body && req.body.password) || "";
  res.json({ ok: pass === ADMIN_PASSWORD });
});

// Реальна адмінка
app.get("/admin-real", (req, res) => {
  res.sendFile(path.join(__dirname, "admin-ws.html"));
});

// Статика
app.use(express.static(__dirname));

// ======= TARGET DATA =======
let targets = [];
let activeAlerts = [];   // <-- ТУТ БУДЕ СПИСОК ТРИВОГ З API

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

// ======= WEBSOCKET =========
wss.on("connection", (ws) => {
  console.log("WS viewer connected");

  ws.send(
    JSON.stringify({
      type: "state",
      targets,
      alerts: activeAlerts,     // <-- РАЙОНИ З ТРИВОГАМИ
    })
  );

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch { return; }

    if (data.role === "admin") {
      if (data.action === "add") {
        const id = Date.now() + "_" + Math.random();
        const t = { id, ...data.target };
        targets.push(t);
      } else if (data.action === "remove") {
        targets = targets.filter((t) => t.id !== data.id);
      } else if (data.action === "clear") {
        targets = [];
      }
      broadcast({ type: "state", targets, alerts: activeAlerts });
    }
  });
});

// ======= TARGET MOVEMENT =======
setInterval(() => {
  targets.forEach((t) => {
    t.lat += t.dy * t.speed;
    t.lon += t.dx * t.speed;
  });

  broadcast({ type: "state", targets, alerts: activeAlerts });
}, 1000);

// ============================================================
// 🔥 API: ОТРИМАННЯ ТРИВОГ КОЖНІ 10 СЕКУНД
// ============================================================

const TOKEN = process.env.ALERTS_TOKEN;

async function fetchAlerts() {
  if (!TOKEN) {
    console.log("⚠️ ALERT: TOKEN not set in .env");
    return;
  }

  const url = `https://api.alerts.in.ua/v1/alerts/active.json?token=${TOKEN}`;

  try {
    const response = await fetch(url);
    const json = await response.json();

    if (!Array.isArray(json)) {
      console.log("❌ ALERT API returned unexpected structure");
      return;
    }

    activeAlerts = json;  // зберігаємо
    console.log("✔️ Alerts updated:", activeAlerts.length);

    broadcast({
      type: "alerts",
      alerts: activeAlerts,
    });

  } catch (err) {
    console.log("❌ ALERT FETCH ERROR:", err.message);
  }
}

// запуск кожні 10 сек
setInterval(fetchAlerts, 10000);
fetchAlerts(); // перший запуск

// ======= START SERVER =======
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
