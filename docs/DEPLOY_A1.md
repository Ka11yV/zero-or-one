# A1 서버에 배포하기 (Oracle Cloud Ampere A1)

게임(정적 파일), 계정 API 서버, PostgreSQL DB를 **A1 한 대**에 Docker Compose로 올립니다.

```
브라우저 ──HTTPS──▶ A1 ┬ web (Caddy) : 게임 파일 + 자동 HTTPS 인증서, /api → api
                       ├ api (Node)  : 계정·세이브 API (외부 포트 없음)
                       └ db  (Postgres 17) : 데이터 (외부 포트 없음, 볼륨에 저장)
```

## 1. 오라클 콘솔에서 (한 번)

1. **인스턴스 만들기**: Shape = `VM.Standard.A1.Flex`(Always Free: 최대 4 OCPU / 24GB), 이미지 = Ubuntu 24.04 (aarch64). SSH 키를 등록합니다.
2. **포트 열기**: 인스턴스의 VCN → Subnet → Security List → Ingress Rules에 추가
   - Source `0.0.0.0/0`, TCP, 포트 `80`
   - Source `0.0.0.0/0`, TCP, 포트 `443`
   - (선택) Source `0.0.0.0/0`, UDP, 포트 `443` — HTTP/3
3. 인스턴스의 **공인 IP**를 확인합니다.

## 2. 사이트 주소 정하기

- **도메인이 있으면**: DNS에 A 레코드 `도메인 → 공인 IP`를 만들고 그 도메인을 씁니다.
- **도메인이 없으면**: `<공인 IP의 점을 대시로>.sslip.io`를 씁니다. 예: IP가 `152.70.1.2`면 `152-70-1-2.sslip.io`. 따로 설정 없이 이 IP를 가리키고, HTTPS 인증서도 받을 수 있습니다.

## 3. 서버에서 (SSH 접속 후)

```bash
curl -fsSL https://raw.githubusercontent.com/Ka11yV/zero-or-one/main/deploy/setup-a1.sh -o setup-a1.sh
bash setup-a1.sh 152-70-1-2.sslip.io      # ← 내 사이트 주소
cd ~/zero-or-one/deploy && sudo docker compose up -d --build
```

`setup-a1.sh`가 하는 일: Docker 설치, 서버 안 방화벽(iptables)에서 80/443 열기, 저장소 받기, `deploy/.env`(사이트 주소 + 무작위 DB 비밀번호) 만들기.

확인:

```bash
sudo docker compose ps                      # 세 개 모두 running / healthy
curl https://152-70-1-2.sslip.io/api/health # {"ok":true}
```

## 4. 업데이트 (새 버전 배포)

```bash
cd ~/zero-or-one && git pull && cd deploy && sudo docker compose up -d --build
```

DB 구조 변경(마이그레이션)은 API 서버가 시작할 때 자동으로 적용됩니다. 데이터는 `db-data` 볼륨에 남습니다.

## 5. 백업

```bash
cd ~/zero-or-one/deploy && ./backup.sh       # backups/zoo-날짜.sql.gz
crontab -e                                  # 매일 새벽 4:30
30 4 * * * cd /home/ubuntu/zero-or-one/deploy && ./backup.sh >> backups/backup.log 2>&1
```

복원: `gunzip -c backups/zoo-….sql.gz | sudo docker compose exec -T db psql -U zoo -d zoo`

백업 파일은 서버 밖(Object Storage, 내 컴퓨터 등)에도 가끔 복사해 두세요.

## 문제 해결

| 증상 | 확인 |
|---|---|
| 접속이 아예 안 됨 | 콘솔 Security List 80/443 + `sudo iptables -L INPUT -n --line-numbers`에 80/443 ACCEPT가 REJECT보다 위에 있는지 |
| 인증서 오류 | `sudo docker compose logs web` — 도메인이 이 IP를 가리키는지, 80 포트가 열려 있는지 (Let's Encrypt가 80으로 확인함) |
| 로그인하면 403 | `.env`의 `SITE_ADDRESS`가 실제 접속 주소와 같은지 (Origin 검사) |
| API 오류 | `sudo docker compose logs api` |

## 보안 메모

- DB와 API 서버는 외부 포트가 없습니다. 밖에서는 Caddy(80/443)만 보입니다.
- 비밀번호는 scrypt로 해시하고, 세션 토큰은 DB에 해시만 저장합니다. 세션 쿠키는 `HttpOnly; Secure; SameSite=Lax`.
- 로그인·가입은 IP당 1분에 10번으로 제한합니다.
- `deploy/.env`는 git에 올라가지 않습니다.
