// ===============================
//  БАЗОВИЙ СЕРВЕР + WEBSOCKET
// ===============================
import express from "express";
import { WebSocketServer } from "ws";
import fs from "fs";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 10000;

// Папка зі статикою
app.use(express.static("./"));

// === РОЗДАЄМО ГЛЯДАЦЬКУ СТОРІНКУ ===
app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/index.html");
});

// === РОЗДАЄМО СТОРІНКУ ЛОГІНУ АДМІНА ===
app.get("/admin", (req, res) => {
  res.sendFile(process.cwd() + "/admin-login.html");
});

// === СТОРІНКА АДМІНКИ (ПІСЛЯ ВВОДУ ПАРОЛЯ) ===
app.get("/admin-panel", (req, res) => {
  res.sendFile(process.cwd() + "/admin.html");
});

// Запускаємо HTTP сервер
const server = app.listen(PORT, () => {
  console.log("SERVER STARTED ON PORT", PORT);
});

// ===============================
//  ЗАПУСКАЄМО WEBSOCKET
// ===============================
const wss = new WebSocketServer({ server });

// ПАМʼЯТЬ ПО ЦІЛЯХ
let targets = [];

// Ширимо стан клієнтам
function broadcast(data) {
  const str = JSON.stringify(data);
  wss.clients.forEach(c => {
    if (c.readyState === 1) c.send(str);
  });
}

// ===============================
//  ОБРОБКА ПОВІДОМЛЕНЬ WS
// ===============================
wss.on("connection", ws => {
  console.log("Client connected");

  ws.send(JSON.stringify({ type: "state", targets }));

  ws.on("message", msg => {
    let data;
    try { data = JSON.parse(msg); } catch {
      return;
    }

    // АДМІНСЬКІ КОМАНДИ
    if (data.role === "admin") {
      if (data.action === "add") {
        const t = data.target;
        t.id = Date.now().toString();
        targets.push(t);
      }

      if (data.action === "remove") {
        targets = targets.filter(x => x.id !== data.id);
      }

      if (data.action === "clear") {
        targets = [];
      }

      broadcast({ type: "state", targets });
    }
  });
});

// ===============================
//  РУХ ЦІЛЕЙ
// ===============================
setInterval(() => {
  targets.forEach(t => {
    t.lat += t.dx * t.speed;
    t.lon += t.dy * t.speed;
  });

  broadcast({ type: "state", targets });
}, 300);

// ===============================
//  API ПОВІТРЯНИХ ТРИВОГ
// ===============================
const ALERTS_URL =
  "https://api.alerts.in.ua/v1/alerts/active.json?token=" +
  process.env.ALERTS_TOKEN;

console.log("ALERT URL:", ALERTS_URL);

// поточний стан тривог
let alertAreas = [];

// КОЖНІ 20 СЕКУНД ОНОВЛЕННЯ
setInterval(async () => {
  try {
    const res = await fetch(ALERTS_URL);

    if (!res.ok) {
      console.log("ALERT API ERROR:", res.status);
      return;
    }

    const data = await res.json();

    // API повертає { alerts: [...] }
    if (!data.alerts || !Array.isArray(data.alerts)) {
      console.log("ALERT FORMAT ERROR:", data);
      return;
    }

    alertAreas = data.alerts;
    broadcast({ type: "alerts", alertAreas });

  } catch (err) {
    console.log("ALERT FETCH FAILED:", err);
  }
}, 20000);

// клієнт отримує актуальні тривоги
wss.on("connection", ws => {
  ws.send(JSON.stringify({ type: "alerts", alertAreas }));
});
