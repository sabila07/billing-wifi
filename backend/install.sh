#!/bin/bash
# =============================================
# Script instalasi otomatis di VPS Ubuntu/Debian
# Jalankan: bash install.sh
# =============================================

echo "===== Billing WiFi OLT Backend ====="
echo "Memulai instalasi..."

# Update sistem
apt-get update -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verifikasi
echo "Node.js: $(node -v)"
echo "npm: $(npm -v)"

# Install PM2 (process manager agar backend jalan terus)
npm install -g pm2

# Masuk ke folder backend
cd /root/billing-wifi-backend || { echo "Folder tidak ditemukan!"; exit 1; }

# Buat file .env dari contoh jika belum ada
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "⚠️  File .env telah dibuat. Silakan edit dulu:"
  echo "    nano /root/billing-wifi-backend/.env"
  echo ""
fi

# Install dependencies
npm install

# Start dengan PM2
pm2 start server.js --name billing-olt-api
pm2 save
pm2 startup

# Install nginx sebagai reverse proxy (opsional)
apt-get install -y nginx

# Buat konfigurasi nginx
cat > /etc/nginx/sites-available/billing-olt << 'EOF'
server {
    listen 80;
    server_name _;

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
    }

    location / {
        return 200 'Billing WiFi OLT API aktif';
        add_header Content-Type text/plain;
    }
}
EOF

ln -sf /etc/nginx/sites-available/billing-olt /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# Buka port firewall
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS (jika pakai SSL)
ufw --force enable

echo ""
echo "===== INSTALASI SELESAI ====="
echo "Status: $(pm2 status)"
echo ""
echo "Langkah selanjutnya:"
echo "1. Edit konfigurasi: nano /root/billing-wifi-backend/.env"
echo "2. Restart: pm2 restart billing-olt-api"
echo "3. Cek log: pm2 logs billing-olt-api"
echo ""
echo "Test API:"
echo "curl http://IP_VPS_ANDA/api/ont/SERIAL_NUMBER -H 'x-api-key: KUNCI_ANDA'"
