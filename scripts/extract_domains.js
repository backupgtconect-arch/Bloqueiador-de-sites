const fs = require('fs');
const path = require('path');

const input = process.argv[2] || 'tmp/teste_ocr.txt';
const output = process.argv[3] || 'tmp/teste_domains.txt';

function normalizeDomain(h) {
  if (!h) return null;
  h = h.toLowerCase().trim();
  if (h.endsWith('.')) h = h.slice(0, -1);
  if (h.startsWith('www.')) h = h.slice(4);
  // remove port
  h = h.replace(/:\d+$/,'');
  return h;
}

function extractDomainsFromText(text) {
  const domains = new Set();

  const urlRegex = /https?:\/\/[^\s"'\)<>]+/gim;
  let m;
  while ((m = urlRegex.exec(text)) !== null) {
    try {
      const u = m[0].replace(/[\),.;:]+$/,'');
      const hostname = new URL(u).hostname;
      const d = normalizeDomain(hostname);
      if (d) domains.add(d);
    } catch (e) {
      // ignore
    }
  }

  // bare domains (like example.com) - avoid emails and short TLD-like words
  const bareRegex = /\b(?:www\.)?([a-z0-9\-]+(?:\.[a-z0-9\-]+){1,})\b/ig;
  while ((m = bareRegex.exec(text)) !== null) {
    const candidate = m[1];
    if (!candidate) continue;
    // reject if looks like an email (preceded by @)
    const beforeChar = text[m.index - 1];
    if (beforeChar === '@') continue;
    // basic TLD check: last label length 2-24 and all letters
    const parts = candidate.split('.');
    const last = parts[parts.length -1];
    if (!/^[a-z]{2,24}$/i.test(last)) continue;
    try {
      const maybe = 'http://' + candidate;
      const hostname = new URL(maybe).hostname;
      const d = normalizeDomain(hostname);
      if (d) domains.add(d);
    } catch (e) {
      // ignore
    }
  }

  return Array.from(domains).sort();
}

try {
  const text = fs.readFileSync(input, 'utf8');
  const domains = extractDomainsFromText(text);
  fs.writeFileSync(output, domains.join('\n') + (domains.length? '\n' : ''), 'utf8');
  console.log(`Found ${domains.length} domains, saved to ${output}`);
} catch (err) {
  console.error('Erro:', err.message);
  process.exit(1);
}
