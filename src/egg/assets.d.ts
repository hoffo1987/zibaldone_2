declare module "*.png" { const url: string; export default url; }
// require.context di webpack (usato per caricare l'atlante di Cloud solo se esiste)
interface WebpackContext { keys(): string[]; (id: string): any }
interface NodeRequire { context(directory: string, useSubdirectories: boolean, regExp: RegExp): WebpackContext }
declare namespace NodeJS { interface Require { context(directory: string, useSubdirectories: boolean, regExp: RegExp): WebpackContext } }
