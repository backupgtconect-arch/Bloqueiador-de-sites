const http = require('http');
const fs = require('fs');
const path = require('path');

const filePath = process.argv[2] || path.join(__dirname, '..', 'tmp', 'teste.pdf');
const url = process.argv[3] || 'http://localhost:3000/upload?debug=1';

const boundary = '----WebKitFormBoundary' + Math.random().toString(16).slice(2);
const stats = fs.statSync(filePath);
const fileStream = fs.createReadStream(filePath);

const postOptions = new URL(url);
postOptions.method = 'POST';
postOptions.headers = {
  'Content-Type': 'multipart/form-data; boundary=' + boundary,
};

const req = http.request(postOptions, (res) => {
  console.log('STATUS', res.statusCode);
  console.log('HEADERS', res.headers);
  let data = '';
  res.setEncoding('utf8');
  res.on('data', chunk => { data += chunk; process.stdout.write(chunk); });
  res.on('end', () => { console.log('\n--- RESPONSE END ---'); });
});

req.on('error', (e) => { console.error('problem with request:', e.message); });

// write multipart headers
req.write(`--${boundary}\r\n`);
req.write(`Content-Disposition: form-data; name="file"; filename="${path.basename(filePath)}"\r\n`);
req.write('Content-Type: application/pdf\r\n\r\n');

// pipe file
fileStream.on('end', () => {
  req.write('\r\n');
  req.write(`--${boundary}--\r\n`);
  req.end();
});
fileStream.pipe(req, { end: false });
