const CACHE='organizapp-pwa-v1';
const BASE='/organizapp/';

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([BASE,BASE+'index.html'])).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;

  if(event.request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const network=await fetch(event.request);
        if(network.ok){
          const cache=await caches.open(CACHE);
          await cache.put(event.request,network.clone());
        }
        return network;
      }catch{
        return (await caches.match(event.request))||caches.match(BASE+'index.html');
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cached=await caches.match(event.request);
    if(cached)return cached;
    try{
      const network=await fetch(event.request);
      if(network.ok){
        const cache=await caches.open(CACHE);
        cache.put(event.request,network.clone()).catch(()=>{});
      }
      return network;
    }catch{
      return Response.error();
    }
  })());
});
