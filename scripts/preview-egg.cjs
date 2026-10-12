// Isolated local preview: no sign-in or Firebase connection required.
const path = require('path');
const fs = require('fs');
const http = require('http');
const webpack = require('webpack');
const root = path.join(__dirname, '..'), output = path.join(root, '.egg-preview');
const config = {
  mode: 'development', context: root, entry: './scripts/egg-preview.tsx',
  output: { path: output, filename: 'preview.js', publicPath: '/' },
  resolve: { extensions: ['.tsx', '.ts', '.js'] },
  module: { rules: [
    { test: /\.[jt]sx?$/, exclude: /node_modules/, use: { loader: require.resolve('babel-loader'), options: { presets: [[require.resolve('babel-preset-react-app'), { runtime: 'automatic' }]] } } },
    { test: /\.png$/, type: 'asset/resource' },
  ] },
};
process.env.BABEL_ENV = 'development';
webpack(config, (error, stats) => {
  if (error || stats.hasErrors()) { console.error(error || stats.toString({ all: false, errors: true })); process.exitCode = 1; return; }
  http.createServer((req, res) => {
    const name = req.url?.split('?')[0];
    if (name === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cloud · Sprite review</title><body style="margin:0;background:#05040a"><div id="root"></div><script src="/preview.js"></script></body></html>'); return; }
    if (!/^\/[a-zA-Z0-9.-]+\.(js|png)$/.test(name || '')) { res.writeHead(404); res.end(); return; }
    const file = path.join(output, name.slice(1));
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', name.endsWith('.png') ? 'image/png' : 'text/javascript; charset=utf-8');
    fs.createReadStream(file).pipe(res);
  }).listen(4173, '127.0.0.1', () => console.log('Sprite review: http://127.0.0.1:4173'));
});
