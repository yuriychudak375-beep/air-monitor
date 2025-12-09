// server-ws.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const https = require("https");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const ADMIN_PASSWORD = "42Adminpassfrommapofdrones42";

// 🔑 API-токен alerts.in.ua
// АБО постав через змінну середовища ALERTS_TOKEN на Render
// АБО тупо впиши свій токен замість PASTE_YOUR_TOKEN_HERE
const ALERTS_TOKEN =
  process.env.ALERTS_TOKEN && process.env.ALERTS_TOKEN !== "50384ea5708d0490af5054940304a4eda4413fbdab2203"
    ? process.env.ALERTS_TOKEN
    : "50384ea5708d0490af5054940304a4eda4413fbdab2203";

// ========= MIDDLEWARE =========
app.use(express.json());

// ========= ROUTES =========

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

// Статика (модельки, geojson і т.д.)
app.use(express.static(__dirname));

// ========= ДАНІ ПО ЦІЛЯХ =========

let targets = [];
let activeAlerts = []; // 🔴 тут буде список тривог з API

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

// ========= WS =========
wss.on("connection", (ws) => {
  console.log("WS client connected");

  // при підключенні шлемо поточний стан
  ws.send(
    JSON.stringify({
      type: "state",
      targets,
      alerts: activeAlerts,
    })
  );

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    // керування цілями тільки з адмінки
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

// Рух цілей
setInterval(() => {
  targets.forEach((t) => {
    t.lat += t.dy * t.speed;
    t.lon += t.dx * t.speed;
  });

  broadcast({ type: "state", targets, alerts: activeAlerts });
}, 1000);

// ========= ОПИТУВАННЯ API ТРИВОГ =========

function fetchActiveAlerts() {
  if (!ALERTS_TOKEN || ALERTS_TOKEN === "PASTE_YOUR_TOKEN_HERE") {
    // Якщо токен не вказаний — просто мовчки не шлемо тривоги
    // Щоб нічого не ламати
    return;
  }

  const url =
    "https://api.alerts.in.ua/v1/alerts/active.json?token=" +
    encodeURIComponent(ALERTS_TOKEN);

  https
    .get(url, (res) => {
      let body = "";

      res.on("data", (chunk) => {
        body += chunk;
      });

      res.on("end", () => {
        try {
          const json = JSON.parse(body);
          // Документація каже, що тут або { alerts: [...] }, або одразу масив
          let alerts = [];

          if (Array.isArray(json)) {
            alerts = json;
          } else if (json && Array.isArray(json.alerts)) {
            alerts = json.alerts;
          } else {
            console.log("ALERT API unexpected structure");
            return;
          }

          // зберігаємо і розсилаємо
          activeAlerts = alerts;
          console.log("Active alerts:", activeAlerts.length);

          broadcast({
            type: "alerts",
            alerts: activeAlerts,
          });
        } catch (e) {
          console.log("ALERT parse error:", e.message);
        }
      });
    })
    .on("error", (err) => {
      console.log("ALERT HTTPS error:", err.message);
    });
}

// кожні 10 секунд оновлюємо тривоги
setInterval(fetchActiveAlerts, 10000);
fetchActiveAlerts();

// ========= START =========
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
