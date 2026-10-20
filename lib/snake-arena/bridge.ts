// Reuses the published Unity binary. Only this competition HTML transport changes.
export function competitionHtml(html:string,build:string){
  if(!/^snake-arena-\d+$/.test(build))throw new Error('Invalid Snake build')
  const bridge=`<script>
(()=>{
 let ticket='';const NativeSocket=window.WebSocket;
 addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==parent||event.data?.channel!=='torneos.snake-arena'||event.data.version!==1)return;if(event.data.type==='restart'){event.stopImmediatePropagation();return;}if(event.data.type==='join'){ticket=typeof event.data.ticket==='string'?event.data.ticket:'';if(!ticket)event.stopImmediatePropagation();}},true);
 window.WebSocket=class extends NativeSocket {
  constructor(url,protocols){const target=new URL(url,location.href);if(target.pathname!=='/snake-arena/socket')throw new Error('Unexpected arena endpoint');target.pathname='/snake-arena/tournament/socket';super(target.href,protocols);this.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.type==='snapshot'||data.type==='competition_end')parent.postMessage({channel:'torneos.snake-arena',version:1,build:'${build}',data},location.origin);});}
  send(raw){const m=JSON.parse(raw);if(m.type==='join'){super.send(JSON.stringify({v:1,type:'join',ticket}));ticket='';}else if(m.type!=='restart')super.send(raw);}
 };
})();</script>`
  return html.replace('<script src=',bridge+'<script src=').replaceAll('Build/',`/games/snake-arena/${build}/Build/`)
}
