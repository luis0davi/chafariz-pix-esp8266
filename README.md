# 💧 Chafariz Eletrônico com Pagamento Pix (ESP8266 + Mercado Pago)

Sistema autônomo de liberação de água para chafariz eletrônico ativado por pagamento Pix com **QR Code Estático impresso na parede**.

---

## 🏗️ Como Funciona o Fluxo

```
[Cliente no Chafariz]
       │
       ▼
Lê o QR Code impresso na parede (fixado ao lado do chafariz)
       │
       ▼
Paga no app do seu banco (Nubank, Itaú, BB, etc.)
       │
       ▼
Mercado Pago recebe o valor instantaneamente
       │
       ▼ (Webhook HTTP)
API Next.js (/api/webhook) valida o pagamento e coloca crédito na fila
       │
       ▼ (Polling a cada 2s)
ESP8266 consulta a API (/api/check_dispense)
       │
       ▼
ESP8266 aciona o Relé com pulsos elétricos ➔ Chafariz libera a água! 🌊
       │
       ▼
ESP8266 confirma a liberação (/api/confirm_dispense)
```

---

## 🔌 1. Esquema de Ligação do Hardware (ESP8266 + Módulo Relé)

| Pino do Módulo Relé | Pino no ESP8266 (NodeMCU / D1 Mini) | Descrição |
| :--- | :--- | :--- |
| **IN** (Sinal) | **D2** (GPIO 4) | Pino de acionamento dos pulsos |
| **VCC** (Alimentação) | **VIN / 5V** | 5V da porta USB |
| **GND** (Terra) | **GND** | Terra comum |

### Ligação da Válvula Solenoide / Bomba do Chafariz no Relé:
- Conecte um fio da fonte de alimentação da válvula no pino **COM** (Comum) do relé.
- Conecte o pino **NO** (Normally Open / Normalmente Aberto) do relé para a válvula solenoide.

---

## 💻 2. Como Subir o Código no ESP8266

Você tem duas opções prontas:

### Opção A: Usando a Arduino IDE (Mais Fácil)
1. Abra o arquivo [esp8266_chafariz.ino](file:///c:/Users/Luis%20Davi/Desktop/esp-pix-main/esp-control/esp8266_chafariz/esp8266_chafariz.ino).
2. Na Arduino IDE, vá em **Ferramentas > Placa** e selecione **NodeMCU 1.0 (ESP-12E Module)** ou **LOLIN(WEMOS) D1 R2 & mini**.
3. Se ainda não tiver as bibliotecas, instale em **Sketch > Incluir Biblioteca > Gerenciar Bibliotecas**:
   - `ArduinoJson` (versão 7.x ou 6.x)
4. No início do código, insira o nome e a senha do seu Wi-Fi:
   ```cpp
   const char* ssid     = "SEU_WIFI_2.4G";
   const char* password = "SUA_SENHA";
   ```
5. O IP do seu computador já está pré-configurado: `http://192.168.2.5:3000/api`.
6. Selecione a porta COM e clique em **Carregar (Upload)**!

### Opção B: Usando o PlatformIO
1. A pasta [esp-control/esp-pix](file:///c:/Users/Luis%20Davi/Desktop/esp-pix-main/esp-control/esp-pix) já está 100% configurada para ESP8266 (`board = nodemcuv2`).
2. Basta compilar e fazer o upload direto pelo PlatformIO.

---

## 💳 3. Passo a Passo: Configuração do Mercado Pago e QR Code na Parede

### Passo 1: Criar a Aplicação no Mercado Pago
1. Acesse o portal: [https://www.mercadopago.com.br/developers](https://www.mercadopago.com.br/developers)
2. Faça login com sua conta do Mercado Pago.
3. No menu superior, clique em **Suas integrações** (ou acesse `Painel do desenvolvedor`).
4. Clique em **Criar aplicação**:
   - Nome: `Chafariz Pix`
   - Tipo de solução: `Pagamentos online` ou `Ponto de venda`.
5. Com a aplicação criada, vá em **Credenciais de Produção** (ou Testes).
6. Copie o seu **Access Token** (ele começa com `APP_USR-...`).
7. Cole no arquivo `next-api/.env.local`:
   ```env
   MERCADO_PAGO_ACCESS_TOKEN=APP_USR-seu-token-aqui
   ```

---

### Passo 2: Gerar o QR Code Estático para Imprimir e Colar na Parede

Para funcionar com o Webhook automático do Mercado Pago e aceitar pagamentos de qualquer banco, você pode gerar o **QR Code de Caixa / Ponto de Venda (PDV)** oficial do Mercado Pago:

1. No painel do Mercado Pago (pelo computador ou app):
   - Vá em **Seu negócio > Lojas e Caixas** (ou [mercadopago.com.br/stores](https://www.mercadopago.com.br/stores)).
   - Cadastre uma Loja (ex: `Chafariz Eletrônico`) e cadastre um **Caixa** (ex: `Caixa 01`).
2. Clique no Caixa cadastrado e clique em **Imprimir QR Code**.
3. O Mercado Pago gera um **PDF com o QR Code oficial** pronto para impressão em placa ou folha adesiva para colocar na parede!
4. **Vantagem**: Esse QR Code aceita Pix de **qualquer banco** do Brasil! Quando o cliente paga, o Mercado Pago identifica o caixa e dispara o Webhook para a nossa API na mesma hora.

---

### Passo 3: Configurar o Webhook no Mercado Pago

O Webhook é o canal pelo qual o Mercado Pago avisa o seu servidor que o Pix caiu.

1. No portal do desenvolvedor do Mercado Pago, abra sua aplicação `Chafariz Pix`.
2. No menu lateral, clique em **Webhooks** (ou **Notificações IPN**).
3. No campo **URL de Notificação**:
   - Durante os testes no seu PC: use uma URL do **ngrok** ou **localtunnel** apontando para a porta 3000 (ex: `https://meu-chafariz.ngrok-free.app/api/webhook`).
   - Em produção: use a URL do seu servidor em nuvem (ex: `https://seu-chafariz.vercel.app/api/webhook`).
4. Em **Eventos**, marque a caixinha:
   - ✅ **Pagamentos** (`payment`)
5. Clique em **Salvar**.

---

## 🧪 4. Como Testar Sem Gastar Dinheiro (Simulador de Bancada)

Criamos um **Painel Web com Simulador** para você testar tudo na sua bancada:

1. Inicie a API no terminal dentro de `next-api`:
   ```bash
   npm run dev
   ```
2. Abra no navegador: [http://localhost:3000](http://localhost:3000) (ou `http://192.168.2.5:3000`).
3. Você verá o Dashboard do Chafariz com:
   - Status em tempo real do ESP8266 (Online / Offline).
   - Botão **"🌊 Simular Pix R$ 1,00 (Liberar Água)"**.
4. Ao clicar no botão, o servidor envia o comando para o ESP8266 acionar os pulsos do relé imediatamente!
