#!/usr/bin/env bash
# Robô horário do Habilita (cron desta máquina): sincroniza com a pasta pública e publica se algo mudou.
# O GitHub Pages serve a pasta docs/ da branch main; cada push republica o site.
set -euo pipefail
cd "$(dirname "$0")/.."
T="$HOME/.local/tesseract"   # tesseract instalado sem sudo (pacotes .deb extraídos)
export PATH="$T/usr/bin:$HOME/.local/bin:$PATH"
export LD_LIBRARY_PATH="$T/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export TESSDATA_PREFIX="$T/usr/share/tesseract-ocr/4.00/tessdata"
echo "== $(date '+%d/%m %H:%M')"
python3 sync/sincronizar.py
git add docs
if ! git diff --cached --quiet; then
  git commit -q -m "Atualiza documentos da pasta ($(date '+%d/%m %H:%M'))"
  ok=0
  for i in 1 2 3; do if git push -q origin main; then ok=1; break; fi; sleep $((i * 10)); done
  [ "$ok" = 1 ] && echo "publicado" || echo "FALHOU o envio ao GitHub (fica para a próxima hora)"
fi
