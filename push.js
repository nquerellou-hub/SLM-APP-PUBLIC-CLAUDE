const pushLocalKey=id=>`slm_web_push_${String(id||"").replace(/[^a-zA-Z0-9_-]/g,"_")}`;
function pushDeviceActive(){return !!cloudUser&&localStorage.getItem(pushLocalKey(cloudUser.id))==="1"}
async function refreshPushDeviceState(userId=cloudUser?.id){if(!userId||!("serviceWorker" in navigator))return;try{const registration=await navigator.serviceWorker.getRegistration(),subscription=registration&&await registration.pushManager.getSubscription();if(!subscription)localStorage.removeItem(pushLocalKey(userId))}catch{}}
function pushBase64Bytes(value){const padded=value+"=".repeat((4-value.length%4)%4),raw=atob(padded.replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(raw,c=>c.charCodeAt(0))}
async function pushInvoke(body){if(!sb)throw new Error("Supabase n’est pas disponible.");const{data,error}=await sb.functions.invoke("push-reminders",{body});if(error)throw new Error(error.message||"Impossible de joindre le service de notifications.");if(data?.error)throw new Error(data.error);return data||{}}
async function pushSyncSchedule(source=db){
  if(!sb||!cloudUser||!source)return;
  const settings=source.settings||{},delays=settings.rappelsOn===false?[]:[...new Set(String(settings.rappels??"360,120,60").split(/[,;\s]+/).map(Number).filter(x=>Number.isInteger(x)&&x>0&&x<=43200))];
  const now=Date.now(),reminders=[];
  for(const course of source.courses||[]){
    if(course.statut!=="planifiée"||!course.date||!course.heure)continue;
    const pickup=new Date(`${course.date}T${course.heure.length===5?course.heure+":00":course.heure}`);
    if(!Number.isFinite(pickup.getTime())||pickup.getTime()<=now)continue;
    const dateLabel=pickup.toLocaleString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
    for(const minutes of delays){
      const due=new Date(pickup.getTime()-minutes*60000);
      if(due.getTime()<=now)continue;
      const delayLabel=minutes>=1440&&minutes%1440===0?`${minutes/1440} j`:minutes>=60&&minutes%60===0?`${minutes/60} h`:`${minutes} min`;
      reminders.push({course_id:String(course.id),minutes_before:minutes,due_at:due.toISOString(),title:`Course dans ${delayLabel}`,body:`Course prévue ${dateLabel} à ${course.heure}. Ouvrez Cabpilot pour voir les détails.`,tag:`slm-${course.id}-${minutes}`});
    }
  }
  return pushInvoke({action:"schedule",reminders});
}
async function enablePushNotifications(){
  if(!cloudUser||!sb)return toast("Connectez-vous à votre compte pour activer les rappels en arrière-plan.");
  if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window))return toast("Les notifications push ne sont pas prises en charge par ce navigateur.");
  if(/iPhone|iPad|iPod/i.test(navigator.userAgent)&&!navigator.standalone&&!matchMedia("(display-mode: standalone)").matches)return toast("Sur iPhone/iPad, ajoutez d’abord Cabpilot à l’écran d’accueil, puis ouvrez l’app depuis son icône.");
  try{
    const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();
    if(permission!=="granted")return toast("Autorisez les notifications dans les réglages de l’appareil pour recevoir les rappels.");
    const registration=await navigator.serviceWorker.ready;
    const{public_key}=await pushInvoke({action:"public_key"});
    if(!public_key)throw new Error("La clé publique des notifications n’est pas configurée.");
    let subscription=await registration.pushManager.getSubscription();
    if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:pushBase64Bytes(public_key)});
    await pushInvoke({action:"subscribe",subscription:subscription.toJSON()});
    await pushSyncSchedule(db);
    localStorage.setItem(pushLocalKey(cloudUser.id),"1");
    toast("Rappels en arrière-plan activés sur cet appareil.");
    go(true);
  }catch(error){toast(`Activation impossible : ${error?.message||"réessayez plus tard"}`)}
}
async function disablePushNotifications(){
  if(!cloudUser||!sb)return toast("Connectez-vous au compte associé à cet appareil.");
  try{
    const registration=await navigator.serviceWorker.ready,subscription=await registration.pushManager.getSubscription();
    if(subscription){await pushInvoke({action:"unsubscribe",endpoint:subscription.endpoint});await subscription.unsubscribe()}
    localStorage.removeItem(pushLocalKey(cloudUser.id));
    toast("Les rappels en arrière-plan sont désactivés sur cet appareil.");go(true);
  }catch(error){toast(`Désactivation impossible : ${error?.message||"réessayez plus tard"}`)}
}
async function removePushForLogout(){
  if(!cloudUser)return;
  let subscription=null,registration=null;
  try{
    registration=await navigator.serviceWorker.getRegistration();subscription=registration&&await registration.pushManager.getSubscription();
    if(subscription){await pushInvoke({action:"unsubscribe",endpoint:subscription.endpoint});await subscription.unsubscribe()}
  }catch(error){console.warn("Cabpilot : désactivation push à la déconnexion impossible",error)}
  if(subscription)try{await subscription.unsubscribe()}catch{}
  localStorage.removeItem(pushLocalKey(cloudUser.id));
}
if(sb){sb.auth.onAuthStateChange((_event,session)=>{if(session?.user?.id)setTimeout(()=>refreshPushDeviceState(session.user.id),0)})}
setTimeout(()=>refreshPushDeviceState(),0);
