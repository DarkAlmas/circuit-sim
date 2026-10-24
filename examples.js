window.EXAMPLES = {
  'Пример: мигание светодиодом (ESP32)': {
    board: 'esp32',
    parts: [{ id: 'U1', type: 'esp32', x: 0, y: 0, rot: 0 },
      { id: 'R1', type: 'resistor', x: -200, y: -60, rot: 0, props: { R: 220, Pmax: 0.25 } },
      { id: 'D1', type: 'led', x: -320, y: -60, rot: 2, props: { color: 'красный', Vf: 1.8, Imax: 0.02 } }],
    wires: [{ id: 'w1', a: { part: 'U1', pin: '2' }, b: { part: 'R1', pin: 'b' } },
      { id: 'w2', a: { part: 'R1', pin: 'a' }, b: { part: 'D1', pin: 'a' } },
      { id: 'w3', a: { part: 'D1', pin: 'b' }, b: { part: 'U1', pin: 'GND' } }],
    code: `// Мигание светодиодом на GPIO2
#define LED 2

void setup() {
  Serial.begin(115200);
  pinMode(LED, OUTPUT);
}

void loop() {
  digitalWrite(LED, HIGH);
  Serial.println("Вкл");
  delay(500);
  digitalWrite(LED, LOW);
  Serial.println("Выкл");
  delay(500);
}` },
  'Пример: кнопка и светодиод': {
    board: 'esp32',
    parts: [{ id: 'U1', type: 'esp32', x: 0, y: 0, rot: 0 },
      { id: 'R1', type: 'resistor', x: -200, y: -60, rot: 0, props: { R: 220, Pmax: 0.25 } },
      { id: 'D1', type: 'led', x: -320, y: -60, rot: 2, props: { color: 'зелёный', Vf: 2.1, Imax: 0.02 } },
      { id: 'S1', type: 'button', x: -220, y: 60, rot: 0 }],
    wires: [{ id: 'w1', a: { part: 'U1', pin: '2' }, b: { part: 'R1', pin: 'b' } },
      { id: 'w2', a: { part: 'R1', pin: 'a' }, b: { part: 'D1', pin: 'a' } },
      { id: 'w3', a: { part: 'D1', pin: 'b' }, b: { part: 'U1', pin: 'GND' } },
      { id: 'w4', a: { part: 'U1', pin: '4' }, b: { part: 'S1', pin: 'b' } },
      { id: 'w5', a: { part: 'S1', pin: 'a' }, b: { part: 'D1', pin: 'b' } }],
    code: `// Нажми кнопку (во время симуляции) — загорится светодиод
const int BTN = 4;
const int LED = 2;

void setup() {
  pinMode(BTN, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
  Serial.begin(115200);
}

int last = 1;
void loop() {
  int s = digitalRead(BTN);
  digitalWrite(LED, s == LOW ? HIGH : LOW);
  if (s != last) { Serial.println(s == LOW ? "Нажата" : "Отпущена"); last = s; }
  delay(10);
}` },
  'Пример: транзистор включает светодиод от 5 В': {
    board: 'esp32',
    parts: [{ id: 'U1', type: 'esp32', x: 0, y: 0, rot: 0 },
      { id: 'R1', type: 'resistor', x: 200, y: -180, rot: 0, props: { R: 220, Pmax: 0.25 } },
      { id: 'D1', type: 'led', x: 320, y: -180, rot: 0, props: { color: 'жёлтый', Vf: 2.0, Imax: 0.02 } },
      { id: 'Q1', type: 'npn', x: 400, y: -60, rot: 0 },
      { id: 'R2', type: 'resistor', x: 200, y: -80, rot: 0, props: { R: 1000, Pmax: 0.25 } }],
    wires: [{ id: 'w1', a: { part: 'U1', pin: 'VIN' }, b: { part: 'R1', pin: 'a' } },
      { id: 'w2', a: { part: 'R1', pin: 'b' }, b: { part: 'D1', pin: 'a' } },
      { id: 'w3', a: { part: 'D1', pin: 'b' }, b: { part: 'Q1', pin: 'c' } },
      { id: 'w4', a: { part: 'Q1', pin: 'e' }, b: { part: 'U1', pin: 'GND2' } },
      { id: 'w5', a: { part: 'U1', pin: '13' }, b: { part: 'R2', pin: 'a' } },
      { id: 'w6', a: { part: 'R2', pin: 'b' }, b: { part: 'Q1', pin: 'b' } }],
    code: `// GPIO13 через 1 кОм открывает 2N2222, светодиод питается от 5 В (VIN)
void setup() { pinMode(13, OUTPUT); }

void loop() {
  digitalWrite(13, HIGH);
  delay(1000);
  digitalWrite(13, LOW);
  delay(1000);
}` },
};
