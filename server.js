require("dotenv").config();
const fs = require("fs"), path = require("path"), http = require("http"), net = require("net");
const express = require("express"), { WebSocketServer } = require("ws"), mqtt = require("mqtt");

const PORT = +process.env.PORT || 3000;
const MQTT_URL = process.env.MQTT_URL || "mqtt://127.0.0.1:1883";
const EMBED = (process.env.EMBEDDED_BROKER || "true") === "true";
const OFFLINE_MS = (+process.env.OFFLINE_SECONDS || 15) * 1000;
const DATA = path.join(__dirname, "data"); fs.mkdirSync(DATA, { recursive: true });
const DBF = path.join(DATA, "devices.json"), CSV = path.join(DATA, "readings.csv");
const KEY = { "Kurang panas": "low", "Optimal": "ok", "Terlalu panas": "high" };
if (!fs.existsSync(CSV)) fs.writeFileSync(CSV, "timestamp,device_id,temp_c\n");

/* ---------- state perangkat ---------- */
function init(d) { d.t = null; d.online = false; d.lastSeen = 0; d.hist = []; d.last = null; d.zones = d.zones || { low: 0, ok: 0, high: 0 } }
let devs;
try { devs = JSON.parse(fs.readFileSync(DBF, "utf8")) } catch {
  devs = {
    "INS-001": { id: "INS-001", name: "Insinerator RS Harapan", loc: "Bekasi", min: 850, max: 1100 },
    "INS-002": { id: "INS-002", name: "TPS3R Sukamaju", loc: "Bogor", min: 800, max: 1000 },
    "INS-003": { id: "INS-003", name: "Puskesmas Cilandak", loc: "Jakarta Selatan", min: 850, max: 1050 }
  };
}
Object.values(devs).forEach(init);
const save = () => fs.writeFileSync(DBF, JSON.stringify(Object.fromEntries(Object.values(devs).map(d =>
  [d.id, { id: d.id, name: d.name, loc: d.loc, min: d.min, max: d.max, zones: d.zones }])), null, 2));
const status = d => !d.online || d.t == null ? "Offline" : d.t < d.min ? "Kurang panas" : d.t > d.max ? "Terlalu panas" : "Optimal";
const pub = d => ({ id: d.id, name: d.name, loc: d.loc, min: d.min, max: d.max, t: d.t, online: d.online, status: status(d), zones: d.zones, hist: d.hist.slice(-60).map(x => x.t) });

/* ---------- web + websocket ---------- */
const app = express(); app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const send = o => { const s = JSON.stringify(o); wss.clients.forEach(c => c.readyState === 1 && c.send(s)) };
const events = [];
function event(msg) { const e = { ts: Date.now(), msg }; events.unshift(e); events.length = Math.min(events.length, 50); console.log(new Date().toISOString(), msg); send({ type: "event", ...e }) }
wss.on("connection", ws => ws.send(JSON.stringify({ type: "snapshot", mqtt: cli.connected, devices: Object.values(devs).map(pub), events: events.slice(0, 5) })));

/* ---------- logika data ---------- */
function reading(d, v) {
  const now = Date.now();
  if (!d.online) { d.online = true; event(`${d.name}: perangkat terhubung`) }
  d.t = v; d.lastSeen = now; d.hist.push({ t: v, ts: now }); if (d.hist.length > 500) d.hist.shift();
  const s = status(d); d.zones[KEY[s]]++;
  if (s !== d.last) { if (d.last) event(`${d.name}: ${s === "Optimal" ? "suhu kembali optimal" : "suhu " + s.toLowerCase()}`); d.last = s }
  fs.appendFile(CSV, `${new Date(now).toISOString()},${d.id},${v}\n`, () => {});
  send({ type: "reading", id: d.id, t: v, zones: d.zones });
}
function goOffline(d) { if (!d.online) return; d.online = false; d.last = null; event(`${d.name}: perangkat offline`); send({ type: "device", device: pub(d) }) }
setInterval(() => Object.values(devs).forEach(d => d.online && Date.now() - d.lastSeen > OFFLINE_MS && goOffline(d)), 5000);
setInterval(save, 30000);

/* ---------- MQTT ---------- */
if (EMBED) {
  const aedes = require("aedes")();
  if (process.env.MQTT_USER) aedes.authenticate = (c, u, p, cb) => cb(null, u === process.env.MQTT_USER && !!p && p.toString() === process.env.MQTT_PASS);
  net.createServer(aedes.handle).listen(1883, () => console.log("Broker MQTT bawaan aktif di port 1883"));
}
const cli = mqtt.connect(MQTT_URL, { username: process.env.MQTT_USER || undefined, password: process.env.MQTT_PASS || undefined, reconnectPeriod: 3000 });
cli.on("connect", () => { console.log("Terhubung ke MQTT:", MQTT_URL); cli.subscribe(["insinerator/+/suhu", "insinerator/+/status"]) });
cli.on("error", e => console.log("MQTT error:", e.message));
cli.on("message", (topic, buf) => {
  const [, id, kind] = topic.split("/"), d = devs[id];
  if (!d) return console.log("Data dari ID belum terdaftar, diabaikan:", id);
  if (kind === "suhu") {
    let v; try { v = JSON.parse(buf).temp_c } catch { v = parseFloat(buf) }
    if (Number.isFinite(v)) reading(d, v);
  } else if (kind === "status" && buf.toString() === "offline") goOffline(d);
});

/* ---------- REST API ---------- */
const idOk = /^[A-Za-z0-9_-]{2,32}$/;
const clean = (b, o = {}) => ({
  name: String(b.name ?? o.name ?? "").trim().slice(0, 80),
  loc: String(b.loc ?? o.loc ?? "").trim().slice(0, 80) || "–",
  min: Number(b.min ?? o.min), max: Number(b.max ?? o.max)
});
const valid = c => c.name && Number.isFinite(c.min) && Number.isFinite(c.max) && c.min < c.max;
app.get("/api/devices", (q, r) => r.json(Object.values(devs).map(pub)));
app.get("/api/events", (q, r) => r.json(events));
app.get("/api/export.csv", (q, r) => r.download(CSV, "readings.csv"));
app.post("/api/devices", (q, r) => {
  const id = String(q.body.id || "").toUpperCase();
  if (!idOk.test(id)) return r.status(400).json({ error: "ID hanya huruf, angka, - dan _ (2 sampai 32 karakter)" });
  if (devs[id]) return r.status(409).json({ error: "ID perangkat sudah terdaftar" });
  const c = clean(q.body); if (!valid(c)) return r.status(400).json({ error: "Data tidak valid" });
  const d = { id, ...c }; init(d); devs[id] = d; save(); event(`${d.name}: didaftarkan`);
  send({ type: "device", device: pub(d) }); r.status(201).json(pub(d));
});
app.put("/api/devices/:id", (q, r) => {
  const d = devs[q.params.id]; if (!d) return r.status(404).json({ error: "Tidak ditemukan" });
  const c = clean(q.body, d); if (!valid(c)) return r.status(400).json({ error: "Data tidak valid" });
  Object.assign(d, c); d.last = d.online ? status(d) : null; save(); send({ type: "device", device: pub(d) }); r.json(pub(d));
});
app.delete("/api/devices/:id", (q, r) => {
  if (!devs[q.params.id]) return r.status(404).json({ error: "Tidak ditemukan" });
  delete devs[q.params.id]; save(); send({ type: "remove", id: q.params.id }); r.json({ ok: true });
});

server.listen(PORT, () => console.log(`Dashboard: http://localhost:${PORT}`));
