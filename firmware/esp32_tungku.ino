// ESP32 + thermocouple tipe K + modul MAX6675  ->  MQTT
// Library (Library Manager): "PubSubClient" (Nick O'Leary), "MAX6675 library" (Adafruit)
// Wiring MAX6675: SCK=GPIO18, CS=GPIO5, SO=GPIO19, VCC=3V3, GND=GND
#include <WiFi.h>
#include <PubSubClient.h>
#include <max6675.h>

const char* WIFI_SSID = "NAMA_WIFI";
const char* WIFI_PASS = "PASSWORD_WIFI";
const char* MQTT_HOST = "192.168.1.10";   // IP komputer/server yang menjalankan broker
const int   MQTT_PORT = 1883;
const char* MQTT_USER = "";               // isi jika broker memakai password
const char* MQTT_PASS = "";
const char* DEVICE_ID = "INS-001";        // harus sama dengan ID yang didaftarkan di web
const unsigned long INTERVAL_MS = 2000;   // MAX6675 butuh minimal ~250 ms

MAX6675 tc(18, 5, 19);
WiFiClient net;
PubSubClient mqtt(net);
String tSuhu, tStatus;
unsigned long last = 0;

void connectAll() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    while (WiFi.status() != WL_CONNECTED) delay(500);
  }
  while (!mqtt.connected()) {
    bool ok = mqtt.connect(DEVICE_ID, strlen(MQTT_USER) ? MQTT_USER : NULL, strlen(MQTT_USER) ? MQTT_PASS : NULL,
                           tStatus.c_str(), 1, true, "offline");   // Last Will: otomatis "offline" jika alat putus
    if (ok) mqtt.publish(tStatus.c_str(), "online", true);
    else delay(2000);
  }
}

void setup() {
  Serial.begin(115200);
  tSuhu = String("insinerator/") + DEVICE_ID + "/suhu";
  tStatus = String("insinerator/") + DEVICE_ID + "/status";
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  delay(500);  // tunggu MAX6675 siap
}

void loop() {
  connectAll();
  mqtt.loop();
  if (millis() - last >= INTERVAL_MS) {
    last = millis();
    double c = tc.readCelsius();
    if (isnan(c)) { Serial.println("Sensor tidak terbaca (cek kabel thermocouple)"); return; }
    char buf[48]; snprintf(buf, sizeof(buf), "{\"temp_c\":%.1f}", c);
    mqtt.publish(tSuhu.c_str(), buf);
    Serial.println(buf);
  }
}
