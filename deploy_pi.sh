#!/bin/bash
# Raspberry Pi 部署腳本 - Kaohsiung Bus CORS Proxy
# 使用方式: chmod +x deploy_pi.sh && ./deploy_pi.sh

set -e

echo "=== Kaohsiung Bus CORS Proxy - Raspberry Pi 部署 ==="

# 1. 更新系統
echo "更新套件..."
sudo apt update && sudo apt upgrade -y

# 2. 安裝必要套件
echo "安裝 Python、Git、Cloudflare Tunnel..."
sudo apt install -y python3 python3-venv python3-pip git cloudflared

# 3. 建立專案目錄
PROJECT_DIR="$HOME/kaohsiung_bus_proxy"
echo "建立專案目錄: $PROJECT_DIR"
mkdir -p $PROJECT_DIR
cd $PROJECT_DIR

# 4. 複製專案檔案 (假設已透過 git clone 或 scp 複製)
# 這裡建立虛擬環境
echo "建立虛擬環境..."
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# 5. 建立 systemd 服務
echo "建立 systemd 服務..."
sudo tee /etc/systemd/system/kaohsiung-bus-proxy.service > /dev/null <<EOF
[Unit]
Description=Kaohsiung Bus CORS Proxy
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
Environment=PATH=$PROJECT_DIR/venv/bin
Environment=PORT=8082
ExecStart=$PROJECT_DIR/venv/bin/gunicorn --bind 0.0.0.0:8082 --workers 2 --timeout 60 proxy_server:app
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# 6. 啟用並啟動服務
echo "啟用 systemd 服務..."
sudo systemctl daemon-reload
sudo systemctl enable kaohsiung-bus-proxy
sudo systemctl start kaohsiung-bus-proxy

# 7. 等待服務啟動
sleep 3

# 8. 驗證本地服務
echo "驗證本地服務..."
curl -s http://localhost:8082/health | jq .

# 9. Cloudflare Tunnel 設定指引
echo ""
echo "=== Cloudflare Tunnel 設定 ==="
echo "1. 登入 Cloudflare: cloudflared tunnel login"
echo "2. 建立 Tunnel: cloudflared tunnel create kaohsiung-bus-proxy"
echo "3. 設定 DNS: cloudflared tunnel route dns kaohsiung-bus-proxy bus.yourdomain.com"
echo "4. 建立設定檔: ~/.cloudflared/config.yml"
echo "5. 安裝為服務: sudo cloudflared service install"
echo ""
echo "config.yml 範例:"
cat <<CFEOF
tunnel: <TUNNEL_ID>
credentials-file: /home/$USER/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: bus.yourdomain.com
    service: http://localhost:8082
  - service: http_status:404
CFEOF

echo ""
echo "部署完成！"
echo "服務狀態: sudo systemctl status kaohsiung-bus-proxy"
echo "查看日誌: sudo journalctl -u kaohsiung-bus-proxy -f"