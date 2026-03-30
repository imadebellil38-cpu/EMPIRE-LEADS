(function(){
if(!location.hostname.includes('instagram.com')){alert('Ouvre ce bookmarklet sur instagram.com');return;}
if(document.getElementById('igf-overlay')){document.getElementById('igf-overlay').remove();return;}

// ── LocalStorage keys ──
var SEEN_KEY='igf_seen_profiles';
var SEARCHES_KEY='igf_saved_searches';

// ── Seen history ──
function getSeenProfiles(){try{return JSON.parse(localStorage.getItem(SEEN_KEY)||'[]');}catch(e){return[];}}
function saveSeenProfiles(list){try{localStorage.setItem(SEEN_KEY,JSON.stringify(list));}catch(e){}}
function addToSeen(usernames){var s=getSeenProfiles();var set=new Set(s);usernames.forEach(function(u){set.add(u);});saveSeenProfiles(Array.from(set));}

// ── Saved searches ──
function getSavedSearches(){try{return JSON.parse(localStorage.getItem(SEARCHES_KEY)||'[]');}catch(e){return[];}}
function saveSearch(obj){var list=getSavedSearches();list.unshift(obj);if(list.length>20)list=list.slice(0,20);localStorage.setItem(SEARCHES_KEY,JSON.stringify(list));}

// ── Synonymes niches ──
var NICHE_SYNONYMS={
  'monteur vid':['video editor','montage vid\u00e9o','\u00e9diteur vid\u00e9o','monteur freelance','post production','motion designer','montage youtube','montage tiktok','montage reels','montage clip','monteur professionnel','video editing','vid\u00e9o montage','editing freelance'],
  'photographe':['photographer','photo studio','shooting photo','portrait photographer','wedding photographer','photographe mariage'],
  'graphiste':['graphic designer','designer graphique','design graphique','visual designer','brand designer','directeur artistique'],
  'd\u00e9veloppeur':['developer','web developer','d\u00e9v web','dev fullstack','software engineer','programmeur','codeur'],
  'community manager':['social media manager','gestionnaire r\u00e9seaux sociaux','social media','CM freelance','content manager'],
  'r\u00e9dacteur':['copywriter','r\u00e9dacteur web','content writer','r\u00e9daction','ghostwriter','storyteller'],
  'coach':['coaching','mentor','consultant','formateur','coach business','coach sportif','life coach','coach bien-\u00eatre'],
  'coiffeur':['hairstylist','hair artist','coiffeuse','barbier','barber','salon de coiffure','coloriste'],
  'tatoueur':['tattoo artist','tatouage','tattoo','ink artist','tattoo studio'],
  'boulanger':['p\u00e2tissier','bakery','boulangerie','pastry chef','artisan boulanger'],
  'restaura':['restaurant','chef','cuisinier','cuisine','food','gastro','traiteur','chef cuisinier'],
  'immobilier':['real estate','agent immobilier','immo','chasseur immobilier','mandataire immobilier'],
  'architecte':['architect','architecture','archi','architecte int\u00e9rieur','interior designer','d\u00e9corateur'],
  'plombier':['plomberie','plumber','chauffagiste','d\u00e9panneur','artisan plombier'],
  'electricien':['\u00e9lectricien','\u00e9lectricit\u00e9','electrician','artisan \u00e9lectricien'],
  'avocat':['lawyer','cabinet avocat','juriste','droit','attorney'],
  'comptable':['expert comptable','accountant','cabinet comptable','commissaire aux comptes'],
  'fitness':['personal trainer','coach sportif','salle de sport','gym','musculation','pr\u00e9parateur physique'],
  'yoga':['prof de yoga','yoga teacher','m\u00e9ditation','bien-\u00eatre','wellness'],
  'maquill':['makeup artist','maquilleuse','MUA','beauty','maquillage professionnel'],
  'fleuriste':['florist','flower shop','compositions florales','artisan fleuriste'],
  'wedding':['mariage','wedding planner','organisateur mariage','d\u00e9coration mariage'],
  'dj':['disc jockey','DJ','djset','music producer','producteur musique','beatmaker'],
  'influenc':['influencer','cr\u00e9ateur de contenu','content creator','influenceur','UGC creator']
};
function getSynonyms(niche){
  var n=niche.toLowerCase();var syns=[];
  Object.keys(NICHE_SYNONYMS).forEach(function(key){
    if(n.indexOf(key)!==-1)syns=syns.concat(NICHE_SYNONYMS[key]);
  });
  return syns;
}

// ── Email/phone extraction ──
function extractEmails(text){return(text||'').match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)||[];}
function extractPhones(text){var raw=(text||'').match(/(?:\+?\d{1,4}[\s\-.]?)?\(?\d{1,4}\)?[\s\-.]?\d{2,4}[\s\-.]?\d{2,4}[\s\-.]?\d{0,4}/g)||[];return raw.filter(function(p){return p.replace(/\D/g,'').length>=7;});}

// ── Styles ──
var S={
  f:'display:flex;flex-direction:column;gap:4px',
  l:'font-size:10px;color:#ffffff;text-transform:uppercase;letter-spacing:.05em;font-weight:600',
  i:'padding:9px 11px;background:#111118;border:1.5px solid #2a2a38;border-radius:8px;color:#e0e0f0;font-size:14px;outline:none',
  s:'padding:9px 11px;background:#111118;border:1.5px solid #2a2a38;border-radius:8px;color:#e0e0f0;font-size:13px;outline:none;cursor:pointer',
  t:'display:inline-block;font-size:9px;padding:1px 5px;border-radius:20px;margin-left:4px',
  btn:'padding:8px 16px;border-radius:8px;border:1.5px solid #2a2a38;background:transparent;color:#d0d0e0;font-size:13px;font-weight:600;cursor:pointer',
  btnA:'padding:8px 16px;border-radius:8px;border:1.5px solid #E1306C;background:rgba(225,48,108,.15);color:#E1306C;font-size:13px;font-weight:600;cursor:pointer',
};

// ── Build overlay ──
var ov=document.createElement('div');
ov.id='igf-overlay';
ov.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(8,8,15,.45);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);overflow-y:auto;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';

ov.innerHTML='<div style="max-width:1060px;margin:0 auto;padding:16px">'+

'<!-- Header -->'+
'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid #2a2a38">'+
'  <div style="font-size:20px;font-weight:800;letter-spacing:-.5px">'+
'    <span style="background:linear-gradient(135deg,#E1306C,#F77737);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Instagram</span>'+
'    <span style="color:#e0e0f0"> Finder Pro</span>'+
'  </div>'+
'  <div style="display:flex;gap:8px;align-items:center">'+
'    <span id="igf-seen-count" style="font-size:11px;color:#c0c0d0"></span>'+
'    <button id="igf-clear-history" style="background:none;border:1px solid #2a2a38;color:#c0c0d0;font-size:10px;padding:4px 8px;border-radius:6px;cursor:pointer">Vider historique</button>'+
'    <button id="igf-saved-btn" style="background:none;border:1px solid #2a2a38;color:#d0d0e0;font-size:12px;padding:4px 10px;border-radius:6px;cursor:pointer">\u2606 Recherches</button>'+
'    <button id="igf-close" style="background:none;border:1px solid #2a2a38;color:#d0d0e0;font-size:22px;cursor:pointer;width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center">&times;</button>'+
'  </div>'+
'</div>'+

'<!-- Saved searches dropdown -->'+
'<div id="igf-saved-panel" style="display:none;margin-bottom:12px;background:#111118;border:1px solid #2a2a38;border-radius:10px;padding:12px;max-height:200px;overflow-y:auto">'+
'  <div style="font-size:11px;color:#c0c0d0;margin-bottom:8px;text-transform:uppercase">Recherches sauvegard\u00e9es</div>'+
'  <div id="igf-saved-list"></div>'+
'</div>'+

'<!-- Mode tabs + location tab -->'+
'<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">'+
'  <button id="igf-mode-niche" class="igf-tab" style="'+S.btnA+'">\uD83D\uDD0D Niche</button>'+
'  <button id="igf-mode-hashtag" class="igf-tab" style="'+S.btn+'"># Hashtag</button>'+
'  <button id="igf-mode-competitor" class="igf-tab" style="'+S.btn+'">\uD83D\uDC64 Concurrents</button>'+
'  <button id="igf-mode-location" class="igf-tab" style="'+S.btn+'">\uD83D\uDCCD Lieu</button>'+
'</div>'+

'<!-- Search input -->'+
'<div style="display:flex;gap:8px;margin-bottom:10px;align-items:stretch">'+
'  <input id="igf-niche" value="monteur vid\u00e9o" placeholder="monteur video, coach sportif, magasin manga..." style="flex:1;min-width:0;padding:13px 15px;background:#111118;border:1.5px solid #2a2a38;border-radius:10px;color:#e0e0f0;font-size:15px;outline:none">'+
'  <button id="igf-voice" title="Recherche vocale" style="width:44px;min-height:44px;border-radius:10px;border:1.5px solid #E1306C;background:rgba(225,48,108,.1);color:#E1306C;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">\uD83C\uDF99</button>'+
'</div>'+

'<!-- Basic filters (always visible) -->'+
'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;align-items:flex-end">'+
'  <div style="'+S.f+'"><label style="'+S.l+'">Min abonn\u00e9s</label><input id="igf-min" type="number" value="0" style="width:95px;'+S.i+'"></div>'+
'  <div style="'+S.f+'"><label style="'+S.l+'">Max abonn\u00e9s</label><input id="igf-max" type="number" value="100000" style="width:105px;'+S.i+'"></div>'+
'  <div style="'+S.f+'"><label style="'+S.l+'">R\u00e9sultats</label><input id="igf-count" type="number" value="50" style="width:70px;'+S.i+'"></div>'+
'  <div style="'+S.f+'"><label style="'+S.l+'">Type</label><select id="igf-type" style="'+S.s+'"><option value="all">Tous</option><option value="verified">V\u00e9rifi\u00e9s</option><option value="biz">Business</option><option value="has_site">A un site</option><option value="has_email">A un email</option></select></div>'+
'  <div style="'+S.f+'"><label style="'+S.l+'">Trier</label><select id="igf-sort" style="'+S.s+'"><option value="followers_desc">Abonn\u00e9s \u2193</option><option value="followers_asc">Abonn\u00e9s \u2191</option><option value="engagement">Engagement</option><option value="score">Score \u2193</option><option value="name">Nom</option></select></div>'+
'  <button id="igf-toggle-filters" style="padding:9px 14px;background:#1a1a24;border:1.5px solid #2a2a38;border-radius:8px;color:#d0d0e0;font-size:12px;cursor:pointer;white-space:nowrap">\u25BC Filtres avanc\u00e9s</button>'+
'</div>'+

'<!-- Advanced filters (collapsible) -->'+
'<div id="igf-adv-filters" style="display:none;padding:10px;background:#0d0d16;border:1px solid #2a2a38;border-radius:10px;margin-bottom:10px">'+
'  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">'+
'    <div style="'+S.f+'"><label style="'+S.l+'">Cat\u00e9gorie</label><input id="igf-cat" placeholder="photographe..." style="width:140px;'+S.i+'"></div>'+
'    <div style="'+S.f+'"><label style="'+S.l+'">Bio contient</label><input id="igf-bio-kw" placeholder="freelance, devis..." style="width:140px;'+S.i+'"></div>'+
'    <div style="'+S.f+'"><label style="'+S.l+'">Ville / Pays</label><input id="igf-city" placeholder="paris, france..." style="width:130px;'+S.i+'"></div>'+
'    <div style="'+S.f+'"><label style="'+S.l+'">Actif depuis</label><select id="igf-active" style="'+S.s+'"><option value="0">Peu importe</option><option value="7">7 jours</option><option value="30" selected>30 jours</option><option value="90">90 jours</option><option value="365">1 an</option></select></div>'+
'    <div style="'+S.f+'"><label style="'+S.l+'">Min engagement</label><input id="igf-min-eng" type="number" value="0" style="width:80px;'+S.i+'"></div>'+
'    <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#d0d0e0;cursor:pointer;padding-bottom:4px"><input type="checkbox" id="igf-hide-seen" style="accent-color:#E1306C"> Exclure d\u00e9j\u00e0 vus</label>'+
'  </div>'+
'</div>'+

'<!-- Action buttons -->'+
'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">'+
'  <button id="igf-go" style="flex:1;min-width:120px;padding:13px 20px;background:linear-gradient(135deg,#E1306C,#F77737);color:#fff;font-size:15px;font-weight:700;border:none;border-radius:10px;cursor:pointer;box-shadow:0 4px 14px rgba(225,48,108,.35)">\uD83D\uDD0D Rechercher</button>'+
'  <button id="igf-stop" style="padding:13px 16px;background:#1a1a24;border:1.5px solid #ff4444;color:#ff4444;font-size:13px;font-weight:600;border-radius:10px;cursor:pointer;display:none">\u23F9 Stop</button>'+
'  <button id="igf-csv" style="padding:13px 16px;background:#1a1a24;border:1.5px solid #00d084;color:#00d084;font-size:13px;font-weight:600;border-radius:10px;cursor:pointer;display:none">\u2B07 CSV</button>'+
'  <button id="igf-csv-sel" style="padding:13px 16px;background:#1a1a24;border:1.5px solid #00d084;color:#00d084;font-size:13px;font-weight:600;border-radius:10px;cursor:pointer;display:none">\u2B07 CSV s\u00e9lection</button>'+
'  <button id="igf-crm" style="padding:13px 16px;background:#1a1a24;border:1.5px solid #6C63FF;color:#6C63FF;font-size:13px;font-weight:600;border-radius:10px;cursor:pointer;display:none">\uD83D\uDCE4 CRM</button>'+
'  <button id="igf-save-search" style="padding:13px 16px;background:#1a1a24;border:1.5px solid #F77737;color:#F77737;font-size:13px;font-weight:600;border-radius:10px;cursor:pointer;display:none">\u2606 Sauvegarder</button>'+
'</div>'+

'<!-- Live counter -->'+
'<div id="igf-prog-wrap" style="margin-bottom:10px;display:none">'+
'  <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">'+
'    <div style="flex:1;height:4px;background:#1a1a24;border-radius:2px;overflow:hidden"><div id="igf-bar" style="height:100%;width:0;background:linear-gradient(90deg,#E1306C,#F77737);transition:width .4s;border-radius:2px"></div></div>'+
'    <div id="igf-counter" style="font-size:18px;font-weight:800;color:#E1306C;min-width:70px;text-align:right">0/50</div>'+
'  </div>'+
'  <div id="igf-status" style="font-size:12px;color:#d0d0e0;min-height:16px"></div>'+
'</div>'+

'<!-- Stats -->'+
'<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">'+
'  <div style="flex:1;min-width:80px;background:#111118;border:1px solid #2a2a38;border-radius:8px;padding:8px 12px"><div style="font-size:9px;color:#c0c0d0;text-transform:uppercase;margin-bottom:2px">Total</div><div id="igf-stat-total" style="font-size:18px;font-weight:700;color:#E1306C">0</div></div>'+
'  <div style="flex:1;min-width:80px;background:#111118;border:1px solid #2a2a38;border-radius:8px;padding:8px 12px"><div style="font-size:9px;color:#c0c0d0;text-transform:uppercase;margin-bottom:2px">Filtr\u00e9s</div><div id="igf-stat-filt" style="font-size:18px;font-weight:700;color:#e0e0f0">0</div></div>'+
'  <div style="flex:1;min-width:80px;background:#111118;border:1px solid #2a2a38;border-radius:8px;padding:8px 12px"><div style="font-size:9px;color:#c0c0d0;text-transform:uppercase;margin-bottom:2px">Moy.</div><div id="igf-stat-avg" style="font-size:18px;font-weight:700;color:#e0e0f0">0</div></div>'+
'  <div style="flex:1;min-width:80px;background:#111118;border:1px solid #2a2a38;border-radius:8px;padding:8px 12px"><div style="font-size:9px;color:#c0c0d0;text-transform:uppercase;margin-bottom:2px">Emails</div><div id="igf-stat-email" style="font-size:18px;font-weight:700;color:#00d084">0</div></div>'+
'  <div style="flex:1;min-width:80px;background:#111118;border:1px solid #2a2a38;border-radius:8px;padding:8px 12px"><div style="font-size:9px;color:#c0c0d0;text-transform:uppercase;margin-bottom:2px">Sites</div><div id="igf-stat-site" style="font-size:18px;font-weight:700;color:#F77737">0</div></div>'+
'  <div style="flex:1;min-width:80px;background:#111118;border:1px solid #2a2a38;border-radius:8px;padding:8px 12px"><div style="font-size:9px;color:#c0c0d0;text-transform:uppercase;margin-bottom:2px">S\u00e9lectionn\u00e9s</div><div id="igf-stat-sel" style="font-size:18px;font-weight:700;color:#6C63FF">0</div></div>'+
'</div>'+

'<!-- Select all -->'+
'<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'+
'  <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#d0d0e0;cursor:pointer"><input type="checkbox" id="igf-select-all" style="accent-color:#E1306C"> Tout s\u00e9lectionner</label>'+
'</div>'+

'<!-- Table -->'+
'<div style="overflow-x:auto;border-radius:10px;border:1px solid #2a2a38">'+
'  <table id="igf-table" style="width:100%;border-collapse:collapse;min-width:820px">'+
'    <thead><tr style="background:#111118">'+
'      <th style="padding:8px 6px;width:30px"></th>'+
'      <th style="padding:8px 6px;text-align:left;font-size:10px;color:#c0c0d0;text-transform:uppercase;width:28px">#</th>'+
'      <th id="igf-th-profile" style="padding:8px 6px;text-align:left;font-size:10px;color:#c0c0d0;text-transform:uppercase;cursor:pointer">Profil</th>'+
'      <th id="igf-th-followers" style="padding:8px 6px;text-align:left;font-size:10px;color:#E1306C;text-transform:uppercase;cursor:pointer;white-space:nowrap">Abonn\u00e9s \u2193</th>'+
'      <th style="padding:8px 6px;text-align:left;font-size:10px;color:#c0c0d0;text-transform:uppercase">Cat.</th>'+
'      <th style="padding:8px 6px;text-align:left;font-size:10px;color:#c0c0d0;text-transform:uppercase">Bio</th>'+
'      <th style="padding:8px 6px;text-align:left;font-size:10px;color:#c0c0d0;text-transform:uppercase">Contact</th>'+
'      <th style="padding:8px 6px;text-align:left;font-size:10px;color:#c0c0d0;text-transform:uppercase">Score</th>'+
'    </tr></thead>'+
'    <tbody id="igf-body"></tbody>'+
'  </table>'+
'</div>'+

'<!-- Profile preview tooltip -->'+
'<div id="igf-preview" style="display:none;position:fixed;z-index:2147483648;background:#111118;border:1.5px solid #2a2a38;border-radius:12px;padding:14px;width:280px;box-shadow:0 12px 40px rgba(0,0,0,.7);pointer-events:none">'+
'  <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px">'+
'    <img id="igf-prev-pic" style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid #2a2a38" src="">'+
'    <div><div id="igf-prev-name" style="font-weight:700;color:#e0e0f0;font-size:14px"></div><div id="igf-prev-user" style="color:#E1306C;font-size:12px"></div></div>'+
'  </div>'+
'  <div style="display:flex;gap:12px;margin-bottom:8px">'+
'    <div style="text-align:center"><div id="igf-prev-posts" style="font-weight:700;color:#e0e0f0;font-size:15px">0</div><div style="font-size:9px;color:#c0c0d0">Posts</div></div>'+
'    <div style="text-align:center"><div id="igf-prev-foll" style="font-weight:700;color:#E1306C;font-size:15px">0</div><div style="font-size:9px;color:#c0c0d0">Abonn\u00e9s</div></div>'+
'    <div style="text-align:center"><div id="igf-prev-fing" style="font-weight:700;color:#e0e0f0;font-size:15px">0</div><div style="font-size:9px;color:#c0c0d0">Abonnements</div></div>'+
'  </div>'+
'  <div id="igf-prev-bio" style="font-size:12px;color:#d0d0e0;line-height:1.4;max-height:60px;overflow:hidden"></div>'+
'  <div id="igf-prev-score" style="margin-top:6px;font-size:11px;font-weight:700"></div>'+
'</div>'+

'</div>';

document.body.appendChild(ov);

// ── DOM refs ──
var $=function(id){return document.getElementById(id);};

// ── Close ──
$('igf-close').onclick=function(){ov.remove()};

// ── Toggle advanced filters ──
var advOpen=false;
$('igf-toggle-filters').onclick=function(){
  advOpen=!advOpen;
  $('igf-adv-filters').style.display=advOpen?'block':'none';
  this.textContent=advOpen?'\u25B2 Masquer filtres':'\u25BC Filtres avanc\u00e9s';
};

// ── Seen count ──
function updateSeenCount(){var c=getSeenProfiles().length;$('igf-seen-count').textContent=c?c+' vus':'';}
updateSeenCount();
$('igf-clear-history').onclick=function(){localStorage.removeItem(SEEN_KEY);updateSeenCount();};

// ── Saved searches panel ──
$('igf-saved-btn').onclick=function(){
  var p=$('igf-saved-panel');
  p.style.display=p.style.display==='none'?'block':'none';
  renderSavedSearches();
};
function renderSavedSearches(){
  var list=getSavedSearches();
  var el=$('igf-saved-list');
  if(!list.length){el.innerHTML='<div style="color:#c0c0d0;font-size:12px">Aucune recherche sauvegard\u00e9e</div>';return;}
  el.innerHTML='';
  list.forEach(function(s,i){
    var d=document.createElement('div');
    d.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #1a1a24;cursor:pointer';
    d.innerHTML='<div><span style="color:#E1306C;font-weight:600;font-size:13px">'+escHtml(s.query)+'</span> <span style="color:#c0c0d0;font-size:11px">'+s.mode+' \u2022 '+s.date+'</span></div><button data-i="'+i+'" style="background:none;border:none;color:#ff4444;cursor:pointer;font-size:14px">\u2715</button>';
    d.querySelector('div').onclick=function(){
      $('igf-niche').value=s.query;
      searchMode=s.mode||'niche';
      updateModeTabs();
      $('igf-saved-panel').style.display='none';
    };
    d.querySelector('button').onclick=function(e){
      e.stopPropagation();
      var arr=getSavedSearches();arr.splice(i,1);localStorage.setItem(SEARCHES_KEY,JSON.stringify(arr));renderSavedSearches();
    };
    el.appendChild(d);
  });
}

// ── State ──
var results=[];
var enrichedCount=0;
var searching=false;
var searchMode='niche';
var selected=new Set();

// ── Mode tabs ──
function updateModeTabs(){
  ['niche','hashtag','competitor','location'].forEach(function(m){
    var btn=$('igf-mode-'+m);
    if(m===searchMode){btn.style.border='1.5px solid #E1306C';btn.style.background='rgba(225,48,108,.15)';btn.style.color='#E1306C';}
    else{btn.style.border='1.5px solid #2a2a38';btn.style.background='transparent';btn.style.color='#9090a8';}
  });
  var inp=$('igf-niche');
  if(searchMode==='niche')inp.placeholder='monteur video, coach sportif, magasin manga...';
  else if(searchMode==='hashtag')inp.placeholder='#fitness, #photographeparis, #coachsportif...';
  else if(searchMode==='competitor')inp.placeholder='@username du concurrent (ex: @nike)';
  else if(searchMode==='location')inp.placeholder='Nom du lieu (ex: Paris, Tour Eiffel, Bordeaux...)';
}
['niche','hashtag','competitor','location'].forEach(function(m){
  $('igf-mode-'+m).onclick=function(){searchMode=m;updateModeTabs();};
});

// ── Utils ──
function igfetch(url){return fetch(url,{headers:{'X-IG-App-ID':'936619743392459','X-Requested-With':'XMLHttpRequest'},credentials:'include'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();});}
function setStatus(m){var el=$('igf-status');if(el)el.textContent=m;}
function setProgress(p){var w=$('igf-prog-wrap');var b=$('igf-bar');if(w)w.style.display='block';if(b)b.style.width=Math.min(100,p)+'%';}
function setCounter(cur,max){var el=$('igf-counter');if(el)el.textContent=cur+'/'+max;}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms);})}
function fmtNum(n){return n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'k':String(n);}
function escHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function calcEngagement(p){if(!p.followers||p.followers<10)return 0;return Math.round((p.posts/Math.max(1,p.followers))*1000*100)/100;}

function calcScore(p){
  var s=0;
  if(p.extUrl)s+=2;
  if(p.emails&&p.emails.length)s+=3;
  if(p.phones&&p.phones.length)s+=1;
  if(p.biz)s+=2;
  if(p.lastPostTs&&(Date.now()-p.lastPostTs)<30*86400000)s+=1;
  if(p.followers>=100&&p.followers<=100000)s+=1;
  return Math.min(10,s);
}

function applySort(arr){
  var key=$('igf-sort')?$('igf-sort').value:'followers_desc';
  var c=arr.slice();
  if(key==='followers_desc')c.sort(function(a,b){return b.followers-a.followers});
  else if(key==='followers_asc')c.sort(function(a,b){return a.followers-b.followers});
  else if(key==='engagement')c.sort(function(a,b){return calcEngagement(b)-calcEngagement(a)});
  else if(key==='score')c.sort(function(a,b){return calcScore(b)-calcScore(a)});
  else if(key==='name')c.sort(function(a,b){return(a.name||a.username).localeCompare(b.name||b.username)});
  return c;
}

function applyFilters(arr){
  var minF=parseInt($('igf-min').value)||0;
  var maxF=parseInt($('igf-max').value)||9999999;
  var type=$('igf-type').value;
  var catF=($('igf-cat')?$('igf-cat').value:'').trim().toLowerCase();
  var bioKw=($('igf-bio-kw')?$('igf-bio-kw').value:'').trim().toLowerCase();
  var cityF=($('igf-city')?$('igf-city').value:'').trim().toLowerCase();
  var actDays=parseInt($('igf-active')?$('igf-active').value:0)||0;
  var minEng=parseFloat($('igf-min-eng')?$('igf-min-eng').value:0)||0;
  var hideSeen=$('igf-hide-seen')?$('igf-hide-seen').checked:false;
  var seenSet=hideSeen?new Set(getSeenProfiles()):null;
  var now=Date.now();
  return arr.filter(function(p){
    if(p.followers<minF||p.followers>maxF)return false;
    if(type==='verified'&&!p.verified)return false;
    if(type==='biz'&&!p.biz)return false;
    if(type==='has_site'&&!p.extUrl)return false;
    if(type==='has_email'&&(!p.emails||!p.emails.length))return false;
    if(catF&&!(p.cat||'').toLowerCase().includes(catF))return false;
    if(bioKw){var kws=bioKw.split(',');var bl=(p.bio||'').toLowerCase();if(!kws.some(function(k){return k.trim()&&bl.includes(k.trim());}))return false;}
    if(cityF){var h=((p.bio||'')+' '+(p.name||'')+' '+(p.cat||'')).toLowerCase();if(!h.includes(cityF))return false;}
    if(actDays>0&&p.lastPostTs&&p.lastPostTs<now-(actDays*864e5))return false;
    if(minEng>0&&calcEngagement(p)<minEng)return false;
    if(hideSeen&&seenSet&&seenSet.has(p.username))return false;
    return true;
  });
}

function updateStats(filtered){
  $('igf-stat-total').textContent=enrichedCount;
  $('igf-stat-filt').textContent=filtered.length;
  var avg=filtered.length?Math.round(filtered.reduce(function(s,p){return s+p.followers},0)/filtered.length):0;
  $('igf-stat-avg').textContent=fmtNum(avg);
  $('igf-stat-email').textContent=filtered.filter(function(p){return p.emails&&p.emails.length;}).length;
  $('igf-stat-site').textContent=filtered.filter(function(p){return!!p.extUrl;}).length;
  $('igf-stat-sel').textContent=selected.size;
}

// ── Selection ──
function toggleSelect(username){
  if(selected.has(username))selected.delete(username);else selected.add(username);
  $('igf-stat-sel').textContent=selected.size;
  $('igf-csv-sel').style.display=selected.size>0?'block':'none';
  var cb=document.querySelector('[data-sel="'+username+'"]');
  if(cb)cb.checked=selected.has(username);
}
$('igf-select-all').onchange=function(){
  var filtered=applyFilters(results);
  var sorted=applySort(filtered);
  if(this.checked)sorted.forEach(function(p){selected.add(p.username);});
  else selected.clear();
  render();
};

// ── Profile preview ──
var prevTimer=null;
function showPreview(p,e){
  clearTimeout(prevTimer);
  var pv=$('igf-preview');
  $('igf-prev-pic').src=p.profilePic||'';
  $('igf-prev-name').textContent=p.name||p.username;
  $('igf-prev-user').textContent='@'+p.username;
  $('igf-prev-posts').textContent=fmtNum(p.posts);
  $('igf-prev-foll').textContent=fmtNum(p.followers);
  $('igf-prev-fing').textContent=fmtNum(p.following);
  $('igf-prev-bio').textContent=p.bio||'';
  var sc=calcScore(p);
  $('igf-prev-score').textContent='Score: '+sc+'/10';
  $('igf-prev-score').style.color=sc>=7?'#00d084':sc>=4?'#F77737':'#ff4444';
  pv.style.display='block';
  var rect=e.target.closest('tr').getBoundingClientRect();
  var top=rect.top;var left=rect.right+10;
  if(left+290>window.innerWidth)left=rect.left-290;
  if(top+200>window.innerHeight)top=window.innerHeight-210;
  pv.style.top=Math.max(10,top)+'px';
  pv.style.left=Math.max(10,left)+'px';
}
function hidePreview(){prevTimer=setTimeout(function(){$('igf-preview').style.display='none';},150);}

function render(){
  var filtered=applyFilters(results);
  var sorted=applySort(filtered);
  updateStats(filtered);
  var b=$('igf-body');if(!b)return;
  b.innerHTML='';
  if(!sorted.length){b.innerHTML='<tr><td colspan="8" style="padding:30px;text-align:center;color:#c0c0d0;font-size:13px">Aucun r\u00e9sultat</td></tr>';return;}
  sorted.forEach(function(p,i){
    var tr=document.createElement('tr');
    tr.style.cssText='border-bottom:1px solid #1a1a24;transition:background .15s';
    tr.onmouseenter=function(e){tr.style.background='rgba(255,255,255,.025)';showPreview(p,e);};
    tr.onmouseleave=function(){tr.style.background='';hidePreview();};
    var badges='';
    if(p.verified)badges+='<span style="'+S.t+';background:rgba(0,149,246,.15);color:#0095f6">\u2713</span>';
    if(p.biz)badges+='<span style="'+S.t+';background:rgba(255,215,0,.1);color:#ffd700">Pro</span>';
    if(p.emails&&p.emails.length)badges+='<span style="'+S.t+';background:rgba(0,208,132,.1);color:#00d084">\u2709</span>';
    if(p.extUrl)badges+='<span style="'+S.t+';background:rgba(247,119,55,.1);color:#F77737">\uD83C\uDF10</span>';
    var contact='';
    if(p.emails&&p.emails.length)contact+='<div style="font-size:11px;color:#00d084">'+escHtml(p.emails[0])+'</div>';
    if(p.phones&&p.phones.length)contact+='<div style="font-size:11px;color:#d0d0e0">'+escHtml(p.phones[0])+'</div>';
    if(p.extUrl)contact+='<a href="'+escHtml(p.extUrl)+'" target="_blank" style="font-size:10px;color:#F77737;text-decoration:none">\u2197 Site</a>';
    if(!contact)contact='<span style="color:#2a2a38">\u2014</span>';
    var sc=calcScore(p);
    var scColor=sc>=7?'#00d084':sc>=4?'#F77737':'#ff4444';
    tr.innerHTML=
      '<td style="padding:6px"><input type="checkbox" data-sel="'+p.username+'" '+(selected.has(p.username)?'checked':'')+' style="accent-color:#E1306C;cursor:pointer"></td>'+
      '<td style="padding:6px;color:#c0c0d0;font-size:11px">'+(i+1)+'</td>'+
      '<td style="padding:6px"><a href="https://www.instagram.com/'+p.username+'/" target="_blank" style="color:#E1306C;font-weight:600;text-decoration:none;font-size:13px">@'+p.username+'</a>'+badges+'<div style="font-size:10px;color:#c0c0d0">'+escHtml(p.name)+'</div></td>'+
      '<td style="padding:6px;color:#E1306C;font-weight:700;font-size:13px;white-space:nowrap">'+fmtNum(p.followers)+'</td>'+
      '<td style="padding:6px;font-size:10px;color:#c0c0d0;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(p.cat||'\u2014')+'</td>'+
      '<td style="padding:6px;font-size:10px;color:#d0d0e0;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+escHtml(p.bio)+'">'+escHtml(p.bio)+'</td>'+
      '<td style="padding:6px">'+contact+'</td>'+
      '<td style="padding:6px;font-weight:700;color:'+scColor+';font-size:13px">'+sc+'<span style="font-size:9px;color:#c0c0d0">/10</span></td>';
    tr.querySelector('input[type=checkbox]').onchange=function(){toggleSelect(p.username);};
    b.appendChild(tr);
  });
}

// ── Sort headers ──
$('igf-th-followers').onclick=function(){var s=$('igf-sort');s.value=s.value==='followers_desc'?'followers_asc':'followers_desc';this.textContent=s.value==='followers_desc'?'Abonn\u00e9s \u2193':'Abonn\u00e9s \u2191';render();};
$('igf-th-profile').onclick=function(){$('igf-sort').value='name';render();};

// ── Voice ──
$('igf-voice').onclick=function(){
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){alert('Non disponible');return;}
  var btn=this,r=new SR();r.lang='fr-FR';r.interimResults=false;
  r.onstart=function(){btn.style.background='#E1306C';btn.style.color='#fff';};
  r.onresult=function(e){$('igf-niche').value=e.results[0][0].transcript;};
  r.onend=function(){btn.style.background='rgba(225,48,108,.1)';btn.style.color='#E1306C';};
  r.start();
};

// ── Enrich user ──
async function enrichUser(un){
  var pd=await igfetch('https://www.instagram.com/api/v1/users/web_profile_info/?username='+encodeURIComponent(un));
  var usr=pd&&pd.data&&pd.data.user;if(!usr)return null;
  var bio=usr.biography||'';
  var emails=extractEmails(bio);var phones=extractPhones(bio);
  if(usr.business_email&&emails.indexOf(usr.business_email)===-1)emails.push(usr.business_email);
  if(usr.business_phone_number&&phones.indexOf(usr.business_phone_number)===-1)phones.push(usr.business_phone_number);
  var lastPostTs=0;
  try{var edges=usr.edge_owner_to_timeline_media&&usr.edge_owner_to_timeline_media.edges;if(edges&&edges.length)lastPostTs=edges[0].node.taken_at_timestamp*1000;}catch(e){}
  return{
    username:un,name:usr.full_name||'',
    followers:usr.edge_followed_by?usr.edge_followed_by.count:0,
    following:usr.edge_follow?usr.edge_follow.count:0,
    posts:usr.edge_owner_to_timeline_media?usr.edge_owner_to_timeline_media.count:0,
    bio:bio.substring(0,200),extUrl:usr.external_url||'',
    biz:!!usr.is_business_account,cat:usr.business_category_name||'',
    verified:!!usr.is_verified,emails:emails,phones:phones,
    lastPostTs:lastPostTs,
    profilePic:usr.profile_pic_url_hd||usr.profile_pic_url||'',
  };
}

// ── Search by niche ──
async function searchByNiche(niche,maxR,seen){
  var queries=[niche];
  var words=niche.split(/\s+/);if(words.length>1)queries.push(words.join(''));
  // Synonymes automatiques
  var syns=getSynonyms(niche);
  syns.forEach(function(s){queries.push(s);});
  // Villes francophones (France + Suisse + Belgique)
  var villes=['paris','lyon','marseille','bordeaux','lille','toulouse','nantes','nice','montpellier','strasbourg','rennes','grenoble','rouen','toulon','metz','nancy','reims','dijon','angers','le mans','geneve','lausanne','zurich','berne','bale','bruxelles','liege','bruges','gand','charleroi','montreal','quebec'];
  villes.forEach(function(c){queries.push(niche+' '+c);if(syns[0])queries.push(syns[0]+' '+c);});
  [' freelance',' pro',' studio',' agence',' formation',' cr\u00e9ateur',' creator',' professionnel',' ind\u00e9pendant'].forEach(function(s){queries.push(niche+s);});
  for(var qi=0;qi<queries.length;qi++){
    if(!searching||enrichedCount>=maxR)break;
    setStatus('Recherche: "'+queries[qi]+'"');setProgress((qi/queries.length)*25);
    try{
      var d=await igfetch('https://www.instagram.com/api/v1/web/search/topsearch/?context=blended&query='+encodeURIComponent(queries[qi])+'&include_reel=false');
      for(var ui=0;ui<(d.users||[]).length;ui++){
        if(!searching||enrichedCount>=maxR)break;
        var un=(d.users[ui].user||{}).username;if(!un||seen.has(un))continue;seen.add(un);
        setStatus('@'+un);setProgress(25+(enrichedCount/maxR)*72);setCounter(enrichedCount,maxR);
        try{var p=await enrichUser(un);if(p){enrichedCount++;results.push(p);setCounter(enrichedCount,maxR);render();}}catch(e2){}
        await sleep(350);
      }
    }catch(e){setStatus('Erreur: '+e.message);}
    await sleep(500);
  }
}

// ── Search by hashtag ──
async function searchByHashtag(tag,maxR,seen){
  tag=tag.replace(/^#/,'').trim();setStatus('Hashtag #'+tag+'...');setProgress(10);
  try{
    var feed=await igfetch('https://www.instagram.com/api/v1/tags/'+encodeURIComponent(tag)+'/sections/');
    var usernames=new Set();
    (feed.sections||[]).forEach(function(sec){(sec.layout_content&&sec.layout_content.medias||[]).forEach(function(m){if(m.media&&m.media.user)usernames.add(m.media.user.username);});});
    var uArr=Array.from(usernames);
    for(var i=0;i<uArr.length;i++){
      if(!searching||enrichedCount>=maxR)break;
      if(seen.has(uArr[i]))continue;seen.add(uArr[i]);
      setStatus('@'+uArr[i]);setProgress(25+(enrichedCount/maxR)*72);setCounter(enrichedCount,maxR);
      try{var p=await enrichUser(uArr[i]);if(p){enrichedCount++;results.push(p);setCounter(enrichedCount,maxR);render();}}catch(e2){}
      await sleep(350);
    }
    if(enrichedCount<maxR&&searching)await searchByNiche(tag,maxR,seen);
  }catch(e){setStatus('Fallback niche...');await searchByNiche(tag,maxR,seen);}
}

// ── Search by competitor ──
async function searchByCompetitor(username,maxR,seen){
  username=username.replace(/^@/,'').trim();setStatus('Profil @'+username+'...');setProgress(5);
  try{
    var pd=await igfetch('https://www.instagram.com/api/v1/users/web_profile_info/?username='+encodeURIComponent(username));
    var usr=pd&&pd.data&&pd.data.user;if(!usr)return setStatus('Profil non trouv\u00e9');
    var userId=usr.id;setStatus('Abonn\u00e9s de @'+username+'...');
    var endCursor='',page=0;
    while(searching&&enrichedCount<maxR&&page<20){
      var url='https://www.instagram.com/api/v1/friendships/'+userId+'/followers/?count=50';
      if(endCursor)url+='&max_id='+encodeURIComponent(endCursor);
      try{
        var fd=await igfetch(url);
        for(var i=0;i<(fd.users||[]).length;i++){
          if(!searching||enrichedCount>=maxR)break;
          var un=fd.users[i].username;if(!un||seen.has(un))continue;seen.add(un);
          setStatus('@'+un+' (abonn\u00e9 @'+username+')');setProgress(10+(enrichedCount/maxR)*87);setCounter(enrichedCount,maxR);
          try{var p=await enrichUser(un);if(p){enrichedCount++;results.push(p);setCounter(enrichedCount,maxR);render();}}catch(e3){}
          await sleep(400);
        }
        endCursor=fd.next_max_id||'';if(!endCursor||!fd.big_list)break;page++;await sleep(800);
      }catch(e2){setStatus('Acc\u00e8s limit\u00e9 (priv\u00e9 ?)');break;}
    }
  }catch(e){setStatus('Erreur: '+e.message);}
}

// ── Search by location ──
async function searchByLocation(query,maxR,seen){
  setStatus('Recherche lieu: "'+query+'"...');setProgress(5);
  try{
    var d=await igfetch('https://www.instagram.com/api/v1/web/search/topsearch/?context=place&query='+encodeURIComponent(query)+'&include_reel=false');
    var places=d.places||[];
    if(!places.length){setStatus('Aucun lieu trouv\u00e9, fallback niche...');await searchByNiche(query,maxR,seen);return;}
    var locId=places[0].place&&places[0].place.location&&places[0].place.location.pk;
    var locName=places[0].place&&places[0].place.title||query;
    if(!locId){await searchByNiche(query,maxR,seen);return;}
    setStatus('Lieu: '+locName+' (ID: '+locId+')');setProgress(10);
    try{
      var feed=await igfetch('https://www.instagram.com/api/v1/locations/'+locId+'/sections/?max_id=&page=1&__a=1');
      var usernames=new Set();
      (feed.sections||[]).forEach(function(sec){(sec.layout_content&&sec.layout_content.medias||[]).forEach(function(m){if(m.media&&m.media.user)usernames.add(m.media.user.username);});});
      var uArr=Array.from(usernames);
      for(var i=0;i<uArr.length;i++){
        if(!searching||enrichedCount>=maxR)break;
        if(seen.has(uArr[i]))continue;seen.add(uArr[i]);
        setStatus('@'+uArr[i]+' ('+locName+')');setProgress(15+(enrichedCount/maxR)*82);setCounter(enrichedCount,maxR);
        try{var p=await enrichUser(uArr[i]);if(p){enrichedCount++;results.push(p);setCounter(enrichedCount,maxR);render();}}catch(e2){}
        await sleep(350);
      }
      if(enrichedCount<maxR&&searching){setStatus('Compl\u00e9ment niche...');await searchByNiche(query,maxR,seen);}
    }catch(e2){setStatus('Location feed limit\u00e9, fallback niche...');await searchByNiche(query,maxR,seen);}
  }catch(e){await searchByNiche(query,maxR,seen);}
}

// ── Main search ──
$('igf-go').onclick=async function(){
  var input=$('igf-niche').value.trim();if(!input){$('igf-niche').focus();return;}
  if(searching)return;
  searching=true;results=[];enrichedCount=0;selected.clear();
  var maxR=Math.max(1,Math.min(200,parseInt($('igf-count').value)||50));
  $('igf-stop').style.display='block';
  $('igf-csv').style.display='none';$('igf-csv-sel').style.display='none';$('igf-crm').style.display='none';$('igf-save-search').style.display='none';
  $('igf-go').disabled=true;$('igf-go').style.opacity='.5';
  setCounter(0,maxR);render();
  var seen=new Set();
  if(searchMode==='hashtag')await searchByHashtag(input,maxR,seen);
  else if(searchMode==='competitor')await searchByCompetitor(input,maxR,seen);
  else if(searchMode==='location')await searchByLocation(input,maxR,seen);
  else await searchByNiche(input,maxR,seen);
  addToSeen(results.map(function(p){return p.username;}));updateSeenCount();
  searching=false;
  $('igf-stop').style.display='none';$('igf-go').disabled=false;$('igf-go').style.opacity='1';
  setProgress(100);setCounter(enrichedCount,maxR);
  var f=applyFilters(results);
  var msg='Termin\u00e9 \u2014 '+enrichedCount+' profils, '+f.length+' apr\u00e8s filtres';
  if(enrichedCount<maxR)msg+=' (Instagram limite les r\u00e9sultats \u2014 c\'est le maximum disponible pour cette recherche)';
  setStatus(msg);
  if(results.length){$('igf-csv').style.display='block';$('igf-crm').style.display='block';$('igf-save-search').style.display='block';}
};

$('igf-stop').onclick=function(){searching=false;setStatus('Arr\u00eat\u00e9.');};

// ── Save search ──
$('igf-save-search').onclick=function(){
  saveSearch({query:$('igf-niche').value,mode:searchMode,date:new Date().toISOString().slice(0,10),results:results.length});
  this.textContent='\u2605 Sauvegard\u00e9e !';this.style.color='#F77737';
  var btn=this;setTimeout(function(){btn.textContent='\u2606 Sauvegarder';btn.style.color='#F77737';},2000);
};

// ── CSV helpers ──
function buildCSV(list){
  var BOM='\uFEFF';
  var lines=['Username,Nom,Abonn\u00e9s,Following,Posts,Bio,Email,T\u00e9l\u00e9phone,Business,Cat\u00e9gorie,URL,Engagement,Score,Dernier post,Instagram'];
  list.forEach(function(p){
    function q(s){return '"'+(String(s||'')).replace(/"/g,'""').replace(/\n/g,' ')+'"';}
    lines.push([q(p.username),q(p.name),p.followers,p.following,p.posts,q(p.bio),q((p.emails||[]).join('; ')),q((p.phones||[]).join('; ')),(p.biz?'Oui':'Non'),q(p.cat),q(p.extUrl),calcEngagement(p).toFixed(1),calcScore(p),p.lastPostTs?new Date(p.lastPostTs).toISOString().slice(0,10):'','https://www.instagram.com/'+p.username+'/'].join(','));
  });
  return BOM+lines.join('\n');
}
function downloadCSV(content,name){
  var blob=new Blob([content],{type:'text/csv;charset=utf-8'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='ig_'+name.replace(/[^a-z0-9]/gi,'_').toLowerCase()+'_'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
}

$('igf-csv').onclick=function(){downloadCSV(buildCSV(applySort(applyFilters(results))),$('igf-niche').value);};
$('igf-csv-sel').onclick=function(){
  var sel=results.filter(function(p){return selected.has(p.username);});
  downloadCSV(buildCSV(applySort(sel)),$('igf-niche').value+'_selection');
};

// ── CRM ──
$('igf-crm').onclick=function(){
  var list=selected.size>0?results.filter(function(p){return selected.has(p.username);}):applySort(applyFilters(results));
  if(!list.length)return;
  var prospects=list.map(function(p){return{company_name:p.name||('@'+p.username),contact_name:p.name||'',email:(p.emails&&p.emails[0])||'',phone:(p.phones&&p.phones[0])||'',website:p.extUrl||('https://instagram.com/'+p.username),source:'Instagram Finder',notes:'@'+p.username+' | '+fmtNum(p.followers)+' | '+(p.cat||'N/A'),instagram:'https://www.instagram.com/'+p.username+'/'};});
  try{localStorage.setItem('igf_crm_export',JSON.stringify(prospects));alert(list.length+' profils pr\u00eats !\nOuvre Empire Leads > Importer depuis IG Finder');}catch(e){alert('Erreur: '+e.message);}
};

// ── Keyboard + filter listeners ──
$('igf-niche').addEventListener('keydown',function(e){if(e.key==='Enter')$('igf-go').click();});
['igf-sort','igf-type','igf-active'].forEach(function(id){var el=$(id);if(el)el.onchange=function(){render();};});
['igf-cat','igf-bio-kw','igf-city','igf-min-eng'].forEach(function(id){var el=$(id);if(el){var t;el.oninput=function(){clearTimeout(t);t=setTimeout(render,400);};}});
if($('igf-hide-seen'))$('igf-hide-seen').onchange=function(){render();};
})();
