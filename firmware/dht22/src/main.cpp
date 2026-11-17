#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>

const char *WIFI_SSID = "Kavling3Lt3_AP2";
const char *WIFI_PASS = "embunpagiputri11111";
const char *MQTT_HOST = "192.168.110.165"; // IP laptop kamu (cek: ipconfig → IPv4)
const int MQTT_PORT = 1883;
const char *DEVICE_ID = "DHT-001"; // huruf besar, harus sama dengan yang didaftarkan di web

DHT dht(13, DHT22);
WiFiClient net;
PubSubClient mqtt(net);
String tSuhu = String("insinerator/") + DEVICE_ID + "/suhu";
String tStatus = String("insinerator/") + DEVICE_ID + "/status";
unsigned long last = 0;

void connectAll()
{
    if (WiFi.status() != WL_CONNECTED)
    {
        WiFi.begin(WIFI_SSID, WIFI_PASS);
        while (WiFi.status() != WL_CONNECTED)
            delay(500);
        Serial.println("WiFi OK");
    }
    while (!mqtt.connected())
    {
        if (mqtt.connect(DEVICE_ID, tStatus.c_str(), 1, true, "offline"))
        {
            mqtt.publish(tStatus.c_str(), "online", true);
            Serial.println("MQTT OK");
        }
        else
            delay(2000);
    }
}

void setup()
{
    Serial.begin(115200);
    dht.begin();
    mqtt.setServer(MQTT_HOST, MQTT_PORT);
}

void loop()
{
    connectAll();
    mqtt.loop();
    if (millis() - last >= 2000)
    {
        last = millis();
        float t = dht.readTemperature();
        if (isnan(t))
        {
            Serial.println("DHT gagal dibaca");
            return;
        }
        char buf[32];
        snprintf(buf, sizeof(buf), "{\"temp_c\":%.1f}", t);
        mqtt.publish(tSuhu.c_str(), buf);
        Serial.println(buf);
    }
}