const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function commandExists(cmd) {
  try { const r = spawnSync('which', [cmd]); return r.status === 0; } catch (e) { return false; }
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return r;
}

async function ocrAllPages(inputPdf, outTxt) {
  if (!fs.existsSync(inputPdf)) {
    console.error('Arquivo não encontrado:', inputPdf);
    process.exit(2);
  }

  const tmpDir = path.dirname(inputPdf);
  const base = path.basename(inputPdf, path.extname(inputPdf));
  const outPrefix = path.join(tmpDir, base + '_p');

  let converter = null;
  if (commandExists('pdftocairo')) converter = 'pdftocairo';
  else if (commandExists('pdftoppm')) converter = 'pdftoppm';
  else if (commandExists('convert')) converter = 'convert';

  if (!converter) {
    console.error('Nenhum conversor de PDF disponível (pdftocairo|pdftoppm|convert)');
    process.exit(3);
  }

  console.log('Usando conversor:', converter);

  if (converter === 'pdftocairo') {
    // pdftocairo -png -r 300 input.pdf outPrefix
    const r = run('pdftocairo', ['-png', '-r', '300', inputPdf, outPrefix]);
    if (r.status !== 0) { console.error('pdftocairo erro:', r.stderr); process.exit(4); }
  } else if (converter === 'pdftoppm') {
    const r = run('pdftoppm', ['-png', inputPdf, outPrefix]);
    if (r.status !== 0) { console.error('pdftoppm erro:', r.stderr); process.exit(4); }
  } else if (converter === 'convert') {
    // convert input.pdf page_%03d.png
    const outPattern = outPrefix + '-%d.png';
    const r = run('convert', [inputPdf, outPattern]);
    if (r.status !== 0) { console.error('convert erro:', r.stderr); process.exit(4); }
  }

  // collect generated pngs: match base_p-1.png or base_p-1.png or base_p-0.png
  const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(base + '_p') && f.endsWith('.png'))
    .map(f => path.join(tmpDir, f))
    .sort((a,b)=> a.localeCompare(b, undefined, {numeric:true}));

  if (files.length === 0) {
    console.error('Nenhuma imagem gerada pelo conversor. Verifique permissões/policies.');
    process.exit(5);
  }

  console.log('Imagens geradas:', files.length);

  let finalText = '';
  for (const f of files) {
    console.log('OCR:', f);
    const t = run('tesseract', [f, 'stdout']);
    if (t.status !== 0) {
      console.error('Tesseract erro na imagem', f, t.stderr);
      // continue to next page
      continue;
    }
    finalText += t.stdout + '\n';
  }

  fs.writeFileSync(outTxt, finalText, 'utf8');
  console.log('Texto salvo em', outTxt);

  // cleanup images
  for (const f of files) {
    try { fs.unlinkSync(f); } catch (e) {}
  }
}

const input = process.argv[2] || path.join(__dirname, '..', 'tmp', 'teste.pdf');
const out = process.argv[3] || path.join(__dirname, '..', 'tmp', path.basename(input, path.extname(input)) + '.txt');

ocrAllPages(input, out).catch(e => { console.error(e); process.exit(1); });
