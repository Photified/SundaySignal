// Increment APP_VERSION when changing app files. Feed JSON always uses network first.
const APP_VERSION='sunday-signal-v4';
const SHELL=['./','./index.html','./styles.css?v=4','./app.js?v=4','./manifest.webmanifest?v=4','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-192.png','./icons/maskable-512.png','./icons/apple-touch-icon.png','./icons/favicon-32.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(APP_VERSION).then(async cache=>{await cache.addAll(SHELL.map(path=>new Request(path,{cache:'reload'})));await self.skipWaiting()}))});
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('sunday-signal-')&&key!==APP_VERSION)await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 if(url.pathname.endsWith('/data/picks.json')){
  const key=new URL('./data/picks.json',self.registration.scope).href;
  event.respondWith((async()=>{const cache=await caches.open(APP_VERSION);try{const response=await fetch(event.request);if(!response.ok)throw Error('Unavailable');await cache.put(key,response.clone());return response}catch(error){const old=await cache.match(key);if(old){const headers=new Headers(old.headers);headers.set('X-Sunday-Signal-Cached','true');return new Response(old.body,{status:old.status,headers})}return new Response('{"error":"No offline edition"}',{status:503,headers:{'Content-Type':'application/json'}})}})());return;
 }
 if(event.request.mode==='navigate'){
  event.respondWith((async()=>{try{const response=await fetch(event.request);if(!response.ok)throw Error('Unavailable');return response}catch{const cache=await caches.open(APP_VERSION);return (await cache.match('./index.html'))||(await cache.match('./'))||new Response('Open online once to enable offline access.',{status:503})}})());return;
 }
 if(SHELL.some(path=>new URL(path,self.registration.scope).pathname===url.pathname))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
