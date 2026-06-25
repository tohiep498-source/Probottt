#!/bin/bash

# Clear terminal and design header
clear
echo -e "\033[1;32m==================================================="
echo -e "   KHỞI ĐỘNG HỆ THỐNG LUCKYBANK - TỰ ĐỘNG (MAC/LINUX)"
echo -e "===================================================\033[0m"
echo ""

# Check Node.js
if ! command -v node &> /dev/null
then
    echo -e "\033[1;31mKHÔNG TÌM THẤY NODE.JS!\033[0m"
    echo "Vui lòng tải và cài đặt Node.js từ https://nodejs.org/"
    exit 1
fi

# Set up environment variables file if it doesn't exist
if [ ! -f .env ]; then
    echo "[i] Đang tạo file cấu hình .env từ file mẫu..."
    cp .env.example .env
fi

# Install dependencies if node_modules is missing
if [ ! -d node_modules ]; then
    echo "[i] Đang cài đặt các thư viện cần thiết (npm install)..."
    npm install
fi

echo ""
echo -e "\033[1;32m==================================================="
echo -e "[OK] Hệ thống khởi động thành công!"
echo -e "Truy cập đường dẫn: http://localhost:3000"
echo -e "===================================================\033[0m"
echo ""

# Open web browser automatically if on macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
    open "http://localhost:3000"
fi

# Execute start development script
npm run dev
