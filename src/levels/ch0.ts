import { pin, truthTableFrom } from '../sim';
import type { Chapter } from './types';

const A = [pin('a')];
const AB = [pin('a'), pin('b')];

export const chapter0: Chapter = {
  id: 0,
  title: { ko: '첫 전류', en: 'First Current' },
  subtitle: { ko: '신호, 선, 그리고 첫 부품', en: 'Signals, wires, and your first part' },
  levels: [
    {
      id: '0-1',
      chapter: 0,
      inputs: A,
      outputs: [pin('out')],
      allowedChips: [],
      test: truthTableFrom(A, (a) => [a]),
      text: {
        ko: {
          title: '불 켜기',
          briefing:
            '디지털 세계의 신호는 단 두 가지, **0(꺼짐)** 과 **1(켜짐)** 뿐입니다.\n\n' +
            '왼쪽의 입력 스위치 **a** 의 오른쪽 핀에서 끌어서, 오른쪽 램프 **out** 의 왼쪽 핀에 놓아 선을 연결하세요. ' +
            '그다음 스위치를 클릭해 0과 1을 바꿔 보고, **테스트** 를 누르세요.',
          hints: [
            '핀은 부품 가장자리의 작은 점입니다. 점 위에서 마우스를 누른 채로 끌어 보세요.',
            '스위치의 오른쪽 점(출력) → 램프의 왼쪽 점(입력)으로 끌면 됩니다.',
            '선이 생기면 스위치를 클릭해 보세요. 선과 램프의 색이 함께 바뀌면 성공입니다.',
          ],
          principle: {
            title: '신호는 0 아니면 1',
            body:
              '컴퓨터 안의 모든 정보 — 글자, 사진, 게임 — 는 결국 수많은 선 위의 0과 1입니다.\n\n' +
              '실제 회로에서 1은 "전압이 높다", 0은 "전압이 낮다"를 뜻합니다. 선은 신호를 한쪽에서 다른 쪽으로 그대로 전달합니다.',
            usage: '모든 디지털 장치의 가장 기본 단위인 1비트(bit) 신호입니다.',
          },
        },
        en: {
          title: 'Let There Be Light',
          briefing:
            'Digital signals come in only two kinds: **0 (off)** and **1 (on)**.\n\n' +
            "Drag from the right pin of input switch **a** and drop it on the left pin of lamp **out**. " +
            'Then click the switch to flip between 0 and 1, and press **Test**.',
          hints: [
            'Pins are the small dots on the edges of parts. Press on a dot and drag.',
            "Drag from the switch's right dot (output) to the lamp's left dot (input).",
            'Once the wire exists, click the switch. If the wire and lamp change color together, you are done.',
          ],
          principle: {
            title: 'A signal is 0 or 1',
            body:
              'Everything inside a computer — text, photos, games — is ultimately lots of 0s and 1s on wires.\n\n' +
              'In real circuits, 1 means "high voltage" and 0 means "low voltage". A wire carries a signal unchanged from one end to the other.',
            usage: 'The 1-bit signal is the most basic unit of every digital device.',
          },
        },
      },
      solution: (b) => {
        b.wire('a', 'out');
      },
    },
    {
      id: '0-2',
      chapter: 0,
      inputs: A,
      outputs: [pin('out1'), pin('out2')],
      allowedChips: [],
      test: truthTableFrom(A, (a) => [a, a]),
      text: {
        ko: {
          title: '나눠 주기',
          briefing:
            '하나의 신호를 여러 곳에 보내야 할 때가 많습니다.\n\n' +
            '스위치 **a** 하나로 램프 **out1**, **out2** 를 동시에 켜세요.',
          hints: [
            '출력 핀 하나에서 선을 여러 개 끌어낼 수 있을까요?',
            '스위치의 출력 점에서 두 번 끌어 보세요. 한 번은 out1, 한 번은 out2로.',
            '입력 핀(램프 쪽)은 선을 하나만 받을 수 있지만, 출력 핀은 여러 곳으로 보낼 수 있습니다.',
          ],
          principle: {
            title: '팬아웃 (Fan-out)',
            body:
              '출력 하나를 여러 입력에 연결하는 것을 **팬아웃** 이라고 합니다. 신호는 복사되어 모든 곳에 똑같이 전달됩니다.\n\n' +
              '반대로, 입력 하나에 출력 두 개를 연결하면 안 됩니다. 한쪽은 0, 한쪽은 1을 보내면 어느 값인지 정할 수 없고, 실제 회로에서는 **단락(쇼트)** 이 일어납니다. 그래서 이 게임은 입력 핀에 선을 하나만 허용합니다.',
            usage: 'CPU의 클럭 신호 하나가 수십억 개의 부품에 동시에 전달됩니다.',
          },
        },
        en: {
          title: 'Sharing',
          briefing:
            'Often one signal has to go to several places.\n\n' + 'Light both lamps **out1** and **out2** with the single switch **a**.',
          hints: [
            'Can you drag more than one wire out of a single output pin?',
            "Drag from the switch's output dot twice: once to out1, once to out2.",
            'An input pin (lamp side) accepts only one wire, but an output pin can feed many.',
          ],
          principle: {
            title: 'Fan-out',
            body:
              'Connecting one output to several inputs is called **fan-out**. The signal is copied to every destination.\n\n' +
              'The reverse is not allowed: two outputs on one input. If one sends 0 and the other 1, the value is undefined, and real hardware gets a **short circuit**. That is why an input pin accepts only one wire here.',
            usage: "A CPU's single clock signal is delivered to billions of parts at once.",
          },
        },
      },
      solution: (b) => {
        b.fan('a', 'out1', 'out2');
      },
    },
    {
      id: '0-3',
      chapter: 0,
      inputs: AB,
      outputs: [pin('out')],
      allowedChips: ['NAND'],
      test: truthTableFrom(AB, (a, b) => [a & b ? 0 : 1]),
      text: {
        ko: {
          title: '첫 부품, NAND',
          briefing:
            '이제 첫 번째 **논리 게이트** 를 만납니다. **NAND** 는 두 입력이 **모두 1일 때만 0**, 그 외에는 1을 내보냅니다.\n\n' +
            'NAND를 하나 놓고 a, b, out에 연결하세요. 스위치를 바꿔 가며 오른쪽 **진리표** 의 네 줄이 모두 맞는지 직접 확인해 보세요.',
          hints: [
            '부품 목록에서 NAND를 클릭하거나 캔버스로 끌어오세요.',
            'NAND의 왼쪽 두 점이 입력, 오른쪽 점이 출력입니다.',
            'a → NAND 위쪽 입력, b → NAND 아래쪽 입력, NAND 출력 → out.',
          ],
          principle: {
            title: 'NAND — 만능 게이트',
            body:
              'NAND는 "NOT AND", 즉 AND의 결과를 뒤집은 것입니다. 진리표로 보면 1·1 → 0, 나머지 → 1.\n\n' +
              '놀랍게도 **NAND 하나만으로 모든 디지털 회로를 만들 수 있습니다.** 이것을 **함수적 완전성** 이라고 합니다. 이 게임에서 여러분은 NAND 하나에서 시작해 컴퓨터까지 만들게 됩니다.\n\n' +
              '**진리표** 는 가능한 모든 입력 조합과 그때의 출력을 적은 표입니다. 입력이 n개면 2ⁿ줄이 됩니다.',
            formula: 'out = ¬(a ∧ b)',
            usage: '실제 반도체 공장에서도 NAND는 가장 작고 빠르게 만들 수 있는 게이트라서 플래시 메모리(NAND 플래시)의 이름이 되었습니다.',
          },
        },
        en: {
          title: 'First Part: NAND',
          briefing:
            'Meet your first **logic gate**. **NAND** outputs **0 only when both inputs are 1**, and 1 otherwise.\n\n' +
            'Place a NAND and connect it to a, b, and out. Flip the switches and check every row of the **truth table** on the right.',
          hints: [
            'Click NAND in the parts list, or drag it onto the canvas.',
            "NAND's two left dots are inputs; the right dot is the output.",
            'a → upper NAND input, b → lower NAND input, NAND output → out.',
          ],
          principle: {
            title: 'NAND — the universal gate',
            body:
              'NAND means "NOT AND": the result of AND, flipped. Its truth table: 1·1 → 0, everything else → 1.\n\n' +
              'Remarkably, **every digital circuit can be built from NAND alone.** This is called **functional completeness**. In this game you start from one NAND and end with a computer.\n\n' +
              'A **truth table** lists every possible input combination and its output. With n inputs there are 2ⁿ rows.',
            formula: 'out = ¬(a ∧ b)',
            usage: 'NAND is the smallest, fastest gate to manufacture — which is how NAND flash memory got its name.',
          },
        },
      },
      solution: (b) => {
        const n = b.add('NAND');
        b.wire('a', `${n}.a`).wire('b', `${n}.b`).wire(`${n}.out`, 'out');
      },
    },
  ],
};
