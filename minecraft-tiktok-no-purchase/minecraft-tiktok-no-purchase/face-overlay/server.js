'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PORT = Number(process.env.PORT || 3000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const DATA_DIR = process.env.DATA_DIR || '/data';
const CONFIG_PATH = path.join(DATA_DIR, 'avatar-config.json');
const clients = new Set();
const defaults = { name: 'NOVA', subtitle: 'TRY TO STOP ME', avatarMode: 'png', idleUrl: '/frames/idle.webp', blinkUrl: '/frames/blink.webp', scratchUrl: '/frames/scratch1.webp', level: 1 };
let config = {...defaults};
try { config = {...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))}; }
catch(_) { /* Fresh deployment. */ }
function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin':'*'});
  res.end(data);
}
function publish(msg) {
  const event = `data: ${JSON.stringify({at:Date.now(), ...msg})}\n\n`;
  for (const res of clients) {try {res.write(event);}catch(_) {clients.delete(res);}}
}
function validToken(req) {
  const supplied = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!ADMIN_TOKEN || !supplied) return false;
  const a = Buffer.from(supplied); const b = Buffer.from(ADMIN_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a,b);
}
async function readBody(req) {
  let raw = ''; for await (const chunk of req) { raw += chunk.toString(); if (raw.length>10000) throw Error('Body too large'); }
  return JSON.parse(raw || '{}');
}
function serve(res, file, contentType) {
  fs.readFile(path.join(__dirname, 'public', file), (err, data) => {
    if(err) {res.writeHead(404);return res.end('Missing file');}
    res.writeHead(200, {'Content-Type':contentType,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);
  });
}
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (req.method === 'GET' && pathname === '/health') return json(res,200,{ok:true,clients:clients.size});
  if (req.method === 'GET' && pathname === '/api/state') return json(res,200,{config});
  if (req.method === 'GET' && pathname === '/api/events') {
    res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no','Access-Control-Allow-Origin':'*'});
    res.write(': connected\n\n'); clients.add(res); req.on('close',()=>clients.delete(res)); return;
  }
  if (req.method === 'GET' && (pathname === '/' || pathname === '/studio')) return serve(res, 'studio.html', 'text/html; charset=utf-8');
  if (req.method === 'GET' && /^\/frames\/(idle|blink|scratch1|scratch2)\.webp$/.test(pathname)) return serve(res, pathname.slice(1), 'image/webp');
  if (req.method === 'GET' && pathname === '/overlay') return serve(res,'overlay.html','text/html; charset=utf-8');
  if (req.method === 'POST' && (pathname === '/api/control' || pathname === '/api/config')) {
    if (!validToken(req)) return json(res,401,{error:'Set ADMIN_TOKEN in Railway and send Authorization: Bearer <token>'});
    try {
      const body = await readBody(req);
      if(pathname === '/api/config') {
        const newConfig = {};
        for (const key of ['name','subtitle','avatarMode','idleUrl','blinkUrl','scratchUrl']) {
          if(body[key]===undefined) continue;
          newConfig[key]=String(body[key]).slice(0,350);
        }
        for (const key of ['idleUrl','blinkUrl','scratchUrl']) {
          if (newConfig[key] && !/^https:\/\//i.test(newConfig[key])) return json(res,400,{error:`${key} must be an https URL`});
        }
        if(newConfig.avatarMode && !['svg','png'].includes(newConfig.avatarMode)) return json(res,400,{error:'Invalid avatar mode'});
        config = {...config,...newConfig};
        try {fs.mkdirSync(DATA_DIR,{recursive:true});fs.writeFileSync(CONFIG_PATH,JSON.stringify(config,null,2));}
        catch(e) { console.warn('Config is in-memory only:',e.message); }
        publish({type:'config',config});return json(res,200,{ok:true,config});
      }
      const allowed=['gift','boom','scratch','win','reset','level','idle'];
      const action=String(body.action||'');
      if(!allowed.includes(action)) return json(res,400,{error:'Unsupported action'});
      const payload = {type:'action', action, gift:String(body.gift||'').slice(0,60), viewer:String(body.viewer||'').slice(0,60), text:String(body.text||'').slice(0,180), count:Math.min(999,Math.max(1,Math.floor(Number(body.count)||1))),tnt:Math.min(64,Math.max(0,Math.floor(Number(body.tnt)||0))),big:body.big===true};
      if(action==='level') {config.level=Math.max(1,Math.min(99999,Number(body.level)||1));payload.level=config.level;}
      if(action==='reset') {config.level=1;payload.level=1;}
      if(action==='win') {config.level+=1;payload.level=config.level;}
      publish(payload);return json(res,200,{ok:true,payload});
    } catch(e) {return json(res,400,{error:e.message});}
  }
  json(res,404,{error:'Not found'});
});
setInterval(()=>{for(const res of clients){try{res.write(': ping\n\n');}catch(_){clients.delete(res);}}},20000).unref();
server.listen(PORT,'0.0.0.0',()=>console.log(`Animated host listening on ${PORT}`));
