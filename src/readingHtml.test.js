import { clean, readingHtml } from './sanitize';

test('il titolo centrato con spazi incollati usa un allineamento responsive solo in lettura', () => {
  const source = '<div><b style="font-size:14pt">' + '&nbsp; '.repeat(40) + 'La ricerca dello Stupore</b></div>';
  const output = new DOMParser().parseFromString(readingHtml(source), 'text/html');
  expect(output.body.firstChild.style.textAlign).toBe('center');
  expect(output.body.textContent).toBe('La ricerca dello Stupore');
  expect(output.querySelector('b').style.fontSize).toBe('14pt');
  expect(clean(source)).toContain('&nbsp;');
});
test('allineamenti espliciti, rientri brevi e spazi tra parole sono conservati', () => {
  const source = '<p style="text-align:right"><b>' + '&nbsp; '.repeat(12) + 'Titolo</b></p><p>&nbsp;&nbsp;Due parole&nbsp;insieme</p>';
  const output = new DOMParser().parseFromString(readingHtml(source), 'text/html');
  expect(output.querySelector('p').style.textAlign).toBe('right');
  expect(output.querySelectorAll('p')[1].textContent).toBe('\u00a0\u00a0Due parole\u00a0insieme');
});
test('il testo preformattato mantiene gli spazi e il contenuto resta sanificato', () => {
  const source = '<pre><code><b>' + '&nbsp; '.repeat(12) + 'Codice</b></code></pre><script>alert(1)</script><p onclick="evil()">Testo</p>';
  const output = readingHtml(source);
  expect(output).toContain('&nbsp;');
  expect(output).not.toContain('<script');
  expect(output).not.toContain('onclick');
});
