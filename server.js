const express = require('express');
const multer = require('multer');
const pdf = require('pdf-parse');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { spawnSync } = require('child_process');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// limitar tamanho do upload por arquivo (MB configurável via env MAX_FILE_MB)
const DEFAULT_MAX_MB = 200;
const maxMb = parseInt(process.env.MAX_FILE_MB || String(DEFAULT_MAX_MB), 10) || DEFAULT_MAX_MB;
const MAX_FILE_BYTES = maxMb * 1024 * 1024;
const upload = multer({ dest: path.join(__dirname, 'tmp'), limits: { fileSize: MAX_FILE_BYTES } });

function extractUrlsFromText(text) {
  if (!text) return [];
  const seen = new Set();
  const results = [];
  const urlRegex = /https?:\/\/[^\s"'<>\)]+/gi;
  const httpMatches = text.match(urlRegex) || [];
  for (const m of httpMatches) {
    if (!seen.has(m)) { seen.add(m); results.push(m); }
  }

  const bareRegex = /(?:www\.)?[a-z0-9][a-z0-9.-]+\.[a-z]{2,}/gi;
  const bareMatches = text.match(bareRegex) || [];
  for (const b of bareMatches) {
    if (/@/.test(b)) continue;
    if (results.some(r => r.includes(b))) continue;
    if (!/[a-z]/i.test(b)) continue;
    const candidate = b.startsWith('http') ? b : 'http://' + b;
    if (!seen.has(candidate)) { seen.add(candidate); results.push(candidate); }
  }

  return results;
}

function extractDomains(urls) {
  const domains = new Set();
  for (let u of urls) {
    try {
      if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
      let hostname = new URL(u).hostname;
      hostname = hostname.split(':')[0].toLowerCase().replace(/^www\./i, '').replace(/\.$/, '');
      if (hostname) domains.add(hostname);
    } catch (err) {
      // ignore invalid URLs
    }
  }
  return Array.from(domains).sort();
}

function commandExists(cmd) {
  try { const r = spawnSync('command', ['-v', cmd]); return r.status === 0; } catch (e) { return false; }
}

function tryOcrForPdf(filePath, outPrefix) {
  const tmpFiles = [];
  try {
    let imgPath = null;
    if (commandExists('pdftoppm')) {
      const args = ['-f', '1', '-l', '1', '-png', filePath, outPrefix];
      const r = spawnSync('pdftoppm', args, { encoding: 'utf8', timeout: 30000 });
      if (r.status === 0) { imgPath = outPrefix + '-1.png'; tmpFiles.push(imgPath); }
    }
    if (!imgPath && commandExists('convert')) {
      imgPath = outPrefix + '-1.png';
      const r = spawnSync('convert', [filePath + '[0]', imgPath], { encoding: 'utf8', timeout: 30000 });
      if (r.status !== 0) imgPath = null; else tmpFiles.push(imgPath);
    }
    if (!imgPath) return { success: false, reason: 'Nenhum conversor de PDF disponível (pdftoppm/convert).' };
    if (!commandExists('tesseract')) return { success: false, reason: 'Tesseract não encontrado no sistema.' };
    const t = spawnSync('tesseract', [imgPath, 'stdout'], { encoding: 'utf8', timeout: 120000 });
    if (t.status !== 0) return { success: false, reason: 'Tesseract falhou: ' + (t.stderr || '').toString() };
    return { success: true, text: t.stdout };
  } catch (err) { return { success: false, reason: String(err) }; } finally { for (const f of tmpFiles) { try { fs.unlinkSync(f); } catch (e) {} } }
}

app.post('/upload', (req, res) => {
  // log básico para diagnóstico: confirma se o request chega ao Node e seu tamanho
  console.log('[upload] attempt', { time: new Date().toISOString(), ip: req.ip || req.connection.remoteAddress, contentLength: req.headers['content-length'] });
  upload.single('file')(req, res, async function (err) {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).send(`Arquivo muito grande. Limite: ${Math.round(MAX_FILE_BYTES / (1024 * 1024))}MB`);
      return res.status(400).send('Erro no upload: ' + (err.message || err.toString()));
    }
    if (!req.file) return res.status(400).send('Nenhum arquivo enviado');
    const ext = path.extname(req.file.originalname).toLowerCase();
    let urls = [];
    try {
      const buffer = fs.readFileSync(req.file.path);
      let extractedText = '';
      if (ext === '.pdf') {
        const data = await pdf(buffer);
        extractedText = data.text || '';
        urls = extractUrlsFromText(extractedText);
        if ((urls.length === 0 || req.query.ocr === '1')) {
          const outPrefix = path.join(__dirname, 'tmp', req.file.filename + '_p');
          const ocrResult = tryOcrForPdf(req.file.path, outPrefix);
          if (ocrResult.success && ocrResult.text) {
            extractedText += '\n' + ocrResult.text;
            const ocrUrls = extractUrlsFromText(ocrResult.text);
            urls.push(...ocrUrls);
          } else if (req.query.ocr === '1') {
            if (req.query.debug === '1') return res.json({ ok: false, reason: ocrResult.reason || 'OCR failed' });
          }
        }
      } else if (ext === '.xls' || ext === '.xlsx') {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const range = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
          for (const row of range) {
            for (const cell of row) {
              if (typeof cell === 'string') {
                const found = cell.match(/https?:\/\/[^\s"'<>\)]+/gi) || [];
                urls.push(...found);
                const bare = cell.match(/(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
                for (const b of bare) {
                  if (!/\./.test(b)) continue;
                  let candidate = b;
                  if (!/^https?:\/\//i.test(candidate)) candidate = 'http://' + candidate;
                  try { urls.push(candidate); } catch (e) {}
                }
                extractedText += cell + '\n';
              }
            }
          }
        }
      } else {
        return res.status(400).send('Tipo de arquivo não suportado. Envie PDF ou XLS/XLSX.');
      }
      const domains = extractDomains(urls);
      const out = domains.join('\n');
      if (req.query.debug === '1') {
        return res.json({ file: req.file.originalname, ext, extractedTextPreview: (extractedText || '').slice(0, 2000), urlsFound: urls.slice(0, 500), domains: domains });
      }
      res.setHeader('Content-disposition', 'attachment; filename=domains.txt');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(out);
    } catch (err) {
      console.error(err);
      res.status(500).send('Erro ao processar o arquivo');
    } finally {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
