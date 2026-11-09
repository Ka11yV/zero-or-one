# 기술 설계서 — Zero or One: Logic (논리 회로 퍼즐 웹게임)

> 버전 0.1 · 2026-11-08 · 짝 문서: [GAME_DESIGN.md](./GAME_DESIGN.md)

---

## 1. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 빌드 | **Vite** | 빠른 개발 서버, 정적 빌드 → GitHub Pages/Netlify 등 어디든 배포 |
| 언어 | **TypeScript (strict)** | 회로/레벨 데이터 모델이 복잡 → 타입 안정성 |
| 렌더링 | **HTML Canvas 2D** | 수천 개 게이트·배선도 부드럽게. DOM/SVG보다 빠름 |
| UI 패널 | 바닐라 TS + CSS | 패널 수가 적어 프레임워크 불필요, 번들 작게 |
| 테스트 | **Vitest** | Vite와 통합. 엔진·레벨 정답 자동 검증 |
| 저장 | localStorage (+ JSON 내보내기) | 서버 불필요 |
| 품질 | ESLint + Prettier | — |

서버 없음. 완전한 정적 웹앱.

---

## 2. 아키텍처

```
┌─────────────────────────── UI 레이어 ───────────────────────────┐
│  ui/ (패널·맵·카드·힌트)        editor/ (캔버스 편집기)        │
└───────────────┬───────────────────────────┬─────────────────────┘
                │ 명령/이벤트               │ 편집 결과(Circuit)
                ▼                           ▼
┌────────────── 게임 레이어 ──────────────┐   ┌── i18n/ ──┐
│ levels/ (레벨 데이터) · game/ (진행 상태)│   │ t(key)    │
│ storage/ (저장·불러오기)                 │   └───────────┘
└───────────────┬──────────────────────────┘
                ▼  Circuit + ChipLibrary
┌────────────── 시뮬레이션 엔진 (sim/, 순수 TS, DOM 의존 X) ─────────────┐
│ netlist.ts (평탄화) → simulator.ts (이벤트 기반) → verify.ts (테스트)  │
└─────────────────────────────────────────────────────────────────────────┘
```

**원칙:** `sim/`은 브라우저 API를 전혀 쓰지 않는다 → Node(Vitest)에서 그대로 테스트, 필요 시 Web Worker로 이동 가능.

---

## 3. 폴더 구조

```
logic-game/
├─ index.html
├─ package.json  vite.config.ts  tsconfig.json
├─ docs/                 GAME_DESIGN.md, TECH_DESIGN.md
├─ src/
│  ├─ main.ts            앱 진입, 라우팅(맵 ↔ 레벨 ↔ 샌드박스)
│  ├─ sim/
│  │  ├─ types.ts        ChipDef, Instance, Wire, PinRef, Net
│  │  ├─ builtins.ts     NAND, INPUT, OUTPUT, CLOCK, CONST, SPLIT, MERGE, (I/O 장치)
│  │  ├─ netlist.ts      칩 정의 → 평탄한 넷리스트 컴파일
│  │  ├─ simulator.ts    이벤트 기반 시뮬레이터, 클럭, 발진 감지
│  │  ├─ functional.ts   검증된 칩의 기능 모델(고속 대체)
│  │  ├─ verify.ts       진리표/시퀀스 테스트 실행, 진리표 생성
│  │  └─ metrics.ts      NAND 개수, 최대 지연 깊이 계산
│  ├─ editor/
│  │  ├─ camera.ts       팬·줌, 좌표 변환
│  │  ├─ renderer.ts     그리드, 칩, 핀, 배선(신호 색), 버스 라벨
│  │  ├─ input.ts        마우스/키보드/터치 → 편집 명령
│  │  ├─ doc.ts          편집 문서 + 순수 편집 연산(연결·삭제·이름변경·복사/붙여넣기·범위선택)
│  │  ├─ geometry.ts     칩/핀 배치, 직교 배선 경로, 도형 계산
│  │  ├─ hit.ts          히트 테스트 (핀 > 부품 > 선)
│  │  ├─ history.ts      스냅샷 기반 undo/redo
│  │  └─ editor.ts       포인터/키보드 처리, 시뮬레이션 루프, 렌더 루프
│  ├─ game/
│  │  └─ levelDoc.ts     레벨 시작 회로(고정 입출력 핀 배치)
│  ├─ levels/
│  │  ├─ index.ts        챕터/레벨 레지스트리
│  │  ├─ types.ts        Level/Chapter 타입 (한/영 텍스트를 레벨 안에 함께 정의)
│  │  └─ ch0.ts … ch8.ts 레벨 정의 + 참조 정답(solution 함수, 테스트 전용)
│  ├─ ui/
│  │  ├─ toolbox.ts  briefing.ts  truthTable.ts  timingChart.ts
│  │  ├─ hintPanel.ts  principleCard.ts  codex.ts(도감)  chapterMap.ts
│  │  ├─ memoryViewer.ts  romEditor.ts(어셈블러)
│  │  └─ styles.css
│  ├─ i18n/
│  │  ├─ index.ts        t(key, params), 언어 전환 이벤트
│  │  ├─ ko.ts           기준 사전
│  │  └─ en.ts           Record<MessageKey,string> — 키 누락 시 타입 오류
│  └─ storage/
│     ├─ progress.ts     클리어·별점·힌트·플레이어 칩·레벨별 작업 회로 (순수 함수 + 저장)
│     └─ store.ts        샌드박스 저장
└─ tests/
   ├─ sim/*.test.ts      엔진 단위 테스트
   └─ levels.test.ts     모든 레벨: 참조 정답이 테스트를 통과하는지
```

---

## 4. 데이터 모델

```ts
// ---- 회로 ----
type ChipId = string;            // 'NAND', 'NOT', 'user:xor', ...
interface PinDef { name: string; width: number; }           // width 1~16

interface ChipDef {
  id: ChipId;
  kind: 'builtin' | 'composite';
  inputs: PinDef[];
  outputs: PinDef[];
  // composite 전용:
  instances?: Instance[];
  wires?: Wire[];
  // 메타
  nameKey: string; icon?: string;
  verified?: boolean;            // 레벨 테스트 통과 여부 → 기능 모델 대체 허용
}

interface Instance { uid: string; chip: ChipId; x: number; y: number; rot: 0|90|180|270; }
interface PinRef   { inst: string | 'self'; pin: string; }   // 'self' = 이 칩의 외부 입출력핀
interface Wire     { from: PinRef; to: PinRef; points?: [number, number][]; }

// ---- 레벨 ----
interface Level {
  id: string;                    // '1-5'
  chapter: number;
  text: Record<'ko' | 'en', LevelText>;  // 제목·브리핑·힌트 3개·원리 카드 (타입으로 누락 방지)
  solution: (b: ChipBuilder) => void;    // 참조 정답 (테스트 전용)
  inputs: PinDef[]; outputs: PinDef[];
  allowedChips: ChipId[];        // 이 레벨까지 해금된 칩만
  test: TruthTableTest | SequenceTest;
  unlocks?: { chipId: ChipId };                // 클리어 시 플레이어 회로가 이 id의 칩이 됨
  stars?: { maxNand: number };                 // ≤ max ★★★, ≤ 1.5배 ★★, 그 외 ★
  // (M7 예정) ioDevices?: ('keypad' | 'seg7' | 'memoryViewer' | 'romEditor')[];
}

interface TruthTableTest { kind: 'truth'; rows: { in: number[]; out: number[] }[]; }  // 생략 시 함수로 생성
interface SequenceTest  {
  kind: 'sequence';
  steps: { set?: Record<string, number>; clock?: number; expect?: Record<string, number> }[];
}
```

---

## 5. 시뮬레이션 엔진

### 5.1 넷리스트 컴파일 (평탄화)
```
compile(chipDef, library):
  nets = UnionFind()
  gates = []                      // 평탄화된 원시 게이트 목록
  expand(chipDef, prefix=''):
    for inst in chipDef.instances:
      def = library[inst.chip]
      if def.kind == 'builtin' or (useFunctional && def.verified && hasModel(def)):
        gates.push({ type: def.id, inputs: netIds(...), outputs: netIds(...) })
      else:
        expand(def, prefix + inst.uid + '/')   // 재귀 펼치기
    for w in chipDef.wires: nets.union(pinNet(w.from), pinNet(w.to))
  return { gates, netCount, fanout[net] -> gate[] }
```
- 다비트 핀은 비트 단위 넷으로 분해(폭 8 → 넷 8개). 버스 분리/합치기는 넷 결합만 하고 게이트를 만들지 않음 → 비용 0.
- 오류 검출: 출력끼리 직접 연결(단락), 미연결 입력(기본값 0 + 경고 표시), 순환 칩 정의.

### 5.2 이벤트 기반 시뮬레이션 (단위 지연)
```
state: Uint8Array(netCount)        // 각 넷 값 0/1
queue: 이번 틱에 재평가할 게이트 집합

setInput(net, v):  if state[net] != v: state[net]=v; queue.addAll(fanout[net])

step():                             // 게이트 지연 1단위
  next = new Set()
  changes = []
  for g in queue: changes += evaluate(g)        // 새 출력 계산 (state는 아직 안 바꿈)
  for (net, v) in changes:
    if state[net] != v: state[net] = v; next.addAll(fanout[net])
  queue = next

settle(maxSteps = 10_000):
  n = 0
  while queue not empty and n < maxSteps: step(); n++
  if queue not empty: return OSCILLATION   // 발진 경고 (예: NOT 고리)
```
- 같은 틱 내 모든 게이트가 **동시에** 평가 → SR 래치·플립플롭이 실제처럼 동작하고, 단계 실행 시 신호가 한 게이트씩 퍼지는 모습을 보여줄 수 있음.
- 순차 회로 테스트: `set → settle → clock 상승 → settle → clock 하강 → settle → expect`.
- 초기 상태: 모든 넷 0에서 settle (래치는 테스트에서 먼저 리셋하도록 레벨 설계).

### 5.3 성능 전략 (챕터 6~8)
| 규모 | 대략 NAND 수 | 전략 |
|---|---|---|
| ~챕터 5 | < 1,000 | 순수 게이트 시뮬레이션 |
| RAM 256×8 | ~ 수만 | **기능 모델 대체**: `verified` 칩(레지스터, RAM16, 가산기 등)을 JS 함수로 시뮬레이션 |
| CPU | 수만~ | 기능 모델 + 클럭 단위 진행, 필요 시 Web Worker |

- 기능 모델은 `functional.ts`에 칩 id별로 정의 (현재 `RAM4`/`RAM16`/`RAM256`). **사용 조건:** 플레이어의 칩이 레벨 테스트를 통과(`verified`)했고 핀 구성이 모델과 정확히 같을 것 → 넷리스트에서 **블록** 하나로 컴파일되어 게이트와 같은 단위 지연 단계에서 평가된다.
- 실측(M6): RAM256을 게이트 수준으로 펼치면 NAND 56,788개, 컴파일 ~135ms·전체 테스트 ~156ms. 성능만 보면 충분하지만, 편집마다 재컴파일 지연이 생기고 메모리 내용을 주소 순서로 읽을 수 없어 RAM에 기능 모델을 쓴다(메모리 뷰어).
- NAND 개수(별점)는 블록도 원래 칩 정의를 따라 세므로 빠른 모드 여부와 무관하다.
- 플레이어가 "정밀 모드"를 켜면 언제든 게이트 수준 시뮬레이션으로 전환(작은 회로에서 관찰용).

### 5.4 검증 / 지표
- `verify(level, circuit)` → `{ pass, failedRows[], firstMismatch }` — UI가 진리표의 틀린 행 강조
- `generateTruthTable(circuit)` — 입력 비트 합 ≤ 10 일 때만 전수 생성(그 이상은 테스트 벡터만)
- `metrics`: 평탄화 NAND 개수, 입력→출력 최장 경로(지연 깊이)

---

## 6. 편집기

- **좌표계:** 월드 좌표(그리드 단위 16px) ↔ 화면 좌표, 줌 0.25~4×.
- **렌더 루프:** `requestAnimationFrame`, 변경 시에만 다시 그리기(dirty flag). 화면 밖 객체 컬링.
- **배선:** 핀에서 드래그 시작 → 유효 핀 하이라이트 → 놓으면 `Connect` 명령. 자동 직교 경로, 꺾임점 수동 편집.
- **신호 표시:** 1 = 밝은 색 + 굵은 선, 0 = 회색 얇은 선, 버스 = 값 라벨(10/2/16진 전환), 발진 = 깜빡임 + 경고.
- **실행 취소:** 편집 직전 문서 스냅샷을 저장하는 방식(회로 문서는 수 KB라 단순·안전). 자동 저장은 디바운스 0.5초.
- **칩 열어보기:** 칩 더블클릭 → 내부 회로를 읽기 전용 탭으로 표시, 현재 신호 상태 함께.
- **입력 장치:** 마우스, 키보드 단축키, 터치(핀치 줌·롱프레스 메뉴).

---

## 7. CPU 명세 (챕터 8)

### 7.1 구조
- 8비트 데이터, 8비트 주소, **RAM 256×8 공유**(프로그램 + 데이터, 폰 노이만)
- 레지스터: **A**(누산기), **PC**(프로그램 카운터), **IR**(명령 레지스터), **MAR**(메모리 주소 레지스터), 플래그 **Z / N / C**
- 명령어 형식: **2바이트 고정** `[opcode(상위 4비트) | 0000] [operand(8비트)]`

### 7.2 명령어 집합
| opcode | 니모닉 | 동작 | 플래그 |
|---|---|---|---|
| 0x0 | NOP | 아무것도 안 함 | — |
| 0x1 | LDI n | A ← n | Z,N |
| 0x2 | LDA addr | A ← RAM[addr] | Z,N |
| 0x3 | STA addr | RAM[addr] ← A | — |
| 0x4 | ADD addr | A ← A + RAM[addr] | Z,N,C |
| 0x5 | SUB addr | A ← A − RAM[addr] | Z,N,C |
| 0x6 | AND addr | A ← A ∧ RAM[addr] | Z,N |
| 0x7 | OR addr | A ← A ∨ RAM[addr] | Z,N |
| 0x8 | NOT | A ← ¬A | Z,N |
| 0x9 | JMP addr | PC ← addr | — |
| 0xA | JZ addr | Z=1이면 PC ← addr | — |
| 0xB | JC addr | C=1이면 PC ← addr | — |
| 0xC | JN addr | N=1이면 PC ← addr | — |
| 0xD | IN | A ← 키패드 입력 | Z,N |
| 0xE | OUT | 표시기 ← A | — |
| 0xF | HALT | 정지 | — |

### 7.3 마이크로 단계 (STEP: T0~T4) — 구현된 제어 신호
제어선(CONTROL 출력): `mar_ld, mar_sel, ir_ld, pc_inc, pc_ld, a_ld, alu[3], b_in, ram_wr, out_ld, halt, t_rst`.
A는 항상 ALU8 결과를 받는다(LDI/LDA/IN = ALU op 7 "b 그대로", NOT = op 5). 플래그 z·n·c는 a_ld와 함께 갱신.

| 단계 | 신호 |
|---|---|
| T0 | mar_ld (MAR ← PC) |
| T1 | ir_ld, pc_inc |
| T2 | mar_ld |
| T3 | 메모리 명령(2–7): mar_ld + mar_sel (MAR ← RAM) · NOP: pc_inc · LDI: a_ld, alu 7, pc_inc · NOT: a_ld, alu 5, pc_inc · JMP: pc_ld · Jxx: take ? pc_ld : pc_inc · IN: a_ld, alu 7, b_in, pc_inc · OUT: out_ld, pc_inc · (HALT 제외 모두 t_rst) · HALT: halt |
| T4 | 메모리 명령: pc_inc, t_rst + LDA a_ld/7 · STA ram_wr · ADD a_ld/0 · SUB a_ld/1 · AND a_ld/2 · OR a_ld/3 · HALT: halt |

클럭 수: 일반 명령 4, 메모리 명령 5, HALT는 4클럭째에 HALT 레지스터가 1 → STEP hold.

### 7.4 CPU 칩 핀과 프로그램 적재
- 입력: `run, pa[8], pd[8], pw, in[8], reset, clk` / 출력: `out[8], ow(= out_ld), halt, pc[8], a[8]`
- run = 0이면 RAM의 addr/d/write를 pa/pd/pw에서 받는다(MUX). 적재 → reset 펄스(run = 0) → run = 1로 실행.
- `src/cpu/run.ts` `CpuRunner`: 256바이트 적재 + 리셋 + 클럭, ow = 1인 클럭마다 OUT 값을 기록 → 프로그램 레벨 테스트와 화면이 공유.
- `src/cpu/isa.ts`: 어셈블러(라벨, `.org`, `.db`, 10/16/2진수, 줄 번호 오류), 역어셈블러, 기준 에뮬레이터(테스트에서 하드웨어와 OUT·클럭 수가 정확히 같은지 검사).

### 7.5 예제 프로그램 (곱셈) — 8-5 테스트와 8-8 참조 정답
```
      LDI 0
      STA 0x82      ; result = 0
loop: LDA 0x81      ; count
      JZ done
      SUB one
      STA 0x81
      LDA 0x82
      ADD 0x80
      STA 0x82
      JMP loop
done: LDA 0x82
      OUT
      HALT
one:  .db 1
```

### 7.6 테스트 전략
- 8-1~8-4는 진리표/순서 테스트, 8-5는 곱셈 프로그램 + 전 명령 점검 프로그램을 핀으로 적재해 실행(`repeat` 클럭 단계)하고 최종 out·halt 확인.
- 프로그램 레벨(`kind: 'program'`)은 참조 프로그램을 ① 에뮬레이터 ② 참조 CPU 회로에서 실행해 경우별 OUT·클럭 수 일치를 검사.

## 8. i18n
- 모든 사용자 노출 문자열은 키로 관리: `level.1-5.title`, `level.1-5.hint.1`, `principle.xor.body`, `ui.toolbar.run` …
- `ko.ts` / `en.ts` — en은 `Record<MessageKey, string>` 타입이라 **키 누락이 컴파일 오류**로 잡힘
- 기본 언어: 브라우저 언어가 ko면 ko, 아니면 en. 토글 시 `languagechange` 이벤트 → 패널 재렌더
- 원리 카드 본문은 간단한 마크다운(굵게, 수식 인라인) 지원

---

## 9. 저장 형식
```json
{
  "version": 1,
  "settings": { "lang": "ko", "palette": "default", "speed": 5 },
  "progress": { "1-5": { "cleared": true, "stars": 3, "hintsUsed": 1 } },
  "chips":   { "user:xor": { /* ChipDef */ } },
  "levelDrafts": { "1-6": { /* Circuit */ } },
  "sandbox": [ { "name": "my adder", "circuit": { } } ]
}
```
- `version` 필드로 마이그레이션. 손상 시 백업 키에서 복구.
- 내보내기/가져오기: JSON 파일, 공유용 압축 문자열(URL 해시).

---

## 10. 테스트 전략
| 대상 | 방법 |
|---|---|
| 엔진 | NOT/AND/XOR/가산기/SR 래치/DFF 단위 테스트, 발진 감지 테스트 |
| 기능 모델 | RAM4/16/256: 게이트 수준 참조 회로와 무작위 쓰기/읽기 수백 단계 출력 비교 (tests/sim/functional.test.ts) |
| 레벨 | **모든 레벨의 참조 정답이 해당 테스트 통과** + 허용 칩만 사용하는지 |
| 의존성 | 각 레벨의 `allowedChips`가 이전 레벨 `unlocks`의 부분집합인지 자동 검사 |
| i18n | ko/en 키 집합 일치 |
| CPU | 예제 프로그램 3개 실행 결과 검사 (덧셈, 카운트다운, 곱셈) |
| 편집기 | 명령 undo/redo 왕복 테스트 |

---

## 11. 마일스톤

| # | 이름 | 범위 | 완료 기준 |
|---|---|---|---|
| M1 | 엔진 | Vite/TS/Vitest 셋업, sim/ 전체(기능 모델 제외) | NOT/AND/XOR/SR 래치 테스트 통과 |
| M2 | 편집기 | 캔버스 배치·배선·팬줌·선택·undo/redo, 신호 색 | 브라우저에서 NAND로 XOR 손으로 만들어 동작 |
| M3 | 레벨 시스템 | levelRunner, 브리핑/진리표/검증/칩화/해금, 진행 저장, i18n, 챕터 0~1 | 챕터 0~1 처음부터 끝까지 플레이 가능 |
| M4 | 조합·산술 | 챕터 2~4, 버스·다비트 표시기, 별점 | **MVP 공개 가능** |
| M5 | 순차 회로 | 클럭, 단계 실행, 타이밍 차트, 챕터 5 | 스톱워치 보스 클리어 |
| M6 | RAM | 기능 모델, 메모리 뷰어, 챕터 6 | RAM 256×8 실시간 동작 (60fps 유지) |
| M7 | 계산기 | 7세그먼트·키패드, ALU, 챕터 7 | 계산기 보스 클리어 ✅ |
| M8 | 컴퓨터 | 제어 유닛, 프로그램 화면/어셈블러, 챕터 8, 엔딩 | 곱셈 프로그램 실행 ✅ |
| M9 | 고수 확장·마감 | 내 칩 저장, 샌드박스 프로그램 적재, 픽셀 화면·빠른 클럭, 내보내기/공유 링크, 도전 과제 (§10) | 샌드박스에서 만든 칩으로 CPU 프로그램이 화면에 그림 |
| M10 | 계정·서버 | 아이디/비밀번호 계정, 진행 기록 서버 동기화(잃지 않는 합치기), A1 배포 (§11) | 두 기기에서 같은 계정으로 이어서 플레이 |

---

## 12. 위험 요소와 대응
| 위험 | 대응 |
|---|---|
| 대형 회로 성능 저하 | 기능 모델 대체, Typed Array, Web Worker, 화면 밖 렌더 생략 |
| 순차 회로가 초보자에게 어려움 | 5-0 관찰 레벨, 단계 실행, 타이밍 차트, 친절한 힌트 |
| 배선 UI가 번거로움 | 버스, 자동 경로, 복사/붙여넣기, 반복 배치 도구 |
| 플레이어 칩 수정 시 상위 칩 깨짐 | 칩 수정 시 의존 칩 재검증, 실패하면 경고 + 이전 버전 유지 옵션 |
| 저장 데이터 손상/구버전 | version 필드 마이그레이션, 백업 키 |

## 10. M9 — 고수를 위한 샌드박스 확장

| 기능 | 내용 | 저장 위치 |
|---|---|---|
| **내 칩 저장** | 샌드박스 회로를 이름(대문자·숫자·_)과 설명을 붙여 칩으로 저장 → 샌드박스 팔레트 "내 칩"에서 재사용, 더블클릭으로 내부 보기, 불러와 편집·덮어쓰기·삭제(다른 칩이 쓰면 삭제 막음). 캠페인 칩 이름(ALU, CPU …)과 내장 칩 이름은 예약 | `logic-game:v1:custom-chips` (진행 기록과 별개) |
| **프로그램 적재** | 샌드박스에 메모리 칩(RAM16/RAM256, CPU 안의 RAM 포함)이 있으면 어셈블리를 써서 그 메모리에 바로 적재. "회로가 바뀌면 다시 적재" 옵션 | `logic-game:sandbox-program` |
| **픽셀 화면** | RAM256의 0xE0–0xFF(32바이트) = 16×16 흑백 화면(한 줄 2바이트, 왼쪽이 최상위 비트). 샌드박스와 프로그램 레벨 화면에 표시 → `STA 0xE0`으로 그림 | — |
| **빠른 클럭** | 자동 클럭 속도 선택: 1.4 Hz ~ 1000 Hz (빠르면 한 프레임에 여러 펄스) | — |
| **내보내기/불러오기/공유** | 회로 + 사용한 칩 정의(전이적으로)를 묶어 JSON 파일 또는 압축(deflate-raw, base64url) 공유 링크 `#/sandbox?c=…`. 불러올 때는 현재 샌드박스를 바꿀지 먼저 확인(실행 취소 가능). 같은 이름의 다른 내 칩이 있으면 중단 | — |
| **도전 과제** | 진행 기록·내 칩·플래그로 판정하는 업적 14개 (예: XOR을 NAND 4개로, CPU를 NAND 5만 개 이하로, 픽셀 화면에 점 찍기). 맵의 🏆 버튼 | `logic-game:achv-flags` |

## 11. M10 — 계정과 서버 (A1)

- **구성**: `server/` Fastify + PostgreSQL 17. A1 한 대에서 Docker Compose(`deploy/`)로 web(Caddy: 정적 파일 + 자동 HTTPS) · api · db. 배포 절차는 [DEPLOY_A1.md](./DEPLOY_A1.md).
- **API** (`/api`): `POST auth/signup|login|logout`, `GET auth/me`, `GET|PUT saves/:game` (`game = 'logic'`; 이후 다른 게임은 `GAMES`에 추가).
- **DB**: `users`(아이디 소문자 3–20자, scrypt 해시) · `sessions`(토큰 sha256만 저장, 30일) · `saves`(user, game, jsonb data, rev). 마이그레이션은 `server/src/db.ts`에 덧붙이기만 한다.
- **보안**: 세션 쿠키 `HttpOnly; Secure; SameSite=Lax`, 상태 변경 요청은 Origin 검사, 로그인·가입 IP당 분당 10회, DB/API는 외부 포트 없음.
- **동기화** (`src/storage/sync.ts`, `syncMerge.ts`):
  - 세이브 한 벌 = `{progress, custom(내 칩), flags(도전 과제)}`. 샌드박스 회로·설정은 브라우저에만.
  - 로그인 안 하면 지금과 똑같이 localStorage만. 로그인하면 서버 세이브를 받아 **합치기**: 레벨 기록은 좋은 쪽(클리어 OR, 별 최대, NAND 최소), 칩·회로는 합집합(같은 항목은 미뤄 둔 변경이 있는 쪽 우선), 내 칩은 최근 저장 쪽, 플래그 합집합 → 어느 쪽 기록도 잃지 않는다.
  - 이후 로컬 저장마다 1.5초 뒤 `PUT`(baseRev). 다른 기기가 먼저 저장했으면 409 → 합쳐서 다시.
  - 처음 계정과 맞출 때 `logic-game:v1:progress-backup`에 백업. 상태는 `logic-game:sync`. 로그아웃해도 로컬 기록은 지우지 않는다.
- **개발 서버**: Vite가 `/api`를 프록시 — 5317 → 8787, 테스트 서버 5318 → 8788(DB `zoo_e2e`, 쿠키 `zoo_sid_test`)로 분리해 실제 게임 기록과 섞이지 않게.

