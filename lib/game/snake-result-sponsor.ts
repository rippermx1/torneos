export type SnakeSponsor={sponsor:string;title:string;description:string;href:string}
function text(value:unknown,max:number,required=true){
  if(typeof value!=='string')return null
  const result=value.trim()
  return result.length<=max&&(!required||result.length>0)?result:null
}
export function readSnakeSponsor(value:unknown):SnakeSponsor|null {
  if(!value||typeof value!=='object')return null
  const input=value as Record<string,unknown>
  if(input.enabled!==true)return null
  const sponsor=text(input.sponsor,60),title=text(input.title,80),description=text(input.description,160,false),href=text(input.href,500)
  if(sponsor===null||title===null||description===null||href===null||/[\s\\\u0000-\u001f\u007f]/.test(href))return null
  if(href.startsWith('/')){
    // Same-site path; encoded separators must not become a scheme-relative URL.
    if(!/^\/[a-zA-Z0-9]/.test(href)||/%(?:2f|5c)/i.test(href))return null
  }else{
    try{const url=new URL(href);if(url.protocol!=='https:'||url.username||url.password)return null}catch{return null}
  }
  return {sponsor,title,description,href}
}
