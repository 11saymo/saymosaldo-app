// Network-first: при онлайне всегда свежая версия, при офлайне — из кеша.
const CACHE='saymosaldo-v33';
const ASSETS=['./','./index.html','./manifest.json','./icon.svg','./icon-180.png','./icon-192.png','./icon-512.png','./icon-maskable-512.png','./privacy.html','./404.html','./app.js','./auth.js','./learning.js','./currency.js'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k.startsWith('saymosaldo-')&&k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(e.request.method!=='GET'||url.origin!==location.origin)return;
  e.respondWith(
    fetch(e.request)
      .then(async res=>{
        if(res.ok){
          try{const cache=await caches.open(CACHE);await cache.put(e.request,res.clone())}catch(err){}
        }
        return res;
      })
      .catch(()=>caches.open(CACHE).then(cache=>cache.match(e.request).then(r=>r||(e.request.mode==='navigate'?cache.match('./index.html'):undefined))))
  );
});
