/* Cabpilot V8 — synchronisation Supabase (logique V7 inchangée, interface déplacée dans app.js) */
const SB_URL="https://ucmwtebwlbrmybxdjxlg.supabase.co";
const SB_KEY="sb_publishable_Fc6ZGyUSjuHkdqCgAUtKiQ_qa9uWSQK";
const CLOUD_ARR=["courses","clients","depenses","factures","docs"];
const TERMS_VERSION="2026-10-07-v1";
const CLOUD_USAGE_EVENTS=new Set(["app_opened","page_home","page_courses","page_history","page_clients","page_plus","page_factures","page_compta","page_documents","page_billing","page_settings","page_tools","course_created","client_created","invoice_created","expense_created","premium_promo_shown","premium_cta_clicked","premium_gate_opened","checkout_started"]);
let cloudRecovery=false;
let sb=null,cloudUser=null,cloudBusy=false,cloudTimer=null,cloudMsg="",cloudPreparedUserId=null,cloudPreparing=null,cloudAuthReady=null,cloudStarting=false;
/* « Rester connecté sur cet appareil » : la session est conservée (localStorage, comportement par défaut, inchangé)
   ou limitée à la fenêtre (sessionStorage). Le second réglage permet d’ouvrir cet appareil sans code. */
const SLM_REMEMBER_KEY="slm_remember",SLM_NOPIN_KEY="slm_device_nopin";
const slmRemember=()=>{try{return localStorage.getItem(SLM_REMEMBER_KEY)!=="0"}catch{return true}};
const deviceNoPin=()=>{try{return localStorage.getItem(SLM_NOPIN_KEY)==="1"}catch{return false}};
function slmSetRemember(on){try{localStorage.setItem(SLM_REMEMBER_KEY,on?"1":"0");if(on)localStorage.setItem(SLM_NOPIN_KEY,"1");else localStorage.removeItem(SLM_NOPIN_KEY)}catch{}}
const slmAuthStorage={getItem(k){try{return localStorage.getItem(k)??sessionStorage.getItem(k)}catch{return null}},setItem(k,v){try{if(slmRemember()){localStorage.setItem(k,v);sessionStorage.removeItem(k)}else{sessionStorage.setItem(k,v);localStorage.removeItem(k)}}catch{}},removeItem(k){try{localStorage.removeItem(k)}catch{}try{sessionStorage.removeItem(k)}catch{}}};
try{if(window.supabase)sb=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,storageKey:"slm_sb_auth",storage:slmAuthStorage}})}catch(e){sb=null}
const cloudSet=m=>{cloudMsg=m;const value=String(m||"").toLocaleLowerCase("fr-FR");const state=/erreur|échec|impossible|refusée/.test(value)?"error":/attente|en cours|vérification|indisponible|hors ligne|déconnecté|non connecté/.test(value)?"waiting":/synchron|à jour|connecté|récupéré|fusionnées|restauré/.test(value)?"ok":"neutral";try{for(const id of ["cloudStatus","accountCloudStatus"]){const el=document.getElementById(id);if(el){el.textContent=m;el.dataset.state=state;el.setAttribute("role","status");el.setAttribute("aria-live","polite")}}}catch{}};
function cloudTrackUsageEvent(event){if(!sb||!cloudUser||!CLOUD_USAGE_EVENTS.has(event))return Promise.resolve(false);return sb.rpc("track_usage_event",{p_event:event}).then(({data,error})=>!error&&!!data).catch(()=>false)}
const hasLocalData=()=>db&&CLOUD_ARR.some(k=>Array.isArray(db[k])&&db[k].length>0);
const hasRemoteData=d=>{const x=d||{};return CLOUD_ARR.some(k=>Array.isArray(x[k])&&x[k].length>0)};
const cloudLocalKey=id=>"slm_data_user_"+String(id||"").replace(/[^a-zA-Z0-9_-]/g,"_");
function ensureMeta(){if(!db.meta)db.meta={};db.meta.appVersion=typeof APP_VERSION!=="undefined"?APP_VERSION:"7.7.4";db.meta.settingsAt=+db.meta.settingsAt||0;db.meta.cloudAt=+db.meta.cloudAt||0;db.meta.dirtyAt=+db.meta.dirtyAt||0;db.meta.firstSyncDone=!!db.meta.firstSyncDone;if(!Array.isArray(db.deleted))db.deleted=[]}
async function cloudPrepareAccount(){
  if(!db||!cloudUser)return false;
  const userId=cloudUser.id;
  if(cloudPreparedUserId===userId&&db.meta?.ownerUserId===userId)return true;
  while(cloudPreparing){const pending=cloudPreparing;await pending;if(cloudPreparing===pending)cloudPreparing=null;if(!cloudUser||cloudUser.id!==userId)return false;if(cloudPreparedUserId===userId&&db.meta?.ownerUserId===userId)return true}
  const preparing=(async()=>{
    ensureMeta();
    const currentOwner=db.meta.ownerUserId||"";
    if(!currentOwner){
      // Claim pre-existing local data for the first account used on this device.
      db.meta.ownerUserId=userId;cloudPreparedUserId=userId;
      const snapshot=JSON.stringify(db);await store(D_KEY,snapshot);await store(cloudLocalKey(userId),snapshot);return;
    }
    if(currentOwner===userId){cloudPreparedUserId=userId;await store(cloudLocalKey(userId),JSON.stringify(db));return;}
    await store(cloudLocalKey(currentOwner),JSON.stringify(db));
    const saved=await fetchStore(cloudLocalKey(userId));
    if(!cloudUser||cloudUser.id!==userId)return;
    if(saved){try{db=JSON.parse(saved)}catch{db=JSON.parse(JSON.stringify(def))}}
    else db=JSON.parse(JSON.stringify(def));
    fixDb();ensureMeta();db.meta.ownerUserId=userId;cloudPreparedUserId=userId;
    const snapshot=JSON.stringify(db);await store(D_KEY,snapshot);await store(cloudLocalKey(userId),snapshot);
    try{applyTheme();if(!document.body.classList.contains("locked"))go(true)}catch{}
  })();
  cloudPreparing=preparing;
  try{await preparing}finally{if(cloudPreparing===preparing)cloudPreparing=null}
  return !!cloudUser&&cloudUser.id===userId&&cloudPreparedUserId===userId&&db.meta?.ownerUserId===userId;
}
function latestRecord(remote,local){if(!remote)return local;if(!local)return remote;return(+local._updatedAt||0)>=(+remote._updatedAt||0)?local:remote}
function cloudMerge(remote,local){
  const out=JSON.parse(JSON.stringify(remote||{})),L=local||{};
  for(const k of CLOUD_ARR){const map=new Map();for(const x of(out[k]||[]))map.set(x.id,x);for(const x of(L[k]||[]))map.set(x.id,latestRecord(map.get(x.id),x));out[k]=Array.from(map.values())}
  const rs=remote&&remote.settings||{},ls=L.settings||{},rt=+((remote&&remote.meta&&remote.meta.settingsAt)||0),lt=+((L.meta&&L.meta.settingsAt)||0);
  out.settings=lt>=rt?Object.assign({},rs,ls):Object.assign({},ls,rs);
  const dels=new Map();
  for(const d of[...(remote&&remote.deleted||[]),...(L.deleted||[])]){if(!d||!d.id||!d.arr)continue;const key=d.arr+"::"+d.id;if(!dels.has(key)||(+d.at||0)>(+dels.get(key).at||0))dels.set(key,d)}
  out.deleted=Array.from(dels.values());
  for(const d of out.deleted){const arr=out[d.arr];if(!Array.isArray(arr))continue;const idx=arr.findIndex(x=>x.id===d.id);if(idx>=0&&(+d.at||0)>=(+arr[idx]._updatedAt||0))arr.splice(idx,1)}
  out.notified=Object.assign({},remote&&remote.notified||{},L.notified||{});
  out.meta=Object.assign({},remote&&remote.meta||{},L.meta||{});
  out.meta.settingsAt=Math.max(rt,lt);out.meta.appVersion=typeof APP_VERSION!=="undefined"?APP_VERSION:"7.7.4";
  return out;
}
async function cloudInit(){
  if(!sb)return cloudSet("Supabase indisponible (hors-ligne ?)");
  try{const{data}=await sb.auth.getSession();cloudUser=data.session?data.session.user:null}catch{cloudUser=null}
  sb.auth.onAuthStateChange((_e,s)=>{cloudUser=s?s.user:null;if(_e==="PASSWORD_RECOVERY"){cloudRecovery=true;setTimeout(cloudRecoveryUI,0);return}if(cloudRecovery)return;cloudPreparedUserId=null;if(cloudUser){cloudPull();if(typeof adminCheckAccess==="function")adminCheckAccess();if(document.getElementById("cloud-auth-screen"))cloudOpenApp()}});
  if(cloudUser)cloudPull();
}
function cloudQueue(){if(!db||!sb||!cloudUser||cloudPreparedUserId!==cloudUser.id||db.meta?.ownerUserId!==cloudUser.id)return;ensureMeta();db.meta.dirtyAt=Math.max(Date.now(),(+db.meta.dirtyAt||0)+1);cloudSet("Modifications en attente de synchronisation…");clearTimeout(cloudTimer);cloudTimer=setTimeout(cloudPush,1800)}
async function cloudPush(){
  if(!db||!sb||!cloudUser||cloudBusy)return;if(!await cloudPrepareAccount()||!cloudUser)return;const userId=cloudUser.id;if(db.meta?.ownerUserId!==userId)return;cloudBusy=true;cloudSet("Synchronisation en cours…");
  try{
    ensureMeta();const now=Date.now(),snapshotDirtyAt=+db.meta.dirtyAt||0,snap=JSON.parse(JSON.stringify(db));
    snap.meta=snap.meta||{};snap.meta.appVersion=typeof APP_VERSION!=="undefined"?APP_VERSION:"7.7.4";snap.meta.syncedAt=now;delete snap.meta.dirtyAt;
    if(!cloudUser||cloudUser.id!==userId)return;const{error}=await sb.from("app_state").upsert({user_id:userId,data:snap,updated_at:new Date(now).toISOString()});
    if(error)throw error;
    if(!cloudUser||cloudUser.id!==userId||db.meta?.ownerUserId!==userId)return;
    try{if(typeof pushSyncSchedule==="function")await pushSyncSchedule(snap)}catch(e){if(typeof pushLocalKey==="function")localStorage.removeItem(pushLocalKey(userId));console.warn("Cabpilot : rappels push non synchronisés",e)}
    db.meta.cloudAt=now;db.meta.firstSyncDone=true;const changedDuringPush=(+db.meta.dirtyAt||0)>snapshotDirtyAt;if(!changedDuringPush)delete db.meta.dirtyAt;else{clearTimeout(cloudTimer);cloudTimer=setTimeout(()=>cloudPull(),1000)}await store(D_KEY,JSON.stringify(db));await store(cloudLocalKey(userId),JSON.stringify(db));
    cloudSet("Synchronisé : données + réglages · "+new Date(now).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}));
  }catch(e){cloudSet("Erreur d'envoi : "+(e.message||e))}finally{cloudBusy=false}
}
async function cloudPull(manual){
  if(!db||!sb||!cloudUser||cloudBusy)return;if(!await cloudPrepareAccount()||!cloudUser||cloudBusy)return;const userId=cloudUser.id;if(db.meta?.ownerUserId!==userId)return;if(manual)cloudSet("Vérification de la synchronisation…");
  try{
    const{data,error}=await sb.from("app_state").select("data,updated_at").eq("user_id",userId).maybeSingle();if(error)throw error;if(!cloudUser||cloudUser.id!==userId||db.meta?.ownerUserId!==userId)return;
    if(!data){await cloudPush();if(manual)toast("Première synchronisation terminée");return}
    const remote=data.data||{},rt=new Date(data.updated_at).getTime()||0;ensureMeta();
    if(!db.meta.firstSyncDone&&!db.meta.cloudAt){
      if(hasLocalData()&&data){
        db=cloudMerge(remote,db);fixDb();ensureMeta();db.meta.ownerUserId=userId;db.meta.cloudAt=rt;db.meta.firstSyncDone=true;db.meta.dirtyAt=Date.now();
        await store(D_KEY,JSON.stringify(db));await store(cloudLocalKey(userId),JSON.stringify(db));try{applyTheme()}catch{}if(!document.querySelector("#modal:not(.hidden)"))go(true);
        cloudSet("Première synchronisation : données fusionnées");if(manual)toast("Données de l’appareil et du compte réunies");await cloudPush();return;
      }
      if(hasRemoteData(remote)&&!hasLocalData()){
        db=remote;fixDb();ensureMeta();db.meta.ownerUserId=userId;db.meta.cloudAt=rt;db.meta.firstSyncDone=true;delete db.meta.dirtyAt;await store(D_KEY,JSON.stringify(db));await store(cloudLocalKey(userId),JSON.stringify(db));try{applyTheme()}catch{}if(!document.querySelector("#modal:not(.hidden)"))go(true);cloudSet("Première synchronisation : cloud récupéré");if(manual)toast("Première synchronisation terminée");return;
      }
      db.meta.firstSyncDone=true;
    }
    const last=db.meta.cloudAt||0,dirty=!!(db.meta.dirtyAt&&db.meta.dirtyAt>last);
    if(rt>last){
      let nd=remote;if(dirty)nd=cloudMerge(remote,db);
      db=nd;fixDb();ensureMeta();db.meta.ownerUserId=userId;db.meta.cloudAt=rt;db.meta.firstSyncDone=true;
      if(dirty){db.meta.dirtyAt=Date.now();await store(D_KEY,JSON.stringify(db));await store(cloudLocalKey(userId),JSON.stringify(db));try{applyTheme()}catch{}if(!document.querySelector("#modal:not(.hidden)"))go(true);cloudSet("Conflit résolu : données + réglages fusionnés");await cloudPush()}
      else{delete db.meta.dirtyAt;await store(D_KEY,JSON.stringify(db));await store(cloudLocalKey(userId),JSON.stringify(db));try{applyTheme()}catch{}if(!document.querySelector("#modal:not(.hidden)"))go(true);cloudSet("Synchronisé : données + réglages récupérés")}
    }else if(dirty){await cloudPush()}
    else{try{applyTheme()}catch{}cloudSet("Tout est à jour · "+new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}))}
    if(manual)toast("Synchronisation terminée");
  }catch(e){cloudSet("Erreur de synchronisation : "+(e.message||e));if(manual)toast("Échec de la synchronisation")}
}
async function cloudLogin(){
  if(!sb)return toast("Supabase indisponible (connexion internet ?)");const email=(document.getElementById("cl_mail")||{}).value||"",pw=(document.getElementById("cl_pw")||{}).value||"";
  if(!email||!pw)return toast("E-mail et mot de passe requis");const rem=document.getElementById("cl_remember");if(rem)slmSetRemember(rem.checked);try{const{data,error}=await sb.auth.signInWithPassword({email:email.trim(),password:pw});if(error)throw error;cloudUser=data.user;if(typeof adminCheckAccess==="function")adminCheckAccess();if(document.getElementById("cloud-auth-screen"))return cloudOpenApp();toast("Connecté");await cloudPull(true);refresh()}catch(error){const message="Connexion refusée : "+(error?.message||"vérifiez votre connexion");if(document.getElementById("cloud-auth-screen"))return cloudAuthUI("login",message);toast(message)}
}
async function cloudSignup(){
  if(!sb)return toast("Supabase indisponible (connexion internet ?)");
  const email=(document.getElementById("cl_mail")||{}).value||"",password=(document.getElementById("cl_pw")||{}).value||"";
  const termsAccepted=!!document.getElementById("cl_terms")?.checked;
  const usageConsent=!!document.getElementById("cl_analytics")?.checked;
  if(!termsAccepted)return toast("Pour créer votre compte, vous devez accepter les conditions d’utilisation.");
  if(!email.trim()||!password)return toast("Saisissez votre e-mail et un mot de passe");
  if(password.length<8)return toast("Choisissez un mot de passe d’au moins 8 caractères");const rem=document.getElementById("cl_remember");if(rem)slmSetRemember(rem.checked);
  try{
    const{data,error}=await sb.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:`${location.origin}${location.pathname}#billing`,data:{terms_accepted:true,terms_version:TERMS_VERSION,terms_accepted_at:new Date().toISOString(),usage_analytics_consent:usageConsent}}});
    if(error)throw error;
    if(data.session&&data.user){cloudUser=data.user;location.hash="billing";toast("Compte créé");await cloudOpenApp();return}
    await cloudAuthUI("login","Compte créé. Ouvrez l’e-mail reçu pour confirmer l’inscription, puis connectez-vous.");
  }catch(e){if(document.getElementById("cloud-auth-screen"))return cloudAuthUI("signup","Création du compte impossible : "+(e.message||"vérifiez votre e-mail"));toast("Création du compte impossible : "+(e.message||"vérifiez votre e-mail"))}
}
function cloudSignupTermsChanged(input){const button=document.getElementById("cl_signup");if(button)button.disabled=!input?.checked}
async function cloudForgotPassword(){if(!sb)return toast("Supabase indisponible");const email=(document.getElementById("cl_mail")||{}).value||"";if(!email.trim())return toast("Saisissez votre adresse e-mail d’abord");const{error}=await sb.auth.resetPasswordForEmail(email.trim(),{redirectTo:`${location.origin}${location.pathname}`});if(error)return toast("Envoi impossible : "+error.message);toast("E-mail de réinitialisation envoyé")}
function cloudAuthSwitch(mode){const email=(document.getElementById("cl_mail")||{}).value||"";cloudAuthUI(mode).then(()=>{const field=document.getElementById("cl_mail");if(field)field.value=email})}
async function cloudOpenApp(){if(cloudRecovery)return cloudRecoveryUI();if(cloudStarting)return;if(!cloudUser)return cloudAuthUI();cloudStarting=true;$("#lock").classList.remove("auth-lock");try{await boot();if(typeof adminCheckAccess==="function")adminCheckAccess();if(typeof billingAppReady==="function")billingAppReady()}catch(error){cloudSet("Impossible d’ouvrir l’application : "+(error?.message||"erreur locale"));await cloudAuthUI("login","Impossible d’ouvrir vos données. Vérifiez la connexion et réessayez.")}finally{cloudStarting=false}}
async function cloudLogout(){cloudRecovery=false;try{localStorage.removeItem(SLM_NOPIN_KEY)}catch{}if(cloudUser&&db){ensureMeta();db.meta.ownerUserId=cloudUser.id;await store(cloudLocalKey(cloudUser.id),JSON.stringify(db))}if(typeof removePushForLogout==="function")await removePushForLogout();if(sb)await sb.auth.signOut();cloudUser=null;cloudPreparedUserId=null;cloudSet("Déconnecté");await cloudAuthUI("login","Vous êtes déconnecté.")}
async function cloudApplyImportedData(imported,userId){
  if(!sb||!cloudUser)throw new Error("Connectez-vous au compte destinataire avant la restauration.");
  const targetUserId=userId||cloudUser.id;
  if(cloudUser.id!==targetUserId)throw new Error("Le compte connecté a changé. Recommencez l’import.");
  if(cloudBusy)throw new Error("Une synchronisation est en cours. Réessayez dans quelques secondes.");
  if(!await cloudPrepareAccount()||!cloudUser||cloudUser.id!==targetUserId||db.meta?.ownerUserId!==targetUserId)throw new Error("Impossible de préparer le compte destinataire.");
  if(!validBackup(imported))throw new Error("Les données du fichier sont incomplètes.");
  const previous=db,now=Date.now(),candidate=JSON.parse(JSON.stringify(imported));
  candidate.meta=candidate.meta&&typeof candidate.meta==="object"?candidate.meta:{};
  candidate.meta.appVersion=typeof APP_VERSION!=="undefined"?APP_VERSION:"7.7.4";
  candidate.meta.ownerUserId=targetUserId;candidate.meta.settingsAt=now;candidate.meta.cloudAt=now;candidate.meta.firstSyncDone=true;candidate.meta.lastLocalSave=now;delete candidate.meta.dirtyAt;
  clearTimeout(cloudTimer);cloudBusy=true;let remoteCommitted=false;
  try{
    const snapshot=JSON.parse(JSON.stringify(candidate));
    const{error}=await sb.from("app_state").upsert({user_id:targetUserId,data:snapshot,updated_at:new Date(now).toISOString()});
    if(error)throw error;
    remoteCommitted=true;
    if(!cloudUser||cloudUser.id!==targetUserId)throw new Error("Le compte a changé après l’envoi. Reconnectez le compte destinataire pour charger les données restaurées.");
    db=candidate;fixDb();ensureMeta();db.meta.ownerUserId=targetUserId;db.meta.cloudAt=now;db.meta.firstSyncDone=true;delete db.meta.dirtyAt;
    const stored=JSON.stringify(db);await store(D_KEY,stored);await store(cloudLocalKey(targetUserId),stored);cloudPreparedUserId=targetUserId;
    try{applyTheme();close_();go(true)}catch{}
    cloudSet("Classeur Excel restauré dans ce compte");return true;
  }catch(error){if(!remoteCommitted)db=previous;else if(cloudUser&&cloudUser.id===targetUserId)throw new Error("Le fichier est restauré dans le cloud, mais l’appareil n’a pas pu actualiser sa copie. Rechargez l’application pour récupérer les données.");throw error}
  finally{cloudBusy=false}
}
cloudAuthReady=cloudInit();
setInterval(()=>{if(!document.hidden)cloudPull()},45000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)cloudPull()});
window.addEventListener("online",()=>cloudPull());

function cloudRecoveryUI(message=""){
  document.body.classList.add('locked');hideSplash();if(mOpen){suspendedSheet=null;close_(true)}
  document.getElementById('lock').innerHTML=`<div class="auth" id="cloud-auth-screen"><div class="auth-main"><div class="auth-box"><h1>Nouveau mot de passe</h1><p>Choisissez un mot de passe pour sécuriser votre compte.</p><form onsubmit="event.preventDefault();cloudSavePassword(this)"><div class="field"><label for="recovery-password">Nouveau mot de passe</label><input id="recovery-password" type="password" autocomplete="new-password" minlength="8" required></div><div class="field"><label for="recovery-confirm">Confirmer le mot de passe</label><input id="recovery-confirm" type="password" autocomplete="new-password" minlength="8" required></div><p id="recovery-status" role="alert">${esc(message)}</p><button class="btn block" type="submit">Enregistrer mon mot de passe</button><button class="btn secondary block" type="button" onclick="cloudLogout()">Retour à la connexion</button></form></div></div></div>`;
  document.getElementById('recovery-password').focus();
}
async function cloudSavePassword(form){
  if(!form.reportValidity())return;const pw=document.getElementById('recovery-password'),confirm=document.getElementById('recovery-confirm'),status=document.getElementById('recovery-status');
  if(pw.value!==confirm.value){status.textContent='Les deux mots de passe doivent être identiques.';confirm.focus();return}
  const button=form.querySelector('[type=submit]');button.disabled=true;
  try{const{error}=await sb.auth.updateUser({password:pw.value});if(error)throw error;cloudRecovery=false;await cloudLogout();await cloudAuthUI('login','Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.')}catch(e){status.textContent='Impossible de modifier le mot de passe : '+(e?.message||'demandez un nouveau lien.')}finally{button.disabled=false}
}
