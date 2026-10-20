// CRM-NIKARA service worker (PWA only; the Android APK never registers it).
// Network-first for the app shell so a new build is always picked up; cache is only the offline fallback.
const VERSION='1.5.0';
const CACHE='crm-nikara-v'+VERSION;
const SHELL=['/','/index.html','/style.css','/offline-store.js','/app.js','/native-bridge.js','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/fonts/nikara-ui-regular.ttf','/fonts/nikara-ui-bold.ttf'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
    .then(()=>self.clients.matchAll({includeUncontrolled:true}))
    .then(list=>list.forEach(c=>{try{c.postMessage({type:'update-available',version:VERSION})}catch(_e){}}))
));
const isShell=url=>{const p=new URL(url).pathname;return p==='/'||/\.(html|js|css|webmanifest)$/.test(p);};
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET'||!req.url.startsWith(self.location.origin))return;
  if(isShell(req.url)){
    e.respondWith(fetch(req).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy));}return r;})
      .catch(()=>caches.match(req).then(c=>c||caches.match('/'))));
    return;
  }
  e.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy));}return r;})));
});
