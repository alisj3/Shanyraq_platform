#!/bin/zsh
cd "$(dirname "$0")" || exit 1
if curl --silent --max-time 1 'http://127.0.0.1:4173/api/health' | /usr/bin/grep -q '"local": true'; then
  open 'http://127.0.0.1:4173'
  echo 'Навигатор уже запущен.'
  exit 0
fi
open 'http://127.0.0.1:4173'
exec /usr/bin/python3 server.py --port 4173
