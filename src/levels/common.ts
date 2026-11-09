// 레벨 정의에서 공통으로 쓰는 부품 목록
export const GATES = ['NAND', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR'];
export const bus = (...widths: number[]) => widths.flatMap((w) => [`SPLIT${w}`, `MERGE${w}`]);
