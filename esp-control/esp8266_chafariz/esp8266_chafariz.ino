/*
  ========================================================================
  PROJETO: Chafariz Eletrônico com Pagamento Pix (Mercado Pago + ESP8266)
  MICROCONTROLADOR: ESP8266 (NodeMCU, Wemos D1 Mini ou ESP-12)
  ATUADOR: Módulo Relé (para ligar a válvula solenoide / bomba)
  ========================================================================
*/

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

// ========================================================================
// 1. CONFIGURAÇÕES DE REDE E SERVIDOR
// ========================================================================
// IMPORTANTE: Insira o nome e a senha da sua rede Wi-Fi (apenas 2.4 GHz)
const char* ssid     = "Solucoes_Net_619";
const char* password = "8893821370";



// URL da sua API na Vercel (com /api no final):
const char* backend = "https://chafariz-pix-esp8266.vercel.app/api";

// ========================================================================
// 2. CONFIGURAÇÕES DE HARDWARE (PINOS)
// ========================================================================
// No NodeMCU e Wemos D1 Mini: D2 corresponde ao GPIO 4 (pino super estável)
#define RELAY_PIN 4 

// LED de status (LED azul embutido no ESP8266, no pino D4 / GPIO 2)
#define STATUS_LED 2

// Configuração do seu Módulo Relé:
// A maioria dos módulos relé azuis do Arduino acionam com nível LOW (Active LOW = true).
// Se o seu módulo acionar com nível HIGH, altere para false.
#define RELAY_ACTIVE_LOW true

// ========================================================================
// 3. VARIÁVEIS GLOBAIS E TIMERS
// ========================================================================
unsigned long lastCheckTime = 0;
const unsigned long CHECK_INTERVAL = 2000; // Consulta a API a cada 2 segundos

// Inicializa o relé desligado com segurança
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
    digitalWrite(STATUS_LED, LOW); // Liga o LED azul
    delay(durationMs);

    Serial.printf("<<< Pulso %d de %d: DESLIGANDO relé...\n", i + 1, pulses);
    setRelayState(false);
    digitalWrite(STATUS_LED, HIGH); // Desliga o LED azul

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

  http.setTimeout(10000); // 10s timeout para estabilidade

  if (url.startsWith("https://")) {
    sClient.setInsecure();
    sClient.setBufferSizes(1024, 1024); // Otimiza a memória RAM do ESP8266
    http.begin(sClient, url);
  } else {
    http.begin(client, url);
  }

  http.addHeader("Content-Type", "application/json");

  String payload = "{\"id\":\"" + paymentId + "\"}";
  int httpCode = http.POST(payload);

  if (httpCode == 200) {
    Serial.println("✅ Pagamento confirmado no servidor. Fila limpa!");
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

  bool shouldDispense = false;
  String paymentId = "";
  float amount = 0.0;
  int pulses = 2;
  int durationMs = 1000;
  int intervalMs = 500;

  // Bloco isolado para liberar a RAM do SSL imediatamente
  {
    WiFiClient client;
    WiFiClientSecure sClient;
    HTTPClient http;
    String url = String(backend) + "/check_dispense";

    http.setTimeout(8000);

    if (url.startsWith("https://")) {
      sClient.setInsecure();
      sClient.setBufferSizes(1024, 1024); // Reduz uso de RAM
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
        shouldDispense = doc["dispense"] | false;
        if (shouldDispense) {
          paymentId = doc["id"].as<String>();
          amount = doc["amount"] | 0.0;
          pulses = doc["pulses"] | 2;
          durationMs = doc["duration_ms"] | 1000;
          intervalMs = doc["interval_ms"] | 500;
        }
      }
    } else {
      Serial.printf("⚠️ Falha ao consultar API (HTTP %d).\n", httpCode);
    }

    http.end(); // 🔌 FECHA A CONEXÃO E LIBERA A RAM ANTES DE QUALQUER OUTRA AÇÃO!
  }

  // Se houver pagamento pendente, agora temos 100% da RAM livre para agir
  if (shouldDispense) {
    Serial.printf("\n💰 NOVO PAGAMENTO IDENTIFICADO! ID: %s | Valor: R$ %.2f\n", paymentId.c_str(), amount);
    
    // 1. Aciona o relé
    triggerRelay(pulses, durationMs, intervalMs);

    // 2. Confirma para o servidor com a memória limpa (evita erro -1)
    confirmDispense(paymentId);
  }
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

  // Configuração dos pinos
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(STATUS_LED, OUTPUT);

  // Garante que o relé começa DESLIGADO
  setRelayState(false);
  digitalWrite(STATUS_LED, HIGH); // LED apagado

  // Conexão Wi-Fi
  Serial.printf("Conectando ao Wi-Fi '%s'", ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    digitalWrite(STATUS_LED, !digitalRead(STATUS_LED)); // Pisca LED conectando
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(STATUS_LED, HIGH); // Apaga LED
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
// 8. LOOP PRINCIPAL
// ========================================================================
void loop() {
  // Mantém a conexão Wi-Fi ativa
  if (WiFi.status() != WL_CONNECTED) {
    Serial.print("Reconectando Wi-Fi...");
    WiFi.reconnect();
    delay(3000);
    return;
  }

  // Faz polling na API no intervalo configurado
  unsigned long now = millis();
  if (now - lastCheckTime >= CHECK_INTERVAL) {
    lastCheckTime = now;
    checkPendingPayments();
  }
}
