# Habilita — documentação de habilitação do Serpro

Busca bonita (com voz) sobre a pasta pública do SerproDrive *SUPCO_TRIBUTARIO_DOCUMENTAÇÃO*.

- `sync/sincronizar.py` — robô: lê a pasta pública (WebDAV do Nextcloud), baixa só o que mudou, extrai texto (OCR para escaneados), acha a validade de cada certidão (no PDF ou na tabela de vencimentos) e gera `docs/dados.json`, cópias dos PDFs e miniaturas.
- `docs/` — site estático: busca no navegador (MiniSearch), sinônimos de habilitação, estado/capital, validade, kit de documentos e voz pelo reconhecimento do próprio navegador.
- `sync/rodar.sh` — roda a cada hora pelo cron e publica no GitHub Pages (pasta `docs/`). `sync/github-actions-atualizar.yml.modelo` é a alternativa pelo GitHub Actions (precisa de token com escopo `workflow`).

Sem nenhuma API paga.
