const CACHE='ts-store-v1';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/','index.html','manifest.json'])).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.map(n=>n!==CACHE?caches.delete(n):Promise.resolve()))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;e.respondWith(caches.match(r).then(c=>c||fetch(r).then(res=>{if(res&&res.status===200){const ca=caches.open(CACHE);ca.then(c=>c.put(r,res.clone()))}return res}).catch(()=>new Response('Offline',{status:503}))))});
