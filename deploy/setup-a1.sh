#!/usr/bin/env bash
# Oracle Cloud A1(Ubuntu 22.04/24.04, ARM64) 서버 첫 설정. 서버에서 한 번 실행:
#   curl -fsSL https://raw.githubusercontent.com/Ka11yV/zero-or-one/main/deploy/setup-a1.sh -o setup-a1.sh
#   bash setup-a1.sh <사이트 주소>     예) bash setup-a1.sh 152-70-1-2.sslip.io  또는  bash setup-a1.sh zeroorone.example
set -euo pipefail

SITE="${1:?사용법: bash setup-a1.sh <도메인 또는 IP.sslip.io>}"
REPO="https://github.com/Ka11yV/zero-or-one.git"
DIR="$HOME/zero-or-one"

echo "== 1/4 Docker 설치"
if ! command -v docker >/dev/null; then
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl git
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" |
    sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER"
fi

echo "== 2/4 서버 방화벽(iptables)에서 80/443 열기"
# 오라클 Ubuntu 이미지는 iptables에 REJECT 규칙이 있어서, 콘솔 Security List만 열면 접속이 안 된다
for rule in "tcp --dport 80" "tcp --dport 443" "udp --dport 443"; do
  # shellcheck disable=SC2086
  sudo iptables -C INPUT -p $rule -m state --state NEW -j ACCEPT 2>/dev/null ||
    sudo iptables -I INPUT 1 -p $rule -m state --state NEW -j ACCEPT
done
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent >/dev/null
sudo netfilter-persistent save

echo "== 3/4 코드 받기"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone "$REPO" "$DIR"; fi

echo "== 4/4 설정(.env) 만들기"
cd "$DIR/deploy"
if [ ! -f .env ]; then
  umask 077
  {
    printf 'SITE_ADDRESS=%s\nPOSTGRES_PASSWORD=%s\nCOOKIE_SECRET=%s\n' "$SITE" "$(openssl rand -hex 24)" "$(openssl rand -hex 32)"
    printf '\n# 소셜 로그인 키 (docs/DEPLOY_A1.md 4단계)\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\nGITHUB_CLIENT_ID=\nGITHUB_CLIENT_SECRET=\n'
  } > .env
  echo "deploy/.env 생성 (DB 비밀번호·쿠키 키는 이 파일에만 있습니다)"
else
  echo "deploy/.env가 이미 있어 그대로 둡니다"
fi

echo
echo "완료. 다음: deploy/.env에 Google/GitHub 로그인 키를 넣고 (docs/DEPLOY_A1.md 4단계) 실행:"
echo "  cd $DIR/deploy && sudo docker compose up -d --build"
echo "그 뒤 https://$SITE 접속 (첫 인증서 발급에 30초쯤 걸릴 수 있음)"
