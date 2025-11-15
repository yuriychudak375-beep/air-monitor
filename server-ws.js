// server.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const server = http.createServer((req, res) => {
    let file = req.url;
    if (file === "/") file = "/index.html";

    const filePath = path.join(__dirname, file);
    
    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); return res.end("Not found"); }

        const ext = path.extname(filePath);
        const type = {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".png": "image/png"
        }[ext] || "text/plain";

        res.writeHead(200, { "Content-Type": type });
        res.end(data);
    });
});

server.listen(3000, () => console.log("SERVER RUNNING @ http://localhost:3000"));

const wss = new WebSocket.Server({ server });

let targets = [];
let nextId = 1;

// send to all
function broadcast() {
    const packet = JSON.stringify({ type: "state", targets });
    wss.clients.forEach(c => c.readyState === WebSocket.OPEN && c.send(packet));
}

wss.on("connection", ws => {
    ws.send(JSON.stringify({ type: "state", targets }));

    ws.on("message", raw => {
        const msg = JSON.parse(raw);
        if (msg.role !== "admin") return;

        if (msg.action === "add") {
            targets.push({
                id: nextId++,
                type: msg.target.type,
                lat: msg.target.lat,
                lon: msg.target.lon,
                dx: msg.target.dx,
                dy: msg.target.dy,
                speed: msg.target.speed,
            });
            broadcast();
        }

        if (msg.action === "remove") {
            targets = targets.filter(t => t.id !== msg.id);
            broadcast();
        }

        if (msg.action === "clear") {
            targets = [];
            broadcast();
        }
    });
});

// MOVE OBJECTS
setInterval(() => {
    targets.forEach(t => {
        t.lat += t.dy * t.speed;
        t.lon += t.dx * t.speed;
    });
    broadcast();
}, 100);
