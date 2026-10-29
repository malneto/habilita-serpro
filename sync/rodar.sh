#!/usr/bin/env bash
# Robô horário do Habilita (cron desta máquina): sincroniza com a pasta pública e publica se algo mudou.
# O GitHub Pages serve a pasta docs/ da branch main; cada push republica o site.
set -euo pipefail
cd "$(dirname "$0")/.."
T="$HOME/.local/tesseract"   # tesseract instalado sem sudo (pacotes .deb extraídos)
export PATH="$T/usr/bin:$HOME/.local/bin:$PATH"
export LD_LIBRARY_PATH="$T/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export TESSDATA_PREFIX="$T/usr/share/tesseract-ocr/4.00/tessdata"
# Cloudflare Pages (endereço principal): publica a versão SALVA no git, nunca a pasta em edição
publicar_cloudflare() {
  local tmp; tmp=$(mktemp -d)
  git archive HEAD docs | tar -x -C "$tmp"
  if npx --yes wrangler@4.156.0 pages deploy "$tmp/docs" --project-name habilita-serpro --branch main --commit-dirty=true >/dev/null 2>&1; then
    echo "publicado no Cloudflare"
  else
    echo "FALHOU a publicação no Cloudflare (fica para a próxima hora)"
  fi
  rm -rf "$tmp"
}
echo "== $(date '+%d/%m %H:%M')"
python3 sync/sincronizar.py
# só o que o robô gera: nunca leva junto edição em andamento do site
git add docs/dados.json docs/arquivos docs/miniaturas
if ! git diff --cached --quiet; then
  git commit -q -m "Atualiza documentos da pasta ($(date '+%d/%m %H:%M'))"
  ok=0
  for i in 1 2 3; do if git push -q origin main; then ok=1; break; fi; sleep $((i * 10)); done
  [ "$ok" = 1 ] && echo "publicado" || echo "FALHOU o envio ao GitHub (fica para a próxima hora)"
  publicar_cloudflare
fi
