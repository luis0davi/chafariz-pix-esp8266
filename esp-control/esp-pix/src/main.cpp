/*
  ========================================================================
  PROJETO: Chafariz Eletrônico com Pagamento Pix (Mercado Pago + ESP8266)
  MICROCONTROLADOR: ESP8266 (NodeMCU, Wemos D1 Mini ou ESP-12)
  ATUADOR: Módulo Relé (para acionar a válvula solenoide / chafariz)
  PLATFORMA: PlatformIO
  ========================================================================
*/

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

// ========================================================================
// 1. CONFIGURAÇÕES DE REDE E SERVIDOR
// ========================================================================
const char* ssid     = "SEU_WIFI_2.4G";
const char* password = "SUA_SENHA_WIFI";

// URL da sua API na Vercel (ONLINE!):
const char* backend = "https://chafariz-pix-esp8266.vercel.app/api";

// ========================================================================
// 2. CONFIGURAÇÕES DE HARDWARE
// ========================================================================
// GPIO 4 corresponde ao pino D2 no NodeMCU / WeMos D1 Mini
#define RELAY_PIN 4 

// LED de status (LED azul integrado no ESP8266 no GPIO 2 / D4)
#define STATUS_LED 2

// Padrão dos módulos relé azuis do Arduino: acionam em nível LOW
#define RELAY_ACTIVE_LOW true

// ========================================================================
// 3. VARIÁVEIS GLOBAIS E TIMERS
// ========================================================================
unsigned long lastCheckTime = 0;
const unsigned long CHECK_INTERVAL = 2000; // Consulta a cada 2 segundos

void setRelayState(bool turnOn) {
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(RELAY_PIN, turnOn ? LOW : HIGH);
  } else {
    digitalWrite(RELAY_PIN, turnOn ? HIGH : LOW);
  }
}

// ========================================================================
// 4. FUNÇÃO DE DISPENSA DE ÁGUA (PULSOS NO RELÉ)
// ========================================================================
void triggerRelay(int pulses, int durationMs, int intervalMs) {
  Serial.println("========================================");
  Serial.printf("🌊 ACIONANDO RELÉ: %d pulso(s) de %d ms (intervalo: %d ms)\n", pulses, durationMs, intervalMs);
  Serial.println("========================================");

  for (int i = 0; i < pulses; i++) {
    Serial.printf(">>> Pulso %d de %d: LIGANDO relé...\n", i + 1, pulses);
    setRelayState(true);
    digitalWrite(STATUS_LED, LOW); // Liga LED
    delay(durationMs);

    Serial.printf("<<< Pulso %d de %d: DESLIGANDO relé...\n", i + 1, pulses);
    setRelayState(false);
    digitalWrite(STATUS_LED, HIGH); // Desliga LED

    if (i < pulses - 1) {
      delay(intervalMs);
    }
  }

  Serial.println("✅ Ciclo de água finalizado com sucesso!");
}

// ========================================================================
// 5. CONFIRMAÇÃO DO ACIONAMENTO PARA A API
// ========================================================================
void confirmDispense(String paymentId) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClient client;
  WiFiClientSecure sClient;
  HTTPClient http;
  String url = String(backend) + "/confirm_dispense";

  if (url.startsWith("https://")) {
    sClient.setInsecure();
    http.begin(sClient, url);
  } else {
    http.begin(client, url);
  }

  http.addHeader("Content-Type", "application/json");

  String payload = "{\"id\":\"" + paymentId + "\"}";
  int httpCode = http.POST(payload);

  if (httpCode == 200) {
    Serial.println("✅ Pagamento confirmado no servidor. Fila atualizada.");
  } else {
    Serial.printf("⚠️ Erro ao confirmar para o servidor. Código HTTP: %d\n", httpCode);
  }

  http.end();
}

// ========================================================================
// 6. CONSULTA DA FILA DE PAGAMENTOS
// ========================================================================
void checkPendingPayments() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ Wi-Fi desconectado! Tentando reconectar...");
    return;
  }

  WiFiClient client;
  WiFiClientSecure sClient;
  HTTPClient http;
  String url = String(backend) + "/check_dispense";

  if (url.startsWith("https://")) {
    sClient.setInsecure();
    http.begin(sClient, url);
  } else {
    http.begin(client, url);
  }

  int httpCode = http.GET();

  if (httpCode == 200) {
    String response = http.getString();
    
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, response);

    if (!error) {
      bool shouldDispense = doc["dispense"] | false;

      if (shouldDispense) {
        String paymentId = doc["id"].as<String>();
        float amount = doc["amount"] | 0.0;
        int pulses = doc["pulses"] | 2;
        int durationMs = doc["duration_ms"] | 1000;
        int intervalMs = doc["interval_ms"] | 500;

        Serial.printf("\n💰 NOVO PAGAMENTO IDENTIFICADO! ID: %s | Valor: R$ %.2f\n", paymentId.c_str(), amount);
        
        // 1. Aciona os pulsos no relé
        triggerRelay(pulses, durationMs, intervalMs);

        // 2. Notifica o backend
        confirmDispense(paymentId);
      }
    }
  } else {
    Serial.printf("⚠️ Falha ao consultar API (HTTP %d). Verifique o IP do backend.\n", httpCode);
  }

  http.end();
}

// ========================================================================
// 7. SETUP
// ========================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n----------------------------------------");
  Serial.println("🤖 Chafariz Pix IoT - Iniciando ESP8266");
  Serial.println("----------------------------------------");

  pinMode(RELAY_PIN, OUTPUT);
  pinMode(STATUS_LED, OUTPUT);

  setRelayState(false);
  digitalWrite(STATUS_LED, HIGH);

  Serial.printf("Conectando ao Wi-Fi '%s'", ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    digitalWrite(STATUS_LED, !digitalRead(STATUS_LED));
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(STATUS_LED, HIGH);
    Serial.println("\n✅ Wi-Fi Conectado com Sucesso!");
    Serial.print("📡 Endereço IP do ESP8266: ");
    Serial.println(WiFi.localIP());
    Serial.print("🔗 Conectando à API: ");
    Serial.println(backend);
  } else {
    Serial.println("\n❌ Falha ao conectar ao Wi-Fi! Verifique as credenciais.");
  }
}

// ========================================================================
// 8. LOOP
// ========================================================================
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.print("Reconectando Wi-Fi...");
    WiFi.reconnect();
    delay(3000);
    return;
  }

  unsigned long now = millis();
  if (now - lastCheckTime >= CHECK_INTERVAL) {
    lastCheckTime = now;
    checkPendingPayments();
  }
}
