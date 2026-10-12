const {test}=require('node:test');
const assert=require('node:assert/strict');
test('account administration requires a bearer token and restricts CORS/methods without claiming authentication',async()=>{
  const {createAccountHandler}=await import('../supabase/functions/account-admin/handler.js');
  // No mock authenticated identity. These branches must reject before touching an Auth client.
  const handler=createAccountHandler({admin:null,appOrigin:'https://canopy.example',redirectUrl:'https://canopy.example/cloud.html'});
  const invoke=(method,origin)=>handler(new Request('https://api.example/account-admin',{
    method,headers:origin?{Origin:origin}:{},...(method==='POST'?{body:'{}'}:{})}));
  assert.equal((await invoke('POST','https://evil.example')).status,403);
  assert.equal((await invoke('POST','https://canopy.example')).status,401);
  assert.equal((await invoke('GET','https://canopy.example')).status,405);
  const preflight=await invoke('OPTIONS','https://canopy.example');
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://canopy.example');
  assert.throws(()=>createAccountHandler({admin:null,appOrigin:'http://canopy.example',redirectUrl:'http://canopy.example/cloud.html'}));
  assert.throws(()=>createAccountHandler({admin:null,appOrigin:'https://canopy.example',redirectUrl:'https://evil.example/cloud.html'}));
});
