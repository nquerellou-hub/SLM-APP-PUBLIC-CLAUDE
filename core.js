/* SLM Transfert V8 — noyau de données (repris de la V7 pour rester compatible avec les comptes existants). */
const APP_VERSION="8.2.0";
const APP_NAME="SLM Transfert";
const $=s=>document.querySelector(s);
const D_KEY="slm_data_v2",PIN_KEY="slm_pin",PIN_USER_PREFIX="slm_pin_user_",A_KEY="slm_auth",E_KEY="slm_enc_v1",OLD_KEY="slm_db_v1",T_KEY="slm_try";
const def={settings:{
nom:"SLM Transfert",gerant:"",siret:"",adresse:"",tel:"",email:"",site:"slmtransfert.fr",plaque:"",numCarte:"",assurance:"",iban:"",
businessForm:"",businessOther:"",businessTax:"",socialMode:"legacy",microCustomRate:false,
tva:10,tvaOn:false,cotis:21.2,objectif:5000,tarifBase:0,tarifKm:0,tarifMin:0,commPct:0,costKm:0,
prefix:"F",prefixDevis:"D",numFormat:"{P}-{Y}-{N}",numPad:4,numStart:1,
autoFacture:true,autoPdf:true,payesAuto:["CB","Espèces","Plateforme"],
pdfStyle:"band",pdfColor:"#3d4a26",pdfLogo:false,pdfTitleF:"FACTURE",pdfTitleD:"DEVIS",pdfIntro:"",pdfThanks:"Merci pour votre confiance.",pdfFooter:"",pdfEcheance:"À réception",pdfDevisJours:30,pdfPayInfo:"",pdfQtyLabel:"Qté",pdfDescLabel:"Désignation",
pdfShowGerant:true,pdfShowAdresse:true,pdfShowSiret:true,pdfShowTel:true,pdfShowEmail:true,pdfShowSite:false,pdfShowCarte:true,pdfShowPlaque:false,pdfShowAssurance:false,pdfShowDate:true,pdfShowPay:true,pdfShowEcheance:true,pdfCols:true,pdfShowIban:true,pdfShowMentions:true,pdfClientTel:true,pdfClientEmail:true,
mentions:"Paiement à réception. En cas de retard : pénalité de 3 fois le taux d'intérêt légal et indemnité forfaitaire de 40 €.",
designTpl:"Transport {depart} → {arrivee} du {date}",
types:["Transfert","Aéroport","Gare","Longue distance","Mise à dispo","Médical","Plateforme"],paiements:["CB","Espèces","Virement","Facture","Plateforme"],cats:["Carburant","Péage","Entretien","Assurance","Leasing / crédit","Lavage","Parking","Téléphone","Comptable","Cotisations","Plateforme","Autre"],typeDef:"Transfert",payDef:"CB",
rappelsOn:true,rappels:"360,120,60",dureeMin:0,
msgConfirm:"Bonjour {client}, votre transfert {nom} est confirmé le {date} à {heure} : {depart} → {arrivee}. Tarif : {prix} ({paiement}). À très bientôt !",
msgFact:"Bonjour {client}, merci pour votre trajet avec {nom}. Facture {num} : {total} ({statut}). Excellente journée !",
msgArrive:"Bonjour, je suis votre chauffeur {nom}, je suis arrivé.",
themeBase:"#f5f4ed",themeAccent:"#27634a",themeStyle:"minimal",blurOn:false,
kpi_ca:true,kpi_net:true,kpi_n:true,kpi_km:true,kpi_dep:true,kpi_ekm:true,kpi_panier:true,kpi_marge:true,showObjectif:true,showChart:true,showNext:true,showUnpaid:true,showExport:true,
pinOn:true,lockMin:15,appearance:"light"},
courses:[],clients:[],depenses:[],factures:[],docs:[],notified:{},meta:{
  appVersion:APP_VERSION,
  settingsAt:0,
  firstSyncDone:false,
  dirtyAt:0,
  cloudAt:0,
  lastLocalSave:0
},
deleted:[]};
let db=null,hiddenAt=0,pending=null,pinBuf="";
const b64=u=>{let s="";new Uint8Array(u).forEach(c=>s+=String.fromCharCode(c));return btoa(s)};const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const idb=()=>new Promise((res,rej)=>{const r=indexedDB.open("slm",1);r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
const idbSet=async(k,v)=>{let d;try{d=await idb();return await new Promise(resolve=>{const t=d.transaction("kv","readwrite"),s=t.objectStore("kv");v==null?s.delete(k):s.put(v,k);t.oncomplete=()=>{d.close();resolve(true)};t.onerror=()=>{d.close();resolve(false)};t.onabort=()=>{d.close();resolve(false)}})}catch{try{d&&d.close()}catch{}return false}};
const idbGet=async k=>{let d;try{d=await idb();return await new Promise(resolve=>{const t=d.transaction("kv"),q=t.objectStore("kv").get(k);q.onsuccess=()=>{const v=q.result??null;d.close();resolve(v)};q.onerror=()=>{d.close();resolve(null)}})}catch{try{d&&d.close()}catch{}return null}};
const store=async(k,v)=>{let localOK=false;try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v);localOK=true}catch{}const idbOK=await idbSet(k,v);if(!localOK&&!idbOK)throw new Error("Le navigateur n'a pas pu enregistrer les données.");return{local:localOK,indexedDB:idbOK}};
const fetchStore=async k=>{let v=await idbGet(k);if(v!=null)return v;try{v=localStorage.getItem(k)}catch{return null}return v};
let chain=Promise.resolve();
const save=()=>{
  if(!db)return;
  db.meta=db.meta||{};
  db.meta.lastLocalSave=Date.now();
  chain=chain.then(async()=>{if(!db)return;await store(D_KEY,JSON.stringify(db))}).catch(e=>{console.error("SLM Transfert: enregistrement local impossible",e);if(!document.hidden)toast("Échec de l’enregistrement des données")});
  try{typeof cloudQueue==="function"&&cloudQueue()}catch{}
};
function fixDb(){
  if(!db||typeof db!=="object")db=JSON.parse(JSON.stringify(def));
  for(const k in def)if(!(k in db))db[k]=JSON.parse(JSON.stringify(def[k]));
  if(!db.meta||typeof db.meta!=="object")db.meta={};
  if(!Array.isArray(db.deleted))db.deleted=[];
  for(const k of ["courses","clients","depenses","factures","docs"])if(!Array.isArray(db[k]))db[k]=[];
  for(const k in def.settings)if(!(k in db.settings))db.settings[k]=JSON.parse(JSON.stringify(def.settings[k]));
  db.meta.appVersion=APP_VERSION;snapshotExistingInvoices();
  delete db.meta.lastBackup;
  delete db.settings.backupDays;
  db.meta.settingsAt=+db.meta.settingsAt||0;
  /* V8.1.4 : thème clair par défaut. Les comptes restés sur l’ancien défaut « Automatique » passent une fois en clair. */
  if(!db.meta.themeLightV814){if(db.settings.appearance==="system")db.settings.appearance="light";db.meta.themeLightV814=true}
  db.meta.firstSyncDone=!!db.meta.firstSyncDone;
  db.meta.dirtyAt=+db.meta.dirtyAt||0;
  db.meta.cloudAt=+db.meta.cloudAt||0;
  db.meta.lastLocalSave=+db.meta.lastLocalSave||0;
  for(const k of ["courses","clients","depenses","factures","docs"])
    for(const x of db[k])if(!x._updatedAt)x._updatedAt=db.meta.lastLocalSave||Date.now();
}
const pinUserKey=userId=>PIN_USER_PREFIX+String(userId||"").replace(/[^a-zA-Z0-9_-]/g,"_");
const activePinKey=()=>typeof cloudUser!=="undefined"&&cloudUser?.id?pinUserKey(cloudUser.id):PIN_KEY;
const hasLocalPin=()=>{try{return!!localStorage.getItem(activePinKey())}catch{return false}};
const getPin=()=>{try{return localStorage.getItem(activePinKey())||""}catch{return""}};
async function saveLocalPin(value,key=activePinKey()){
  try{localStorage.setItem(key,value)}catch{throw new Error("Le navigateur n'a pas pu enregistrer le code.")}
  await idbSet(key,value);
}
async function migrateLegacyPinForAccount(){
  if(typeof cloudUser==="undefined"||!cloudUser?.id)return;
  const legacy=await fetchStore(PIN_KEY);
  if(!legacy)return;
  let ownerId="";
  try{const saved=await fetchStore(D_KEY);ownerId=JSON.parse(saved||"{}").meta?.ownerUserId||""}catch{}
  const targetKey=pinUserKey(ownerId||cloudUser.id);
  if(!await fetchStore(targetKey))await saveLocalPin(legacy,targetKey);
  await store(PIN_KEY,null);
}
function validBackup(x){return!!x&&typeof x==="object"&&!Array.isArray(x)&&!!x.settings&&typeof x.settings==="object"&&Array.isArray(x.courses)&&["clients","depenses","factures","docs"].every(k=>x[k]==null||Array.isArray(x[k]))}
async function derive(pw,salt){const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(pw),"PBKDF2",false,["deriveKey"]);return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:150000,hash:"SHA-256"},k,{name:"AES-GCM",length:256},false,["decrypt"])}
const CRC=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
const crc32=u=>{let c=0xFFFFFFFF;for(let i=0;i<u.length;i++)c=CRC[(c^u[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0};
function zipStore(files){const te=new TextEncoder();const parts=[],cd=[];let off=0;
for(const f of files){const nb=te.encode(f.name),data=f.data,crc=crc32(data);
const lh=new DataView(new ArrayBuffer(30));lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(12,33,true);lh.setUint32(14,crc,true);lh.setUint32(18,data.length,true);lh.setUint32(22,data.length,true);lh.setUint16(26,nb.length,true);
parts.push(new Uint8Array(lh.buffer),nb,data);
const ch=new DataView(new ArrayBuffer(46));ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(14,33,true);ch.setUint32(16,crc,true);ch.setUint32(20,data.length,true);ch.setUint32(24,data.length,true);ch.setUint16(28,nb.length,true);ch.setUint32(42,off,true);
cd.push(new Uint8Array(ch.buffer),nb);off+=30+nb.length+data.length}
const cdSize=cd.reduce((s,x)=>s+x.length,0);const end=new DataView(new ArrayBuffer(22));end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,cdSize,true);end.setUint32(16,off,true);
return new Blob([...parts,...cd,new Uint8Array(end.buffer)],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})}
const xe=s=>String(s??"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const colN=i=>{let s="";i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26)}return s};
const serial=d=>{if(!d)return"";const[y,m,dd]=d.slice(0,10).split("-").map(Number);return Date.UTC(y,m-1,dd)/864e5+25569};
function sheetXml(rows,widths){let x='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'+widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join("")+"</cols><sheetData>";
rows.forEach((r,ri)=>{x+=`<row r="${ri+1}">`;r.forEach((c,ci)=>{if(c===""||c==null)return;const ref=colN(ci)+(ri+1);let v=c,s=ri===0?1:0;if(typeof c==="object"){v=c.v;s=c.s}
if(v===""||v==null)return;if(typeof v==="number")x+=`<c r="${ref}" s="${s}"><v>${v}</v></c>`;else x+=`<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xe(v)}</t></is></c>`});x+="</row>"});
return x+`</sheetData><autoFilter ref="A1:${colN(widths.length-1)}${Math.max(1,rows.length)}"/></worksheet>`}
function buildXlsx(sheets){const te=new TextEncoder();const n=sheets.length;const F=[];
F.push({name:"[Content_Types].xml",data:te.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")+"</Types>")});
F.push({name:"_rels/.rels",data:te.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')});
F.push({name:"xl/workbook.xml",data:te.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((s,i)=>`<sheet name="${xe(s.name)}" sheetId="${i+1}"${s.hidden?' state="hidden"':""} r:id="rId${i+1}"/>`).join("")+"</sheets></workbook>")});
F.push({name:"xl/_rels/workbook.xml.rels",data:te.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("")+`<Relationship Id="rId${n+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`)});
F.push({name:"xl/styles.xml",data:te.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;€&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF5A6B2E"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>')});
sheets.forEach((s,i)=>F.push({name:`xl/worksheets/sheet${i+1}.xml`,data:te.encode(sheetXml(s.rows,s.widths))}));
return zipStore(F)}
const HR=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HB=[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const clean=s=>String(s??"").replace(/→/g,"->").replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,"-").replace(/\u00a0|\u202f/g," ");
function tw(s,size,bold){let w=0;for(const ch of clean(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"")){const c=ch.charCodeAt(0);w+=(c>=32&&c<=126?(bold?HB:HR)[c-32]:556)}return w*size/1000}
function pdfStr(s){let o="";for(const ch of clean(s)){const c=ch.charCodeAt(0);if(ch==="€")o+="\\200";else if(c===40||c===41||c===92)o+="\\"+ch;else if(c>=32&&c<127)o+=ch;else if(c>=160&&c<256)o+="\\"+c.toString(8).padStart(3,"0");else if(c===339)o+="\\234";else o+="?"}return o}
function wrap(s,size,maxW,bold){const out=[];for(const para of clean(s).split("\n")){let line="";for(const w of para.split(/\s+/)){const t=line?line+" "+w:w;if(tw(t,size,bold)<=maxW||!line)line=t;else{out.push(line);line=w}}out.push(line)}return out}
const hex2=h=>{h=String(h||"#3d4a26").replace("#","");if(h.length===3)h=h.split("").map(x=>x+x).join("");return[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255)};
const mixc=(a,b,t)=>a.map((v,i)=>v*(1-t)+b[i]*t);
function snapshotInvoice(inv){if(!inv||inv.snapshot)return inv;inv.snapshot=JSON.parse(JSON.stringify({settings:db.settings,client:cl(inv.client),course:db.courses.find(x=>x.id===inv.course)||null}));inv.snapshotAt=Date.now();inv._updatedAt=Math.max(inv.snapshotAt,+inv._updatedAt||0);return inv}
function snapshotExistingInvoices(){for(const inv of db?.factures||[])snapshotInvoice(inv)}
async function buildInvoicePdf(inv,cOver,coOver){const s=inv.snapshot?.settings||db.settings,c=cOver||inv.snapshot?.client||cl(inv.client),co=coOver||inv.snapshot?.course||db.courses.find(x=>x.id===inv.course)||null;
const dev=inv.statut==="devis",paid=inv.statut==="payée",band=s.pdfStyle==="band";
const G=[0.13,0.15,0.1],GR=[0.4,0.42,0.36],COL=hex2(s.pdfColor),WH=[1,1,1],LT=mixc(COL,WH,0.9),LN=mixc(COL,WH,0.6);
const pages=[[]];const Y=t=>842-t;
const pageAt=t=>Math.max(0,Math.floor((t-40)/740));
const emit=(page,op)=>{while(pages.length<=page)pages.push([]);pages[page].push(op)};
const rect=(x,t,w,h,col)=>{let remaining=h,pos=t;while(remaining>0){const p=pageAt(pos),part=Math.min(remaining,780+p*740-pos);emit(p,`${col.map(v=>v.toFixed(3)).join(" ")} rg ${x} ${Y(pos-p*740+part)} ${w} ${part} re f`);pos+=part;remaining-=part}};
const line=(x1,t1,x2,t2,col,wd)=>{const p=pageAt(t1);emit(p,`${col.map(v=>v.toFixed(3)).join(" ")} RG ${wd||0.6} w ${x1} ${Y(t1-p*740)} m ${x2} ${Y(t2-p*740)} l S`)};
const text=(str,x,t,size,col,bold,align)=>{let xx=x;const w=tw(str,size,bold);if(align==="r")xx=x-w;else if(align==="c")xx=x-w/2;const p=pageAt(t);emit(p,`BT /${bold?"F2":"F1"} ${size} Tf ${col.map(v=>v.toFixed(3)).join(" ")} rg ${xx.toFixed(2)} ${Y(t-p*740)} Td (${pdfStr(str)}) Tj ET`)};
const ttc=+inv.total||0,ht=s.tvaOn?ttc/(1+s.tva/100):ttc,tva=ttc-ht;
let lg=null;
const headTxt=band?WH:COL,headH=band?108:96;
if(band)rect(0,0,595,108,COL);else{rect(0,92,595,3,COL)}

text(s.nom||"",40,56,20,headTxt,true);
text(dev?(s.pdfTitleD||"DEVIS"):(s.pdfTitleF||"FACTURE"),555,52,28,headTxt,true,"r");text("N° "+inv.num,555,72,11,headTxt,false,"r");text("Date : "+fd(inv.date),555,86,10,headTxt,false,"r");
let top=headH+22;
if(s.pdfIntro){wrap(s.pdfIntro,10,515).forEach(w=>{text(w,40,top,10,GR,false);top+=13});top+=8}
let t1=top,t2=top;
text("ÉMETTEUR",40,t1,8,GR,true);t1+=16;text(s.nom||"",40,t1,13,G,true);t1+=16;
const em=[s.pdfShowGerant&&s.gerant,s.pdfShowAdresse&&s.adresse,s.pdfShowSiret&&s.siret&&"SIRET : "+s.siret,[s.pdfShowTel&&s.tel,s.pdfShowEmail&&s.email].filter(Boolean).join("  ·  "),s.pdfShowSite&&s.site,s.pdfShowCarte&&s.numCarte&&"Carte professionnelle : "+s.numCarte,s.pdfShowPlaque&&s.plaque&&"Véhicule : "+s.plaque,s.pdfShowAssurance&&s.assurance&&"Assurance : "+s.assurance].filter(Boolean);
em.forEach(l=>wrap(l,10,235).forEach(w=>{text(w,40,t1,10,G,false);t1+=13}));
text(dev?"DESTINATAIRE":"FACTURÉ À",330,t2,8,GR,true);t2+=16;text(c.nom==="—"?"Client":c.nom,330,t2,13,G,true);t2+=16;
[c.adresse,c.siret?"SIRET : "+c.siret:"",s.pdfClientTel&&c.tel,s.pdfClientEmail&&c.email].filter(Boolean).forEach(l=>wrap(l,10,225).forEach(w=>{text(w,330,t2,10,G,false);t2+=13}));
top=Math.max(t1,t2)+16;
const info=[s.pdfShowDate&&["Date de la prestation",fd(co?co.date:inv.date)],s.pdfShowPay&&["Mode de paiement",co?co.paiement:"-"],s.pdfShowEcheance&&[dev?"Validité":"Échéance",dev?(s.pdfDevisJours||30)+" jours":(paid?"Réglée":(s.pdfEcheance||"À réception"))]].filter(Boolean);
if(info.length){rect(40,top,515,44,LT);const cw=515/info.length;info.forEach((x,i)=>{const xx=52+i*cw;text(x[0].toUpperCase(),xx,top+16,7.5,GR,true);text(x[1],xx,top+33,11,G,true)});top+=62}
rect(40,top,515,24,COL);const cols=s.pdfCols;
text(s.pdfDescLabel||"Désignation",50,top+16,9.5,WH,true);text(s.pdfQtyLabel||"Qté",cols?350:430,top+16,9.5,WH,true,"r");
if(cols){text("Prix HT",425,top+16,9.5,WH,true,"r");text("TVA",480,top+16,9.5,WH,true,"r")}text("Total TTC",548,top+16,9.5,WH,true,"r");
top+=24;const dl_=wrap(inv.desc||"Prestation de transport de personnes",10.5,cols?270:340);
const rh=Math.max(34,dl_.length*14+18);dl_.forEach((w,i)=>text(w,50,top+20+i*14,10.5,G,false));
text("1",cols?350:430,top+20,10.5,G,false,"r");if(cols){text(eur(ht),425,top+20,10.5,G,false,"r");text(s.tvaOn?s.tva+" %":"-",480,top+20,10.5,G,false,"r")}text(eur(ttc),548,top+20,10.5,G,true,"r");
top+=rh;line(40,top,555,top,LN,0.8);top+=22;const bx=335;
if(cols){text("Total HT",bx,top+4,10.5,GR,false);text(eur(ht),548,top+4,10.5,G,false,"r");top+=20;text(s.tvaOn?`TVA (${s.tva} %)`:"TVA non applicable",bx,top+4,10.5,GR,false);text(eur(tva),548,top+4,10.5,G,false,"r");top+=14}
rect(bx-10,top,230,34,COL);text("TOTAL TTC",bx,top+22,11,WH,true);text(eur(ttc),548,top+23,15,WH,true,"r");
let ly=top-(cols?30:0);
if(paid){text("ACQUITTÉE",40,ly+14,20,[0.22,0.5,0.15],true);text("Réglée"+(co?` par ${co.paiement}`:"")+(s.pdfThanks?" - "+s.pdfThanks:""),40,ly+32,10,GR,false)}
else if(!dev){text("À régler : "+(s.pdfEcheance||"à réception"),40,ly+14,13,G,true);let yy=ly+32;if(s.pdfShowIban&&s.iban){text("Coordonnées bancaires",40,yy,8,GR,true);text("IBAN : "+s.iban,40,yy+13,10,G,false);yy+=28}
if(s.pdfPayInfo)wrap(s.pdfPayInfo,9.5,270).forEach(w=>{text(w,40,yy,9.5,GR,false);yy+=12})}
else{text(`Devis valable ${s.pdfDevisJours||30} jours - bon pour accord, date et signature :`,40,ly+14,10,G,false);line(40,ly+75,260,ly+75,GR,0.6)}
top+=Math.max(70,(cols?0:30)+50);
if(top<ly+90)top=ly+90;
const ment=[s.tvaOn?"":"TVA non applicable, art. 293 B du CGI.",s.pdfShowMentions?s.mentions:""].filter(Boolean).join("\n");
if(ment){text("MENTIONS",40,top,7.5,GR,true);top+=12;wrap(ment,8.5,515).forEach(w=>{text(w,40,top,8.5,GR,false);top+=11})}
const footer=s.pdfFooter||[s.nom,s.siret?"SIRET "+s.siret:"",s.email].filter(Boolean).join(" · ");
for(let i=0;i<pages.length;i++){const label=footer+` · ${i+1}/${pages.length}`;const size=Math.min(8,510/Math.max(1,tw(label,1,false)));pages[i].push(`${LN.join(' ')} RG .6 w 40 42 m 555 42 l S`,`BT /F1 ${size} Tf ${GR.join(' ')} rg 40 26 Td (${pdfStr(label)}) Tj ET`)}
const te=new TextEncoder(),parts=[],offs=[];let len=0;const P=str=>{const bytes=te.encode(str);parts.push(bytes);len+=bytes.length};
P('%PDF-1.4\n');const obj=(n,body)=>{offs[n]=len;P(`${n} 0 obj\n${body}\nendobj\n`)};
obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,`<< /Type /Pages /Kids [${pages.map((_,i)=>(5+i*2)+' 0 R').join(' ')}] /Count ${pages.length} >>`);
obj(3,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');obj(4,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
pages.forEach((ops,i)=>{const id=5+i*2,stream=ops.join('\n');obj(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id+1} 0 R >>`);obj(id+1,`<< /Length ${te.encode(stream).length} >>\nstream\n${stream}\nendstream`)});
const n=5+pages.length*2,xo=len;P(`xref\n0 ${n}\n0000000000 65535 f \n`);for(let i=1;i<n;i++)P(String(offs[i]).padStart(10,'0')+' 00000 n \n');P(`trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xo}\n%%EOF\n`);return new Blob(parts,{type:'application/pdf'})}

const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const eur=n=>(+n||0).toLocaleString("fr-FR",{style:"currency",currency:"EUR"}).replace(/[\u202f\u00a0]/g," ");
const today=()=>{const d=new Date();return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
const fd=d=>d?new Date(d).toLocaleDateString("fr-FR"):"";
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const S=()=>db?db.settings:def.settings;
const cl=id=>db.clients.find(c=>c.id===id)||{nom:"—"};
const enc=encodeURIComponent;
const isAndroid=/Android/i.test(navigator.userAgent||"");
const MOIS=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const fill=(t,v)=>String(t||"").replace(/\{(\w+)\}/g,(_,k)=>v[k]!=null?v[k]:"");
const VARS=(c,fa)=>({client:cl(c.client).nom,date:fd(c.date),heure:c.heure||"--:--",depart:c.depart||"",arrivee:c.arrivee||"",prix:eur(c.prix),paiement:c.paiement||"",km:c.km||"",nom:S().nom,num:fa?fa.num:"",total:fa?eur(fa.total):"",statut:fa?(fa.statut==="payée"?"réglée":"à régler"):""});
const offs=()=>[...new Set(String(S().rappels??"").split(/[,;\s]+/).map(Number).filter(n=>Number.isInteger(n)&&n>0&&n<=43200))].sort((a,b)=>b-a);
const labM=m=>m%60===0&&m>=60?(m/60)+" h":m>=60?Math.floor(m/60)+" h "+(m%60):m+" min";
const sum=(a,f)=>a.reduce((s,x)=>s+(+f(x)||0),0);
function stats(pred){const C=db.courses.filter(c=>pred(c.date)&&c.statut==="terminée"),D=db.depenses.filter(d=>pred(d.date)),s=S();const ca=sum(C,c=>c.prix)+sum(C,c=>c.pourboire);const dep=sum(D,d=>d.montant);const km=sum(C,c=>c.km);
const tvaC=s.tvaOn?ca-ca/(1+s.tva/100):0;const tvaD=s.tvaOn?sum(D,d=>d.tva):0;const social=socialEstimate(s,ca-tvaC,D),cot=social.amount;return{ca,dep,km,n:C.length,tvaC,tvaD,cot,social,commissions:sum(C,c=>c.commission),net:ca-tvaC-dep-social.additional-sum(C,c=>c.commission),C,D}}
function appLink(kind,addr){const q=enc(addr);
if(kind==="waze"){const web=`https://waze.com/ul?q=${q}&navigate=yes`;return isAndroid?`intent://waze.com/ul?q=${q}&navigate=yes#Intent;scheme=https;package=com.waze;S.browser_fallback_url=${enc(web)};end`:web}
const path=`maps/dir/?api=1&destination=${q}&travelmode=driving`;const web="https://www.google.com/"+path;return isAndroid?`intent://www.google.com/${path}#Intent;scheme=https;package=com.google.android.apps.maps;S.browser_fallback_url=${enc(web)};end`:web}
const tel=c=>(cl(c.client).tel||"").replace(/[\s.\-]/g,"");
const intl=t=>t.replace(/^\+/,"").replace(/^00/,"").replace(/^0/,"33");
const msgConfirm=c=>fill(S().msgConfirm,VARS(c));
const msgFact=(c,fa)=>fill(S().msgFact,VARS(c,fa));
const waLink=(c,m)=>`https://wa.me/${intl(tel(c))}?text=${enc(m)}`;
const smsLink=(c,m)=>`sms:${tel(c)}?body=${enc(m)}`;
function parseNum(n){const m=/^(.*?)-(\d{4})-(\d+)$/.exec(n||"");return m?{p:m[1],y:+m[2],n:+m[3]}:{p:"",y:0,n:0}}
const fmtNum=(p,y,n)=>String(S().numFormat||"{P}-{Y}-{N}").replace("{P}",p).replace("{Y}",y).replace("{N}",String(n).padStart(+S().numPad||4,"0"));
function nextNum(p){const y=new Date().getFullYear();const used=db.factures.filter(f=>(f.pfx!=null?f.pfx:parseNum(f.num).p)===p&&(f.yr||parseNum(f.num).y)===y).map(f=>f.seq||parseNum(f.num).n);const n=used.length?Math.max(...used)+1:(+S().numStart||1);return{num:fmtNum(p,y,n),pfx:p,yr:y,seq:n}}
const designOf=c=>fill(S().designTpl,VARS(c));
async function shareOrDownload(file){try{if(isAndroid&&navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:file.name});return"shared"}}catch(e){if(e&&e.name==="AbortError")return"abort"}dl(file.name,file,file.type);return"downloaded"}
function buildSheets(onlyPer){const P=onlyPer?inPer:()=>true;const D=s=>({v:serial(s),s:2}),E=v=>({v:+v||0,s:3});
const C=db.courses.filter(c=>P(c.date)).sort((a,b)=>(a.date+a.heure).localeCompare(b.date+b.heure));
const sCourses={name:"Courses",widths:[12,8,22,16,30,30,16,12,12,8,12,12,12,30],rows:[["Date","Heure","Client","Téléphone","Départ","Arrivée","Type","Paiement","Statut","Km","Prix TTC","Pourboire","Commission","Notes"],...C.map(c=>[D(c.date),c.heure||"",cl(c.client).nom,cl(c.client).tel||"",c.depart||"",c.arrivee||"",c.type,c.paiement,c.statut,+c.km||0,E(c.prix),E(c.pourboire),E(c.commission),c.notes||""])]};
const sCl={name:"Clients",widths:[24,12,16,26,30,16,10,14],rows:[["Nom","Type","Téléphone","Email","Adresse","SIRET","Nb courses","CA total"],...db.clients.map(c=>{const cc=db.courses.filter(x=>x.client===c.id&&x.statut!=="annulée"&&P(x.date));return[c.nom,c.type||"",c.tel||"",c.email||"",c.adresse||"",c.siret||"",cc.length,E(sum(cc,x=>x.prix))]})]};
const sF={name:"Factures",widths:[16,12,22,44,14,12],rows:[["N°","Date","Client","Désignation","Total TTC","Statut"],...db.factures.filter(f=>P(f.date)).map(f=>[f.num,D(f.date),(f.snapshot?.client||cl(f.client)).nom,f.desc||"",E(f.total),f.statut])]};
const sD={name:"Dépenses",widths:[12,18,36,14,12],rows:[["Date","Catégorie","Description","Montant TTC","dont TVA"],...db.depenses.filter(d=>P(d.date)).sort((a,b)=>a.date.localeCompare(b.date)).map(d=>[D(d.date),d.cat,d.desc||"",E(d.montant),E(d.tva)])]};
const months=[...new Set([...db.courses.filter(c=>P(c.date)).map(c=>c.date.slice(0,7)),...db.depenses.filter(c=>P(c.date)).map(c=>c.date.slice(0,7))])].sort();
const sR={name:"Résumé mensuel",widths:[12,10,10,14,14,16,14],rows:[["Mois","Courses","Km","CA TTC","Dépenses","Cotisations estimées","Net estimé"],...months.map(m=>{const s=stats(d=>d.slice(0,7)===m);return[m,s.n,s.km,E(s.ca),E(s.dep),E(s.cot),E(s.net)]})]};
const sDoc={name:"Documents",widths:[30,14],rows:[["Nom","Expiration"],...db.docs.map(d=>[d.nom,d.exp?D(d.exp):""])]};
const sSettings={name:"Réglages",widths:[30,60],rows:[["Réglage","Valeur"],...Object.entries(db.settings).map(([key,value])=>[key,value!==null&&typeof value==="object"?JSON.stringify(value):String(value??"")])]};
return[sR,sCourses,sCl,sF,sD,sDoc,sSettings]}
function fullExcelState(){const state=JSON.parse(JSON.stringify(db));state.meta={appVersion:APP_VERSION,settingsAt:+(db.meta?.settingsAt||0),exportedAt:new Date().toISOString()};return state}
function buildRestoreSheet(){const json=JSON.stringify(fullExcelState()),chunks=json.match(/[\s\S]{1,30000}/g)||["{}"];return{name:"SLM_Restauration",hidden:true,widths:[18,60],rows:[["SLM_BACKUP",1],["Application",APP_NAME],["Version",APP_VERSION],["Exporté le",new Date().toISOString()],["Nombre de blocs",chunks.length],[],["Bloc","Données JSON"],...chunks.map((chunk,i)=>[i+1,chunk])]}}
async function xlsxOut(onlyPer,share,complete=false){const sheets=buildSheets(onlyPer);if(complete)sheets.push(buildRestoreSheet());const blob=buildXlsx(sheets);const name=`slm-${complete?"application-complete-":onlyPer?"periode-":"export-"}${today()}.xlsx`;const file=new File([blob],name,{type:blob.type});const r=share?await shareOrDownload(file):(dl(name,file,blob.type),"downloaded");if(r==="abort")return;toast(r==="shared"?"Excel prêt à partager":"Excel enregistré dans Téléchargements : "+file.name)}
async function exportAppExcel(share=true){return xlsxOut(false,share,true)}
let xlsxParserPromise=null,pendingExcelRestore=null,pendingExcelName="";
function loadXlsxParser(){if(window.XLSX?.read)return Promise.resolve(window.XLSX);if(!xlsxParserPromise)xlsxParserPromise=new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";script.onload=()=>window.XLSX?.read?resolve(window.XLSX):reject(new Error("Le lecteur Excel ne s’est pas chargé."));script.onerror=()=>reject(new Error("Lecture Excel indisponible. Vérifiez la connexion internet et réessayez."));document.head.appendChild(script)});return xlsxParserPromise.catch(error=>{xlsxParserPromise=null;throw error})}
function openExcelImport(){if(!cloudUser)return toast("Connectez-vous à votre compte avant d’importer un fichier.");document.getElementById("slm-excel-import")?.click()}
async function importExcelFile(file){if(!file)return;if(!cloudUser){toast("Connectez-vous à votre compte avant d’importer un fichier.");return}try{const XLSX=await loadXlsxParser(),workbook=XLSX.read(await file.arrayBuffer(),{cellDates:false});const sheet=workbook.Sheets.SLM_Restauration;if(!sheet)throw new Error("Ce fichier ne contient pas les données de restauration SLM. Choisissez un export complet créé par l’application.");const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:true});if(String(rows[0]?.[0]||"")!=="SLM_BACKUP"||String(rows[0]?.[1])!=="1")throw new Error("Format de restauration non reconnu.");const expected=Number(rows[4]?.[1]);if(!Number.isInteger(expected)||expected<1)throw new Error("Fichier Excel incomplet.");const chunks=new Map();for(const row of rows.slice(7)){const index=Number(row?.[0]);if(Number.isInteger(index)&&index>0&&typeof row[1]==="string")chunks.set(index,row[1])}if(chunks.size!==expected)throw new Error("La feuille de restauration est incomplète. Utilisez le fichier Excel original, sans le modifier.");let json="";for(let i=1;i<=expected;i++){if(!chunks.has(i))throw new Error("Un bloc de données manque dans le fichier.");json+=chunks.get(i)}const data=JSON.parse(json);if(!validBackup(data))throw new Error("Les données du fichier ne sont pas compatibles avec SLM Transfert.");for(const key of ["courses","clients","depenses","factures","docs"])if((data[key]||[]).some(row=>!row||typeof row!=="object"||!row.id))throw new Error("Une fiche du fichier n’a pas d’identifiant. L’import est annulé pour éviter les doublons.");pendingExcelRestore=data;pendingExcelName=file.name;showExcelImportPreview(data,file.name)}catch(error){toast(error?.message||"Impossible de lire ce fichier Excel.")}finally{const input=document.getElementById("slm-excel-import");if(input)input.value=""}}
async function applyExcelImport(mode){if(!pendingExcelRestore)return;if(!cloudUser)return toast("Connectez-vous au compte destinataire avant de restaurer.");if(!["replace","merge"].includes(mode))return;const userId=cloudUser.id,source=JSON.parse(JSON.stringify(pendingExcelRestore));let next=source;if(mode==="merge"){next=JSON.parse(JSON.stringify(db));const importedKeys=new Set();for(const key of ["courses","clients","depenses","factures","docs"]){const rows=new Map((next[key]||[]).map(row=>[row.id,row]));for(const row of source[key]||[]){const old=rows.get(row.id);if(!old||(+row._updatedAt||0)>(+old._updatedAt||0))rows.set(row.id,row);importedKeys.add(key+":"+row.id)}next[key]=Array.from(rows.values())}if(+(source.meta?.settingsAt||0)>+(next.meta?.settingsAt||0))next.settings=Object.assign({},next.settings||{},source.settings||{});next.notified=Object.assign({},next.notified||{},source.notified||{});next.deleted=(next.deleted||[]).filter(item=>!importedKeys.has(item.arr+":"+item.id))}try{await cloudApplyImportedData(next,userId);pendingExcelRestore=null;pendingExcelName="";toast(mode==="replace"?"Données restaurées dans ce compte.":"Données fusionnées dans ce compte.")}catch(error){toast(error?.message||"La restauration a échoué. Vos données précédentes sont conservées.")}}
const BUSINESS_FORMS=[["","À renseigner"],["micro","Micro-entreprise (régime de l’EI)"],["ei","Entreprise individuelle (EI)"],["eurl","EURL"],["sasu","SASU"],["sarl","SARL"],["sas","SAS"],["sa","SA"],["snc","SNC"],["scop","SCOP"],["scic","SCIC"],["sca","SCA"],["scs","SCS"],["other","Autre forme juridique"]];
const SOCIAL_MODES=[["legacy","Estimation personnalisée sur le CA HT"],["micro_bic","Micro-social : prestations de services BIC"],["recorded","Cotisations réelles saisies dans les dépenses"]];
function socialEstimate(settings,revenueHT,expenses){
  const mode=settings.socialMode||"legacy",paid=sum(expenses,d=>d.cat==="Cotisations"?d.montant:0);
  const rate=mode==="micro_bic"&&!settings.microCustomRate?21.2:Math.min(100,Math.max(0,+settings.cotis||0));
  const amount=mode==="recorded"?paid:Math.max(0,revenueHT)*rate/100;
  return{amount,additional:mode==="recorded"?0:Math.max(0,amount-paid),label:mode==="recorded"?"Cotisations saisies (déjà dans les dépenses)":`Cotisations prévisionnelles (${rate} % du CA HT)`,note:mode==="recorded"?"Saisissez vos montants de paie ou appels de cotisations dans la catégorie Cotisations. Aucun montant manquant n’est estimé.":"Prévision sur les courses saisies, pas sur les encaissements. Hors CFP, taxes consulaires, IR, IS et CFE. Les cotisations déjà saisies en dépenses ne sont pas déduites deux fois."};
}
const opt=(a,v)=>a.map(x=>`<option ${x===v?"selected":""}>${esc(x)}</option>`).join("");const f=id=>$("#"+id).value;
const touch=x=>{if(x&&typeof x==="object")x._updatedAt=Date.now();return x};
function markDeleted(arr,id){
  db.deleted=Array.isArray(db.deleted)?db.deleted:[];
  db.deleted=db.deleted.filter(x=>!(x.arr===arr&&x.id===id));
  db.deleted.push({arr,id,at:Date.now()});
}
function removeRecord(arr,id){snapshotExistingInvoices();
  if(!db[arr])return;
  db[arr]=db[arr].filter(x=>x.id!==id);
  markDeleted(arr,id);
  save();close_();go(true);
  toast("Élément supprimé");
}
function upsert(arr,o){if(arr==="clients")snapshotExistingInvoices();touch(o);db.deleted=(db.deleted||[]).filter(x=>!(x.arr===arr&&x.id===o.id));const i=db[arr].findIndex(x=>x.id===o.id);i>=0?db[arr][i]=o:db[arr].push(o);save();close_();go(true)}
const VOICE_MONTHS="janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre";
const VOICE_MONTH_NUMBERS={"janvier":1,"février":2,"fevrier":2,"mars":3,"avril":4,"mai":5,"juin":6,"juillet":7,"août":8,"aout":8,"septembre":9,"octobre":10,"novembre":11,"décembre":12,"decembre":12};
const VOICE_DAY_WORDS={"premier":1,"un":1,"une":1,"deux":2,"trois":3,"quatre":4,"cinq":5,"six":6,"sept":7,"huit":8,"neuf":9,"dix":10,"onze":11,"douze":12,"treize":13,"quatorze":14,"quinze":15,"seize":16,"dix-sept":17,"dix sept":17,"dix-huit":18,"dix huit":18,"dix-neuf":19,"dix neuf":19,"vingt":20,"vingt-et-un":21,"vingt et un":21,"vingt-deux":22,"vingt deux":22,"vingt-trois":23,"vingt trois":23,"vingt-quatre":24,"vingt quatre":24,"vingt-cinq":25,"vingt cinq":25,"vingt-six":26,"vingt six":26,"vingt-sept":27,"vingt sept":27,"vingt-huit":28,"vingt huit":28,"vingt-neuf":29,"vingt neuf":29,"trente":30,"trente-et-un":31,"trente et un":31};
const VOICE_WORD_NUMBERS={"un":1,"une":1,"deux":2,"trois":3,"quatre":4,"cinq":5,"six":6,"sept":7,"huit":8,"neuf":9,"dix":10,"onze":11,"douze":12,"treize":13,"quatorze":14,"quinze":15,"seize":16,"dix-sept":17,"dix-huit":18,"dix-neuf":19,"vingt":20,"vingt-et-un":21,"vingt-deux":22,"vingt-trois":23,"vingt-quatre":24};
let voiceRideRecognition=null;
let voiceRideRecognitionError="";
function voiceRideStatus(message,state){const el=$("#voice-ride-status");if(el){el.textContent=message;el.dataset.state=state||""}}
function voiceRideStartLabel(listening){const button=$("#voice-ride-start");if(button)button.textContent=listening?"Arrêter":"Dicter"}
function toggleVoiceRideCapture(){
  if(!billingRequirePremium("voice_course"))return;
  if(voiceRideRecognition){voiceRideRecognition.stop();voiceRideStatus("Finalisation de la dictée…");return}
  if(!window.isSecureContext){voiceRideStatus("La dictée vocale nécessite une connexion sécurisée (HTTPS).","error");return}
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){voiceRideStatus("Dictée intégrée indisponible ici. Utilise le micro du clavier dans le champ de texte.","fallback");$("#voice-ride-text")?.focus();return}
  const recognition=new Recognition();voiceRideRecognition=recognition;voiceRideRecognitionError="";
  recognition.lang="fr-FR";recognition.continuous=false;recognition.interimResults=true;
  recognition.onstart=()=>{voiceRideStartLabel(true);voiceRideStatus("Je t’écoute… Décris le trajet en une phrase.","listening")};
  recognition.onresult=event=>{if(voiceRideRecognition!==recognition)return;const input=$("#voice-ride-text");if(input)input.value=Array.from(event.results).map(result=>result[0]?.transcript||"").filter(Boolean).join(" ").trim()};
  recognition.onerror=event=>{if(voiceRideRecognition!==recognition)return;const messages={"not-allowed":"Autorise le microphone dans les réglages du navigateur, puis réessaie.","service-not-allowed":"Le service vocal du navigateur est indisponible. Utilise le micro du clavier.","network":"Le service vocal nécessite une connexion réseau. Utilise le micro du clavier ou réessaie en ligne.","no-speech":"Je n’ai pas entendu de phrase. Réessaie en parlant après le démarrage.","audio-capture":"Aucun microphone n’est disponible."};voiceRideRecognitionError=messages[event.error]||"La dictée n’a pas démarré. Tu peux saisir ou dicter le texte avec le clavier.";voiceRideStatus(voiceRideRecognitionError,"error")};
  recognition.onend=()=>{if(voiceRideRecognition!==recognition)return;voiceRideRecognition=null;voiceRideStartLabel(false);const phrase=$("#voice-ride-text")?.value?.trim()||"";if(phrase)parseVoiceRideIntoForm();else if(!voiceRideRecognitionError)voiceRideStatus("Aucune phrase reçue. Réessaie ou saisis le texte au clavier.","error")};
  try{recognition.start()}catch{voiceRideRecognition=null;voiceRideStartLabel(false);voiceRideStatus("Impossible de démarrer le microphone. Réessaie ou utilise le micro du clavier.","error")}
}
function stopVoiceRideCapture(){if(!voiceRideRecognition)return;try{voiceRideRecognition.stop()}catch{voiceRideRecognition=null;voiceRideStartLabel(false)}}
function voiceDateValue(year,month,day){const now=new Date();let y=year==null?now.getFullYear():year;if(y<100)y+=2000;let d=new Date(y,month-1,day);if(d.getFullYear()!==y||d.getMonth()!==month-1||d.getDate()!==day)return"";if(year==null&&d<new Date(now.getFullYear(),now.getMonth(),now.getDate())){y++;d=new Date(y,month-1,day);if(d.getMonth()!==month-1||d.getDate()!==day)return""}return String(y).padStart(4,"0")+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0")}
function voiceParseDate(text){
  const lower=text.toLocaleLowerCase("fr-FR");
  let m=lower.match(/\b(?:le\s+)?(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
  if(m){const value=voiceDateValue(m[3]?+m[3]:null,+m[2],+m[1]);if(value)return{value,match:m[0]}}
  const dayPattern="[0-9]{1,2}|"+Object.keys(VOICE_DAY_WORDS).sort((a,b)=>b.length-a.length).join("|");
  m=lower.match(new RegExp("\\b(?:le\\s+)?("+dayPattern+")\\s+("+VOICE_MONTHS+")(?:\\s+(\\d{4}))?\\b","i"));
  if(m){const token=m[1].replace(/\s+/g," ").trim(),day=VOICE_DAY_WORDS[token]||VOICE_DAY_WORDS[token.replace(/\s+/g,"-")]||+token,month=VOICE_MONTH_NUMBERS[m[2].toLocaleLowerCase("fr-FR")],value=voiceDateValue(m[3]?+m[3]:null,month,day);if(value)return{value,match:m[0]}}
  for(const [pattern,offset] of [[/\b(après-demain|apres-demain)\b/i,2],[/\b(demain)\b/i,1],[/\b(aujourd’hui|aujourd'hui)\b/i,0],[/\b(hier)\b/i,-1]]){const hit=lower.match(pattern);if(hit){const d=new Date();d.setDate(d.getDate()+offset);return{value:String(d.getFullYear()).padStart(4,"0")+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"),match:hit[0]}}}
  const weekdays={"dimanche":0,"lundi":1,"mardi":2,"mercredi":3,"jeudi":4,"vendredi":5,"samedi":6};
  m=lower.match(/\b(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)(?:\s+(prochain))?\b/);
  if(m){const d=new Date(),target=weekdays[m[1]],todayDay=d.getDay();let offset=(target-todayDay+7)%7;if(m[2]&&offset===0)offset=7;d.setDate(d.getDate()+offset);return{value:String(d.getFullYear()).padStart(4,"0")+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"),match:m[0]}}
  return null
}
function voiceParseTime(text){
  let m=text.match(/\b(?:à|vers)?\s*(\d{1,2}):([0-5]\d)\b/i);
  if(!m)m=text.match(/\b(?:à|vers)?\s*(\d{1,2})\s*(?:h|heures?)(?:\s*([0-5]?\d))?\b/i);
  if(m){const h=+m[1],min=+(m[2]||0);if(h<=23&&min<=59)return{value:String(h).padStart(2,"0")+":"+String(min).padStart(2,"0"),match:m[0]}}
  m=text.match(/\b(midi|minuit)\b/i);if(m)return{value:m[1].toLowerCase()==="midi"?"12:00":"00:00",match:m[0]};
  const words=Object.keys(VOICE_WORD_NUMBERS).sort((a,b)=>b.length-a.length).join("|");
  m=text.toLocaleLowerCase("fr-FR").match(new RegExp("\\b(?:à|vers)\\s+("+words+")\\s+heures?(?:\\s+(?:et\\s+)?(quart|quinze|trente|demi|quarante[- ]cinq))?\\b","i"));
  if(m){const hour=VOICE_WORD_NUMBERS[m[1]],minuteToken=(m[2]||"").replace(/[- ]/g," "),minute=minuteToken==="quart"||minuteToken==="quinze"?15:minuteToken==="trente"||minuteToken==="demi"?30:minuteToken==="quarante cinq"?45:0;if(hour<=23)return{value:String(hour).padStart(2,"0")+":"+String(minute).padStart(2,"0"),match:m[0]}}
  return null
}
function voiceCleanPlace(value){return(value||"").replace(/(?:\s+à|\s+avec|\s+pour)\s*[,;]*\s*$/i,"").replace(/[,;.!?]+$/g,"").replace(/^[\s,;:.-]+|[\s,;:.-]+$/g,"").replace(/\s+/g," ").replace(/^(?:un|une|course|transfert|trajet)\s+/i,"").trim()}
function voiceParseRidePhrase(text){
  const result={},date=voiceParseDate(text),time=voiceParseTime(text);if(date)result.date=date.value;if(time)result.heure=time.value;
  let route=text;
  if(date)route=route.replace(new RegExp(date.match.replace(/[.]/g,"\\."),"i")," ");
  if(time)route=route.replace(new RegExp(time.match.replace(/[.]/g,"\\."),"i")," ");
  route=route.replace(/\b(aujourd’hui|aujourd'hui|demain|après-demain|apres-demain|hier|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(?:\s+prochain)?\b/gi," ");
  const price=text.match(/\b(?:prix|tarif)\s*(?:de|à)?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?)\b/i)||text.match(/\b(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?)\b/i);
  if(price)result.prix=price[1].replace(",",".");
  const emptyKm=text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:km|kilom[eè]tres?)\s*(?:à\s+vide|vide)\b/i),km=text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:km|kilom[eè]tres?)\b/i);
  if(emptyKm)result.kmVide=emptyKm[1].replace(",",".");if(km&&(!emptyKm||km.index!==emptyKm.index))result.km=km[1].replace(",",".");
  if(price)route=route.replace(price[0]," ");if(km)route=route.replace(km[0]," ");if(emptyKm)route=route.replace(emptyKm[0]," ");
  const explicit=route.match(/\b(?:au\s+)?départ\s*(?:de|depuis|:)?\s*(.+?)\s+(?:et\s+)?arrivée\s*(?:à|au|:)?\s*(.+)$/i)||route.match(/\b(?:au\s+)?départ\s*(?:de|depuis|:)?\s*(.+?)\s+destination\s*(?:à|au|:)?\s*(.+)$/i);
  const reverse=route.match(/\b(?:arrivée|destination)\s*(?:à|au|:)?\s*(.+?)\s*[,;]\s*(?:au\s+)?départ\s*(?:de|depuis|:)?\s*(.+)$/i);
  const fromTo=route.match(/\b(?:au\s+départ\s+de|départ\s+de|depuis|de)\s+(.+?)\s+(?:jusqu['’]à|jusqu['’]au|vers|direction|à|pour)\s+(.+)$/i);
  const reverseFromTo=route.match(/\b(?:à\s+destination\s+de|destination)\s+(.+?)\s+(?:depuis|à\s+partir\s+de)\s+(.+)$/i);
  if(explicit){result.depart=voiceCleanPlace(explicit[1]);result.arrivee=voiceCleanPlace(explicit[2])}
  else if(reverse){result.arrivee=voiceCleanPlace(reverse[1]);result.depart=voiceCleanPlace(reverse[2])}
  else if(fromTo){result.depart=voiceCleanPlace(fromTo[1]);result.arrivee=voiceCleanPlace(fromTo[2])}
  else if(reverseFromTo){result.arrivee=voiceCleanPlace(reverseFromTo[1]);result.depart=voiceCleanPlace(reverseFromTo[2])}
  const client=text.match(/\bclient(?:e)?\s*(?:est|:)?\s*([^,;.]+)/i);if(client)result.client=client[1].trim();
  if(/\baéroport\b/i.test(text))result.type="Aéroport";else if(/\bgare\b/i.test(text))result.type="Gare";
  return result
}
let pendingExpenseReceipt=null,expenseReceiptBusy=false,expenseReceiptGeneration=0;
let expenseReceiptRemoved=false;
function expenseReceiptSafeUrl(value){const url=String(value||"");return /^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(url)?url:""}
let expenseEditingId="";
function expenseReceiptRemove(){if(pendingExpenseReceipt||db?.depenses?.find(x=>x.id===expenseEditingId)?.receiptDataUrl){if(typeof billingRequirePremium==="function"&&!billingRequirePremium("expense_receipt"))return;expenseReceiptRemoved=true;pendingExpenseReceipt=null;expenseReceiptRefreshPreview()}}
function expenseLoadImage(file){if(typeof createImageBitmap==="function")return createImageBitmap(file,{imageOrientation:"from-image"});return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),image=new Image();image.onload=()=>{URL.revokeObjectURL(url);resolve(image)};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Impossible de lire cette image."))};image.src=url})}
function expenseCanvasBlob(canvas,quality){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("La compression de la photo a échoué.")),"image/jpeg",quality))}
function expenseBlobDataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||""));reader.onerror=()=>reject(new Error("Impossible de préparer la photo."));reader.readAsDataURL(blob)})}
async function expenseReceiptSelected(input){
  if(typeof billingRequirePremium==="function"&&!billingRequirePremium("expense_receipt")){input.value="";return}
  const file=input.files?.[0];input.value="";if(!file)return;
  if(!file.type.startsWith("image/"))return toast("Choisis une photo ou une image de ticket.");
  if(file.size>15*1024*1024)return toast("La photo dépasse 15 Mo. Choisis une image plus légère.");
  const generation=++expenseReceiptGeneration;expenseReceiptBusy=true;
  try{
    const image=await expenseLoadImage(file),width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
    if(!width||!height)throw new Error("Cette image ne peut pas être lue.");
    let scale=Math.min(1,1280/Math.max(width,height)),blob=null;
    const canvas=document.createElement("canvas"),context=canvas.getContext("2d");if(!context)throw new Error("Compression photo indisponible sur cet appareil.");
    for(let attempt=0;attempt<4;attempt++){
      canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      blob=await expenseCanvasBlob(canvas,attempt<2 ? 0.76 : 0.62);if(blob.size<=500*1024)break;scale*=.82;
    }
    image.close?.();if(blob.size>800*1024)throw new Error("La photo reste trop volumineuse après compression. Essaie de la recadrer.");
    const dataUrl=await expenseBlobDataUrl(blob);if(generation!==expenseReceiptGeneration)return;pendingExpenseReceipt={dataUrl,name:file.name||"Justificatif photo"};expenseReceiptRemoved=false;expenseReceiptRefreshPreview();
  }catch(error){if(generation===expenseReceiptGeneration)toast(error?.message||"Impossible d’ajouter cette photo.")}finally{if(generation===expenseReceiptGeneration)expenseReceiptBusy=false}
}
function dl(n,t,ty){const a=document.createElement("a");a.href=URL.createObjectURL(t instanceof Blob?t:new Blob([t],{type:ty}));a.download=n;document.body.appendChild(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(a.href)},4000)}
const icsDate=d=>d.toISOString().replace(/[-:]/g,"").replace(/\.\d+/,"");
const ie=x=>String(x||"").replace(/[,;\\]/g,m=>"\\"+m).replace(/\n/g,"\\n");
function vevent(c){const dur=+S().dureeMin>0?+S().dureeMin:Math.max(30,(+c.km||20)*1.5);const st=new Date(c.date+"T"+(c.heure||"00:00")),en=new Date(st.getTime()+dur*6e4);
const al=S().rappelsOn?offs().map(m=>`BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Course dans ${labM(m)}\r\nTRIGGER:-PT${m}M\r\nEND:VALARM`).join("\r\n"):"";
return`BEGIN:VEVENT\r\nUID:${c.id}@slmtransfert\r\nDTSTAMP:${icsDate(new Date())}\r\nDTSTART:${icsDate(st)}\r\nDTEND:${icsDate(en)}\r\nSUMMARY:${ie("🚖 "+cl(c.client).nom+" - "+(c.depart||"")+" → "+(c.arrivee||""))}\r\nLOCATION:${ie(c.depart)}\r\nDESCRIPTION:${ie(`Client: ${cl(c.client).nom} ${tel(c)}\nTrajet: ${c.depart} -> ${c.arrivee}\nPrix: ${c.prix} EUR (${c.paiement})\nWaze: https://waze.com/ul?q=${enc(c.depart||"")}&navigate=yes\n${c.notes||""}`)}\r\n${al}${al?"\r\n":""}END:VEVENT`}
const ics=a=>"BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//SLM Transfert//FR\r\n"+a.map(vevent).join("\r\n")+"\r\nEND:VCALENDAR";
function icsOne(id){dl("course.ics",ics([db.courses.find(c=>c.id===id)]),"text/calendar");toast("Fichier téléchargé : ouvrez-le pour l'ajouter à l'agenda")}
function icsAll(){const a=db.courses.filter(c=>c.statut==="planifiée"&&c.date>=today());if(!a.length)return toast("Aucune course");dl("courses-slm.ics",ics(a),"text/calendar");toast("Fichier téléchargé : ouvrez-le pour l'ajouter à l'agenda")}
async function notify(t,b){toast(t);navigator.vibrate&&navigator.vibrate([200,100,200]);if("Notification" in window&&Notification.permission==="granted"){try{const r=await navigator.serviceWorker.getRegistration();r?r.showNotification(t,{body:b,icon:"icon-192.jpg",badge:"icon-192.jpg",vibrate:[200,100,200],tag:t+b}):new Notification(t,{body:b})}catch{}}}
function checkReminders(){if(!db||!S().rappelsOn||(typeof pushDeviceActive==="function"&&pushDeviceActive()))return;const now=Date.now();db.courses.filter(c=>c.statut==="planifiée"&&c.heure).forEach(c=>{const m=(new Date(c.date+"T"+c.heure).getTime()-now)/6e4;
offs().forEach(th=>{const k=c.id+th;if(m>0&&m<=th&&m>th-1&&!db.notified[k]){db.notified[k]=1;save();notify(`🚖 Course dans ${labM(th)}`,`${c.heure} · ${cl(c.client).nom} · ${c.depart||""} → ${c.arrivee||""}`)}})})}
setInterval(checkReminders,30000);
if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(e=>console.warn("SLM Transfert : mode hors-ligne indisponible",e));