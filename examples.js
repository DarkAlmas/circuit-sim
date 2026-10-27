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
/* v7 starters: ESP32-C3 SuperMini, line-following robot, NRF24 pair */
(function () {
  const S = window.STARTERS, ex = window.EXAMPLES;
  const W = (id, a, ap, b, bp) => ({ id, a: { part: a, pin: ap }, b: { part: b, pin: bp } });
  S.esp32c3 = { kind: 'esp32c3', name: 'ESP32-C3 SuperMini', parts: [{ id: 'U1', type: 'esp32c3', x: 0, y: 0, rot: 0 },
    { id: 'R1', type: 'resistor', x: 200, y: -45, rot: 0, props: { R: 220, Pmax: 0.25 } }, { id: 'D1', type: 'led', x: 320, y: -45, rot: 0, props: { color: 'зелёный', Vf: 2.1, Imax: 0.02 } }],
    wires: [W('w1', 'U1', 'G5', 'R1', 'a'), W('w2', 'R1', 'b', 'D1', 'a'), W('w3', 'D1', 'b', 'U1', 'GND')],
    code: `// ESP32-C3 SuperMini: встроенный синий LED на GPIO8 (горит при LOW) и внешний на GPIO5
#define LED 8
#define EXT 5

void setup() {
  Serial.begin(115200);
  pinMode(LED, OUTPUT);
  pinMode(EXT, OUTPUT);
}

void loop() {
  digitalWrite(LED, LOW);   // встроенный горит
  digitalWrite(EXT, LOW);
  delay(400);
  digitalWrite(LED, HIGH);
  digitalWrite(EXT, HIGH);
  Serial.println("тик");
  delay(400);
}` };
  S.line = { kind: 'line', name: 'Робот по линии', parts: [{ id: 'U1', type: 'esp32c3', x: 0, y: 0, rot: 0 },
    { id: 'S1', type: 'tcrt5000', x: -280, y: 220, rot: 0, props: { refl: 0.9, thr: 0.5 } }, { id: 'S2', type: 'tcrt5000', x: -140, y: 220, rot: 0, props: { refl: 0.9, thr: 0.5 } },
    { id: 'U2', type: 'drv8833', x: 280, y: 0, rot: 0 }, { id: 'M1', type: 'ttmotor', x: 480, y: -80, rot: 0 }, { id: 'M2', type: 'ttmotor', x: 480, y: 80, rot: 0 },
    { id: 'BT1', type: 'liion', x: 280, y: 200, rot: 0, props: { soc: 90 } }],
    wires: [W('w1', 'S1', 'VCC', 'U1', '3V3'), W('w2', 'S1', 'GND', 'U1', 'GND'), W('w3', 'S1', 'D0', 'U1', 'G0'),
      W('w4', 'S2', 'VCC', 'U1', '3V3'), W('w5', 'S2', 'GND', 'U1', 'GND'), W('w6', 'S2', 'D0', 'U1', 'G1'),
      W('w7', 'U1', 'G5', 'U2', 'AIN1'), W('w8', 'U1', 'G6', 'U2', 'AIN2'), W('w9', 'U1', 'G7', 'U2', 'BIN1'), W('w10', 'U1', 'G10', 'U2', 'BIN2'),
      W('w11', 'U2', 'AO1', 'M1', 'a'), W('w12', 'U2', 'AO2', 'M1', 'b'), W('w13', 'U2', 'BO1', 'M2', 'a'), W('w14', 'U2', 'BO2', 'M2', 'b'),
      W('w15', 'BT1', 'p', 'U2', 'VM'), W('w16', 'BT1', 'n', 'U2', 'GND'), W('w17', 'U2', 'GND', 'U1', 'GND')],
    code: `// Робот по линии: ESP32-C3 + 2×TCRT5000 + DRV8833 + 2 мотора TT + Li-ion 103450
// Датчик над белым: D0 = LOW, над чёрной линией: D0 = HIGH. Двигай ползунок «Отражение» у S1/S2.
#define SL 0      // левый датчик (D0)
#define SR 1      // правый датчик (D0)
#define AIN1 5
#define AIN2 6
#define BIN1 7
#define BIN2 10
#define SPEED 220

void motor(int in1, int in2, int sp) {   // sp: -255..255, знак = направление
  if (sp >= 0) { analogWrite(in1, sp); analogWrite(in2, 0); }
  else { analogWrite(in1, 0); analogWrite(in2, -sp); }
}

void setup() {
  Serial.begin(115200);
  pinMode(SL, INPUT); pinMode(SR, INPUT);
  pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT); pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT);
  pinMode(8, OUTPUT);
}

void loop() {
  int l = digitalRead(SL);
  int r = digitalRead(SR);
  if (l && !r) { motor(AIN1, AIN2, -120); motor(BIN1, BIN2, SPEED); }       // линия слева — поворот налево
  else if (!l && r) { motor(AIN1, AIN2, SPEED); motor(BIN1, BIN2, -120); }  // линия справа — направо
  else if (l && r) { motor(AIN1, AIN2, 0); motor(BIN1, BIN2, 0); }          // перекрёсток — стоп
  else { motor(AIN1, AIN2, SPEED); motor(BIN1, BIN2, SPEED); }             // прямо
  digitalWrite(8, (l || r) ? LOW : HIGH);
  delay(20);
}` };
  /* v9: robot car — ESP32 + L298N + 2×TCRT5000 + 2 TT wheels on a chassis, drives on the «Трасса» tab */
  S.car = { kind: 'car', name: 'Робот-машинка (простой)', parts: [{ id: 'U1', type: 'esp32', x: 0, y: 0, rot: 0 },
    { id: 'S1', type: 'tcrt5000', x: -320, y: -60, rot: 0, props: { refl: 0.9, thr: 0.5 } }, { id: 'S2', type: 'tcrt5000', x: -320, y: 120, rot: 0, props: { refl: 0.9, thr: 0.5 } },
    { id: 'D1', type: 'l298n', x: 330, y: -20, rot: 0 }, { id: 'M1', type: 'ttmotor', x: 540, y: -110, rot: 0 }, { id: 'M2', type: 'ttmotor', x: 540, y: 70, rot: 0 },
    { id: 'BT1', type: 'liion', x: 260, y: 200, rot: 0, props: { soc: 95 } }, { id: 'BT2', type: 'liion', x: 400, y: 200, rot: 0, props: { soc: 95 } }],
    wires: [W('w1', 'S1', 'VCC', 'U1', '3V3'), W('w2', 'S1', 'GND', 'U1', 'GND'), W('w3', 'S1', 'D0', 'U1', '32'),
      W('w4', 'S2', 'VCC', 'U1', '3V3'), W('w5', 'S2', 'GND', 'U1', 'GND'), W('w6', 'S2', 'D0', 'U1', '33'),
      W('w7', 'U1', '25', 'D1', 'IN1'), W('w8', 'U1', '26', 'D1', 'IN2'), W('w9', 'U1', '27', 'D1', 'IN3'), W('w10', 'U1', '14', 'D1', 'IN4'),
      W('w11', 'D1', 'OUT1', 'M1', 'a'), W('w12', 'D1', 'OUT2', 'M1', 'b'), W('w13', 'D1', 'OUT3', 'M2', 'a'), W('w14', 'D1', 'OUT4', 'M2', 'b'),
      W('w15', 'BT1', 'p', 'D1', 'VS'), W('w16', 'BT1', 'n', 'BT2', 'p'), W('w17', 'BT2', 'n', 'D1', 'GND'), W('w18', 'D1', 'GND', 'U1', 'GND2')],
    robot: { body: 'rect', mat: 'acrylic', caster: true, speed: 1, mounts: [{ part: 'M1', x: 0, y: 72 }, { part: 'M2', x: 0, y: -72 }, { part: 'S1', x: 78, y: 8 }, { part: 'S2', x: 78, y: -8 },
      { part: 'U1', x: 20, y: 0 }, { part: 'D1', x: -20, y: 0 }, { part: 'BT1', x: -55, y: 22 }, { part: 'BT2', x: -55, y: -22 }], track: { preset: 'oval' }, obstacles: [] },
    code: `// Робот-машинка: ESP32 + L298N + 2×TCRT5000 + 2 мотора TT + 2×Li-ion 103450 (7,4 В)
// Открой вкладку «Трасса» и нажми ▶. Датчик над чёрной линией: D0 = HIGH, над белым: D0 = LOW.
#define SL 32     // левый датчик линии (D0)
#define SR 33     // правый датчик линии (D0)
#define IN1 25    // левый мотор
#define IN2 26
#define IN3 27    // правый мотор
#define IN4 14
#define SPEED 140 // скорость по прямой (0..255)
#define TURN 200  // внешнее колесо в повороте
#define SLOW 40   // внутреннее колесо: плавный поворот (один датчик съехал)
#define BACK 120  // внутреннее колесо назад: резкий разворот (линия потеряна)
// Датчики стоят ближе друг к другу, чем ширина линии: на линии оба видят чёрное.
int last = 0;     // где линия была в последний раз: -1 слева, 1 справа, 0 по центру

void motor(int a, int b, int sp) {   // sp: -255..255, знак = направление
  if (sp >= 0) { analogWrite(a, sp); analogWrite(b, 0); }
  else { analogWrite(a, 0); analogWrite(b, -sp); }
}

void setup() {
  Serial.begin(115200);
  pinMode(SL, INPUT); pinMode(SR, INPUT);
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  Serial.println("Робот по линии: старт");
}

void loop() {
  int l = digitalRead(SL);
  int r = digitalRead(SR);
  if (l && r)        { last = 0;  motor(IN1, IN2, SPEED); motor(IN3, IN4, SPEED); }  // оба на линии (и перекрёсток) — прямо
  else if (l)        { last = -1; motor(IN1, IN2, SLOW);  motor(IN3, IN4, TURN); }   // линия уходит влево — плавно налево
  else if (r)        { last = 1;  motor(IN1, IN2, TURN);  motor(IN3, IN4, SLOW); }   // линия уходит вправо — плавно направо
  else if (last < 0) { motor(IN1, IN2, -BACK); motor(IN3, IN4, TURN); }  // потеряли слева — разворот на месте
  else if (last > 0) { motor(IN1, IN2, TURN); motor(IN3, IN4, -BACK); }  // потеряли справа
  else               { motor(IN1, IN2, SPEED); motor(IN3, IN4, SPEED); }  // ещё не видели линию — вперёд
  delay(5);
}` };
  const nrfWires = (u, r, k) => [W(k + '1', r, 'GND', u, 'GND'), W(k + '2', r, 'VCC', u, '3V3'), W(k + '3', r, 'CE', u, 'G2'), W(k + '4', r, 'CSN', u, 'G7'),
    W(k + '5', r, 'SCK', u, 'G4'), W(k + '6', r, 'MOSI', u, 'G6'), W(k + '7', r, 'MISO', u, 'G5')];
  ex['Пример: NRF24 — передатчик и приёмник (2 × ESP32-C3)'] = { kind: 'esp32c3', parts: [{ id: 'U1', type: 'esp32c3', x: 0, y: 0, rot: 0 }, { id: 'RF1', type: 'nrf24', x: 220, y: 40, rot: 0 },
    { id: 'U2', type: 'esp32c3', x: 600, y: 0, rot: 0 }, { id: 'RF2', type: 'nrf24', x: 820, y: 40, rot: 0 }],
    wires: [...nrfWires('U1', 'RF1', 'a'), ...nrfWires('U2', 'RF2', 'b')],
    code: `// U1 — передатчик. Скетч приёмника U2 выбери в списке над редактором.
#include <SPI.h>
#include <RF24.h>
RF24 radio(2, 7);              // CE, CSN
const byte address[6] = "00001";
int n = 0;

void setup() {
  Serial.begin(115200);
  radio.begin();
  radio.openWritingPipe(address);
  radio.setPALevel(RF24_PA_LOW);
  radio.stopListening();
}

void loop() {
  n++;
  bool ok = radio.write(&n, sizeof(n));
  Serial.println(ok ? "отправлено " + String(n) : "нет ответа");
  delay(500);
}`,
    codes: { U2: `// U2 — приёмник
#include <SPI.h>
#include <RF24.h>
RF24 radio(2, 7);
const byte address[6] = "00001";

void setup() {
  Serial.begin(115200);
  radio.begin();
  radio.openReadingPipe(0, address);
  radio.setPALevel(RF24_PA_LOW);
  radio.startListening();
}

void loop() {
  if (radio.available()) {
    int x = 0;
    radio.read(&x, sizeof(x));
    Serial.println("принято " + String(x));
    digitalWrite(8, x % 2);
  }
  delay(10);
}` } };
  ex['Пример: Робот по линии (ESP32-C3)'] = S.line;
  /* v11: smooth line following — 5×TCRT5000 on analog A0, PD controller, live Kp/Kd/base sliders on «Трасса» */
  const SY = [24, 12, 0, -12, -24], SPN = [32, 33, 34, 35, 36];
  S.pid = { kind: 'car', name: 'Плавная езда (ПИД)', parts: [{ id: 'U1', type: 'esp32', x: 0, y: 0, rot: 0 },
    ...SY.map((y, i) => ({ id: 'S' + (i + 1), type: 'tcrt5000', x: -340, y: -200 + i * 110, rot: 0, props: { refl: 0.9, thr: 0.5 } })),
    { id: 'D1', type: 'l298n', x: 330, y: -20, rot: 0 }, { id: 'M1', type: 'ttmotor', x: 540, y: -110, rot: 0 }, { id: 'M2', type: 'ttmotor', x: 540, y: 70, rot: 0 },
    { id: 'BT1', type: 'liion', x: 260, y: 200, rot: 0, props: { soc: 95 } }, { id: 'BT2', type: 'liion', x: 400, y: 200, rot: 0, props: { soc: 95 } }],
    wires: [...SY.flatMap((y, i) => { const id = 'S' + (i + 1), k = 's' + (i + 1); return [W(k + 'v', id, 'VCC', 'U1', '3V3'), W(k + 'g', id, 'GND', 'U1', 'GND'), W(k + 'a', id, 'A0', 'U1', String(SPN[i]))]; }),
      W('w7', 'U1', '25', 'D1', 'IN1'), W('w8', 'U1', '26', 'D1', 'IN2'), W('w9', 'U1', '27', 'D1', 'IN3'), W('w10', 'U1', '14', 'D1', 'IN4'),
      W('w11', 'D1', 'OUT1', 'M1', 'a'), W('w12', 'D1', 'OUT2', 'M1', 'b'), W('w13', 'D1', 'OUT3', 'M2', 'a'), W('w14', 'D1', 'OUT4', 'M2', 'b'),
      W('w15', 'BT1', 'p', 'D1', 'VS'), W('w16', 'BT1', 'n', 'BT2', 'p'), W('w17', 'BT2', 'n', 'D1', 'GND'), W('w18', 'D1', 'GND', 'U1', 'GND2')],
    robot: { body: 'rect', mat: 'acrylic', caster: true, speed: 1, tune: { kp: 25, kd: 150, base: 180 },
      mounts: [{ part: 'M1', x: 0, y: 72 }, { part: 'M2', x: 0, y: -72 }, ...SY.map((y, i) => ({ part: 'S' + (i + 1), x: 80, y })),
      { part: 'U1', x: 20, y: 0 }, { part: 'D1', x: -20, y: 0 }, { part: 'BT1', x: -55, y: 22 }, { part: 'BT2', x: -55, y: -22 }], track: { preset: 'oval' }, obstacles: [] },
    code: `// Плавная езда: ESP32 + L298N + 5×TCRT5000 (аналоговые A0) + ПД-регулятор
// Почему простая машинка виляет: цифровые датчики дают только «да/нет», и моторы
// переключаются рывками (релейное управление). Здесь датчики аналоговые: мы считаем,
// НАСКОЛЬКО линия сместилась, и поворачиваем ровно настолько, насколько нужно.
// Kp, Kd и базовую скорость можно крутить ползунками на вкладке «Трасса» прямо на ходу.
#define IN1 25    // левый мотор
#define IN2 26
#define IN3 27    // правый мотор
#define IN4 14
#define N 5
#define AWHITE 400   // analogRead над белым (≈0,33 В)
#define ABLACK 2700  // analogRead над чёрной лентой (≈2,2 В)
int PIN[5] = {32, 33, 34, 35, 36};    // S1 (крайний левый) … S5 (крайний правый), шаг 12 мм
float WT[5] = {2, 1, 0, -1, -2};      // вес датчика: + линия слева, − справа
float lastE = 0;
unsigned long lastT = 0;

void motor(int a, int b, float sp) {  // sp: -255..255, знак = направление
  sp = constrain(sp, -255, 255);
  if (sp >= 0) { analogWrite(a, sp); analogWrite(b, 0); }
  else { analogWrite(a, 0); analogWrite(b, -sp); }
}

void setup() {
  Serial.begin(115200);
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  Serial.println("ПД-регулятор: старт");
}

void loop() {
  // 1) где линия: взвешенное среднее «черноты» датчиков (0 — по центру, ±2 — под крайним)
  float sum = 0, ws = 0;
  for (int i = 0; i < N; i++) {
    float b = constrain((analogRead(PIN[i]) - AWHITE) / (float)(ABLACK - AWHITE), 0, 1);
    sum += b; ws += b * WT[i];
  }
  float e;
  if (sum < 0.3) e = lastE > 0 ? 3 : -3;  // линия потеряна — крутим туда, где видели её последний раз
  else e = ws / sum;
  // 2) ПД: P — поворот пропорционально ошибке, D — гасит раскачку (смотрит, как быстро ошибка меняется)
  float kp = param("kp", 25);     // ползунок Kp
  float kd = param("kd", 150);     // ползунок Kd, мс
  float base = param("base", 180); // ползунок «База» — скорость по прямой
  unsigned long t = millis();
  float dt = (t - lastT) / 1000.0;
  if (dt <= 0 || dt > 0.2) dt = 0.01;
  float de = (e - lastE) / dt;
  lastE = e; lastT = t;
  float u = kp * (e + kd / 1000.0 * de);
  // 3) в крутом повороте (линия под крайним датчиком) сбрасываем скорость, на прямой — полный ход
  float v = base * max(0.2, 1 - 0.4 * abs(e));
  // 4) ШИМ моторов = база ± поправка (линия слева, e > 0 → левое колесо медленнее)
  motor(IN1, IN2, v - u);
  motor(IN3, IN4, v + u);
  delay(5);
}` };
  ex['Пример: Плавная езда (ПИД)'] = S.pid;
  ex['Пример: Робот-машинка на трассе (простой)'] = S.car;
  /* v13 «Любая машинка»: 4WD, гусеницы, рулевое (серво), меканум, лабиринт — все на Devices.vehicle */
  const BASE = (more = []) => [{ id: 'U1', type: 'esp32', x: 0, y: 0, rot: 0 }, { id: 'D1', type: 'l298n', x: 330, y: -20, rot: 0 },
    { id: 'BT1', type: 'liion', x: 260, y: 200, rot: 0, props: { soc: 95 } }, { id: 'BT2', type: 'liion', x: 400, y: 200, rot: 0, props: { soc: 95 } }, ...more];
  const BW = [W('w7', 'U1', '25', 'D1', 'IN1'), W('w8', 'U1', '26', 'D1', 'IN2'), W('w9', 'U1', '27', 'D1', 'IN3'), W('w10', 'U1', '14', 'D1', 'IN4'),
    W('w15', 'BT1', 'p', 'D1', 'VS'), W('w16', 'BT1', 'n', 'BT2', 'p'), W('w17', 'BT2', 'n', 'D1', 'GND'), W('w18', 'D1', 'GND', 'U1', 'GND2')];
  const MOT = (id, x, y) => ({ id, type: 'ttmotor', x, y, rot: 0 });
  const TW = (k, drv, o1, o2, m) => [W(k + 'a', drv, o1, m, 'a'), W(k + 'b', drv, o2, m, 'b')];
  const SONAR = (id, x, y, trig, echo) => ({ part: { id, type: 'hcsr04', x, y, rot: 0, props: { dist: 200 } },
    wires: [W(id + 'v', id, 'VCC', 'U1', '3V3'), W(id + 'g', id, 'GND', 'U1', 'GND'), W(id + 't', id, 'TRIG', 'U1', String(trig)), W(id + 'e', id, 'ECHO', 'U1', String(echo))] });
  const I2C = (id, type, x, y, props) => ({ part: { id, type, x, y, rot: 0, props }, wires: [W(id + 'v', id, 'VCC', 'U1', '3V3'), W(id + 'g', id, 'GND', 'U1', 'GND'), W(id + 'c', id, 'SCL', 'U1', '22'), W(id + 'd', id, 'SDA', 'U1', '21')] });
  const MOTOR_FN = `void motor(int a, int b, int sp) {   // sp: -255..255, знак = направление
  sp = constrain(sp, -255, 255);
  if (sp >= 0) { analogWrite(a, sp); analogWrite(b, 0); }
  else { analogWrite(a, 0); analogWrite(b, -sp); }
}`;
  const BODY = { body: 'rect', size: { l: 190, w: 140, rad: 10, r: 90 }, mat: 'acrylic', speed: 1 };
  const MB = [{ part: 'U1', x: 20, y: 0 }, { part: 'D1', x: -20, y: 0 }, { part: 'BT1', x: -55, y: 22 }, { part: 'BT2', x: -55, y: -22 }];
  // 4WD: левая пара на канале A, правая на канале B (моторы одной стороны параллельно) + HC-SR04 спереди → парковка у стены
  { const s = SONAR('U2', -320, -60, 4, 5);
    S.wd4 = { kind: 'car', name: '4WD: парковка у стены', parts: BASE([MOT('M1', 540, -170), MOT('M2', 540, 130), MOT('M3', 640, -170), MOT('M4', 640, 130), s.part]),
      wires: [...BW, ...TW('m1', 'D1', 'OUT1', 'OUT2', 'M1'), ...TW('m3', 'D1', 'OUT1', 'OUT2', 'M3'), ...TW('m2', 'D1', 'OUT3', 'OUT4', 'M2'), ...TW('m4', 'D1', 'OUT3', 'OUT4', 'M4'), ...s.wires],
      robot: { ...BODY, caster: false, drive: '4wd', wheels: [{ x: 55, y: 72, R: 33, part: 'M1' }, { x: 55, y: -72, R: 33, part: 'M2' }, { x: -55, y: 72, R: 33, part: 'M3' }, { x: -55, y: -72, R: 33, part: 'M4' }],
        mounts: [{ part: 'M1', x: 55, y: 72 }, { part: 'M2', x: 55, y: -72 }, { part: 'M3', x: -55, y: 72 }, { part: 'M4', x: -55, y: -72 }, { part: 'U2', x: 92, y: 0 }, ...MB], track: { preset: 'park', start: { x: 400, y: 700, th: 0 } }, obstacles: [{ x: 1730, y: 700, w: 60, h: 400 }] },
      code: `// 4WD: четыре мотора TT, левая пара на канале A L298N, правая — на канале B.
// Задача «Парковка у стены»: подъехать и остановиться в 5–15 см от стены, не ударившись.
// HC-SR04 смотрит вперёд: быстро, потом медленно, потом стоп.
#include <NewPing.h>
#define IN1 25
#define IN2 26
#define IN3 27
#define IN4 14
NewPing sonar(4, 5, 400);   // TRIG = 4, ECHO = 5
${MOTOR_FN}

void setup() {
  Serial.begin(115200);
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
}

void loop() {
  int cm = sonar.ping_cm();
  int sp = 0;
  if (cm > 40) sp = 160;        // далеко — полный ход
  else if (cm > 11) sp = 70;    // близко — подкрадываемся
  else sp = 0;                  // 10 см — стоим
  motor(IN1, IN2, sp);
  motor(IN3, IN4, sp);
  Serial.println("до стены " + String(cm) + " см");
  delay(20);
}` }; }
  // гусеницы + HC-SR04 (вперёд-влево) + VL53L0X (вперёд-вправо) → объезд препятствий
  { const s = SONAR('U2', -320, -60, 4, 5), v = I2C('U3', 'vl53l0x', -320, 140, { mm: 500 });
    S.tracks = { kind: 'car', name: 'Гусеницы: объезд препятствий', parts: BASE([MOT('M1', 540, -110), MOT('M2', 540, 70), s.part, v.part]),
      wires: [...BW, ...TW('m1', 'D1', 'OUT1', 'OUT2', 'M1'), ...TW('m2', 'D1', 'OUT3', 'OUT4', 'M2'), ...s.wires, ...v.wires],
      robot: { ...BODY, caster: false, drive: 'tracks', wheels: [{ x: 0, y: 78, R: 20, grip: 0.3, track: true, part: 'M1' }, { x: 0, y: -78, R: 20, grip: 0.3, track: true, part: 'M2' }],
        mounts: [{ part: 'M1', x: 0, y: 78 }, { part: 'M2', x: 0, y: -78 }, { part: 'U2', x: 90, y: 30, dir: 0.6 }, { part: 'U3', x: 90, y: -30, dir: -0.6 }, ...MB],
        track: { preset: 'avoid', start: { x: 200, y: 700, th: 0 } }, obstacles: [{ x: 700, y: 640, w: 160, h: 160 }, { x: 1150, y: 1000, w: 200, h: 160 }, { x: 1250, y: 350, w: 160, h: 200 }, { x: 1650, y: 750, w: 160, h: 220 }] },
      code: `// Гусеницы: две ленты (сцепление меньше, чем у резины — в повороте их заносит).
// Задача «Объезд препятствий»: проехать 3 м и ни во что не врезаться.
// HC-SR04 смотрит вперёд-влево (+35°), VL53L0X — вперёд-вправо (−35°): что ближе, от того и отворачиваем.
#include <NewPing.h>
#include <VL53L0X.h>
#define IN1 25
#define IN2 26
#define IN3 27
#define IN4 14
NewPing sonar(4, 5, 400);
VL53L0X lox;
bool turning = false;
int dir = 1;
${MOTOR_FN}

void setup() {
  Serial.begin(115200);
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  Wire.begin();
  lox.init();
}

void loop() {
  int left = sonar.ping_cm() * 10;            // мм (0 = эхо не вернулось)
  if (left == 0) left = 4000;
  int right = lox.readRangeSingleMillimeters(); // мм
  if (!turning && (left < 400 || right < 400)) { turning = true; dir = left > right ? 1 : -1; }
  if (turning && left > 600 && right > 600) turning = false;   // свободно с запасом — едем дальше
  if (turning) { motor(IN1, IN2, -160 * dir); motor(IN3, IN4, 160 * dir); }   // dir 1 = влево
  else { motor(IN1, IN2, 130); motor(IN3, IN4, 130); }
  delay(10);
}` }; }
  // рулевое: задний привод (M1+M2 вместе) + серво на передней оси, едет по линии
  S.steer = { kind: 'car', name: 'Рулевое (серво) по линии', parts: BASE([MOT('M1', 540, -110), MOT('M2', 540, 70), { id: 'M3', type: 'servo', x: 560, y: 260, rot: 0 },
      { id: 'S1', type: 'tcrt5000', x: -320, y: -60, rot: 0, props: { refl: 0.9, thr: 0.5 } }, { id: 'S2', type: 'tcrt5000', x: -320, y: 120, rot: 0, props: { refl: 0.9, thr: 0.5 } }]),
    wires: [...BW, ...TW('m1', 'D1', 'OUT1', 'OUT2', 'M1'), ...TW('m2', 'D1', 'OUT3', 'OUT4', 'M2'),
      W('sv', 'M3', 'VCC', 'D1', '5V'), W('sg', 'M3', 'GND', 'U1', 'GND'), W('ss', 'M3', 'SIG', 'U1', '13'),
      W('w1', 'S1', 'VCC', 'U1', '3V3'), W('w2', 'S1', 'GND', 'U1', 'GND'), W('w3', 'S1', 'D0', 'U1', '32'), W('w4', 'S2', 'VCC', 'U1', '3V3'), W('w5', 'S2', 'GND', 'U1', 'GND'), W('w6', 'S2', 'D0', 'U1', '33')],
    robot: { ...BODY, caster: false, drive: 'steer', wheels: [{ x: -60, y: 72, R: 33, part: 'M1' }, { x: -60, y: -72, R: 33, part: 'M2' }, { x: 60, y: 72, R: 33, driven: false, steer: true }, { x: 60, y: -72, R: 33, driven: false, steer: true }],
      mounts: [{ part: 'M1', x: -60, y: 72 }, { part: 'M2', x: -60, y: -72 }, { part: 'M3', x: 60, y: 0 }, { part: 'S1', x: 90, y: 8 }, { part: 'S2', x: 90, y: -8 }, ...MB], track: { preset: 'oval' }, obstacles: [] },
    code: `// Рулевое как у машины: задние колёса крутят моторы, передние поворачивает серво SG90.
// Серво 90° — прямо, больше — влево, меньше — вправо (до ±40°).
#include <Servo.h>
#define SL 32
#define SR 33
#define IN1 25
#define IN2 26
#define IN3 27
#define IN4 14
Servo steer;
int last = 0;
${MOTOR_FN}

void setup() {
  Serial.begin(115200);
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  steer.attach(13);
  steer.write(90);
}

void loop() {
  bool l = digitalRead(SL) == HIGH;   // HIGH = датчик над чёрной линией
  bool r = digitalRead(SR) == HIGH;
  int sp = 130;
  if (l && r) { steer.write(90); last = 0; }
  else if (l) { steer.write(118); last = 1; }      // линия слева — руль влево
  else if (r) { steer.write(62); last = -1; }      // линия справа — руль вправо
  else { steer.write(last >= 0 ? 130 : 50); sp = 100; } // потеряли — круто туда, где была
  motor(IN1, IN2, sp);
  motor(IN3, IN4, sp);
  delay(10);
}` };
  // меканум: 4 мотора на двух L298N, едет квадратом: вперёд, влево боком, назад, вправо боком
  S.mec = { kind: 'car', name: 'Меканум: едем боком', parts: [...BASE([MOT('M1', 540, -170), MOT('M2', 540, 130), MOT('M3', 640, -170), MOT('M4', 640, 130)]), { id: 'D2', type: 'l298n', x: 330, y: 330, rot: 0 }],
    wires: [...BW, ...TW('m1', 'D1', 'OUT1', 'OUT2', 'M1'), ...TW('m2', 'D1', 'OUT3', 'OUT4', 'M2'), ...TW('m3', 'D2', 'OUT1', 'OUT2', 'M3'), ...TW('m4', 'D2', 'OUT3', 'OUT4', 'M4'),
      W('x1', 'U1', '16', 'D2', 'IN1'), W('x2', 'U1', '17', 'D2', 'IN2'), W('x3', 'U1', '18', 'D2', 'IN3'), W('x4', 'U1', '19', 'D2', 'IN4'),
      W('x5', 'BT1', 'p', 'D2', 'VS'), W('x6', 'BT2', 'n', 'D2', 'GND')],
    robot: { ...BODY, caster: false, drive: 'mecanum', wheels: [{ x: 60, y: 72, R: 30, roller: -0.7854, part: 'M1' }, { x: 60, y: -72, R: 30, roller: 0.7854, part: 'M2' }, { x: -60, y: 72, R: 30, roller: 0.7854, part: 'M3' }, { x: -60, y: -72, R: 30, roller: -0.7854, part: 'M4' }],
      mounts: [{ part: 'M1', x: 60, y: 72 }, { part: 'M2', x: 60, y: -72 }, { part: 'M3', x: -60, y: 72 }, { part: 'M4', x: -60, y: -72 }, { part: 'D2', x: -20, y: 40 }, ...MB],
      track: { preset: '', strokes: [], start: { x: 700, y: 450, th: 0 } }, obstacles: [] },
    code: `// Меканум: у каждого колеса ролики под 45°. Если левые и правые колёса крутить «накрест»,
// машинка едет боком, не поворачиваясь. FL, FR — D1; RL, RR — D2.
#define FL1 25
#define FL2 26
#define FR1 27
#define FR2 14
#define RL1 16
#define RL2 17
#define RR1 18
#define RR2 19
${MOTOR_FN}

void drive(int fl, int fr, int rl, int rr) {
  motor(FL1, FL2, fl); motor(FR1, FR2, fr); motor(RL1, RL2, rl); motor(RR1, RR2, rr);
}

void loop() {
  drive(150, 150, 150, 150);     Serial.println("вперёд");       delay(1500);
  drive(-150, 150, 150, -150);   Serial.println("влево боком");   delay(1500);
  drive(-150, -150, -150, -150); Serial.println("назад");         delay(1500);
  drive(150, -150, -150, 150);   Serial.println("вправо боком");  delay(1500);
}

void setup() {
  Serial.begin(115200);
  int pins[8] = {FL1, FL2, FR1, FR2, RL1, RL2, RR1, RR2};
  for (int i = 0; i < 8; i++) pinMode(pins[i], OUTPUT);
}` };
  // лабиринт: HC-SR04 вперёд + VL53L0X вправо + MPU6050 (гироскоп) для точных поворотов на 90°
  { const s = SONAR('U2', -320, -60, 4, 5), v = I2C('U3', 'vl53l0x', -320, 140, { mm: 500 }), g = I2C('U4', 'mpu6050', -320, 300, { pitch: 0, roll: 0, acc: 0, gz: 0 });
    S.maze = { kind: 'car', name: 'Лабиринт: сонар + VL53 + гироскоп', parts: BASE([MOT('M1', 540, -110), MOT('M2', 540, 70), s.part, v.part, g.part]),
      wires: [...BW, ...TW('m1', 'D1', 'OUT1', 'OUT2', 'M1'), ...TW('m2', 'D1', 'OUT3', 'OUT4', 'M2'), ...s.wires, ...v.wires, ...g.wires],
      robot: { ...BODY, caster: true, drive: 'diff', wheels: [{ x: 0, y: 72, R: 33, part: 'M1' }, { x: 0, y: -72, R: 33, part: 'M2' }, { x: -72, y: 0, R: 10, driven: false, caster: true }],
        mounts: [{ part: 'M1', x: 0, y: 72 }, { part: 'M2', x: 0, y: -72 }, { part: 'U2', x: 92, y: 0 }, { part: 'U3', x: 40, y: -60, dir: -1.57 }, { part: 'U4', x: 0, y: 30 }, ...MB],
        track: { preset: 'maze', start: { x: 220, y: 220, th: 0 } }, obstacles: [{ x: 200, y: 450, w: 400, h: 40 }, { x: 600, y: 450, w: 400, h: 40 }, { x: 1000, y: 450, w: 400, h: 40 }, { x: 1400, y: 450, w: 400, h: 40 }, { x: 600, y: 900, w: 400, h: 40 }, { x: 1000, y: 900, w: 400, h: 40 }, { x: 1400, y: 900, w: 400, h: 40 }, { x: 1800, y: 900, w: 400, h: 40 }] },
      code: `// Лабиринт по правилу «правой руки»: едем прямо, пока спереди свободно;
// у стены смотрим направо: свободно — поворот направо, иначе — налево.
// Поворот ровно на 90° считаем по гироскопу MPU-6050: угол = сумма (скорость поворота × время).
#include <NewPing.h>
#include <VL53L0X.h>
#include <MPU6050.h>
#define IN1 25
#define IN2 26
#define IN3 27
#define IN4 14
NewPing sonar(4, 5, 400);
VL53L0X lox;
MPU6050 mpu;
${MOTOR_FN}

float yaw = 0, target = 0;          // курс по гироскопу, ° (+ влево)
unsigned long t0 = 0;

void gyro() {                       // угол = сумма (скорость поворота × время)
  unsigned long n = millis();
  yaw += mpu.getRotationZ() / 131.0 * (n - t0) / 1000.0;
  t0 = n;
}

void turn(float deg) {              // + влево, − вправо: поворот на месте до курса target
  target += deg;
  while (abs(target - yaw) > 3) {
    gyro();
    int sp = constrain((target - yaw) * 3, -90, 90);
    if (sp > 0 && sp < 45) sp = 45;
    if (sp < 0 && sp > -45) sp = -45;
    motor(IN1, IN2, -sp);
    motor(IN3, IN4, sp);
    delay(5);
  }
  motor(IN1, IN2, 0); motor(IN3, IN4, 0);
  for (int i = 0; i < 30; i++) { gyro(); delay(5); }   // ждём, пока машинка замрёт
}

void setup() {
  Serial.begin(115200);
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  Wire.begin();
  lox.init();
  mpu.initialize();
  t0 = millis();
}

void loop() {
  int front = sonar.ping_cm();
  gyro();
  if (front == 0 || front > 12) {   // 0 = эхо не вернулось (слишком далеко)
    int corr = (target - yaw) * 6;    // держим курс: увело вправо — левое колесо медленнее
    motor(IN1, IN2, 140 - corr);
    motor(IN3, IN4, 140 + corr);
    delay(10);
    return;
  }
  motor(IN1, IN2, 0); motor(IN3, IN4, 0);
  for (int i = 0; i < 40; i++) { gyro(); delay(5); }
  int right = lox.readRangeSingleMillimeters();
  Serial.println("стена! справа " + String(right) + " мм");
  if (right > 350) turn(-90); else turn(90);
}` }; }
  ex['Пример: 4WD — парковка у стены'] = S.wd4;
  ex['Пример: Гусеницы — объезд препятствий'] = S.tracks;
  ex['Пример: Рулевое (серво) по линии'] = S.steer;
  ex['Пример: Меканум — едем боком'] = S.mec;
  ex['Пример: Лабиринт (сонар + VL53 + гироскоп)'] = S.maze;
  ex['Пример: Повышающий преобразователь 3,7 → 12 В'] = { kind: 'analog', parts: [{ id: 'BT1', type: 'liion', x: -200, y: 0, rot: 0, props: { soc: 80 } }, { id: 'U1', type: 'boost', x: 0, y: 0, rot: 0, props: { Vout: 12 } },
    { id: 'R1', type: 'resistor', x: 200, y: 0, rot: 1, props: { R: 120, Pmax: 2 } }],
    wires: [W('w1', 'BT1', 'p', 'U1', 'IN+'), W('w2', 'BT1', 'n', 'U1', 'IN-'), W('w3', 'U1', 'OUT+', 'R1', 'a'), W('w4', 'U1', 'OUT-', 'R1', 'b')], code: '' };
  ex['Пример: Uno и HC-SR04'] = { kind: 'uno', name: 'Uno и HC-SR04',
    parts: [{ id: 'U1', type: 'uno', x: 0, y: 0, rot: 0 }, { id: 'U2', type: 'hcsr04', x: -240, y: -20, rot: 0, props: { dist: 87 } }],
    wires: [W('w1', 'U1', '5V', 'U2', 'VCC'), W('w2', 'U1', 'GND', 'U2', 'GND'), W('w3', 'U1', 'D7', 'U2', 'TRIG'), W('w4', 'U1', 'D6', 'U2', 'ECHO')],
    code: `// HC-SR04: Trig = D7, Echo = D6, Vcc = 5V, Gnd = GND. Расстояние печатает sonar.distanceCm().
#include <NewPing.h>
NewPing sonar(7, 6, 400);

void setup() {
  Serial.begin(9600);
}

void loop() {
  float cm = sonar.distanceCm();
  if (cm == cm && cm >= 2) Serial.println("расстояние " + String(cm) + " см");
  delay(50);
}` };
})();
/* FastLED writes the same WS2812 strip as Adafruit_NeoPixel (D.strip / strip8). */
(function () {
  const W = (id, a, ap, b, bp) => ({ id, a: { part: a, pin: ap }, b: { part: b, pin: bp } });
  window.EXAMPLES['Пример: FastLED и лента WS2812'] = { kind: 'uno', name: 'FastLED: лента 8 LED',
    parts: [{ id: 'U1', type: 'uno', x: 0, y: 0, rot: 0 }, { id: 'H1', type: 'strip8', x: -280, y: -40, rot: 0 }],
    wires: [W('w1', 'U1', '5V', 'H1', 'VCC'), W('w2', 'U1', 'GND', 'H1', 'GND'), W('w3', 'U1', 'D6', 'H1', 'DIN')],
    code: `// FastLED, лента 8× WS2812B. Uno: DIN = D6, питание 5V и GND.
// На ESP32 тот же скетч: DATA_PIN — номер GPIO, к которому подключён DIN.
#include <FastLED.h>

#define NUM_LEDS 8
#define DATA_PIN 6

CRGB leds[NUM_LEDS];

void setup() {
  FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(80);
  FastLED.clear();
}

int t = 0;
void loop() {
  for (int i = 0; i < NUM_LEDS; i++) leds[i] = CRGB::Black;
  leds[t % NUM_LEDS] = CRGB::Red;
  leds[(t + 1) % NUM_LEDS] = CRGB(0, 180, 0);
  leds[(t + 2) % NUM_LEDS] = CHSV(160, 255, 255);
  FastLED.show();
  t++;
  delay(80);
}` };
})();
