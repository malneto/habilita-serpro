# Habilita — documentação de habilitação do Serpro

Busca bonita (com voz) sobre a pasta pública do SerproDrive *SUPCO_TRIBUTARIO_DOCUMENTAÇÃO*.

- `sync/sincronizar.py` — robô: lê a pasta pública (WebDAV do Nextcloud), baixa só o que mudou, extrai texto (OCR para escaneados), acha a validade de cada certidão (no PDF ou na tabela de vencimentos) e gera `site/dados.json`, cópias dos PDFs e miniaturas.
- `site/` — site estático: busca no navegador (MiniSearch), sinônimos de habilitação, estado/capital, validade, kit de documentos e voz pelo reconhecimento do próprio navegador.
- `.github/workflows/atualizar.yml` — roda a cada hora e publica no GitHub Pages.

Sem nenhuma API paga.
