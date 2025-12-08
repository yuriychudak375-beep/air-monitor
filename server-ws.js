require("dotenv").config();
const express = require("express");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const ALERTS_TOKEN = process.env.ALERTS_TOKEN;

// --- СТАТИКА ---
app.use(express.static(__dirname)); // дає адмінку і глядацьку

// --- СЕРВЕР ---
const server = app.listen(PORT, () => {
    console.log("SERVER STARTED on port", PORT);
});

// --- WS ---
const wss = new WebSocket.Server({ server });

let targets = [];
let activeAlerts = [];

// Відправка даних всім клієнтам
function broadcast(data) {
    const msg = JSON.stringify(data);
    wss.clients.forEach(c => {
        if (c.readyState === WebSocket.OPEN) c.send(msg);
    });
}

// --- API Alerts.in.ua ---
async function fetchAlerts() {
    try {
        if (!ALERTS_TOKEN) {
            console.log("❌ ALERTS_TOKEN не знайдено!");
            return;
        }

        const url = `https://api.alerts.in.ua/v1/alerts/active.json?token=${ALERTS_TOKEN}`;

        const res = await fetch(url);
        if (!res.ok) {
            console.log("❌ ALERT API ERROR:", res.status);
            return;
        }

        const data = await res.json();

        if (!Array.isArray(data.alerts)) {
            console.log("❌ API повернуло неправильний формат:", data);
            return;
        }

        activeAlerts = data.alerts;

        console.log("🟢 Активні тривоги:", activeAlerts.length);

        broadcast({
            type: "alerts",
            alerts: activeAlerts
        });

    } catch (err) {
        console.log("❌ ALERT FETCH FAILED:", err);
    }
}

// кожні 10с оновлення тривог
setInterval(fetchAlerts, 10000);
fetchAlerts();

// WS прийом команд адмінки
wss.on("connection", ws => {
    console.log("Client connected");

    ws.send(JSON.stringify({
        type: "init",
        targets,
        alerts: activeAlerts
    }));

    ws.on("message", msg => {
        try {
            const data = JSON.parse(msg);

            if (data.type === "addTarget") {
                targets.push(data.target);
                broadcast({ type: "targets", targets });
            }

            if (data.type === "clearTargets") {
                targets = [];
                broadcast({ type: "targets", targets });
            }

            if (data.type === "deleteOne") {
                targets = targets.filter(t => t.id !== data.id);
                broadcast({ type: "targets", targets });
            }

        } catch (e) {
            console.log("WS error:", e);
        }
    });
});
