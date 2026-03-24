const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { name, data } = JSON.parse(body);
        const base64 = data.replace(/^data:image\/png;base64,/, '');
        const outPath = path.join(__dirname, '..', 'assets', 'images', name);
        fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ saved: outPath }));
        console.log('Saved:', outPath);
      } catch (e) {
        res.writeHead(500);
        res.end(e.message);
      }
    });
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }
  const fileName = req.url === '/splash' ? 'splash.html' : 'index.html';
  const filePath = path.join(__dirname, fileName);
  const content = fs.readFileSync(filePath, 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(content);
});

server.listen(3456, () => {
  console.log('Logo server running on http://localhost:3456');
});
