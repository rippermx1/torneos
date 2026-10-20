mergeInto(LibraryManager.library, {
  $SnakeNet: {socket:null,generation:0,heartbeat:null},
  SA_Open__deps:['$SnakeNet'],
  SA_Open: function(payload) {
    if(SnakeNet.socket && SnakeNet.socket.readyState<2)return;
    clearInterval(SnakeNet.heartbeat);SnakeNet.heartbeat=null;
    var generation=++SnakeNet.generation,join=JSON.parse(UTF8ToString(payload)||'{}');
    var socket=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/snake-arena/socket');SnakeNet.socket=socket;
    socket.onopen=function(){if(generation!==SnakeNet.generation)return;socket.send(JSON.stringify({v:1,type:'join',name:'Jugador',appearance:join.appearance,ticket:join.ticket,resumeOnly:join.resumeOnly===true}));};
    socket.onmessage=function(event){if(generation!==SnakeNet.generation)return;var data=JSON.parse(event.data);if(data.type==='welcome'){SnakeNet.heartbeat=setInterval(function(){if(generation===SnakeNet.generation && socket.readyState===1)socket.send(JSON.stringify({v:1,type:'ping',nonce:-1}));},4000);}SendMessage('SnakeArena','OnNetwork',event.data);};
    socket.onerror=function(){if(generation===SnakeNet.generation)SendMessage('SnakeArena','OnNetwork',JSON.stringify({v:1,type:'error',code:'socket_unavailable'}));};
    socket.onclose=function(event){if(generation===SnakeNet.generation){clearInterval(SnakeNet.heartbeat);SnakeNet.heartbeat=null;SendMessage('SnakeArena','OnNetwork',JSON.stringify({v:1,type:'disconnect',recoverable:[1006,1011,1012,1013,4003].includes(event.code),code:event.reason||String(event.code)}));}};
  },
  SA_Send__deps:['$SnakeNet'],
  SA_Send: function(value){if(SnakeNet.socket && SnakeNet.socket.readyState===1)SnakeNet.socket.send(UTF8ToString(value));},
  SA_Close__deps:['$SnakeNet'],
  SA_Close: function(){SnakeNet.generation++;clearInterval(SnakeNet.heartbeat);SnakeNet.heartbeat=null;if(SnakeNet.socket)SnakeNet.socket.close();SnakeNet.socket=null;},
  SA_Drop__deps:['$SnakeNet'],
  SA_Drop: function(){if(SnakeNet.socket)SnakeNet.socket.close(4003,'test_disconnect');},
    SA_Publish: function(value){var data=JSON.parse(UTF8ToString(value));if(data.type==='fps')data.wasmAllocatedMB=HEAPU8.buffer.byteLength/1048576;window.parent.postMessage({channel:'torneos.snake-arena',version:1,build:'snake-arena-014',data:data},location.origin);}
});
