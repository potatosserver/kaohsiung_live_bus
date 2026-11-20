# 樹莓派 Kaohsiung Bus CORS Proxy 部署指令單
# 適用：Raspberry Pi OS (Bookworm/Bullseye)，Python 3.11+，無 Docker

## 1. 一鍵部署 (複製貼上即可執行)

```bash
# 進入家目錄
cd ~

# 下載專案 (若已有本地專案請用 scp 複製，這裡示範 git clone)
git clone https://github.com/你的帳號/kaohsiung_bus_proxy.git
cd kaohsiung_bus_proxy

# 執行自動部署腳本
chmod +x deploy_pi.sh
./deploy_pi.sh
```

---

## 2. 手動步驟說明 (若不想跑腳本)

### 2-1 安裝系統套件
```bash
sudo apt update && sudo apt install -y python3 python3-venv python3-pip git
```

### 2-2 建立虛擬環境與安裝依賴
```bash
cd ~/kaohsiung_bus_proxy
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 2-3 測試手動啟動 (先確認正常再設定開機自啟)
```bash
# 前景測試，Ctrl+C 停止
python proxy_server.py
# 另開終端機測試
curl http://localhost:8082/health
```

### 2-4 建立 systemd 服務 (開機自啟動核心)
```bash
sudo tee /etc/systemd/system/kaohsiung-bus-proxy.service > /dev/null <<'EOF'
[Unit]
Description=Kaohsiung Bus CORS Proxy
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=/home/pi/kaohsiung_bus_proxy
Environment=PATH=/home/pi/kaohsiung_bus_proxy/venv/bin:/usr/local/bin:/usr/bin:/bin
Environment=PORT=8082
# 使用 gunicorn 生產級啟動 (2 workers, 60s timeout)
ExecStart=/home/pi/kaohsiung_bus_proxy/venv/bin/gunicorn --bind 0.0.0.0:8082 --workers 2 --timeout 60 proxy_server:app
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
# 資源限制 (視 Pi 記憶體調整)
MemoryMax=512M

[Install]
WantedBy=multi-user.target
EOF
```

### 2-5 啟用並啟動服務
```bash
sudo systemctl daemon-reload
sudo systemctl enable kaohsiung-bus-proxy
sudo systemctl start kaohsiung-bus-proxy
```

### 2-6 驗證服務狀態
```bash
# 看狀態
sudo systemctl status kaohsiung-bus-proxy

# 看即時日誌
sudo journalctl -u kaohsiung-bus-proxy -f

# 測試 API
curl http://localhost:8082/health
curl "http://localhost:8082/api/routes"
```

---

## 3. Cloudflare Tunnel 設定 (公網 HTTPS)

### 3-1 安裝 cloudflared
```bash
# Raspberry Pi OS Bookworm 內建套件
sudo apt install -y cloudflared

# 或手動下載最新版 (ARM64)
# curl -L -o cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
# sudo dpkg -i cloudflared.deb
```

### 3-2 登入並建立 Tunnel
```bash
# 1. 瀏覽器授權
cloudflared tunnel login

# 2. 建立 tunnel (記下輸出的 UUID)
cloudflared tunnel create kaohsiung-bus-proxy

# 3. 綁定域名 (需在 Cloudflare 管理的域名下)
cloudflared tunnel route dns kaohsiung-bus-proxy bus-api.你的域名.com
```

### 3-3 建立設定檔
```bash
mkdir -p ~/.cloudflared

# 取得剛才的 TUNNEL_ID
TUNNEL_ID=$(cloudflared tunnel list | grep kaohsiung-bus-proxy | awk '{print $1}')

cat > ~/.cloudflared/config.yml <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: /home/pi/.cloudflared/${TUNNEL_ID}.json

ingress:
  - hostname: bus-api.你的域名.com
    service: http://localhost:8082
    originRequest:
      connectTimeout: 30s
      noTLSVerify: true
  - service: http_status:404
EOF
```

### 3-4 安裝為 systemd 服務並啟動
```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

### 3-5 驗證公網存取
```bash
curl https://bus-api.你的域名.com/health
curl "https://bus-api.你的域名.com/api/estimated_arrivals?\$filter=routeid%20eq%20'856'%20and%20direction%20eq%200"
```

---

## 4. 常用管理指令

| 操作 | 指令 |
|------|------|
| 重啟代理服務 | `sudo systemctl restart kaohsiung-bus-proxy` |
| 重啟 Tunnel | `sudo systemctl restart cloudflared` |
| 看代理日誌 | `sudo journalctl -u kaohsiung-bus-proxy -f` |
| 看 Tunnel 日誌 | `sudo journalctl -u cloudflared -f` |
| 停用開機自啟 | `sudo systemctl disable kaohsiung-bus-proxy` |
| 更新程式碼後重啟 | `cd ~/kaohsiung_bus_proxy && git pull && sudo systemctl restart kaohsiung-bus-proxy` |
| 檢查端口佔用 | `ss -tlnp | grep 8082` |

---

## 5. 關鍵檔案位置速查

```
/home/pi/kaohsiung_bus_proxy/
├── proxy_server.py          # 主程式
├── venv/                    # 虛擬環境
├── requirements.txt
└── deploy_pi.sh             # 部署腳本

/etc/systemd/system/
├── kaohsiung-bus-proxy.service   # 代理服務
# cloudflared 服務由 cloudflared service install 自動建立

/home/pi/.cloudflared/
├── config.yml               # Tunnel 設定
└── <TUNNEL_ID>.json         # 憑證 (勿外洩)
```

---

## 6. 故障排除快速查核

| 現象 | 檢查項目 |
|------|----------|
| `systemctl status` 顯示 failed | `journalctl -u kaohsiung-bus-proxy -n 50` 看錯誤 |
| Port 8082 被佔用 | `sudo lsof -i :8082` 或改 PORT 環境變數 |
| Tunnel 連不上 localhost | 確認 `cloudflared` 服務啟動、config.yml service 指向正確 |
| 公網 502 Bad Gateway | 確認本地 `curl localhost:8082/health` 正常、Tunnel 狀態 running |
| CORS 被瀏覽器擋 | 確認 proxy_server.py 有回傳 `Access-Control-Allow-Origin: *` |

---

## 7. 更新 Subscription Key (如過期)

```bash
# 編輯 proxy_server.py
nano ~/kaohsiung_bus_proxy/proxy_server.py
# 找到 SUBSCRIPTION_KEY = "..." 替換新值

# 重啟服務生效
sudo systemctl restart kaohsiung-bus-proxy
```