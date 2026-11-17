// Simulator alat ESP32: kirim suhu palsu ke MQTT. Pemakaian: node simulator.js [ID ...]
require("dotenv").config();
const mqtt = require("mqtt");
const URL = process.env.MQTT_URL || "mqtt://127.0.0.1:1883", PORT = process.env.PORT || 3000;
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ["INS-001", "INS-002"];
(async () => {
  let list = []; try { list = await (await fetch(`http://127.0.0.1:${PORT}/api/devices`)).json() } catch {}
  for (const id of ids) {
    const d = list.find(x => x.id === id) || { min: 850, max: 1100 };
    let t = (d.min + d.max) / 2, tg = t;
    const c = mqtt.connect(URL, { clientId: "sim-" + id, username: process.env.MQTT_USER || undefined, password: process.env.MQTT_PASS || undefined,
      will: { topic: `insinerator/${id}/status`, payload: "offline", retain: true, qos: 1 } });
    c.on("connect", () => { console.log("Simulasi", id); c.publish(`insinerator/${id}/status`, "online", { retain: true }) });
    setInterval(() => {
      if (Math.random() < .04) tg = d.min - 90 + Math.random() * (d.max - d.min + 180);
      t += (tg - t) * .12 + (Math.random() - .5) * 14;
      c.publish(`insinerator/${id}/suhu`, JSON.stringify({ temp_c: +t.toFixed(1) }));
    }, 1500);
  }
})();
