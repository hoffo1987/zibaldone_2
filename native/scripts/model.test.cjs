const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const name=path.resolve(__dirname,'../src/model.ts'),m=new Module(name,module);m.filename=name;m.paths=Module._nodeModulePaths(path.dirname(name));
m._compile(ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,name);
const {publicWriting,plainText,safeImage}=m.exports;
test('complete writings never expose full content, drawings or author metadata',()=>{
  const d=publicWriting('x',{version:2,kind:'complete',title:'Titolo',excerpt:'Pubblico',content:'RISERVATO',strokes:[{points:[]}],userId:'privato',author:'Nome'});
  assert.equal(d.content,'');assert.deepEqual(d.strokes,[]);assert.equal(d.excerpt,'Pubblico');assert.equal('userId' in d,false);assert.equal('author' in d,false);
});
test('legacy public copies are rejected and diary identity is discarded',()=>{
  assert.equal(publicWriting('x',{content:'legacy'}),null);
  const d=publicWriting('y',{version:2,kind:'diary',title:'Diario',content:'Intero',author:'Segreto',userId:'privato',w:900,h:600});
  assert.equal(d.content,'Intero');assert.equal(JSON.stringify(d).includes('Segreto'),false);
});
test('preview decodes entities and removes active content without executing it',()=>{
  assert.equal(plainText('<p>Ciao &amp; benvenuto<br>qui</p><script>segreto()</script><style>body{}</style><p>Fine</p>'),'Ciao & benvenuto\nqui\nFine');
});
test('only HTTPS or raster data images can be rendered',()=>{
  for(const s of ['javascript:alert(1)','file:///data/private','http://unsafe/image.png','data:image/svg+xml;base64,AAAA'])assert.equal(safeImage(s),false);
  assert.equal(safeImage('https://example.org/image.png'),true);assert.equal(safeImage('data:image/png;base64,AAAA'),true);
});
