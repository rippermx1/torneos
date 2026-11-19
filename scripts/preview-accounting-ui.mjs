// Static visual fixture: renders the actual React component and production CSS.
// No Auth bypass, application API or editable accounting DB.
import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'
import http from 'node:http'
import ts from 'typescript'
const load = Module.createRequire(import.meta.url)
const root = path.resolve(import.meta.dirname,'..')
const resolve = Module._resolveFilename
Module._resolveFilename = function(id,...args) {
  if(id.startsWith('@/')) {const base=path.join(root,id.slice(2));id=['.ts','.tsx','/index.ts'].map(ext=>base+ext).find(fs.existsSync)??base}
  return resolve.call(this,id,...args)
}
for(const ext of ['.ts','.tsx']) Module._extensions[ext]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file)
const React = load('react'), {renderToStaticMarkup} = load('react-dom/server')
const {AppRouterContext}=load('next/dist/shared/lib/app-router-context.shared-runtime')
const {AccountingWorkspace}=load('../components/admin/accounting-workspace.tsx')
const pack=JSON.parse(fs.readFileSync(path.join(root,'artifacts/accounting/ui-fixture.json'),'utf8'))
const build=path.join(root,process.env.ACCOUNTING_BUILD_DIR??'.next/accounting-20261005')
const css=fs.readdirSync(path.join(build,'static/css')).map(file=>`<link rel="stylesheet" href="/_next/static/css/${file}">`).join('')
const markup=renderToStaticMarkup(React.createElement(AppRouterContext.Provider,{value:{refresh(){},push(){},replace(){},prefetch(){},back(){},forward(){}}},React.createElement(AccountingWorkspace,{pack,period:'2026-09'})))
const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}<title>Contabilidad · fixture visual</title></head><body class="bg-background text-foreground"><main class="p-4 sm:p-8 max-w-7xl mx-auto space-y-5"><p class="text-sm border p-3 rounded">Vista estática con datos sintéticos para revisión visual. Formularios sin conexión; no representa una sesión administrativa real.</p><h1 class="text-2xl font-bold">Contabilidad de la empresa</h1>${markup}</main></body></html>`
fs.writeFileSync(path.join(root,'artifacts/accounting/ui-preview.html'),html)
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost')
 if(url.pathname.startsWith('/_next/static/')) {const file=path.resolve(build,'static',url.pathname.slice('/_next/static/'.length));if(!file.startsWith(path.join(build,'static')+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end()};res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'application/octet-stream');return fs.createReadStream(file).pipe(res)}
 if(url.pathname!=='/'){res.writeHead(404);return res.end()}
 res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html)
})
server.listen(Number(process.env.ACCOUNTING_PREVIEW_PORT??3088),'127.0.0.1',()=>console.log('Static accounting fixture: http://127.0.0.1:'+server.address().port))
