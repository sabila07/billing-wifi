# Backend OLT Hioso — Billing WiFi

## Cara Install di VPS Ubuntu/Debian

```bash
# 1. Upload folder ini ke VPS
scp -r backend/ root@IP_VPS:/root/billing-wifi-backend

# 2. Masuk ke VPS
ssh root@IP_VPS

# 3. Jalankan installer otomatis
cd /root/billing-wifi-backend
bash install.sh

# 4. Edit konfigurasi
nano .env

# 5. Restart
pm2 restart billing-olt-api
pm2 logs billing-olt-api
```

## File .env yang perlu diisi

```env
OLT_HOST=192.168.1.1     # IP OLT Hioso Anda
OLT_PORT=22              # Port SSH
OLT_USER=admin           # Username OLT
OLT_PASS=admin           # Password OLT
API_KEY=buat-kunci-acak  # Kunci rahasia (bebas)
ALLOWED_ORIGIN=https://sabila07.github.io
```

## Test API

```bash
# Cek server aktif
curl http://localhost:3000/

# Cek info ONT
curl http://localhost:3000/api/ont/HSGQ1234ABCD \
  -H "x-api-key: KUNCI_ANDA"

# Isolir ONT
curl -X POST http://localhost:3000/api/ont/HSGQ1234ABCD/isolir \
  -H "x-api-key: KUNCI_ANDA" \
  -H "Content-Type: application/json" \
  -d '{"port":"gei_1/1/1","ontId":"1"}'

# Aktifkan ONT
curl -X POST http://localhost:3000/api/ont/HSGQ1234ABCD/aktifkan \
  -H "x-api-key: KUNCI_ANDA" \
  -H "Content-Type: application/json" \
  -d '{"port":"gei_1/1/1","ontId":"1"}'
```
