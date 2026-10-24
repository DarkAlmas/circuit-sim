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

/* v5 starters for the «Новый проект» chooser; also listed among examples */
(function () {
  const W = (id, a, ap, b, bp) => ({ id, a: { part: a, pin: ap }, b: { part: b, pin: bp } });
  const led = (id, x, y, color) => ({ id, type: 'led', x, y, rot: 2, props: { color: color || 'красный', Vf: 1.8, Imax: 0.02 } });
  const res = (id, x, y, R) => ({ id, type: 'resistor', x, y, rot: 0, props: { R: R || 220, Pmax: 0.25 } });
  const ex = window.EXAMPLES;
  const pick = n => JSON.parse(JSON.stringify(ex[n]));
  const S = {
    esp32: { ...pick('Пример: мигание светодиодом (ESP32)'), kind: 'esp32' },
    esp8266: { ...pick('Пример: кнопка и светодиод'), kind: 'esp8266' },
    uno: { kind: 'uno', name: 'Uno: матрица 8×8',
      parts: [{ id: 'U1', type: 'uno', x: 0, y: 0, rot: 0 }, { id: 'H1', type: 'max7219', x: 260, y: -60, rot: 0 }],
      wires: [W('w1', 'U1', '5V', 'H1', 'VCC'), W('w2', 'U1', 'GND', 'H1', 'GND'), W('w3', 'U1', 'D11', 'H1', 'DIN'), W('w4', 'U1', 'D10', 'H1', 'CS'), W('w5', 'U1', 'D13', 'H1', 'CLK')],
      code: `// Бегущая точка и рамка на матрице MAX7219
LedControl lc = LedControl(11, 13, 10, 1);

void setup() {
  lc.shutdown(0, false);
  lc.setIntensity(0, 8);
  lc.clearDisplay(0);
}

int t = 0;
void loop() {
  matrix.clear();
  for (int i = 0; i < 8; i++) { matrix.set(i, 0, 1); matrix.set(i, 7, 1); matrix.set(0, i, 1); matrix.set(7, i, 1); }
  matrix.set(1 + t % 6, 1 + (t / 6) % 6, 1);
  matrix.show();
  t++;
  delay(120);
}` },
    attiny: { kind: 'attiny', name: 'ATtiny85 на макетке',
      parts: [{ id: 'BB1', type: 'breadboard', x: 0, y: 0, rot: 0 }, { id: 'U1', type: 'attiny85', x: 0, y: 0, rot: 0 }, { id: 'V1', type: 'dc', x: -260, y: 0, rot: 0, props: { V: 5, rInt: 0.1 } },
        res('R1', 120, -140), led('D1', 240, -140)],
      wires: [W('w1', 'V1', 'p', 'U1', 'VCC'), W('w2', 'V1', 'n', 'U1', 'GND'), W('w3', 'U1', 'PB0', 'R1', 'a'), W('w4', 'R1', 'b', 'D1', 'a'), W('w5', 'D1', 'b', 'V1', 'n')],
      code: `// ATtiny85: мигание на PB0 (ножка 5)
void setup() { pinMode(0, OUTPUT); }
void loop() { digitalWrite(0, HIGH); delay(300); digitalWrite(0, LOW); delay(300); }` },
    pico: { kind: 'pico', name: 'Pico: кольцо WS2812',
      parts: [{ id: 'U1', type: 'pico', x: 0, y: 0, rot: 0 }, { id: 'H1', type: 'ring16', x: -240, y: -60, rot: 0 }],
      wires: [W('w1', 'U1', '3V3', 'H1', 'VCC'), W('w2', 'U1', 'GND', 'H1', 'GND'), W('w3', 'U1', 'GP0', 'H1', 'DIN')],
      code: `// Радуга по кольцу из 16 светодиодов WS2812
Adafruit_NeoPixel strip(16, 0, NEO_GRB + NEO_KHZ800);

void setup() { strip.begin(); strip.setBrightness(120); }

int h = 0;
void loop() {
  for (int i = 0; i < strip.numPixels(); i++) strip.setPixelColor(i, strip.ColorHSV(h + i * 4096));
  strip.show();
  h += 1024;
  delay(40);
}` },
    opi: { kind: 'opi', name: 'Orange Pi: Python + HDMI',
      parts: [{ id: 'U1', type: 'opi', x: 0, y: 0, rot: 0 }, { id: 'M1', type: 'monitor', x: 420, y: -60, rot: 0 }, res('R1', -220, -40), led('D1', -340, -40, 'зелёный')],
      wires: [W('w1', 'U1', 'HDMI', 'M1', 'HDMI'), W('w2', 'U1', 'G0', 'R1', 'b'), W('w3', 'R1', 'a', 'D1', 'a'), W('w4', 'D1', 'b', 'U1', 'GND')],
      code: `# Orange Pi: светодиод на G0 и анимация на мониторе 1920x1080
import time
import OPi.GPIO as GPIO

GPIO.setmode(GPIO.BOARD)
GPIO.setup(0, GPIO.OUT)
x = 0
frame = 0
while True:
    screen.fill(rgb(10, 14, 30))
    screen.text(80, 60, "Привет с Orange Pi!", "#ffffff", 96)
    screen.circle(x, 600, 120, rgb(63, 179, 127))
    screen.text(80, 960, f"кадр {frame}", "#8a94a8", 48)
    screen.show()
    GPIO.output(0, frame % 20 < 10)
    x = (x + 24) % 1920
    frame += 1
    time.sleep(0.05)
` },
    analog: { kind: 'analog', name: 'Чистая электроника',
      parts: [{ id: 'B1', type: 'battery', x: -200, y: 0, rot: 0, props: { rInt: 1.5 } }, res('R1', 0, -80, 470), led('D1', 160, 0)],
      wires: [W('w1', 'B1', 'p', 'R1', 'a'), W('w2', 'R1', 'b', 'D1', 'a'), W('w3', 'D1', 'b', 'B1', 'n')], code: '' },
    empty: { kind: 'empty', name: 'Пустой', parts: [], wires: [], code: '' },
  };
  S.opi.parts[3].rot = 0; S.opi.wires[2] = W('w3', 'R1', 'a', 'D1', 'a');
  window.STARTERS = S;
  ex['Пример: Uno и матрица 8×8'] = S.uno; ex['Пример: Pico и кольцо WS2812'] = S.pico; ex['Пример: Orange Pi, Python и HDMI'] = S.opi; ex['Пример: ATtiny85 на макетке'] = S.attiny;
})();
