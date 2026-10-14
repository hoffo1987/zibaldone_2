// Local preview of the real onboarding component, without signing in or connecting to Firebase.
const fs = require('fs');
const http = require('http');
const path = require('path');
const webpack = require('webpack');
const root = path.join(__dirname, '..'), output = path.join(root, '.tour-preview');
process.env.BABEL_ENV = 'development';
const compiler = webpack({
  mode: 'development', context: root, entry: './src/tour/preview.tsx',
  output: { path: output, filename: 'preview.js' },
  plugins: [new webpack.DefinePlugin({ 'process.env.PUBLIC_URL': JSON.stringify('') })],
  resolve: { extensions: ['.tsx', '.ts', '.js'] },
  module: { rules: [
    { test: /\.[jt]sx?$/, exclude: /node_modules/, use: { loader: require.resolve('babel-loader'), options: { presets: [[require.resolve('babel-preset-react-app'), { runtime: 'automatic' }]] } } },
    { test: /\.css$/, use: [require.resolve('style-loader'), require.resolve('css-loader'), { loader: require.resolve('postcss-loader'), options: { postcssOptions: { plugins: [require('tailwindcss')(path.join(root, 'tailwind.config.js')), require('autoprefixer')] } } }] },
  ] },
});
let listening = false;
const server = http.createServer((req, res) => {
  const name = (req.url || '/').split('?')[0];
  if (name === '/') {
    const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8').replaceAll('%PUBLIC_URL%', '').replace('</body>', '<script src="/preview.js"></script></body>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return;
  }
  const file = name === '/preview.js' ? path.join(output, 'preview.js') : /^\/audio\/[a-zA-Z0-9-]+\.(mp3|wav)$/.test(name) || name === '/favicon.svg' || name === '/manifest.json' ? path.join(root, 'public', name) : null;
  if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript; charset=utf-8' : name.endsWith('.mp3') ? 'audio/mpeg' : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.json') ? 'application/json' : 'audio/wav');
  fs.createReadStream(file).pipe(res);
});
compiler.watch({}, (error, stats) => {
  if (error || stats.hasErrors()) { console.error(error || stats.toString({ all: false, errors: true })); return; }
  if (!listening) { listening = true; server.listen(4174, '127.0.0.1', () => console.log('Intro review: http://127.0.0.1:4174')); }
  else console.log('Preview updated; reload the browser.');
});
const close = () => { server.close(); compiler.close(() => process.exit()); };
process.on('SIGINT', close); process.on('SIGTERM', close);
