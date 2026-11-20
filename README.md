# Kaohsiung Bus CORS Proxy - Raspberry Pi 部署指南

## 概覽
這是一個 Flask + Gunicorn 的 CORS 代理伺服器，解決 `ibusplus.tbkc.gov.tw` 新版 API 的跨域限制，將請求轉發至 Foxconn 雲端 OData API (`citygpt.foxconn.com`)。

## 快速開始 (三種部署方式)

### 方式一：原生 systemd (推薦，最輕量)
```bash
# 1. 複製專案到樹莓派
scp -r kaohsiung_bus_proxy pi@raspberrypi.local:~/

# 2. SSH 進入樹莓派執行部署腳本
ssh pi@raspberrypi.local
cd ~/kaohsiung_bus_proxy
chmod +x deploy_pi.sh
./deploy_pi.sh

# 3. 設定 Cloudflare Tunnel (見下方)
```

### 方式二：Docker Compose (含 Cloudflare Tunnel)
```bash
# 1. 複製專案並修改 cloudflared-config.yml
# 2. 建立 tunnel 並取得憑證
cloudflared tunnel login
cloudflared tunnel create kaohsiung-bus-proxy
cloudflared tunnel route dns kaohsiung-bus-proxy bus-api.yourdomain.com

# 3. 複製產生的憑證檔到專案目錄
cp ~/.cloudflared/<TUNNEL_ID>.json ./cloudflared-credentials.json

# 4. 修改 docker-compose.yml 中的 credentials 路徑
# 5. 啟動
docker compose up -d
```

### 方式三：手動部署 (最小依賴)
```bash
# 安裝依賴
sudo apt install python3 python3-venv python3-pip

# 建立環境
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 直接運行 (測試用)
python proxy_server.py

# 生產環境用 gunicorn
gunicorn --bind 0.0.0.0:8082 --workers 2 --timeout 60 proxy_server:app
```

## Cloudflare Tunnel 完整設定步驟

### 1. 安裝 cloudflared
```bash
# Raspberry Pi (ARM64)
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
sudo dpkg -i cloudflared.deb
```

### 2. 登入並建立 Tunnel
```bash
cloudflared tunnel login
# 瀏覽器開啟授權頁面，選擇你的域名

cloudflared tunnel create kaohsiung-bus-proxy
# 輸出會包含 TUNNEL_ID，記下來

cloudflared tunnel route dns kaohsiung-bus-proxy bus-api.yourdomain.com
```

### 3. 建立設定檔
```bash
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml <<EOF
tunnel: <YOUR_TUNNEL_ID>
credentials-file: /home/pi/.cloudflared/<YOUR_TUNNEL_ID>.json

ingress:
  - hostname: bus-api.yourdomain.com
    service: http://localhost:8082
    originRequest:
      connectTimeout: 30s
      noTLSVerify: true
  - service: http_status:404
EOF
```

### 4. 安裝為系統服務
```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

### 5. 驗證
```bash
# 本地測試
curl http://localhost:8082/health

# 公網測試
curl https://bus-api.yourdomain.com/health
curl "https://bus-api.yourdomain.com/api/routes"
```

## API 端點對照表

| 本地端點 | 上游端點 | 說明 |
|---------|---------|------|
| `/api/routes` | `/abfs/dal/v_stg_tdx_route` | 所有路線 |
| `/api/estimated_arrivals` | `/abfs/dal/v_stg_tdx_estimatedtimeofarrival_pt1m` | 即時到站時間 |
| `/api/stops` | `/abfs/dal/v_stg_tdx_stop` | 站點資訊 (含座標) |
| `/api/shapes` | `/abfs/dal/v_stg_tdx_shape` | 路線幾何 (LINESTRING) |
| `/api/realtime` | `/abfs/dal/v_stg_tdx_realtimebyfrequency_pt1m` | 即時車輛位置 |
| `/api/alerts` | `/abfs/dal/v_stg_tdx_alert` | 公告/異常 |
| `/api/operators` | `/abfs/dal/v_stg_tdx_operator` | 業者資訊 |
| `/api/schedules` | `/abfs/dal/v_stg_tdx_schedule` | 時刻表 |
| `/api/groups` | `/abfs/dal/v_stg_ibus_routegrp` | 路線群組 |
| 共 25+ 端點 | 見 `proxy_server.py` ENDPOINTS |  |

## 查詢參數範例 (OData $filter)

```bash
# 紅56科技幹線 (856) 去程 (direction=0) 到站時間
curl "https://bus-api.yourdomain.com/api/estimated_arrivals?\$filter=routeid%20eq%20'856'%20and%20direction%20eq%200"

# 特定路線的站點
curl "https://bus-api.yourdomain.com/api/stops?\$filter=routeid%20eq%20'856'"

# 路線幾何
curl "https://bus-api.yourdomain.com/api/shapes?\$filter=routeid%20eq%20'856'"
```

## 監控與維護

### 服務狀態
```bash
# systemd 方式
sudo systemctl status kaohsiung-bus-proxy
sudo journalctl -u kaohsiung-bus-proxy -f

# Docker 方式
docker compose logs -f kaohsiung-bus-proxy
docker compose ps
```

### Cloudflare Tunnel 狀態
```bash
sudo systemctl status cloudflared
sudo journalctl -u cloudflared -f
cloudflared tunnel list
```

### 健康檢查
```bash
# 本地
curl http://localhost:8082/health

# 公網 (Cloudflare 會快取 5xx 錯誤，建議用 health endpoint)
curl https://bus-api.yourdomain.com/health
```

## 效能調優建議

### Raspberry Pi 4 (4GB/8GB)
```bash
# gunicorn workers = CPU 核心數 * 2 + 1
# Pi 4 有 4 核心 -> 9 workers 可能太多，建議 2-4
gunicorn --workers 2 --worker-class gthread --threads 4 ...
```

### 記憶體優化
```bash
# 限制記憶體使用 (systemd)
MemoryMax=512M

# Docker
deploy:
  resources:
    limits:
      memory: 512M
```

## 常見問題

### Q: cloudflared 連不上 localhost:8082
**A**: 確認 `network_mode: host` (Docker) 或 service 設定正確。cloudflared 需要能存取 host 的 localhost。

### Q: CORS 仍被瀏覽器擋下
**A**: 確認 `Access-Control-Allow-Origin: *` 標頭已回傳。proxy_server.py 已內建 CORS 處理。

### Q: 上游 API 回傳 401/403
**A**: Subscription Key 可能過期，需更新 `proxy_server.py` 中的 `SUBSCRIPTION_KEY`。

### Q: 查詢超時
**A**: 調整 `originRequest.connectTimeout` 和 gunicorn `--timeout` 參數。

## 專案結構
```
kaohsiung_bus_proxy/
├── proxy_server.py          # 主程式
├── requirements.txt         # Python 依賴
├── Dockerfile               # Docker 映像
├── docker-compose.yml       # Docker Compose (含 cloudflared)
├── deploy_pi.sh             # Pi 部署腳本
├── cloudflared-config.yml.example  # Tunnel 設定範例
└── README.md                # 本檔案
```

## 授權
內部工具，請勿公開散布 API Key。