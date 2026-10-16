const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
function load(file) {
  const name=path.resolve(__dirname,'../src',file+'.ts'),m=new Module(name,module);m.filename=name;m.paths=Module._nodeModulePaths(path.dirname(name));
  const original=m.require.bind(m);m.require=id=>id==='./model'?load('model'):original(id);
  m._compile(ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,name);return m.exports;
}
module.exports=load('fixtures').demoItems;
