/**
 * Marco Extension — SDK Injection Template
 *
 * Generates the self-contained IIFE that creates `window.marco`
 * in the page context before user scripts execute.
 *
 * IMPORTANT: Scripts run in MAIN world where chrome.runtime is undefined.
 * All communication uses window.postMessage through the content script relay.
 * See spec/05-chrome-extension/42-user-script-logging-and-data-bridge.md
 */

/* ------------------------------------------------------------------ */
/*  Template Context                                                   */
/* ------------------------------------------------------------------ */

interface SdkContext {
    projectId: string;
    scriptId: string;
    configId: string;
    urlRuleId: string;
    version: string;
}

/* ------------------------------------------------------------------ */
/*  Inline Notify Function (DOM-based toast)                           */
/* ------------------------------------------------------------------ */

const SDK_NOTIFY_FN = `
var __toastContainer=null;
function __ensureContainer(){
  if(__toastContainer&&document.body.contains(__toastContainer))return __toastContainer;
  __toastContainer=document.createElement("div");
  __toastContainer.id="marco-notify-container";
  Object.assign(__toastContainer.style,{position:"fixed",bottom:"16px",right:"16px",zIndex:"2147483647",display:"flex",flexDirection:"column-reverse",gap:"8px",pointerEvents:"none",maxWidth:"380px"});
  document.body.appendChild(__toastContainer);
  return __toastContainer;
}
function __marcoNotify(message,level,durationMs){
  level=level||"info";
  durationMs=durationMs||4000;
  var colors={info:["#6366f1","#eef2ff"],success:["#16a34a","#f0fdf4"],warning:["#d97706","#fffbeb"],error:["#dc2626","#fef2f2"]};
  var c=colors[level]||colors.info;
  var container=__ensureContainer();
  var el=document.createElement("div");
  Object.assign(el.style,{background:c[1],border:"1px solid "+c[0]+"33",borderLeft:"4px solid "+c[0],color:"#1f2937",padding:"10px 14px",borderRadius:"8px",fontSize:"13px",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",lineHeight:"1.4",boxShadow:"0 4px 12px rgba(0,0,0,0.15)",pointerEvents:"auto",opacity:"0",transform:"translateX(20px)",transition:"opacity 0.25s ease,transform 0.25s ease",maxWidth:"100%",wordBreak:"break-word"});
  var icons={info:"ℹ️",success:"✅",warning:"⚠️",error:"❌"};
  el.innerHTML='<div style="display:flex;align-items:flex-start;gap:8px"><span style="flex-shrink:0;font-size:14px">'+(icons[level]||"ℹ️")+'</span><span style="flex:1">'+message.replace(/</g,"&lt;").replace(/>/g,"&gt;")+'</span><button style="flex-shrink:0;background:none;border:none;cursor:pointer;font-size:16px;color:#9ca3af;padding:0 0 0 4px;line-height:1" title="Dismiss">&times;</button></div>';
  el.querySelector("button").onclick=function(){dismiss();};
  container.appendChild(el);
  requestAnimationFrame(function(){requestAnimationFrame(function(){el.style.opacity="1";el.style.transform="translateX(0)";});});
  var timer=setTimeout(dismiss,durationMs);
  function dismiss(){clearTimeout(timer);el.style.opacity="0";el.style.transform="translateX(20px)";setTimeout(function(){try{el.remove();}catch(e){}},300);}
}
`;

/* ------------------------------------------------------------------ */
/*  Template Builder                                                   */
/* ------------------------------------------------------------------ */

/** Builds the SDK IIFE string for injection into a page (MAIN world). */
// eslint-disable-next-line max-lines-per-function
export function buildMarcoSdkScript(ctx: SdkContext): string {
    const safeProjectId = escapeForTemplate(ctx.projectId);
    const safeScriptId = escapeForTemplate(ctx.scriptId);
    const safeConfigId = escapeForTemplate(ctx.configId);
    const safeUrlRuleId = escapeForTemplate(ctx.urlRuleId);
    const safeVersion = escapeForTemplate(ctx.version);

    return `(function(){
if(window.marco){
if(!window.RiseupAsiaMacroExt){window.RiseupAsiaMacroExt={Projects:{}};}
else if(!window.RiseupAsiaMacroExt.Projects){window.RiseupAsiaMacroExt.Projects={};}
return;
}
var __root=window.RiseupAsiaMacroExt;
if(!__root){__root={Projects:{}};window.RiseupAsiaMacroExt=__root;}
if(!__root.Projects){__root.Projects={};}
var __ctx={projectId:"${safeProjectId}",scriptId:"${safeScriptId}",configId:"${safeConfigId}",urlRuleId:"${safeUrlRuleId}",version:"${safeVersion}"};
var __reqCounter=0;
var __pending={};
function __genId(){return"marco-sdk-"+(++__reqCounter)+"-"+Date.now();}
function sendMsg(m){return new Promise(function(resolve,reject){var rid=__genId();__pending[rid]={resolve:resolve,reject:reject};m.source="marco-controller";m.requestId=rid;try{window.postMessage(m,"*");}catch(e){delete __pending[rid];reject(e);}setTimeout(function(){if(__pending[rid]){delete __pending[rid];reject(new Error("Marco SDK message timeout"));}},10000);});}
window.addEventListener("message",function(evt){if(evt.source!==window)return;var d=evt.data;if(!d||d.source!=="marco-extension"||d.type!=="RESPONSE")return;var rid=d.requestId;if(!rid||!__pending[rid])return;var p=__pending[rid];delete __pending[rid];var payload=d.payload;if(payload&&payload.isOk===false){p.reject(new Error(payload.errorMessage||"SDK message failed"));}else{p.resolve(payload);}});
function logFn(level){return function(message,metadata){sendMsg({type:"USER_SCRIPT_LOG",payload:{level:level,source:"user-script",category:"USER",action:"log",detail:String(message),metadata:metadata?JSON.stringify(metadata):null,projectId:__ctx.projectId,scriptId:__ctx.scriptId,configId:__ctx.configId,urlRuleId:__ctx.urlRuleId,pageUrl:window.location.href,timestamp:new Date().toISOString()}}).catch(function(){});};}
function nsKey(k){return __ctx.projectId+"::"+k;}
function globalKey(k){return "__global__::"+k;}
${SDK_NOTIFY_FN}
window.marco={
log:{info:logFn("INFO"),warn:logFn("WARN"),error:logFn("ERROR"),debug:logFn("DEBUG"),write:function(opts){sendMsg({type:"USER_SCRIPT_LOG",payload:{level:opts.level||"INFO",source:"user-script",category:opts.category||"USER",action:opts.action||"log",detail:String(opts.message),metadata:opts.metadata?JSON.stringify(opts.metadata):null,projectId:__ctx.projectId,scriptId:__ctx.scriptId,configId:__ctx.configId,urlRuleId:__ctx.urlRuleId,pageUrl:window.location.href,timestamp:new Date().toISOString()}}).catch(function(){});}},
store:{
set:function(k,v){return sendMsg({type:"USER_SCRIPT_DATA_SET",key:nsKey(k),value:v,projectId:__ctx.projectId,scriptId:__ctx.scriptId});},
get:function(k){return sendMsg({type:"USER_SCRIPT_DATA_GET",key:nsKey(k)}).then(function(r){return r.value;});},
delete:function(k){return sendMsg({type:"USER_SCRIPT_DATA_DELETE",key:nsKey(k)});},
keys:function(){return sendMsg({type:"USER_SCRIPT_DATA_KEYS",prefix:__ctx.projectId+"::"}).then(function(r){return r.keys;});},
getAll:function(){return sendMsg({type:"USER_SCRIPT_DATA_GET_ALL",prefix:__ctx.projectId+"::"}).then(function(r){return r.entries;});},
clear:function(){return sendMsg({type:"USER_SCRIPT_DATA_CLEAR",prefix:__ctx.projectId+"::"});},
setGlobal:function(k,v){return sendMsg({type:"USER_SCRIPT_DATA_SET",key:globalKey(k),value:v,projectId:"__global__",scriptId:__ctx.scriptId});},
getGlobal:function(k){return sendMsg({type:"USER_SCRIPT_DATA_GET",key:globalKey(k)}).then(function(r){return r.value;});},
deleteGlobal:function(k){return sendMsg({type:"USER_SCRIPT_DATA_DELETE",key:globalKey(k)});},
keysGlobal:function(){return sendMsg({type:"USER_SCRIPT_DATA_KEYS",prefix:"__global__::"}).then(function(r){return r.keys;});}
},
kv:{
get:function(k){return sendMsg({type:"KV_GET",projectId:__ctx.projectId,key:k}).then(function(r){return r.value;});},
set:function(k,v){return sendMsg({type:"KV_SET",projectId:__ctx.projectId,key:k,value:typeof v==="string"?v:JSON.stringify(v)});},
delete:function(k){return sendMsg({type:"KV_DELETE",projectId:__ctx.projectId,key:k});},
list:function(){return sendMsg({type:"KV_LIST",projectId:__ctx.projectId}).then(function(r){return r.entries;});}
},
notify:(function(){
var _stopLoopCb=null;
var _version="";
var _errorCbs=[];
var _recentErrors=[];
var MAX_ERRORS=50;
function pushError(e){_recentErrors.unshift(e);if(_recentErrors.length>MAX_ERRORS)_recentErrors.pop();for(var i=0;i<_errorCbs.length;i++){try{_errorCbs[i](e);}catch(x){}};}
return{
toast:function(message,level,opts){
  opts=opts||{};
  __marcoNotify(message,level||"info",level==="error"?30000:(level==="warn"?12000:4000));
  if(level==="error"||level==="warn"){
    var ts=new Date().toLocaleTimeString("en-US",{hour12:false,hour:"2-digit",minute:"2-digit",second:"2-digit"});
    pushError({timestamp:ts,level:level||"error",message:message,stack:opts.stack,requestDetail:opts.requestDetail});
    if(!opts.noStop&&_stopLoopCb){try{_stopLoopCb();}catch(x){}}
  }
},
dismissAll:function(){var c=document.getElementById("marco-notify-container");if(c)c.innerHTML="";},
onError:function(cb){if(typeof cb==="function")_errorCbs.push(cb);},
getRecentErrors:function(){return _recentErrors.slice();},
_setStopLoopCallback:function(fn){_stopLoopCb=fn;},
_setVersion:function(v){_version=v;}
};
})(),
context:Object.freeze({projectId:__ctx.projectId,scriptId:__ctx.scriptId,configId:__ctx.configId,urlRuleId:__ctx.urlRuleId,version:__ctx.version})
};
Object.freeze(window.marco.log);
Object.freeze(window.marco.store);
Object.freeze(window.marco.kv);
Object.freeze(window.marco);

/* RiseupAsiaMacroExt.require() — await-style dynamic script loading */
if(!__root.require){
__root.require=function(target){
return sendMsg({type:"DYNAMIC_REQUIRE",target:target,requesterProjectId:__ctx.projectId}).then(function(r){
if(r&&r.isOk===false){throw new Error(r.errorMessage||"Dynamic require failed for: "+target);}
var ns=r&&r.namespace;
if(ns){try{return(new Function("return "+ns))();}catch(e){return r;}}
return r;
});
};
}

__marcoNotify("Marco Controller v" + __ctx.version + " loaded","info",2500);
})();`;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Escapes a string for safe embedding in a JS template literal. */
function escapeForTemplate(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r");
}
