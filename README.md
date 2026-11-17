# Tungku: Monitoring Suhu Insinerator (v0.1)

Alur data: **ESP32 + thermocouple → MQTT broker → server Node.js → dashboard web (WebSocket)**

## 1. Jalankan di lokal
Butuh Node.js 18 atau lebih baru.

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm start                   # buka http://localhost:3000
```
Broker MQTT bawaan ikut menyala di port 1883, jadi tidak perlu install apa pun lagi.

Uji tanpa alat (terminal kedua):
```bash
npm run sim                 # simulasi INS-001 dan INS-002
node simulator.js INS-003   # simulasi alat lain
```
Daftarkan insinerator baru di menu **Insinerator**, lalu kirim data dengan ID yang sama.
Pakai Mosquitto sungguhan (opsional): `docker compose up -d`, lalu set `EMBEDDED_BROKER=false` di `.env`.

## 2. Kontrak MQTT
| Topik | Isi | Keterangan |
|---|---|---|
| `insinerator/{ID}/suhu` | `{"temp_c": 912.5}` | dikirim tiap 1 sampai 5 detik |
| `insinerator/{ID}/status` | `online` / `offline` | retained; `offline` dikirim otomatis lewat Last Will |

Alat yang ID-nya belum didaftarkan di web akan diabaikan. Tanpa data lebih dari `OFFLINE_SECONDS` (15 dtk), alat dianggap offline.

## 3. Alat (ESP32)
File `firmware/esp32_tungku.ino`. Wiring MAX6675: SCK→GPIO18, CS→GPIO5, SO→GPIO19, VCC→3V3, GND→GND.
Isi WiFi, `MQTT_HOST` (IP komputer/server) dan `DEVICE_ID`, lalu upload via Arduino IDE.
Di lokal, komputer dan ESP32 harus satu jaringan WiFi, dan firewall komputer harus mengizinkan port 1883.

## 4. Struktur
```
server.js          backend: MQTT + REST + WebSocket + penyimpanan
simulator.js       alat palsu untuk uji
public/index.html  dashboard
data/              dibuat otomatis: devices.json (konfigurasi), readings.csv (log suhu)
```
REST: `GET/POST /api/devices`, `PUT/DELETE /api/devices/:id`, `GET /api/events`, `GET /api/export.csv`.

## 5. Go live: yang wajib disesuaikan
**Keamanan (jangan dilewati)**
1. **Broker MQTT**: matikan `allow_anonymous`, buat user per alat (`mosquitto_passwd`), dan batasi ACL supaya alat X hanya boleh publish ke `insinerator/X/#`. Aktifkan TLS (port 8883).
2. **Web**: sekarang siapa pun yang membuka URL bisa mengubah threshold atau menghapus alat. Tambahkan login (minimal basic auth di Nginx/Caddy; idealnya login + peran).
3. **HTTPS**: taruh di belakang reverse proxy (Caddy atau Nginx) dengan sertifikat Let's Encrypt. Pastikan WebSocket di `/ws` ikut diteruskan. Frontend otomatis memakai `wss://` bila halaman HTTPS.
4. Rahasia (user/password MQTT) hanya di `.env`, jangan masuk Git.

**Server**
5. Deploy ke VPS (atau Docker). Jalankan dengan `pm2`/`systemd` agar restart otomatis.
6. Pakai broker eksternal: `EMBEDDED_BROKER=false` dan `MQTT_URL=mqtts://...`. Broker bawaan hanya untuk lokal.
7. **Database**: JSON + CSV hanya cukup untuk uji. Untuk live pakai PostgreSQL/TimescaleDB atau InfluxDB (riwayat per rentang waktu, retensi, backup). Riwayat grafik saat ini hanya ada di memori dan hilang saat server restart.
8. Siapkan backup data dan pemantauan server (uptime, disk).

**Alat dan sensor**
9. Pastikan sensor sesuai rentang suhu. MAX6675 sampai sekitar 1024°C, resolusi 0,25°C. Untuk suhu lebih tinggi atau akurasi lebih baik pakai MAX31855 dan thermocouple yang sesuai.
10. Kalibrasi sensor terhadap alat ukur acuan; tambahkan offset kalibrasi bila perlu.
11. Pasang modul elektronik jauh dari panas dan noise (kabel kompensasi thermocouple, casing tahan panas dan debu, catu daya stabil).
12. Firmware: gunakan TLS (`WiFiClientSecure`), NTP untuk waktu, watchdog, buffer data saat internet putus, dan idealnya OTA update serta pengaturan WiFi tanpa edit kode.
13. Satu ID unik per alat, dan catat daftar alat per lokasi.

**Fitur yang biasanya menyusul**
14. Notifikasi Telegram/WhatsApp saat suhu keluar batas atau alat offline.
15. Aturan durasi (misalnya di atas X°C selama Y detik), setelah threshold final dari dosen.
16. Zona waktu dan laporan harian, serta ekspor per tanggal.

**Catatan keselamatan**: sistem ini hanya memantau. Jangan jadikan satu-satunya pengaman proses pembakaran.
