# Zero or One

컴퓨터 과학을 **직접 만들어 보며** 배우는 퍼즐 게임 시리즈.

## Zero or One: Logic

NAND 게이트 하나에서 시작해 NOT → AND/OR/XOR → 가산기 → ALU → 레지스터 → RAM → 계산기 → **CPU**까지, 직접 만든 부품만으로 컴퓨터를 완성하는 논리 회로 퍼즐입니다. 한국어 / English.

- 챕터 0–8, 58개 레벨 (마지막 장은 내가 만든 CPU에서 어셈블리 프로그램 실행)
- 샌드박스: 내 칩 저장, 공유 링크, 16×16 픽셀 화면, 메모리 프로그램 적재, 회로 최적화
- 계정(선택): 로그인하면 진행 기록이 서버에 저장되어 여러 기기에서 이어서 플레이

## 구조

```
.            게임 (Vite + TypeScript, 프레임워크 없음)
├ src/       시뮬레이터 · 에디터 · 레벨 · UI
├ tests/     Vitest
├ server/    계정·세이브 API (Fastify + PostgreSQL)
├ deploy/    Docker Compose · Caddy(HTTPS) · A1 설정 스크립트
└ docs/      기획서 · 기술 설계서 · 배포 안내
```

## 개발

```bash
npm install && npm run dev            # 게임만: http://localhost:5173 (로그인 없이 동작)
npm test                              # 게임 테스트

# 계정 서버까지
docker run -d --name zoo-pg-dev -e POSTGRES_USER=zoo -e POSTGRES_PASSWORD=zoo-dev -e POSTGRES_DB=zoo \
  -p 127.0.0.1:5433:5432 postgres:17-alpine
docker exec zoo-pg-dev psql -U zoo -c "CREATE DATABASE zoo_test"
cd server && npm install
DATABASE_URL=postgres://zoo:zoo-dev@127.0.0.1:5433/zoo npm run dev   # :8787, 게임 dev 서버가 /api를 프록시
npm test                                                              # API 테스트 (zoo_test DB)
```

## 배포

[docs/DEPLOY_A1.md](docs/DEPLOY_A1.md) — Oracle Cloud A1 한 대에 게임 + API + DB.

## 호환성 약속

- 저장 형식 `version: 1`, 칩 id, 핀 이름은 바꾸지 않습니다 (플레이어가 만든 칩이 id로 저장됨).
- localStorage 키(`logic-game:…`)와 공유 형식(`logic-game-circuit`)은 이름이 바뀐 지금도 그대로 둡니다.
