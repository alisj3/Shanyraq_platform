#!/bin/zsh
cd "$(dirname "$0")" || exit 1
exec /usr/bin/python3 -B - <<'PY'
from pathlib import Path
import webbrowser

key_path = Path('.local/admin-key')
if not key_path.exists():
    print('Сначала откройте «Запустить навигатор.command».')
else:
    webbrowser.open('http://127.0.0.1:4173/admin#key=' + key_path.read_text().strip())
PY
