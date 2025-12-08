// =======================================
//      AIR-MONITOR — ГОЛОВНИЙ СЕРВЕР
// =======================================

const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const fs = require("fs");

// 👇 просто константа, без process.env
const ALERTS_TOKEN = "50384ea5708d0490af5054940304a4eda4413fbdab2203";


// =======================================
//        1. СТАРТ СЕРВЕРУ
// =======================================
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(".")); // віддаємо HTML, картинки, моделі


// =======================================
//        2. ЗБЕРІГАННЯ ЦІЛЕЙ (ракети)
// =======================================
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
    wss.clients.forEach(ws => {
        if (ws.readyState === 1) ws.send(json);
    });
}


// =======================================
//           3. WS ЛОГІКА
// =======================================
wss.on("connection", ws => {

    // надсилаємо поточні цілі
    ws.send(JSON.stringify({ type: "state", targets }));

    // надсилаємо поточні тривоги
    if (lastAlerts.length) {
        ws.send(JSON.stringify({ type: "alerts", regions: lastAlerts }));
    }

    ws.on("message", raw => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        if (msg.role === "admin") {
            if (msg.action === "add") {
                const t = {
                    id: Date.now(),
                    ...msg.target
                };
                targets.push(t);
                saveTargets();
                broadcast({ type: "state", targets });
            }

            if (msg.action === "remove") {
                targets = targets.filter(x => x.id != msg.id);
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


// =======================================
//      4. ТРИВОГИ З alerts.in.ua
// =======================================

let lastAlerts = [];

async function fetchAlerts() {
  try {
    const url =
      "https://api.alerts.in.ua/v1/alerts/active.json?token=" + ALERTS_TOKEN;

    console.log("ALERT URL:", url);

    const response = await fetch(url);
    const json = await response.json();          // <- це весь обʼєкт

    // якщо раптом помилка формату – логнемо і вийдемо
    if (!json.alerts || !Array.isArray(json.alerts)) {
      console.log("UNEXPECTED ALERTS FORMAT:", json);
      return;
    }

    const active = json.alerts
      .filter((a) => a.alert_type === "air_raid") // тільки повітряні тривоги
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



// кожні 15 секунд оновлюємо тривоги
setInterval(fetchAlerts, 15000);
fetchAlerts();


// =======================================
//     5. СТАРТ СЕРВЕРУ
// =======================================
server.listen(PORT, () => {
    console.log("🌐 SERVER RUNNING ON PORT", PORT);
});







