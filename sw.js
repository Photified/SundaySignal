const APP_VERSION='sunday-signal-v8';
const SHELL=['./','./index.html','./styles.css?v=8','./app.js?v=8','./manifest.json','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png','./icons/favicon-32.png'];
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(APP_VERSION).then(cache=>cache.addAll(SHELL.map(path=>new Request(path,{cache:'reload'})))))});
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key!==APP_VERSION)await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 if(url.pathname.endsWith('/data/picks.json')){
  const key=new URL('./data/picks.json',self.registration.scope).href;
  event.respondWith((async()=>{const cache=await caches.open(APP_VERSION);try{const response=await fetch(event.request);if(!response.ok)throw Error('Unavailable');await cache.put(key,response.clone());return response}catch(error){const old=await cache.match(key);if(old){const headers=new Headers(old.headers);headers.set('X-Sunday-Signal-Cached','true');return new Response(old.body,{status:old.status,headers})}return new Response('{"error":"No offline edition"}',{status:503,headers:{'Content-Type':'application/json'}})}})());return;
 }
 event.respondWith(fetch(event.request).catch(()=>caches.match(event.request,{ignoreSearch:true})));
});