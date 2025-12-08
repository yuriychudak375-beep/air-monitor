const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const ADMIN_PASSWORD = "42Adminpassfrommapofdrones42"; // Можеш змінити тут

// ======= MIDDLEWARE =======
app.use(express.json());

// ======= ROUTES =======

// Глядацька
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index-ws.html"));
});

// Сторінка з паролем (ти її вже зробив — admin-login.html)
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin-login.html"));
});

// Обробка логіну з admin-login.html
app.post("/admin-login", (req, res) => {
  const pass = (req.body && req.body.password) || "";
  if (pass === ADMIN_PASSWORD) {
    return res.json({ ok: true });
  }
  res.json({ ok: false });
});

// Реальна адмін-панель
app.get("/admin-real", (req, res) => {
  res.sendFile(path.join(__dirname, "admin-ws.html"));
});

// Статика — моделі, скрипти, все інше
app.use(express.static(__dirname));

// ======= TARGET DATA =======
let targets = [];

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

// ======= WEBSOCKET =========
wss.on("connection", (ws) => {
  console.log("WS client connected");

  // відправити поточний стан
  ws.send(JSON.stringify({ type: "state", targets }));

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    // Admin actions
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

      broadcast({ type: "state", targets });
    }
  });
});

// ======= TARGET MOVEMENT =======
// ЛОГІКА ЯК У ТВОЄМУ СТАРОМУ ФАЙЛІ (НІЧОГО НЕ МІНЯЮ)
setInterval(() => {
  targets.forEach((t) => {
    t.lat += t.dy * t.speed;
    t.lon += t.dx * t.speed;
  });

  broadcast({ type: "state", targets });
}, 1000);

// ======= START SERVER =======
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});



