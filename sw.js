const V="slm-v8-1-4";
const FILES=["./","index.html","landing.html","config.js","core.js","app.js","cloud.js","push.js","billing.js","admin.js","style.css","manifest.json","icon-192.jpg","icon-192.png","icon-512.png","icon-maskable.png","apple-touch-icon.jpg"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const u=new URL(e.request.url);
  if(u.origin!==location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{if(r&&r.ok){const c=r.clone();caches.open(V).then(x=>x.put(e.request,c))}return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match("index.html"))));
});
self.addEventListener("push",e=>{
  let message={};
  try{message=e.data?e.data.json():{}}catch{message={body:e.data?.text()||"Ouvrez SLM Transfert pour consulter vos rappels."}}
  const title=String(message.title||"Rappel SLM Transfert").slice(0,80);
  const body=String(message.body||"Une course approche.").slice(0,180);
  e.waitUntil(self.registration.showNotification(title,{body,icon:"icon-192.png",badge:"icon-192.png",tag:String(message.tag||"slm-course-reminder").slice(0,120),renotify:false,data:{url:message.url||"./#courses"}}));
});
self.addEventListener("notificationclick",e=>{
  e.notification.close();
  const target=new URL(e.notification.data?.url||"./#courses",self.location.origin).href;
  e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(async clients=>{
    for(const client of clients){if(new URL(client.url).origin===self.location.origin){await client.focus();if("navigate" in client)await client.navigate(target);return}}
    return self.clients.openWindow(target);
  }));
});
