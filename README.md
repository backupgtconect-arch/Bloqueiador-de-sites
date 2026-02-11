# Bloqueiador-de-sites
Pequeno serviço que aceita upload de arquivos PDF e XLS/XLSX, extrai links e retorna um arquivo `.txt` contendo os domínios únicos encontrados.

Quickstart

- Instalar dependências:

```bash
npm install
```

- Rodar em desenvolvimento:

```bash
npm start
```

Depois abra `http://localhost:3000` e faça upload de um arquivo PDF ou XLS/XLSX. O servidor retornará automaticamente um arquivo `domains.txt` contendo a lista de domínios únicos.

Arquivos chave

- `server.js`: servidor Express que processa uploads e extrai links
- `public/index.html`: página simples para enviar arquivos e baixar o `.txt`
- `package.json`: scripts e dependências

Notas de implementação

- PDFs são processados com `pdf-parse` (texto extraído e regex para urls).
- Planilhas são processadas com `xlsx` (cada célula é verificada por urls).
- Domínios são normalizados usando `URL` e retornados sem prefixo (`http://`/`https://`), caminho ou porta; `www.` é removido.

OCR (scanned PDFs)

- Há suporte opcional a OCR para PDFs escaneados. Isso usa utilitários do sistema: `pdftoppm` (poppler) ou `convert` (ImageMagick) para rasterizar a primeira página, e `tesseract` para extrair texto. Esses binários não são instalados pelo npm — instale-os no sistema quando necessário.
- Como usar: envie o upload e adicione `?ocr=1` ao endpoint para forçar OCR, por exemplo via `curl`:

```bash
curl -F "file=@scanned.pdf" "http://localhost:3000/upload?ocr=1&debug=1"
```

- Se os utilitários estiverem ausentes, o servidor retornará um motivo no modo `debug`.

Uploads grandes / 413 Request Entity Too Large

- Se você estiver recebendo `413 Request Entity Too Large` isso normalmente vem do proxy reverso (ex.: Nginx) que antecipa o upload antes do Node.js. Ajuste o Nginx adicionando/alterando dentro do bloco `http` ou `server`:

```nginx
# Exemplo (coloque dentro de `http {}` ou do `server {}`):
server {
	# ...
	client_max_body_size 500M; # por exemplo 500MB
}
```

Ou use o arquivo de exemplo incluso no repositório: `nginx.client_max_body_size.conf` — copie-o para `/etc/nginx/conf.d/` ou inclua seu conteúdo no `nginx.conf`.

- Após alterar, recarregue o Nginx: `sudo systemctl reload nginx`.
- No servidor Node, também definimos um limite de upload em `server.js` (padrão 50MB). Você pode aumentar `MAX_FILE_BYTES` no arquivo se necessário.
- No servidor Node, o limite padrão é definido por `MAX_FILE_MB` — por padrão `200` (200MB). Para alterar sem editar o código, exporte a variável antes de iniciar, por exemplo para 500MB:

```bash
export MAX_FILE_MB=500
npm start
```

- Se você preferir configurar no código, edite `server.js`.
- Se você não controla o proxy (por exemplo hospedagem que aplica limites), use arquivos menores ou um uploader em partes (chunked) para evitar o limite.

Se quiser que eu adicione validação adicional, suporte a ZIPs de múltiplos arquivos ou processamento assíncrono/filas, me avise.
