# Instruções rápidas para agentes (repositório: Bloqueiador-de-sites)

Resumo (big picture)
- Serviço Node/Express monolítico: todo o comportamento está em `server.js`.
- Serve `public/` estático (UI simples em `public/index.html`) e processa uploads em `/upload`.
- Fluxo: cliente envia arquivo (form field `file`) -> `server.js` extrai texto/URLs -> normaliza domínios -> responde com `domains.txt`.

Endpoints importantes
- `POST /upload` — multipart form, campo `file`. Aceita `.pdf`, `.xls`, `.xlsx`. Query params: `ocr=1` (forçar OCR), `debug=1` (retorna JSON com razão em falhas). UI já monta esses params.
- `GET /progress` — Server-Sent Events (SSE). Emite `{ percent, message }` para atualizar progresso (consumido pela UI em `public/index.html`).

Arquivos/locais chave
- `server.js` — toda a lógica de upload, parsing (pdf-parse, xlsx) e OCR. Leia este arquivo para entender comportamento exato.
- `public/index.html` — UI de upload e exemplo de consumo de `/progress` e de download do `domains.txt`.
- `nginx.client_max_body_size.conf` — exemplo de configuração Nginx para aumentar `client_max_body_size` (importante para uploads grandes).
- `tmp/` — diretório de destino temporário do `multer` (arquivos são apagados em `finally`).
- `package.json` — dependências: `express`, `multer`, `pdf-parse`, `xlsx`, `cors`.

Padrões e decisões de implementação descobertas
- Extração de URLs: função `extractUrlsFromText` usa regex para URLs explícitas e também procura padrões "bare" (`www...`/domínios) e prefixa com `http://` quando necessário.
- Normalização de domínios: `extractDomains` usa `new URL(...)`, remove `www.`, porta e trailing dots; retorna lista ordenada.
- Planilhas: `XLSX.utils.sheet_to_json(..., { header: 1, raw: false })` é usada para iterar células como strings.
- OCR: implementação depende de binários do sistema — `pdftoppm` (poppler) ou `convert` (ImageMagick) para rasterizar e `tesseract` para OCR. O código usa `spawnSync` para esses comandos.

Implicações operacionais observadas
- Limites de upload: existe um limite por arquivo em `multer` definido por `MAX_FILE_MB` (env var). Valor padrão codificado é 200 (MB).
- Proxy reverso: se encontrar `413`, o problema pode vir do Nginx (ver `nginx.client_max_body_size.conf`).
- Bloqueio/concorrência: o uso de `spawnSync` bloqueia o event loop enquanto as ferramentas externas rodam — isso torna o servidor sensível a requisições concorrentes quando OCR está habilitado.

Como depurar localmente
- Instalar dependências e rodar:

  npm install
  npm start

- Variáveis de ambiente úteis:
  - `PORT` — porta do servidor (padrão 3000)
  - `MAX_FILE_MB` — limite por arquivo em MB (padrão 200)

Exemplos úteis (extraídos do código)
- Upload simples via curl (retorna arquivo `domains.txt`):

  curl -F "file=@arquivo.pdf" http://localhost:3000/upload -o domains.txt

- Upload com OCR forçado e debug para receber razão em falhas:

  curl -F "file=@scanned.pdf" "http://localhost:3000/upload?ocr=1&debug=1"

- Consumir progresso (SSE) — a UI já usa `new EventSource('/progress')` e espera mensagens com `data: JSON` contendo `percent` e `message`.

Observações para agentes que vão editar o código
- Alterações em `server.js` afetam todo o fluxo; mantenha clareza sobre:
  - Onde `tmp/` é usado (multer dest) e limpeza em `finally`.
  - O comportamento de OCR (checa `command -v` para `pdftoppm|convert|tesseract`) e o uso de `spawnSync`.
- Se for introduzir processamento assíncrono (fila/workers), atualize também a SSE `/progress` para refletir progresso assíncrono.
- Evite alterar o esquema de resposta do endpoint `/upload` sem adaptar `public/index.html` (ela espera `domains.txt` ou JSON em modo debug).

Checklist rápido ao editar
- Teste upload de PDF e XLSX localmente.
- Teste OCR somente em máquina com `pdftoppm|convert|tesseract` instalados.
- Verifique que `tmp/` é limpo após falhas ou sucesso.

Feedback
- Se algo estiver confuso ou faltar contexto (ex.: testes, contêiner Docker, integração contínua), diga quais pontos quer que eu detalhe ou adicione.
