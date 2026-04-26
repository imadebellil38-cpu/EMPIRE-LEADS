(function(){
if(!location.hostname.includes('instagram.com')){alert('Ouvre ce bookmarklet sur instagram.com');return;}
if(document.getElementById('igf-overlay')){document.getElementById('igf-overlay').remove();return;}

// ===== STORAGE =====
var LS_CONTACTED='igf_contacted_v2';
var LS_TEMPLATES='igf_templates_v2';
var LS_FILTERS='igf_filters_v2';

function loadContacted(){try{return JSON.parse(localStorage.getItem(LS_CONTACTED)||'{}');}catch(e){return{};}}
function saveContacted(o){try{localStorage.setItem(LS_CONTACTED,JSON.stringify(o));}catch(e){}}
function markContacted(un){var c=loadContacted();c[un]=Date.now();saveContacted(c);}
function isContacted(un){return!!loadContacted()[un];}

function loadTemplates(){
  try{
    var t=JSON.parse(localStorage.getItem(LS_TEMPLATES)||'null');
    if(t&&t.length)return t;
  }catch(e){}
  return[
    {name:'Approche directe',text:'Salut {prenom} ! J\'ai vu ton compte {compte}, ton travail est top. Je cherche des monteurs video pour collaborer sur des projets. Disponible pour echanger ?'},
    {name:'Compliment + offre',text:'Hey {prenom}, j\'adore ton style sur {compte} ! Je bosse avec des creators et j\'ai des projets recurrents. Ca te dirait qu\'on en parle ?'},
    {name:'Court et punchy',text:'Salut {prenom}, ton compte est mortel. J\'ai un projet pour toi. Dispo ?'},
  ];
}
function saveTemplates(t){try{localStorage.setItem(LS_TEMPLATES,JSON.stringify(t));}catch(e){}}

function loadFilters(){
  try{return JSON.parse(localStorage.getItem(LS_FILTERS)||'{}');}catch(e){return{};}
}
function saveFilters(f){try{localStorage.setItem(LS_FILTERS,JSON.stringify(f));}catch(e){}}

// ===== HELPERS =====
function extractEmails(text){return(text||'').match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)||[];}
function extractPhones(text){var raw=(text||'').match(/(?:\+?\d{1,4}[\s\-.]?)?\(?\d{1,4}\)?[\s\-.]?\d{2,4}[\s\-.]?\d{2,4}[\s\-.]?\d{0,4}/g)||[];return raw.filter(function(p){return p.replace(/\D/g,'').length>=7;});}
function igfetch(url){apiCallCount++;return fetch(url,{headers:{'X-IG-App-ID':'936619743392459','X-Requested-With':'XMLHttpRequest','X-ASBD-ID':'129477'},credentials:'include'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();});}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms);})}
function fmtNum(n){return n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'k':String(n);}
function escHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function escAttr(s){return escHtml(s).replace(/'/g,'&#39;');}

// Anti-ban: count API calls and force pauses
var apiCallCount=0;
var lastBigPause=Date.now();
async function antibanThrottle(){
  // Force a 5s pause every 30 calls
  if(apiCallCount>0&&apiCallCount%30===0){
    setStatus('\u23F8 Pause anti-ban (5s)...');
    await sleep(5000);
  }
  // Force 30s pause every 100 calls
  if(apiCallCount>0&&apiCallCount%100===0){
    setStatus('\u23F8 Pause longue anti-ban (30s)...');
    await sleep(30000);
  }
}

// ===== DETECTION LANGUE FR =====
var FR_TOKENS=['je','tu','il','elle','les','des','mon','ma','mes','ton','ta','ses','pour','avec','dans','sans','sur','par','que','qui','quoi','vous','nous','ils','elles','est','sont','etais','etre','avoir','monteur','video','vidéo','editeur','éditeur','clip','reels','créateur','createur','contenu','réalisateur','realisateur','paris','lyon','france','marseille','bordeaux','lille','toulouse','nantes','nice','strasbourg','rennes','grenoble','geneve','genève','lausanne','bruxelles','français','francais','francaise','française','dispo','disponible','collab','collaboration','passionné','passionne','freelance','indépendant','independant','contact','message','dm','disponible','rendez-vous','rdv','tarif','prix','devis'];
function detectFR(text){
  if(!text)return false;
  var lower=text.toLowerCase();
  var c=0;
  for(var i=0;i<FR_TOKENS.length;i++){
    if(lower.indexOf(FR_TOKENS[i])>-1)c++;
    if(c>=2)return true;
  }
  return false;
}

// ===== AUTO-DETECT PAGE =====
function detectPage(){
  var path=location.pathname;
  var post=path.match(/^\/(p|reel|tv)\/([^\/]+)/);
  if(post)return{type:'post',shortcode:post[2]};
  var reserved=['explore','reels','direct','accounts','stories','p','reel','tv','about','privacy','legal','blog','press','pixel','developer','api'];
  var prof=path.match(/^\/([A-Za-z0-9._]+)\/?$/);
  if(prof&&reserved.indexOf(prof[1])===-1)return{type:'profile',username:prof[1]};
  return{type:'other'};
}
var PAGE=detectPage();

// ===== STYLES =====
var styleEl=document.createElement('style');
styleEl.textContent='@keyframes igfFadeIn{from{opacity:0}to{opacity:1}}@keyframes igfSlideDown{from{opacity:0;max-height:0}to{opacity:1;max-height:3000px}}@keyframes igfSpin{to{transform:rotate(360deg)}}.igf-card{transition:all .25s ease}.igf-card:hover{background:rgba(255,255,255,.025)!important;border-color:rgba(225,48,108,.3)!important}.igf-btn-action{transition:all .15s ease}.igf-btn-action:hover{transform:translateY(-1px);filter:brightness(1.15)}.igf-expand{animation:igfSlideDown .35s ease;overflow:hidden}.igf-spinner{width:14px;height:14px;border:2px solid rgba(225,48,108,.2);border-top-color:#E1306C;border-radius:50%;animation:igfSpin .8s linear infinite;display:inline-block;vertical-align:middle}#igf-overlay::-webkit-scrollbar{width:10px}#igf-overlay::-webkit-scrollbar-track{background:#0a0a0f}#igf-overlay::-webkit-scrollbar-thumb{background:#2a2a38;border-radius:5px}.igf-checkbox{accent-color:#E1306C;width:16px;height:16px;cursor:pointer}.igf-modal{position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(8px);z-index:2147483648;display:flex;align-items:center;justify-content:center;padding:20px;animation:igfFadeIn .25s ease}.igf-modal-content{background:#0a0a0f;border:1.5px solid #2a2a38;border-radius:16px;padding:24px;max-width:600px;width:100%;max-height:85vh;overflow-y:auto}.igf-input{width:100%;padding:11px 13px;background:#0a0a0f;border:1.5px solid #2a2a38;border-radius:9px;color:#fff;font-size:13px;outline:none;box-sizing:border-box;font-family:inherit}.igf-textarea{width:100%;padding:11px 13px;background:#0a0a0f;border:1.5px solid #2a2a38;border-radius:9px;color:#fff;font-size:13px;outline:none;box-sizing:border-box;font-family:inherit;resize:vertical;min-height:80px}.igf-pill{display:inline-block;padding:3px 9px;border-radius:20px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}';
document.head.appendChild(styleEl);

// ===== OVERLAY =====
var ov=document.createElement('div');
ov.id='igf-overlay';
ov.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(8,8,15,.7);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);overflow-y:auto;font-family:-apple-system,BlinkMacSystemFont,sans-serif;animation:igfFadeIn .3s ease';

// Build current page card if applicable
var currentPageHTML='';
if(PAGE.type==='profile'){
  currentPageHTML=
    '<div style="background:linear-gradient(135deg,rgba(225,48,108,.12),rgba(247,119,55,.06));border:1.5px solid rgba(225,48,108,.35);border-radius:14px;padding:16px;margin-bottom:18px">'+
    '  <div style="font-size:10px;color:#F77737;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;font-weight:700">\u2728 Tu es sur ce profil</div>'+
    '  <div style="display:flex;align-items:center;gap:14px;margin-bottom:12px">'+
    '    <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#E1306C,#F77737);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:22px">'+escHtml(PAGE.username.charAt(0).toUpperCase())+'</div>'+
    '    <div style="flex:1;min-width:0">'+
    '      <div style="font-size:18px;font-weight:800;color:#fff">@'+escHtml(PAGE.username)+'</div>'+
    '      <div style="font-size:11px;color:#9090a8;margin-top:2px">Clique sur un bouton pour extraire son audience</div>'+
    '    </div>'+
    '  </div>'+
    '  <div style="display:flex;gap:6px;flex-wrap:wrap">'+
    '    <button class="igf-btn-action" data-action="followers" data-user="'+escAttr(PAGE.username)+'" style="flex:1;min-width:120px;padding:12px;background:linear-gradient(135deg,rgba(225,48,108,.25),rgba(247,119,55,.15));border:1px solid rgba(225,48,108,.5);color:#E1306C;font-size:12px;font-weight:800;border-radius:10px;cursor:pointer">\uD83D\uDC65 Abonnes</button>'+
    '    <button class="igf-btn-action" data-action="comments" data-user="'+escAttr(PAGE.username)+'" style="flex:1;min-width:120px;padding:12px;background:linear-gradient(135deg,rgba(247,119,55,.25),rgba(252,175,69,.15));border:1px solid rgba(247,119,55,.5);color:#F77737;font-size:12px;font-weight:800;border-radius:10px;cursor:pointer">\uD83D\uDCAC Commentateurs</button>'+
    '    <button class="igf-btn-action" data-action="likers" data-user="'+escAttr(PAGE.username)+'" style="flex:1;min-width:120px;padding:12px;background:linear-gradient(135deg,rgba(252,175,69,.25),rgba(255,215,0,.15));border:1px solid rgba(252,175,69,.5);color:#FCAF45;font-size:12px;font-weight:800;border-radius:10px;cursor:pointer">\u2764\uFE0F Likers</button>'+
    '  </div>'+
    '  <div id="igf-page-expand" style="display:none;margin-top:12px"></div>'+
    '</div>';
}else if(PAGE.type==='post'){
  currentPageHTML=
    '<div style="background:linear-gradient(135deg,rgba(225,48,108,.12),rgba(247,119,55,.06));border:1.5px solid rgba(225,48,108,.35);border-radius:14px;padding:16px;margin-bottom:18px">'+
    '  <div style="font-size:10px;color:#F77737;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;font-weight:700">\u2728 Tu es sur ce post</div>'+
    '  <div style="display:flex;align-items:center;gap:14px;margin-bottom:12px">'+
    '    <div style="width:52px;height:52px;border-radius:12px;background:linear-gradient(135deg,#E1306C,#F77737);display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px">\uD83D\uDCF8</div>'+
    '    <div style="flex:1;min-width:0">'+
    '      <div style="font-size:16px;font-weight:800;color:#fff">Post '+escHtml(PAGE.shortcode)+'</div>'+
    '      <div style="font-size:11px;color:#9090a8;margin-top:2px">Extrais qui a commente ou like</div>'+
    '    </div>'+
    '  </div>'+
    '  <div style="display:flex;gap:6px;flex-wrap:wrap">'+
    '    <button class="igf-btn-action" data-action="post-comments" data-shortcode="'+escAttr(PAGE.shortcode)+'" style="flex:1;min-width:140px;padding:12px;background:linear-gradient(135deg,rgba(247,119,55,.25),rgba(252,175,69,.15));border:1px solid rgba(247,119,55,.5);color:#F77737;font-size:12px;font-weight:800;border-radius:10px;cursor:pointer">\uD83D\uDCAC Commentateurs</button>'+
    '    <button class="igf-btn-action" data-action="post-likers" data-shortcode="'+escAttr(PAGE.shortcode)+'" style="flex:1;min-width:140px;padding:12px;background:linear-gradient(135deg,rgba(252,175,69,.25),rgba(255,215,0,.15));border:1px solid rgba(252,175,69,.5);color:#FCAF45;font-size:12px;font-weight:800;border-radius:10px;cursor:pointer">\u2764\uFE0F Likers</button>'+
    '  </div>'+
    '  <div id="igf-page-expand" style="display:none;margin-top:12px"></div>'+
    '</div>';
}

ov.innerHTML='<div style="max-width:960px;margin:0 auto;padding:22px 18px 80px">'+

// Header
'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">'+
'  <div>'+
'    <div style="font-size:22px;font-weight:900;letter-spacing:-.5px">'+
'      <span style="background:linear-gradient(135deg,#E1306C,#F77737);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Instagram</span>'+
'      <span style="color:#fff"> Finder</span>'+
'    </div>'+
'    <div style="font-size:11px;color:#9090a8;margin-top:3px">Extrais l\'audience + envoie des DM en mode safe</div>'+
'  </div>'+
'  <div style="display:flex;gap:6px">'+
'    <button id="igf-templates-btn" title="Templates DM" style="background:none;border:1.5px solid #2a2a38;color:#e0e0f0;font-size:14px;cursor:pointer;width:42px;height:42px;border-radius:12px">\uD83D\uDCAC</button>'+
'    <button id="igf-history-btn" title="Historique contactes" style="background:none;border:1.5px solid #2a2a38;color:#e0e0f0;font-size:14px;cursor:pointer;width:42px;height:42px;border-radius:12px">\uD83D\uDCDC</button>'+
'    <button id="igf-close" style="background:none;border:1.5px solid #2a2a38;color:#e0e0f0;font-size:24px;cursor:pointer;width:42px;height:42px;border-radius:12px">&times;</button>'+
'  </div>'+
'</div>'+

// Current page card
currentPageHTML+

// Search bar
'<div style="background:#111118;border:1.5px solid #2a2a38;border-radius:14px;padding:14px;margin-bottom:14px">'+
'  <div style="font-size:10px;color:#9090a8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;font-weight:700">\uD83D\uDD0D Cherche par mot-cle</div>'+
'  <div style="display:flex;gap:8px">'+
'    <input id="igf-input" placeholder="monteur video, photographe paris..." style="flex:1;padding:13px 15px;background:#0a0a0f;border:1.5px solid #2a2a38;border-radius:10px;color:#fff;font-size:14px;outline:none">'+
'    <button id="igf-search-btn" style="padding:13px 22px;background:linear-gradient(135deg,#E1306C,#F77737);color:#fff;font-size:13px;font-weight:800;border:none;border-radius:10px;cursor:pointer;white-space:nowrap">Chercher</button>'+
'  </div>'+
'</div>'+

// Status / progress
'<div id="igf-status-wrap" style="display:none;background:linear-gradient(135deg,rgba(225,48,108,.06),rgba(247,119,55,.04));border:1px solid rgba(225,48,108,.18);border-radius:12px;padding:14px;margin-bottom:14px">'+
'  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'+
'    <div id="igf-status" style="font-size:12px;color:#e0e0f0;font-weight:600">Pret</div>'+
'    <div style="display:flex;align-items:center;gap:10px">'+
'      <div id="igf-counter" style="font-size:18px;font-weight:900;color:#E1306C">0</div>'+
'      <button id="igf-stop" style="padding:6px 12px;background:#1a1a24;border:1.5px solid #ff4444;color:#ff4444;font-size:11px;font-weight:700;border-radius:6px;cursor:pointer">\u23F9 Stop</button>'+
'    </div>'+
'  </div>'+
'  <div style="height:4px;background:#1a1a24;border-radius:2px;overflow:hidden"><div id="igf-bar" style="height:100%;width:0;background:linear-gradient(90deg,#E1306C,#F77737);transition:width .4s"></div></div>'+
'</div>'+

// Filters bar
'<div id="igf-filters-bar" style="display:none;background:#111118;border:1px solid #2a2a38;border-radius:12px;padding:12px;margin-bottom:12px">'+
'  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'+
'    <div style="font-size:10px;color:#9090a8;text-transform:uppercase;letter-spacing:.05em;font-weight:700">\uD83C\uDF9B\uFE0F Filtres</div>'+
'    <div id="igf-filter-summary" style="font-size:11px;color:#9090a8"></div>'+
'  </div>'+
'  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'+
'    <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:#d0d0e0;cursor:pointer"><input type="checkbox" id="igf-f-fr" class="igf-checkbox"> Francais</label>'+
'    <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:#d0d0e0;cursor:pointer"><input type="checkbox" id="igf-f-email" class="igf-checkbox"> Avec email</label>'+
'    <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:#d0d0e0;cursor:pointer"><input type="checkbox" id="igf-f-site" class="igf-checkbox"> Avec site</label>'+
'    <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:#d0d0e0;cursor:pointer"><input type="checkbox" id="igf-f-biz" class="igf-checkbox"> Pro</label>'+
'    <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:#d0d0e0;cursor:pointer"><input type="checkbox" id="igf-f-uncontacted" class="igf-checkbox" checked> Non contactes</label>'+
'    <input type="text" id="igf-f-keyword" placeholder="\uD83D\uDD0D Mot-cle..." style="width:140px;padding:6px 10px;background:#0a0a0f;border:1px solid #2a2a38;border-radius:6px;color:#fff;font-size:11px;outline:none">'+
'    <span style="font-size:11px;color:#9090a8;margin-left:6px">Abonnes :</span>'+
'    <input type="number" id="igf-f-min" placeholder="min" style="width:65px;padding:6px 8px;background:#0a0a0f;border:1px solid #2a2a38;border-radius:6px;color:#fff;font-size:11px">'+
'    <input type="number" id="igf-f-max" placeholder="max" style="width:75px;padding:6px 8px;background:#0a0a0f;border:1px solid #2a2a38;border-radius:6px;color:#fff;font-size:11px">'+
'    <select id="igf-f-sort" style="padding:6px 8px;background:#0a0a0f;border:1px solid #2a2a38;border-radius:6px;color:#fff;font-size:11px;cursor:pointer">'+
'      <option value="date_desc" selected>Tri : Date com (recent)</option>'+
'      <option value="score">Tri : Score</option>'+
'      <option value="client">Tri : Client probable</option>'+
'      <option value="followers_asc">Tri : Moins d\'abonnes</option>'+
'      <option value="followers_desc">Tri : Plus d\'abonnes</option>'+
'    </select>'+
'    <select id="igf-f-date" style="padding:6px 8px;background:#0a0a0f;border:1px solid #2a2a38;border-radius:6px;color:#fff;font-size:11px;cursor:pointer">'+
'      <option value="0">Date : Tous</option>'+
'      <option value="7">7 derniers jours</option>'+
'      <option value="30">30 derniers jours</option>'+
'      <option value="90">3 derniers mois</option>'+
'      <option value="180">6 derniers mois</option>'+
'      <option value="365">1 an</option>'+
'    </select>'+
'  </div>'+
'</div>'+

// Stats bar
'<div id="igf-stats" style="display:none;gap:8px;margin-bottom:12px;flex-wrap:wrap">'+
'  <div style="flex:1;min-width:90px;background:#111118;border:1px solid #2a2a38;border-radius:10px;padding:10px"><div style="font-size:9px;color:#9090a8;text-transform:uppercase;font-weight:700;margin-bottom:4px">Total</div><div id="igf-s-total" style="font-size:18px;font-weight:900;color:#E1306C">0</div></div>'+
'  <div style="flex:1;min-width:90px;background:#111118;border:1px solid #2a2a38;border-radius:10px;padding:10px"><div style="font-size:9px;color:#9090a8;text-transform:uppercase;font-weight:700;margin-bottom:4px">Affiches</div><div id="igf-s-shown" style="font-size:18px;font-weight:900;color:#fff">0</div></div>'+
'  <div style="flex:1;min-width:90px;background:#111118;border:1px solid #2a2a38;border-radius:10px;padding:10px"><div style="font-size:9px;color:#9090a8;text-transform:uppercase;font-weight:700;margin-bottom:4px">FR</div><div id="igf-s-fr" style="font-size:18px;font-weight:900;color:#0095f6">0</div></div>'+
'  <div style="flex:1;min-width:90px;background:#111118;border:1px solid #2a2a38;border-radius:10px;padding:10px"><div style="font-size:9px;color:#9090a8;text-transform:uppercase;font-weight:700;margin-bottom:4px">Avec email</div><div id="igf-s-email" style="font-size:18px;font-weight:900;color:#00d084">0</div></div>'+
'  <div style="flex:1;min-width:90px;background:#111118;border:1px solid #2a2a38;border-radius:10px;padding:10px"><div style="font-size:9px;color:#9090a8;text-transform:uppercase;font-weight:700;margin-bottom:4px">Selectionnes</div><div id="igf-s-sel" style="font-size:18px;font-weight:900;color:#FCAF45">0</div></div>'+
'</div>'+

// Bulk actions bar (sticky-ish)
'<div id="igf-bulk-bar" style="display:none;gap:8px;margin-bottom:12px;flex-wrap:wrap">'+
'  <button id="igf-select-all" style="padding:9px 14px;background:#1a1a24;border:1.5px solid #2a2a38;color:#d0d0e0;font-size:11px;font-weight:700;border-radius:8px;cursor:pointer">\u2713 Tout</button>'+
'  <button id="igf-select-none" style="padding:9px 14px;background:#1a1a24;border:1.5px solid #2a2a38;color:#d0d0e0;font-size:11px;font-weight:700;border-radius:8px;cursor:pointer">Aucun</button>'+
'  <button id="igf-dm-bulk" style="padding:9px 16px;background:linear-gradient(135deg,#E1306C,#F77737);border:none;color:#fff;font-size:12px;font-weight:800;border-radius:8px;cursor:pointer">\uD83D\uDCE8 DM les selectionnes</button>'+
'  <button id="igf-enrich-all" style="padding:9px 16px;background:#1a1a24;border:1.5px solid #00d084;color:#00d084;font-size:11px;font-weight:700;border-radius:8px;cursor:pointer">\uD83D\uDD0D Enrichir tout</button>'+
'  <button id="igf-triage" style="padding:9px 16px;background:#1a1a24;border:1.5px solid #6C63FF;color:#6C63FF;font-size:11px;font-weight:700;border-radius:8px;cursor:pointer">\uD83D\uDCC7 Mode Triage</button>'+
'  <button id="igf-csv" style="padding:9px 16px;background:#1a1a24;border:1.5px solid #00d084;color:#00d084;font-size:11px;font-weight:700;border-radius:8px;cursor:pointer">\u2B07 CSV</button>'+
'</div>'+

// Search results
'<div id="igf-search-section" style="display:none">'+
'  <div style="font-size:10px;color:#9090a8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;font-weight:700">Comptes trouves</div>'+
'  <div id="igf-cards" style="display:flex;flex-direction:column;gap:10px"></div>'+
'</div>'+

'</div>';

document.body.appendChild(ov);

var $=function(id){return document.getElementById(id);};

// ===== STATE =====
var searchResults=[];
var allExtracted=[]; // current extraction list (for filtering, selection)
var selected={};
var searching=false;
var expandedKey=null;
var currentExpandUid=null;

function setStatus(m){var w=$('igf-status-wrap');w.style.display='block';$('igf-status').textContent=m;}
function setProgress(p){$('igf-bar').style.width=Math.min(100,p)+'%';}
function setCounter(n){$('igf-counter').textContent=n;}

$('igf-close').onclick=function(){ov.remove();styleEl.remove();};

// ===== ENRICH =====
async function enrichUser(un){
  try{
    var pd=await igfetch('https://www.instagram.com/api/v1/users/web_profile_info/?username='+encodeURIComponent(un));
    var usr=pd&&pd.data&&pd.data.user;if(!usr)return null;
    var bio=usr.biography||'';
    var emails=extractEmails(bio);var phones=extractPhones(bio);
    if(usr.business_email&&emails.indexOf(usr.business_email)===-1)emails.push(usr.business_email);
    if(usr.business_phone_number&&phones.indexOf(usr.business_phone_number)===-1)phones.push(usr.business_phone_number);
    var fullName=usr.full_name||'';
    return{
      username:un,name:fullName,userId:usr.id||'',
      followers:usr.edge_followed_by?usr.edge_followed_by.count:0,
      following:usr.edge_follow?usr.edge_follow.count:0,
      posts:usr.edge_owner_to_timeline_media?usr.edge_owner_to_timeline_media.count:0,
      bio:bio.substring(0,300),extUrl:usr.external_url||'',
      biz:!!usr.is_business_account,verified:!!usr.is_verified,
      emails:emails,phones:phones,
      profilePic:usr.profile_pic_url_hd||usr.profile_pic_url||'',
      isFR:detectFR(bio+' '+fullName),
      isContacted:isContacted(un),
    };
  }catch(e){return null;}
}

// Score quality (email/site/biz/etc)
function calcScore(p){
  var s=0;
  if(p.emails&&p.emails.length)s+=4;
  if(p.phones&&p.phones.length)s+=2;
  if(p.extUrl)s+=2;
  if(p.biz)s+=1;
  if(p.followers>=100&&p.followers<=100000)s+=1;
  return Math.min(10,s);
}

// Score "client probable"
function calcClientScore(p){
  var s=0;
  // Sweet spot: 1k-50k abonnes
  if(p.followers>=1000&&p.followers<=50000)s+=4;
  else if(p.followers>=300&&p.followers<=1000)s+=2;
  else if(p.followers>=50&&p.followers<=300)s+=1;
  // Has contact info
  if(p.emails&&p.emails.length)s+=3;
  if(p.extUrl)s+=2;
  if(p.phones&&p.phones.length)s+=1;
  // Active (a des posts)
  if(p.posts>=10)s+=1;
  // Following ratio (suit moins de monde = plus reactif aux DMs)
  if(p.followers>0&&p.following>0&&p.following<p.followers/2)s+=1;
  // Pro
  if(p.biz)s+=1;
  // FR
  if(p.isFR)s+=2;
  return Math.min(15,s);
}

// ===== FILTERS / SORT =====
function applyFilters(list){
  var f={
    fr:$('igf-f-fr')&&$('igf-f-fr').checked,
    email:$('igf-f-email')&&$('igf-f-email').checked,
    site:$('igf-f-site')&&$('igf-f-site').checked,
    biz:$('igf-f-biz')&&$('igf-f-biz').checked,
    uncontacted:$('igf-f-uncontacted')&&$('igf-f-uncontacted').checked,
    min:parseInt($('igf-f-min')&&$('igf-f-min').value)||0,
    max:parseInt($('igf-f-max')&&$('igf-f-max').value)||9e9,
    days:parseInt($('igf-f-date')&&$('igf-f-date').value)||0,
    keyword:($('igf-f-keyword')&&$('igf-f-keyword').value||'').toLowerCase().trim(),
  };
  var cutoff=f.days?Date.now()-f.days*86400000:0;
  return list.filter(function(p){
    if(f.fr&&!p.isFR)return false;
    if(f.email&&!(p.emails&&p.emails.length))return false;
    if(f.site&&!p.extUrl)return false;
    if(f.biz&&!p.biz)return false;
    if(f.uncontacted&&p.isContacted)return false;
    if(p.followers<f.min||p.followers>f.max)return false;
    if(cutoff&&p.latestCommentDate&&p.latestCommentDate<cutoff)return false;
    if(f.keyword){
      var hay=((p.username||'')+' '+(p.name||'')+' '+(p.bio||'')+' '+((p.comments||[]).join(' '))).toLowerCase();
      if(hay.indexOf(f.keyword)===-1)return false;
    }
    return true;
  });
}

function applySort(list){
  var sortKey=$('igf-f-sort')?$('igf-f-sort').value:'date_desc';
  var c=list.slice();
  if(sortKey==='date_desc')c.sort(function(a,b){return(b.latestCommentDate||0)-(a.latestCommentDate||0);});
  else if(sortKey==='score')c.sort(function(a,b){return calcScore(b)-calcScore(a);});
  else if(sortKey==='client')c.sort(function(a,b){return calcClientScore(b)-calcClientScore(a);});
  else if(sortKey==='followers_asc')c.sort(function(a,b){return a.followers-b.followers;});
  else if(sortKey==='followers_desc')c.sort(function(a,b){return b.followers-a.followers;});
  return c;
}

function updateStats(){
  $('igf-stats').style.display='flex';
  $('igf-bulk-bar').style.display='flex';
  $('igf-filters-bar').style.display='block';
  var src=allExtracted.length?allExtracted:searchResults;
  var filtered=applyFilters(src);
  $('igf-s-total').textContent=src.length;
  $('igf-s-shown').textContent=filtered.length;
  $('igf-s-fr').textContent=src.filter(function(p){return p.isFR;}).length;
  $('igf-s-email').textContent=src.filter(function(p){return p.emails&&p.emails.length;}).length;
  $('igf-s-sel').textContent=Object.keys(selected).length;
}

// ===== TEMPLATES & DM =====
function personalize(template,p){
  var firstName=(p.name||'').split(/\s+/)[0]||p.username;
  var firstComment=(p.comments&&p.comments[0])||'';
  return template
    .replace(/\{prenom\}/g,firstName)
    .replace(/\{nom\}/g,p.name||p.username)
    .replace(/\{compte\}/g,'@'+p.username)
    .replace(/\{commentaire\}/g,firstComment.substring(0,60));
}

function copyToClipboard(text){
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text);
      return true;
    }
  }catch(e){}
  // Fallback
  try{
    var ta=document.createElement('textarea');
    ta.value=text;ta.style.position='fixed';ta.style.left='-9999px';
    document.body.appendChild(ta);ta.select();
    document.execCommand('copy');document.body.removeChild(ta);
    return true;
  }catch(e){return false;}
}

// ===== RENDER CARDS =====
function renderSearchCards(){
  var section=$('igf-search-section');
  if(!searchResults.length){section.style.display='none';return;}
  section.style.display='block';
  updateStats();
  var sorted=applySort(applyFilters(searchResults));
  var box=$('igf-cards');box.innerHTML='';
  sorted.forEach(function(p,i){box.appendChild(buildCardEl(p,i,false));});
  bindCardActions(box);
}

function buildCardEl(p,i,isExtracted){
  var card=document.createElement('div');
  card.className='igf-card';
  card.style.cssText='background:#111118;border:1.5px solid #1f1f2c;border-radius:14px;overflow:hidden';
  var sc=calcScore(p);
  var cs=calcClientScore(p);
  var scColor=sc>=7?'#00d084':sc>=4?'#F77737':'#9090a8';
  var scBg=sc>=7?'rgba(0,208,132,.12)':sc>=4?'rgba(247,119,55,.12)':'rgba(144,144,168,.1)';
  var pic=p.profilePic?'<img src="'+escAttr(p.profilePic)+'" style="width:46px;height:46px;border-radius:50%;object-fit:cover;border:2px solid #2a2a38;flex-shrink:0" onerror="this.style.display=\'none\'">':'<div style="width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#E1306C,#F77737);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:18px;flex-shrink:0">'+escHtml((p.username||'?').charAt(0).toUpperCase())+'</div>';
  var contact='';
  if(p.emails&&p.emails.length)contact+='<span style="color:#00d084;font-size:11px;margin-right:8px">\u2709 '+escHtml(p.emails[0])+'</span>';
  if(p.phones&&p.phones.length)contact+='<span style="color:#d0d0e0;font-size:11px;margin-right:8px">\uD83D\uDCDE '+escHtml(p.phones[0])+'</span>';
  if(p.extUrl)contact+='<a href="'+escAttr(p.extUrl)+'" target="_blank" style="color:#F77737;font-size:11px;text-decoration:none">\uD83C\uDF10 Site</a>';
  var badges='';
  if(p.verified)badges+='<span style="color:#0095f6">\u2713</span>';
  if(p.biz)badges+='<span class="igf-pill" style="background:rgba(255,215,0,.15);color:#ffd700">PRO</span>';
  if(p.isFR)badges+='<span class="igf-pill" style="background:rgba(0,149,246,.15);color:#0095f6">FR</span>';
  if(p.isContacted)badges+='<span class="igf-pill" style="background:rgba(108,99,255,.18);color:#6C63FF">\u2705 DM</span>';
  // Comment block (if any)
  var commentBlock='';
  if(p.comments&&p.comments.length){
    var fullComment=p.comments[0];
    var truncated=fullComment.length>100?fullComment.substring(0,100)+'...':fullComment;
    var dateStr='';
    if(p.latestCommentDate){
      var diffDays=Math.floor((Date.now()-p.latestCommentDate)/86400000);
      if(diffDays===0)dateStr='aujourd\u2019hui';
      else if(diffDays===1)dateStr='hier';
      else if(diffDays<30)dateStr='il y a '+diffDays+' j';
      else if(diffDays<365)dateStr='il y a '+Math.floor(diffDays/30)+' mois';
      else dateStr='il y a '+Math.floor(diffDays/365)+' an'+(diffDays>=730?'s':'');
    }
    commentBlock='<div style="margin-top:6px;padding:6px 9px;background:rgba(247,119,55,.08);border-left:2px solid #F77737;border-radius:4px;font-size:11px;color:#d0d0e0;font-style:italic;line-height:1.4" title="'+escAttr(fullComment)+'">\uD83D\uDCAC '+escHtml(truncated)+(dateStr?' <span style="color:#9090a8;font-style:normal;font-size:10px">\u00b7 '+dateStr+'</span>':'')+'</div>';
  }
  var sourcePost='';
  if(p.sourcePosts&&p.sourcePosts.length){
    sourcePost='<a href="https://www.instagram.com/p/'+p.sourcePosts[0]+'/" target="_blank" style="font-size:9px;color:#9090a8;text-decoration:none;margin-left:6px">\uD83D\uDCCC '+(p.sourcePosts.length>1?p.sourcePosts.length+' posts':'1 post')+'</a>';
  }
  var checked=selected[p.username]?'checked':'';
  card.innerHTML=
    '<div style="display:flex;align-items:center;gap:12px;padding:14px 16px">'+
      '<input type="checkbox" class="igf-checkbox igf-row-check" data-user="'+escAttr(p.username)+'" '+checked+' style="margin-right:2px">'+
      '<div style="color:#3a3a48;font-size:11px;font-weight:700;width:20px">'+(i+1)+'</div>'+
      pic+
      '<div style="flex:1;min-width:0">'+
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'+
          '<a href="https://www.instagram.com/'+p.username+'/" target="_blank" style="color:#fff;font-weight:700;text-decoration:none;font-size:14px">@'+p.username+'</a>'+
          badges+sourcePost+
        '</div>'+
        '<div style="font-size:11px;color:#9090a8;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(p.name||'')+'</div>'+
        (contact?'<div style="margin-top:5px">'+contact+'</div>':'')+
        commentBlock+
      '</div>'+
      '<div style="text-align:right;flex-shrink:0">'+
        '<div style="font-size:14px;font-weight:800;color:#E1306C">'+fmtNum(p.followers)+'</div>'+
        '<div style="font-size:9px;color:#9090a8;text-transform:uppercase;font-weight:600">abonnes</div>'+
      '</div>'+
      '<div title="Score qualite" style="background:'+scBg+';color:'+scColor+';font-size:13px;font-weight:800;padding:6px 10px;border-radius:9px;flex-shrink:0;min-width:42px;text-align:center">'+sc+'<span style="font-size:9px;opacity:.7">/10</span></div>'+
      '<div title="Score client probable" style="background:rgba(108,99,255,.12);color:#6C63FF;font-size:13px;font-weight:800;padding:6px 10px;border-radius:9px;flex-shrink:0;min-width:42px;text-align:center">'+cs+'<span style="font-size:9px;opacity:.7">/15</span></div>'+
    '</div>'+
    '<div style="display:flex;gap:6px;padding:0 16px 14px 16px">'+
      '<button class="igf-btn-action" data-action="dm-single" data-user="'+escAttr(p.username)+'" style="flex:1;padding:9px;background:linear-gradient(135deg,#E1306C,#F77737);border:none;color:#fff;font-size:11px;font-weight:800;border-radius:8px;cursor:pointer">\uD83D\uDCE8 DM</button>'+
      (isExtracted?'':'<button class="igf-btn-action" data-action="followers" data-user="'+escAttr(p.username)+'" style="flex:1;padding:9px;background:linear-gradient(135deg,rgba(225,48,108,.18),rgba(247,119,55,.12));border:1px solid rgba(225,48,108,.4);color:#E1306C;font-size:11px;font-weight:800;border-radius:8px;cursor:pointer">\uD83D\uDC65 Abonnes</button>'+
      '<button class="igf-btn-action" data-action="comments" data-user="'+escAttr(p.username)+'" style="flex:1;padding:9px;background:linear-gradient(135deg,rgba(247,119,55,.18),rgba(252,175,69,.12));border:1px solid rgba(247,119,55,.4);color:#F77737;font-size:11px;font-weight:800;border-radius:8px;cursor:pointer">\uD83D\uDCAC Coms</button>'+
      '<button class="igf-btn-action" data-action="likers" data-user="'+escAttr(p.username)+'" style="flex:1;padding:9px;background:linear-gradient(135deg,rgba(252,175,69,.18),rgba(255,215,0,.12));border:1px solid rgba(252,175,69,.4);color:#FCAF45;font-size:11px;font-weight:800;border-radius:8px;cursor:pointer">\u2764\uFE0F Likes</button>')+
    '</div>'+
    (isExtracted?'':'<div id="igf-card-expand-'+escAttr(p.username)+'" style="display:none"></div>');
  return card;
}

function bindCardActions(container){
  container.querySelectorAll('.igf-row-check').forEach(function(cb){
    cb.onchange=function(){
      var u=this.getAttribute('data-user');
      if(this.checked)selected[u]=true;else delete selected[u];
      updateStats();
    };
  });
  container.querySelectorAll('.igf-btn-action').forEach(function(btn){
    btn.onclick=function(){
      var action=this.getAttribute('data-action');
      var user=this.getAttribute('data-user');
      if(action==='dm-single'){openDMSingle(user);return;}
      if(action==='followers'||action==='comments'||action==='likers'){
        toggleCardExpand(action,user);
      }
    };
  });
}

// ===== Page-level (current profile/post) action buttons =====
ov.querySelectorAll('.igf-btn-action').forEach(function(btn){
  btn.onclick=function(){
    var action=this.getAttribute('data-action');
    var user=this.getAttribute('data-user');
    var shortcode=this.getAttribute('data-shortcode');
    if(action==='post-comments'||action==='post-likers'){togglePageExpand(action,shortcode);}
    else{togglePageExpand(action,user);}
  };
});

// ===== EXPANSION =====
function buildExpansionHTML(uid){
  return '<div style="background:#0a0a0f;border:1px solid #2a2a38;border-radius:11px;padding:12px">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:10px">'+
      '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">'+
        '<div id="igf-exp-status-'+uid+'" style="font-size:11px;color:#d0d0e0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Demarrage...</div>'+
      '</div>'+
      '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">'+
        '<div id="igf-exp-counter-'+uid+'" style="font-size:14px;font-weight:800;color:#E1306C">0</div>'+
        '<button class="igf-exp-stop" style="padding:5px 11px;background:#1a1a24;border:1.5px solid #ff4444;color:#ff4444;font-size:10px;font-weight:700;border-radius:6px;cursor:pointer">\u23F9 Stop</button>'+
      '</div>'+
    '</div>'+
    '<div style="height:3px;background:#1a1a24;border-radius:2px;overflow:hidden;margin-bottom:10px"><div id="igf-exp-bar-'+uid+'" style="height:100%;width:0;background:linear-gradient(90deg,#E1306C,#F77737);transition:width .4s"></div></div>'+
    '<div id="igf-exp-list-'+uid+'" style="display:flex;flex-direction:column;gap:6px;max-height:55vh;overflow-y:auto"></div>'+
  '</div>';
}

// Global stop handler — works for any .igf-exp-stop button via event delegation
document.addEventListener('click',function(e){
  var stopBtn=e.target.closest&&e.target.closest('.igf-exp-stop');
  if(stopBtn){
    searching=false;
    var statusEl=stopBtn.closest('div').parentNode.querySelector('[id^="igf-exp-status-"]');
    if(statusEl)statusEl.textContent='\u23F9 Arrete par l\'utilisateur';
  }
});

function expSetStatus(uid,m){var el=document.getElementById('igf-exp-status-'+uid);if(el)el.textContent=m;}
function expSetCounter(uid,n){var el=document.getElementById('igf-exp-counter-'+uid);if(el)el.textContent=n;}
function expSetProgress(uid,p){var el=document.getElementById('igf-exp-bar-'+uid);if(el)el.style.width=Math.min(100,p)+'%';}

function expRenderList(uid,list){
  var listEl=document.getElementById('igf-exp-list-'+uid);if(!listEl)return;
  listEl.innerHTML='';
  allExtracted=list.slice();
  currentExpandUid=uid;
  updateStats();
  var sorted=applySort(applyFilters(list));
  sorted.forEach(function(p,i){
    listEl.appendChild(buildExtractRow(p,i));
  });
  // Use event delegation: bind ONCE on the container
  if(!listEl._delegated){
    listEl._delegated=true;
    listEl.addEventListener('click',function(e){
      var dmBtn=e.target.closest('.igf-ext-dm');
      if(dmBtn){
        e.preventDefault();e.stopPropagation();
        openDMSingle(dmBtn.getAttribute('data-user'));
        return;
      }
      var enrichBtn=e.target.closest('.igf-ext-enrich');
      if(enrichBtn){
        e.preventDefault();e.stopPropagation();
        var un=enrichBtn.getAttribute('data-user');
        var origText=enrichBtn.textContent;
        enrichBtn.textContent='...';enrichBtn.disabled=true;
        enrichUser(un).then(function(p){
          if(p){
            for(var i=0;i<allExtracted.length;i++){
              if(allExtracted[i].username===un){
                p.sourcePosts=allExtracted[i].sourcePosts;
                p.comments=allExtracted[i].comments;
                p.commentDates=allExtracted[i].commentDates;
                p.latestCommentDate=allExtracted[i].latestCommentDate;
                p.enriched=true;
                allExtracted[i]=p;
                break;
              }
            }
            expRenderList(currentExpandUid,allExtracted);
          }else{
            enrichBtn.textContent='Echec';
            setTimeout(function(){enrichBtn.textContent=origText;enrichBtn.disabled=false;},1500);
          }
        });
      }
    });
    listEl.addEventListener('change',function(e){
      var cb=e.target.closest('.igf-row-check');
      if(cb){
        var u=cb.getAttribute('data-user');
        if(cb.checked)selected[u]=true;else delete selected[u];
        updateStats();
      }
    });
  }
}

function buildExtractRow(p,i){
  var row=document.createElement('div');
  row.style.cssText='background:#111118;border:1.5px solid #1f1f2c;border-radius:11px;padding:11px 13px;display:flex;align-items:flex-start;gap:11px';
  var pic=p.profilePic
    ?'<img src="'+escAttr(p.profilePic)+'" style="width:42px;height:42px;border-radius:50%;object-fit:cover;border:1.5px solid #2a2a38;flex-shrink:0" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<div style=&quot;width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#E1306C,#F77737);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:16px;flex-shrink:0&quot;>'+escHtml((p.username||'?').charAt(0).toUpperCase())+'</div>\'">'
    :'<div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#E1306C,#F77737);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:16px;flex-shrink:0">'+escHtml((p.username||'?').charAt(0).toUpperCase())+'</div>';
  // Date string
  var dateStr='';
  if(p.latestCommentDate){
    var diff=Math.floor((Date.now()-p.latestCommentDate)/86400000);
    if(diff===0)dateStr='aujourd\u2019hui';
    else if(diff===1)dateStr='hier';
    else if(diff<30)dateStr='il y a '+diff+'j';
    else if(diff<365)dateStr='il y a '+Math.floor(diff/30)+'mois';
    else dateStr='il y a '+Math.floor(diff/365)+'an'+(diff>=730?'s':'');
  }
  // Comment block
  var commentBlock='';
  if(p.comments&&p.comments.length){
    var full=p.comments[0];
    var trunc=full.length>120?full.substring(0,120)+'...':full;
    commentBlock='<div style="margin-top:5px;padding:6px 9px;background:rgba(247,119,55,.1);border-left:2px solid #F77737;border-radius:4px;font-size:11px;color:#d0d0e0;font-style:italic;line-height:1.4" title="'+escAttr(full)+'">\uD83D\uDCAC '+escHtml(trunc)+(dateStr?' <span style="color:#9090a8;font-style:normal;font-size:10px">\u00b7 '+dateStr+'</span>':'')+'</div>';
  }
  // Badges
  var badges='';
  if(p.verified)badges+=' <span style="color:#0095f6;font-size:11px">\u2713</span>';
  if(p.isFR)badges+=' <span class="igf-pill" style="background:rgba(0,149,246,.15);color:#0095f6">FR</span>';
  if(p.isContacted)badges+=' <span class="igf-pill" style="background:rgba(108,99,255,.18);color:#6C63FF">\u2705 DM</span>';
  if(p.emails&&p.emails.length)badges+=' <span class="igf-pill" style="background:rgba(0,208,132,.15);color:#00d084">\u2709</span>';
  // Source post link
  var srcLink='';
  if(p.sourcePosts&&p.sourcePosts.length){
    srcLink='<a href="https://www.instagram.com/p/'+p.sourcePosts[0]+'/" target="_blank" style="font-size:10px;color:#9090a8;text-decoration:none;margin-left:6px">\uD83D\uDCCC '+(p.sourcePosts.length>1?p.sourcePosts.length+' posts':'1 post')+'</a>';
  }
  // Bio (if enriched)
  var bioBlock='';
  if(p.enriched&&p.bio){bioBlock='<div style="font-size:10px;color:#9090a8;margin-top:3px;line-height:1.3">'+escHtml(p.bio.substring(0,140))+(p.bio.length>140?'...':'')+'</div>';}
  // Contact (if enriched)
  var contact='';
  if(p.emails&&p.emails.length)contact+='<div style="color:#00d084;font-size:11px;margin-top:3px">\u2709 '+escHtml(p.emails[0])+'</div>';
  if(p.extUrl)contact+='<div><a href="'+escAttr(p.extUrl)+'" target="_blank" style="color:#F77737;font-size:11px;text-decoration:none">\uD83C\uDF10 Site</a></div>';
  // Followers (if enriched)
  var followersStr=p.enriched?fmtNum(p.followers)+' abonnes':'';
  // Score badge (only if enriched)
  var scoreBadge='';
  if(p.enriched){
    var sc=calcScore(p);
    var scColor=sc>=7?'#00d084':sc>=4?'#F77737':'#9090a8';
    scoreBadge='<div style="background:rgba(255,255,255,.04);color:'+scColor+';font-size:12px;font-weight:800;padding:5px 9px;border-radius:7px;flex-shrink:0">'+sc+'<span style="font-size:9px;opacity:.7">/10</span></div>';
  }
  // Enrich button (only if not enriched)
  var enrichBtn=p.enriched?'':'<button class="igf-ext-enrich" data-user="'+escAttr(p.username)+'" style="padding:6px 9px;background:transparent;border:1px solid #2a2a38;color:#9090a8;font-size:10px;font-weight:700;border-radius:6px;cursor:pointer">\uD83D\uDD0D Infos</button>';
  var checked=selected[p.username]?'checked':'';

  row.innerHTML=
    '<input type="checkbox" class="igf-row-check" data-user="'+escAttr(p.username)+'" '+checked+' style="accent-color:#E1306C;width:16px;height:16px;cursor:pointer;margin-top:13px;flex-shrink:0">'+
    '<div style="color:#3a3a48;font-size:10px;font-weight:700;width:18px;text-align:right;padding-top:14px;flex-shrink:0">'+(i+1)+'</div>'+
    pic+
    '<div style="flex:1;min-width:0">'+
      '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">'+
        '<a href="https://www.instagram.com/'+p.username+'/" target="_blank" style="color:#fff;font-weight:700;text-decoration:none;font-size:13px">@'+escHtml(p.username)+'</a>'+
        badges+srcLink+
      '</div>'+
      (p.name?'<div style="font-size:11px;color:#9090a8;margin-top:1px">'+escHtml(p.name)+'</div>':'')+
      bioBlock+
      contact+
      commentBlock+
    '</div>'+
    (followersStr?'<div style="text-align:right;flex-shrink:0;padding-top:4px"><div style="font-size:12px;font-weight:700;color:#E1306C">'+followersStr.replace(' abonnes','')+'</div><div style="font-size:9px;color:#9090a8">abonnes</div></div>':'')+
    scoreBadge+
    '<div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0;align-items:stretch">'+
      '<button type="button" class="igf-ext-dm" data-user="'+escAttr(p.username)+'" style="padding:7px 12px;background:linear-gradient(135deg,#E1306C,#F77737);border:none;color:#fff;font-size:11px;font-weight:800;border-radius:7px;cursor:pointer;white-space:nowrap">\uD83D\uDCE8 DM</button>'+
      enrichBtn+
    '</div>';
  return row;
}

async function togglePageExpand(action,target){
  var key='page:'+action+':'+target;
  var zone=$('igf-page-expand');
  if(!zone)return;
  if(expandedKey===key){zone.style.display='none';zone.innerHTML='';expandedKey=null;return;}
  closeAllExpansions();
  expandedKey=key;currentExpandUid='page';
  zone.style.display='block';zone.className='igf-expand';
  zone.innerHTML=buildExpansionHTML('page');
  await runExtraction(action,target,'page');
}

async function toggleCardExpand(action,user){
  var key='card:'+action+':'+user;
  var zone=document.getElementById('igf-card-expand-'+user);
  if(!zone)return;
  if(expandedKey===key){zone.style.display='none';zone.innerHTML='';expandedKey=null;return;}
  closeAllExpansions();
  expandedKey=key;currentExpandUid=user;
  zone.style.display='block';zone.className='igf-expand';
  zone.innerHTML='<div style="padding:0 16px 14px 16px">'+buildExpansionHTML(user)+'</div>';
  await runExtraction(action,user,user);
}

function closeAllExpansions(){
  var p=$('igf-page-expand');if(p){p.style.display='none';p.innerHTML='';}
  document.querySelectorAll('[id^="igf-card-expand-"]').forEach(function(z){z.style.display='none';z.innerHTML='';});
  expandedKey=null;
}

// ===== POSTS / EXTRACTION =====
async function getUserPosts(userId,maxPosts,statusUid,cutoffTs){
  maxPosts=maxPosts||8;
  // Paginate through user feed: Instagram returns ~12 per page, so we loop with max_id
  var collected=[];var maxIdParam='';var page=0;var lastErr=null;
  while(collected.length<maxPosts&&page<25&&searching){
    page++;
    try{
      var url='https://www.instagram.com/api/v1/feed/user/'+userId+'/?count=12';
      if(maxIdParam)url+='&max_id='+encodeURIComponent(maxIdParam);
      var d=await igfetch(url);
      var items=d.items||[];
      var batch=items.map(function(m){
        return{
          id:m.id||(m.pk?String(m.pk):''),
          shortcode:m.code||'',
          takenAt:(m.taken_at||0)*1000,
        };
      }).filter(function(p){return!!p.id;});
      if(!batch.length){
        if(statusUid)expSetStatus(statusUid,'Pas plus de posts (page '+page+')');
        break;
      }
      for(var i=0;i<batch.length&&collected.length<maxPosts;i++)collected.push(batch[i]);
      if(statusUid)expSetStatus(statusUid,'Recuperation posts: '+collected.length+' (page '+page+')');
      // Stop early if oldest post in batch is past cutoff
      if(cutoffTs&&batch.length){
        var oldest=batch[batch.length-1].takenAt;
        if(oldest&&oldest<cutoffTs)break;
      }
      if(d.next_max_id)maxIdParam=d.next_max_id;
      else if(d.more_available===false)break;
      else break;
      await sleep(500);
    }catch(e){
      lastErr=e;
      // On first-page failure, propagate so caller can show error
      if(page===1){
        if(statusUid)expSetStatus(statusUid,'Erreur API: '+(e.message||'inconnue'));
        throw e;
      }
      break;
    }
  }
  return collected;
}

async function getUserId(username){
  // Method 1: DOM scan if we're on the user's page (no API call needed)
  try{
    var html=document.documentElement.innerHTML;
    var patterns=[
      new RegExp('"profile_id":"(\\d+)"'),
      new RegExp('"owner":\\{"id":"(\\d+)"'),
      new RegExp('"user_id":"(\\d+)"'),
      new RegExp('"id":"(\\d+)","username":"'+username+'"'),
      new RegExp('"username":"'+username+'","id":"(\\d+)"'),
    ];
    for(var i=0;i<patterns.length;i++){
      var m=html.match(patterns[i]);
      if(m&&m[1])return m[1];
    }
  }catch(e){}
  // Method 2: API web_profile_info
  try{
    var pd=await igfetch('https://www.instagram.com/api/v1/users/web_profile_info/?username='+encodeURIComponent(username));
    if(pd&&pd.data&&pd.data.user&&pd.data.user.id)return pd.data.user.id;
  }catch(e){}
  // Method 3: fetch profile HTML directly
  try{
    var r=await fetch('https://www.instagram.com/'+encodeURIComponent(username)+'/',{credentials:'include'});
    var h=await r.text();
    var m2=h.match(/"profile_id":"(\d+)"/)||h.match(/"id":"(\d+)","username":"/)||h.match(/"user_id":"(\d+)"/);
    if(m2&&m2[1])return m2[1];
  }catch(e){}
  return null;
}

async function getMediaIdFromShortcode(shortcode){
  try{
    var html=document.documentElement.innerHTML;
    var m=html.match(/"media_id":"(\d+)"/)||html.match(/instagram:\/\/media\?id=(\d+)/)||html.match(/"id":"(\d+)_/);
    if(m)return m[1];
  }catch(e){}
  try{
    var r=await fetch('https://www.instagram.com/p/'+shortcode+'/',{credentials:'include'});
    var h=await r.text();
    var m2=h.match(/"media_id":"(\d+)"/)||h.match(/instagram:\/\/media\?id=(\d+)/)||h.match(/"id":"(\d+)_/);
    if(m2)return m2[1];
  }catch(e){}
  return null;
}

async function fetchFollowersList(uid,userId){
  var collected=[];var seen={};var maxIdParam='';var page=0;
  while(searching&&collected.length<200&&page<15){
    page++;
    try{
      await antibanThrottle();
      var url='https://www.instagram.com/api/v1/friendships/'+userId+'/followers/?count=50';
      if(maxIdParam)url+='&max_id='+encodeURIComponent(maxIdParam);
      var fd=await igfetch(url);
      var batch=fd.users||[];
      if(!batch.length)break;
      batch.forEach(function(u){
        if(u.username&&!seen[u.username]){
          seen[u.username]=true;
          collected.push({
            username:u.username,
            name:u.full_name||'',
            profilePic:u.profile_pic_url||'',
            verified:!!u.is_verified,
            sourcePosts:[],
            comments:[],
            commentDates:[],
            latestCommentDate:0,
          });
        }
      });
      expSetStatus(uid,collected.length+' abonnes collectes...');
      expSetProgress(uid,5+(collected.length/200)*30);
      if(fd.next_max_id)maxIdParam=fd.next_max_id;else break;
      await sleep(900);
    }catch(e){expSetStatus(uid,'Acces limite');break;}
  }
  return collected;
}

async function fetchCommentersList(uid,userId){
  // Get ALL posts from the last 90 days — paginate through user feed
  expSetStatus(uid,'Recuperation des posts...');
  var cutoff=Date.now()-90*86400000;
  var posts=await getUserPosts(userId,300,uid,cutoff);
  if(!posts.length){expSetStatus(uid,'Aucun post');return [];}
  // Filter posts to keep only those from the last 90 days (3 months)
  var recentPosts=posts.filter(function(p){return!p.takenAt||p.takenAt>=cutoff;});
  if(!recentPosts.length)recentPosts=posts.slice(0,12); // fallback if no dates
  expSetStatus(uid,recentPosts.length+' posts (3 derniers mois) \u2014 extraction de TOUS les commentaires...');
  var collected={};
  for(var i=0;i<recentPosts.length;i++){
    if(!searching)break;
    var post=recentPosts[i];
    var postNum=i+1;
    var minId='',atts=0;
    // Fetch ALL comment pages for this post (up to 50 pages — covers very large posts)
    while(atts<50&&searching){
      atts++;
      try{
        await antibanThrottle();
        var url='https://www.instagram.com/api/v1/media/'+post.id+'/comments/?can_support_threading=true&permalink_enabled=false';
        if(minId)url+='&min_id='+encodeURIComponent(minId);
        var d=await igfetch(url);
        var comments=d.comments||[];
        if(!comments.length)break;
        comments.forEach(function(c){
          var un=c.user&&c.user.username;
          if(un){
            if(!collected[un])collected[un]={username:un,sourcePosts:[],comments:[],commentDates:[],latestCommentDate:0,profilePic:c.user.profile_pic_url||'',name:c.user.full_name||''};
            if(post.shortcode&&collected[un].sourcePosts.indexOf(post.shortcode)===-1)collected[un].sourcePosts.push(post.shortcode);
            if(c.text&&collected[un].comments.indexOf(c.text)===-1)collected[un].comments.push(c.text);
            if(c.created_at){
              var ts=c.created_at*1000;
              collected[un].commentDates.push(ts);
              if(ts>collected[un].latestCommentDate)collected[un].latestCommentDate=ts;
            }
          }
        });
        expSetStatus(uid,'Post '+postNum+'/'+recentPosts.length+' (page '+atts+') \u2014 '+Object.keys(collected).length+' commentateurs');
        expSetCounter(uid,Object.keys(collected).length);
        expSetProgress(uid,5+(postNum/recentPosts.length)*90);
        if(d.next_min_id)minId=d.next_min_id;else break;
        await sleep(600);
      }catch(e){break;}
    }
    await sleep(400);
  }
  return Object.keys(collected).map(function(k){return collected[k];});
}

async function fetchLikersList(uid,userId){
  var posts=await getUserPosts(userId,30);
  if(!posts.length){expSetStatus(uid,'Aucun post');return [];}
  expSetStatus(uid,posts.length+' posts \u2014 extraction...');
  var collected={};
  for(var i=0;i<posts.length;i++){
    if(!searching)break;
    var post=posts[i];
    expSetStatus(uid,'Post '+(i+1)+'/'+posts.length+' \u2014 likers');
    expSetProgress(uid,5+((i+1)/posts.length)*30);
    try{
      await antibanThrottle();
      var d=await igfetch('https://www.instagram.com/api/v1/media/'+post.id+'/likers/');
      (d.users||[]).forEach(function(u){
        if(u.username){
          if(!collected[u.username])collected[u.username]={
            username:u.username,
            name:u.full_name||'',
            profilePic:u.profile_pic_url||'',
            verified:!!u.is_verified,
            sourcePosts:[],
            comments:[],
            commentDates:[],
            latestCommentDate:0,
          };
          if(post.shortcode&&collected[u.username].sourcePosts.indexOf(post.shortcode)===-1)collected[u.username].sourcePosts.push(post.shortcode);
        }
      });
    }catch(e){}
    expSetCounter(uid,Object.keys(collected).length);
    await sleep(800);
  }
  return Object.keys(collected).map(function(k){return collected[k];});
}

async function fetchPostCommenters(uid,shortcode){
  expSetStatus(uid,'Recuperation du post...');
  var mediaId=await getMediaIdFromShortcode(shortcode);
  if(!mediaId){expSetStatus(uid,'Post inaccessible');return [];}
  var collected={};var minId='',atts=0;
  while(atts<5&&searching){
    atts++;
    try{
      await antibanThrottle();
      var url='https://www.instagram.com/api/v1/media/'+mediaId+'/comments/?can_support_threading=true&permalink_enabled=false';
      if(minId)url+='&min_id='+encodeURIComponent(minId);
      var d=await igfetch(url);
      var comments=d.comments||[];
      if(!comments.length)break;
      comments.forEach(function(c){
        var un=c.user&&c.user.username;
        if(un){
          if(!collected[un])collected[un]={username:un,sourcePosts:[shortcode],comments:[]};
          if(c.text&&collected[un].comments.indexOf(c.text)===-1)collected[un].comments.push(c.text);
        }
      });
      expSetStatus(uid,Object.keys(collected).length+' commentateurs collectes...');
      if(d.next_min_id)minId=d.next_min_id;else break;
      await sleep(700);
    }catch(e){break;}
  }
  return Object.keys(collected).map(function(k){return collected[k];});
}

async function fetchPostLikers(uid,shortcode){
  expSetStatus(uid,'Recuperation du post...');
  var mediaId=await getMediaIdFromShortcode(shortcode);
  if(!mediaId){expSetStatus(uid,'Post inaccessible');return [];}
  try{
    await antibanThrottle();
    var d=await igfetch('https://www.instagram.com/api/v1/media/'+mediaId+'/likers/');
    var users=d.users||[];
    return users.map(function(u){return{username:u.username,sourcePosts:[shortcode],comments:[]};}).filter(function(x){return x.username;});
  }catch(e){return [];}
}

async function runExtraction(action,target,uid){
  if(searching)return;
  searching=true;
  allExtracted=[];selected={};
  var rawList=[];
  try{
    if(action==='followers'){
      expSetStatus(uid,'Recuperation du profil...');
      var u1=await getUserId(target);if(!u1){expSetStatus(uid,'Profil introuvable');searching=false;return;}
      rawList=await fetchFollowersList(uid,u1);
    }else if(action==='comments'){
      expSetStatus(uid,'Recuperation du profil...');
      var u2=await getUserId(target);if(!u2){expSetStatus(uid,'Profil introuvable');searching=false;return;}
      rawList=await fetchCommentersList(uid,u2);
    }else if(action==='likers'){
      expSetStatus(uid,'Recuperation du profil...');
      var u3=await getUserId(target);if(!u3){expSetStatus(uid,'Profil introuvable');searching=false;return;}
      rawList=await fetchLikersList(uid,u3);
    }else if(action==='post-comments'){rawList=await fetchPostCommenters(uid,target);}
    else if(action==='post-likers'){rawList=await fetchPostLikers(uid,target);}
  }catch(e){expSetStatus(uid,'\u274C Erreur: '+(e.message||'inconnue')+' \u2014 Reconnecte-toi a Instagram et ressaie');searching=false;return;}

  if(!rawList.length){expSetStatus(uid,'\u26A0 Aucun resultat \u2014 le profil n\'a pas de posts publics ou Instagram a bloque l\'API');searching=false;return;}

  // FAST mode: build profiles directly from raw data (no API enrichment to avoid rate limits)
  var enriched=rawList.map(function(item){
    return{
      username:item.username,name:item.name||'',userId:'',
      followers:0,following:0,posts:0,bio:'',extUrl:'',
      biz:false,verified:!!item.verified,emails:[],phones:[],
      profilePic:item.profilePic||'',isFR:detectFR(item.name||''),isContacted:isContacted(item.username),
      sourcePosts:item.sourcePosts||[],
      comments:item.comments||[],
      commentDates:item.commentDates||[],
      latestCommentDate:item.latestCommentDate||0,
      enriched:false,
    };
  });
  expSetCounter(uid,enriched.length);
  expRenderList(uid,enriched);
  searching=false;
  expSetProgress(uid,100);
  var label=action==='followers'?'abonnes':(action.indexOf('com')>-1?'commentateurs':'likers');
  expSetStatus(uid,'\u2705 '+enriched.length+' '+label+' (clique \uD83D\uDD0D Enrichir tout pour les bios/emails)');
  // Hide the spinner when done
  var spin=document.getElementById('igf-exp-spin-'+uid);
  if(spin)spin.style.display='none';
}

// ===== ENRICH ALL ON DEMAND =====
async function enrichAllExtracted(uid){
  if(searching)return;
  if(!allExtracted.length){return;}
  searching=true;
  $('igf-stop').style.display='inline-block';
  var max=allExtracted.length;
  for(var i=0;i<allExtracted.length;i++){
    if(!searching)break;
    var item=allExtracted[i];
    if(item.enriched)continue;
    expSetStatus(uid,'\uD83D\uDD0D Enrichissement @'+item.username+' ('+(i+1)+'/'+max+')');
    expSetProgress(uid,(i/max)*100);
    var p=await enrichUser(item.username);
    if(p){
      p.sourcePosts=item.sourcePosts;
      p.comments=item.comments;
      p.commentDates=item.commentDates;
      p.latestCommentDate=item.latestCommentDate;
      p.enriched=true;
      allExtracted[i]=p;
    }else{
      allExtracted[i].enriched=true;
    }
    if(i%5===0)expRenderList(uid,allExtracted);
    await sleep(450);
  }
  expRenderList(uid,allExtracted);
  searching=false;
  $('igf-stop').style.display='none';
  expSetStatus(uid,'\u2705 Enrichissement termine');
}

// ===== SEARCH =====
async function doSearch(query){
  if(searching)return;
  searching=true;searchResults=[];allExtracted=[];selected={};
  $('igf-search-section').style.display='none';
  setStatus('Recherche : "'+query+'"...');setProgress(5);setCounter(0);
  var queries=[query,query+' freelance',query+' france',query+' paris',query+' lyon'];
  var seen={};
  for(var qi=0;qi<queries.length;qi++){
    if(!searching||searchResults.length>=30)break;
    setStatus('Recherche : "'+queries[qi]+'"');setProgress(5+(qi/queries.length)*20);
    try{
      await antibanThrottle();
      var d=await igfetch('https://www.instagram.com/api/v1/web/search/topsearch/?context=blended&query='+encodeURIComponent(queries[qi])+'&include_reel=false');
      var users=d.users||[];
      for(var ui=0;ui<users.length&&searchResults.length<30;ui++){
        if(!searching)break;
        var u=users[ui].user||{};var un=u.username;if(!un||seen[un])continue;seen[un]=true;
        setStatus('Analyse @'+un+'...');setProgress(25+(searchResults.length/30)*70);
        var p=await enrichUser(un);
        if(p){searchResults.push(p);setCounter(searchResults.length);renderSearchCards();}
        await sleep(350);
      }
    }catch(e){}
    await sleep(500);
  }
  searching=false;setProgress(100);
  setStatus('\u2705 '+searchResults.length+' comptes trouves');
}

$('igf-search-btn').onclick=function(){var v=$('igf-input').value.trim();if(!v){$('igf-input').focus();return;}doSearch(v);};
$('igf-input').addEventListener('keydown',function(e){if(e.key==='Enter')$('igf-search-btn').click();});
$('igf-stop').onclick=function(){searching=false;setStatus('Arrete.');};
$('igf-input').value='monteur video';

// ===== FILTER LISTENERS =====
['igf-f-fr','igf-f-email','igf-f-site','igf-f-biz','igf-f-uncontacted'].forEach(function(id){
  if($(id))$(id).onchange=function(){
    if(allExtracted.length&&currentExpandUid){var listEl=document.getElementById('igf-exp-list-'+currentExpandUid);if(listEl)expRenderList(currentExpandUid,allExtracted);}
    else renderSearchCards();
    updateStats();
  };
});
['igf-f-min','igf-f-max','igf-f-keyword'].forEach(function(id){
  if($(id))$(id).oninput=function(){
    if(allExtracted.length&&currentExpandUid){var listEl=document.getElementById('igf-exp-list-'+currentExpandUid);if(listEl)expRenderList(currentExpandUid,allExtracted);}
    else renderSearchCards();
    updateStats();
  };
});
if($('igf-f-sort'))$('igf-f-sort').onchange=function(){
  if(allExtracted.length&&currentExpandUid){var listEl=document.getElementById('igf-exp-list-'+currentExpandUid);if(listEl)expRenderList(currentExpandUid,allExtracted);}
  else renderSearchCards();
};
if($('igf-f-date'))$('igf-f-date').onchange=function(){
  if(allExtracted.length&&currentExpandUid){var listEl=document.getElementById('igf-exp-list-'+currentExpandUid);if(listEl)expRenderList(currentExpandUid,allExtracted);}
  else renderSearchCards();
  updateStats();
};

// ===== BULK ACTIONS =====
$('igf-select-all').onclick=function(){
  var src=allExtracted.length?allExtracted:searchResults;
  applySort(applyFilters(src)).forEach(function(p){selected[p.username]=true;});
  if(allExtracted.length&&currentExpandUid){var listEl=document.getElementById('igf-exp-list-'+currentExpandUid);if(listEl)expRenderList(currentExpandUid,allExtracted);}
  else renderSearchCards();
};
$('igf-select-none').onclick=function(){selected={};if(allExtracted.length&&currentExpandUid){var listEl=document.getElementById('igf-exp-list-'+currentExpandUid);if(listEl)expRenderList(currentExpandUid,allExtracted);}else renderSearchCards();};

$('igf-enrich-all').onclick=function(){if(allExtracted.length&&currentExpandUid){enrichAllExtracted(currentExpandUid);}else{alert('Pas de profils a enrichir.');}};

$('igf-dm-bulk').onclick=function(){
  var src=allExtracted.length?allExtracted:searchResults;
  var selectedProfiles=src.filter(function(p){return selected[p.username];});
  if(!selectedProfiles.length){alert('Selectionne au moins 1 profil avec les checkboxes.');return;}
  openDMQueue(selectedProfiles);
};

// ===== DM SINGLE =====
function openDMSingle(username){
  var src=allExtracted.length?allExtracted:searchResults;
  var p=src.filter(function(x){return x.username===username;})[0];
  if(!p){
    // Fallback: build a minimal profile from username only
    p={username:username,name:'',followers:0,profilePic:'',emails:[],phones:[],comments:[]};
  }
  openDMQueue([p]);
}
// Expose globally so inline onclick works
window.igfDMSingle=openDMSingle;
window.igfEnrichProfile=function(username,btnEl){
  var origText=btnEl.textContent;
  btnEl.textContent='...';btnEl.disabled=true;
  enrichUser(username).then(function(p){
    if(p){
      for(var i=0;i<allExtracted.length;i++){
        if(allExtracted[i].username===username){
          p.sourcePosts=allExtracted[i].sourcePosts;
          p.comments=allExtracted[i].comments;
          p.commentDates=allExtracted[i].commentDates;
          p.latestCommentDate=allExtracted[i].latestCommentDate;
          p.enriched=true;
          allExtracted[i]=p;
          break;
        }
      }
      if(currentExpandUid)expRenderList(currentExpandUid,allExtracted);
    }else{
      btnEl.textContent='Echec';
      setTimeout(function(){btnEl.textContent=origText;btnEl.disabled=false;},1500);
    }
  });
};

// ===== DM QUEUE MODAL =====
function openDMQueue(profiles){
  var templates=loadTemplates();
  var currentTplIdx=0;
  var currentIdx=0;

  var modal=document.createElement('div');
  modal.className='igf-modal';
  function buildQueueHTML(){
    var p=profiles[currentIdx];
    var tpl=templates[currentTplIdx];
    var msg=personalize(tpl.text,p);
    return '<div class="igf-modal-content">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'+
      '  <div style="font-size:18px;font-weight:800;color:#fff">\uD83D\uDCE8 Envoi DM <span style="color:#E1306C">'+(currentIdx+1)+'</span> / '+profiles.length+'</div>'+
      '  <button id="igf-q-close" style="background:none;border:1.5px solid #2a2a38;color:#e0e0f0;font-size:22px;cursor:pointer;width:38px;height:38px;border-radius:10px">&times;</button>'+
      '</div>'+
      // Profile info
      '<div style="background:#111118;border:1.5px solid #2a2a38;border-radius:12px;padding:14px;margin-bottom:14px;display:flex;align-items:center;gap:12px">'+
      '  '+(p.profilePic?'<img src="'+escAttr(p.profilePic)+'" style="width:50px;height:50px;border-radius:50%;object-fit:cover">':'<div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#E1306C,#F77737);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:20px">'+escHtml(p.username.charAt(0).toUpperCase())+'</div>')+
      '  <div style="flex:1;min-width:0">'+
      '    <div style="font-size:15px;font-weight:800;color:#fff">@'+escHtml(p.username)+'</div>'+
      '    <div style="font-size:12px;color:#9090a8">'+escHtml(p.name||'')+' \u00b7 '+fmtNum(p.followers)+' abonnes</div>'+
      '  </div>'+
      '</div>'+
      // Template selector
      '<div style="margin-bottom:14px">'+
      '  <div style="font-size:10px;color:#9090a8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;font-weight:700">Template</div>'+
      '  <select id="igf-q-tpl" class="igf-input">'+
      templates.map(function(t,i){return '<option value="'+i+'"'+(i===currentTplIdx?' selected':'')+'>'+escHtml(t.name)+'</option>';}).join('')+
      '  </select>'+
      '</div>'+
      // Message preview (editable)
      '<div style="margin-bottom:14px">'+
      '  <div style="font-size:10px;color:#9090a8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;font-weight:700">Message a envoyer (modifiable)</div>'+
      '  <textarea id="igf-q-msg" class="igf-textarea" rows="5">'+escHtml(msg)+'</textarea>'+
      '</div>'+
      // Instructions
      '<div style="background:rgba(0,208,132,.08);border:1px solid rgba(0,208,132,.3);border-radius:10px;padding:12px;margin-bottom:14px;font-size:12px;color:#d0d0e0;line-height:1.5">'+
      '  <strong style="color:#00d084">Mode safe (anti-ban) :</strong><br>'+
      '  1. Clique <strong>"Copier + Ouvrir DM"</strong> \u2192 message copie + onglet DM s\'ouvre direct<br>'+
      '  2. Dans l\'onglet DM : <strong>Ctrl+V</strong> puis <strong>Enter</strong> (3 sec max)<br>'+
      '  3. Reviens ici et clique <strong>"Marque envoye"</strong> pour passer au suivant<br>'+
      '  <em style="color:#9090a8;font-size:11px">\u26A0 L\'envoi auto via API est desactive (Instagram ban les comptes qui l\'utilisent).</em>'+
      '</div>'+
      // Actions
      '<button type="button" id="igf-q-copyopen" style="width:100%;padding:14px;background:linear-gradient(135deg,#E1306C,#F77737);border:none;color:#fff;font-size:14px;font-weight:800;border-radius:10px;cursor:pointer;margin-bottom:8px">\uD83D\uDCE9 Copier + Ouvrir DM (Ctrl+V puis Enter)</button>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
      '  <button type="button" id="igf-q-marksent" style="flex:1;min-width:140px;padding:11px;background:#1a1a24;border:1.5px solid #00d084;color:#00d084;font-size:12px;font-weight:800;border-radius:10px;cursor:pointer">\u2705 Marque envoye \u2192 suivant</button>'+
      '  <button type="button" id="igf-q-skip" style="flex:1;min-width:120px;padding:11px;background:#1a1a24;border:1.5px solid #2a2a38;color:#9090a8;font-size:12px;font-weight:700;border-radius:10px;cursor:pointer">Passer</button>'+
      '</div>'+
      '<div id="igf-q-result" style="margin-top:10px;font-size:12px;text-align:center"></div>'+
      '</div>';
  }
  function rerender(){modal.innerHTML=buildQueueHTML();bindQueueEvents();}
  function bindQueueEvents(){
    document.getElementById('igf-q-close').onclick=function(){modal.remove();};
    document.getElementById('igf-q-tpl').onchange=function(){currentTplIdx=parseInt(this.value);rerender();};
    document.getElementById('igf-q-copyopen').onclick=async function(){
      var btn=this;
      var msg=document.getElementById('igf-q-msg').value;
      var resEl=document.getElementById('igf-q-result');
      copyToClipboard(msg);
      resEl.innerHTML='<span style="color:#00d084">\u2705 Message copie ! Ouverture du DM...</span>';
      btn.textContent='\u2705 Va sur l\'onglet Instagram \u2192 Ctrl+V + Enter';
      // Try to open the DM thread directly: need user ID
      try{
        var userId=await getUserId(profiles[currentIdx].username);
        if(userId){
          window.open('https://www.instagram.com/direct/t/'+userId+'/','_blank');
        }else{
          window.open('https://www.instagram.com/'+profiles[currentIdx].username+'/','_blank');
        }
      }catch(e){
        window.open('https://www.instagram.com/'+profiles[currentIdx].username+'/','_blank');
      }
      setTimeout(function(){btn.textContent='\uD83D\uDCE9 Copier + Ouvrir DM (Ctrl+V puis Enter)';},4000);
    };
    document.getElementById('igf-q-marksent').onclick=function(){
      markContacted(profiles[currentIdx].username);
      profiles[currentIdx].isContacted=true;
      currentIdx++;
      if(currentIdx>=profiles.length){
        modal.innerHTML='<div class="igf-modal-content" style="text-align:center"><div style="font-size:48px;margin-bottom:14px">\uD83C\uDF89</div><div style="font-size:18px;font-weight:800;color:#fff;margin-bottom:8px">Tous envoyes !</div><div style="font-size:13px;color:#9090a8;margin-bottom:18px">'+profiles.length+' DMs envoyes en mode safe</div><button id="igf-q-end" style="padding:13px 28px;background:linear-gradient(135deg,#E1306C,#F77737);border:none;color:#fff;font-size:13px;font-weight:800;border-radius:10px;cursor:pointer">Fermer</button></div>';
        document.getElementById('igf-q-end').onclick=function(){modal.remove();renderSearchCards();if(allExtracted.length&&currentExpandUid){var listEl=document.getElementById('igf-exp-list-'+currentExpandUid);if(listEl)expRenderList(currentExpandUid,allExtracted);}};
      }else{rerender();}
    };
    document.getElementById('igf-q-skip').onclick=function(){
      currentIdx++;
      if(currentIdx>=profiles.length){modal.remove();return;}
      rerender();
    };
  }
  modal.innerHTML=buildQueueHTML();
  document.body.appendChild(modal);
  bindQueueEvents();
}

// ===== TEMPLATES MODAL =====
$('igf-templates-btn').onclick=function(){
  var templates=loadTemplates();
  var modal=document.createElement('div');
  modal.className='igf-modal';
  function build(){
    var html='<div class="igf-modal-content">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'+
      '  <div style="font-size:18px;font-weight:800;color:#fff">\uD83D\uDCAC Templates DM</div>'+
      '  <button id="igf-tpl-close" style="background:none;border:1.5px solid #2a2a38;color:#e0e0f0;font-size:22px;cursor:pointer;width:38px;height:38px;border-radius:10px">&times;</button>'+
      '</div>'+
      '<div style="font-size:12px;color:#9090a8;margin-bottom:14px;line-height:1.5">Variables disponibles : <code style="color:#F77737">{prenom}</code> <code style="color:#F77737">{nom}</code> <code style="color:#F77737">{compte}</code> <code style="color:#F77737">{commentaire}</code></div>';
    templates.forEach(function(t,i){
      html+='<div style="background:#111118;border:1.5px solid #2a2a38;border-radius:11px;padding:12px;margin-bottom:10px">'+
        '<input class="igf-input igf-tpl-name" data-i="'+i+'" value="'+escAttr(t.name)+'" style="margin-bottom:6px;font-weight:700">'+
        '<textarea class="igf-textarea igf-tpl-text" data-i="'+i+'" rows="3">'+escHtml(t.text)+'</textarea>'+
        '<div style="display:flex;justify-content:flex-end;margin-top:6px">'+
          '<button class="igf-tpl-del" data-i="'+i+'" style="padding:5px 11px;background:#1a1a24;border:1px solid #ff4444;color:#ff4444;font-size:10px;font-weight:700;border-radius:6px;cursor:pointer">\uD83D\uDDD1 Supprimer</button>'+
        '</div>'+
      '</div>';
    });
    html+='<button id="igf-tpl-add" style="width:100%;padding:11px;background:#1a1a24;border:1.5px dashed #2a2a38;color:#9090a8;font-size:12px;font-weight:700;border-radius:10px;cursor:pointer;margin-bottom:10px">+ Ajouter un template</button>'+
      '<button id="igf-tpl-save" style="width:100%;padding:13px;background:linear-gradient(135deg,#E1306C,#F77737);border:none;color:#fff;font-size:13px;font-weight:800;border-radius:10px;cursor:pointer">\uD83D\uDCBE Sauvegarder</button>'+
      '</div>';
    return html;
  }
  modal.innerHTML=build();
  function readTemplates(){
    var arr=[];
    var names=modal.querySelectorAll('.igf-tpl-name');
    var texts=modal.querySelectorAll('.igf-tpl-text');
    for(var i=0;i<names.length;i++){arr.push({name:names[i].value,text:texts[i].value});}
    return arr;
  }
  function bind(){
    modal.querySelector('#igf-tpl-close').onclick=function(){modal.remove();};
    modal.querySelectorAll('.igf-tpl-del').forEach(function(b){b.onclick=function(){templates=readTemplates();var i=parseInt(this.getAttribute('data-i'));templates.splice(i,1);modal.innerHTML=build();bind();};});
    modal.querySelector('#igf-tpl-add').onclick=function(){templates=readTemplates();templates.push({name:'Nouveau template',text:'Salut {prenom}, ...'});modal.innerHTML=build();bind();};
    modal.querySelector('#igf-tpl-save').onclick=function(){templates=readTemplates();saveTemplates(templates);this.textContent='\u2705 Sauvegarde !';var btn=this;setTimeout(function(){modal.remove();},800);};
  }
  bind();
  document.body.appendChild(modal);
};

// ===== HISTORY MODAL =====
$('igf-history-btn').onclick=function(){
  var contacted=loadContacted();
  var keys=Object.keys(contacted).sort(function(a,b){return contacted[b]-contacted[a];});
  var modal=document.createElement('div');
  modal.className='igf-modal';
  var html='<div class="igf-modal-content">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'+
    '  <div style="font-size:18px;font-weight:800;color:#fff">\uD83D\uDCDC Historique \u2014 '+keys.length+' contactes</div>'+
    '  <button id="igf-hist-close" style="background:none;border:1.5px solid #2a2a38;color:#e0e0f0;font-size:22px;cursor:pointer;width:38px;height:38px;border-radius:10px">&times;</button>'+
    '</div>';
  if(!keys.length){html+='<div style="text-align:center;color:#9090a8;padding:30px;font-size:13px">Aucun profil contacte pour l\'instant.</div>';}
  else{
    html+='<div style="max-height:50vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px">';
    keys.forEach(function(un){
      var date=new Date(contacted[un]).toLocaleDateString('fr-FR');
      html+='<div style="background:#111118;border:1px solid #2a2a38;border-radius:8px;padding:10px;display:flex;align-items:center;justify-content:space-between"><a href="https://www.instagram.com/'+un+'/" target="_blank" style="color:#E1306C;font-weight:700;text-decoration:none;font-size:13px">@'+un+'</a><span style="color:#9090a8;font-size:11px">'+date+'</span></div>';
    });
    html+='</div>';
    html+='<button id="igf-hist-clear" style="width:100%;margin-top:14px;padding:11px;background:#1a1a24;border:1.5px solid #ff4444;color:#ff4444;font-size:12px;font-weight:700;border-radius:10px;cursor:pointer">\uD83D\uDDD1 Vider l\'historique</button>';
  }
  html+='</div>';
  modal.innerHTML=html;
  modal.querySelector('#igf-hist-close').onclick=function(){modal.remove();};
  if(modal.querySelector('#igf-hist-clear'))modal.querySelector('#igf-hist-clear').onclick=function(){if(confirm('Vider tout l\'historique des contactes ?')){saveContacted({});modal.remove();}};
  document.body.appendChild(modal);
};

// ===== TRIAGE MODE =====
$('igf-triage').onclick=function(){
  var src=allExtracted.length?allExtracted:searchResults;
  var list=applySort(applyFilters(src));
  if(!list.length){alert('Aucun profil a trier');return;}
  var idx=0;
  var modal=document.createElement('div');
  modal.className='igf-modal';
  function build(){
    if(idx>=list.length){
      return '<div class="igf-modal-content" style="text-align:center"><div style="font-size:48px;margin-bottom:14px">\uD83C\uDF89</div><div style="font-size:18px;font-weight:800;color:#fff;margin-bottom:8px">Triage termine !</div><div style="font-size:13px;color:#9090a8;margin-bottom:18px">'+Object.keys(selected).length+' profils selectionnes</div><button id="igf-tri-end" style="padding:13px 28px;background:linear-gradient(135deg,#E1306C,#F77737);border:none;color:#fff;font-size:13px;font-weight:800;border-radius:10px;cursor:pointer">Voir les selectionnes</button></div>';
    }
    var p=list[idx];
    var sc=calcScore(p);var cs=calcClientScore(p);
    var pic=p.profilePic?'<img src="'+escAttr(p.profilePic)+'" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:3px solid #E1306C">':'<div style="width:90px;height:90px;border-radius:50%;background:linear-gradient(135deg,#E1306C,#F77737);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:36px">'+escHtml(p.username.charAt(0).toUpperCase())+'</div>';
    var contact='';
    if(p.emails&&p.emails.length)contact+='<div style="color:#00d084;font-size:13px;margin-bottom:4px">\u2709 '+escHtml(p.emails[0])+'</div>';
    if(p.phones&&p.phones.length)contact+='<div style="color:#d0d0e0;font-size:13px;margin-bottom:4px">\uD83D\uDCDE '+escHtml(p.phones[0])+'</div>';
    if(p.extUrl)contact+='<div><a href="'+escAttr(p.extUrl)+'" target="_blank" style="color:#F77737;font-size:13px;text-decoration:none">\uD83C\uDF10 '+escHtml(p.extUrl)+'</a></div>';
    // Comment block
    var commentBlock='';
    if(p.comments&&p.comments.length){
      var dateStr='';
      if(p.latestCommentDate){
        var diff=Math.floor((Date.now()-p.latestCommentDate)/86400000);
        if(diff===0)dateStr='aujourd\u2019hui';
        else if(diff===1)dateStr='hier';
        else if(diff<30)dateStr='il y a '+diff+'j';
        else if(diff<365)dateStr='il y a '+Math.floor(diff/30)+'mois';
        else dateStr='il y a '+Math.floor(diff/365)+'an'+(diff>=730?'s':'');
      }
      commentBlock='<div style="background:rgba(247,119,55,.1);border:1px solid rgba(247,119,55,.3);border-left:3px solid #F77737;border-radius:10px;padding:12px;margin-bottom:14px;text-align:left">'+
        '<div style="font-size:9px;color:#F77737;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;font-weight:700">\uD83D\uDCAC Son commentaire'+(dateStr?' \u00b7 '+dateStr:'')+'</div>'+
        '<div style="font-size:13px;color:#fff;font-style:italic;line-height:1.4">'+escHtml(p.comments[0])+'</div>'+
        '</div>';
    }
    // Source post
    var srcBlock='';
    if(p.sourcePosts&&p.sourcePosts.length){
      srcBlock='<div style="margin-bottom:10px"><a href="https://www.instagram.com/p/'+p.sourcePosts[0]+'/" target="_blank" style="display:inline-block;padding:6px 12px;background:rgba(108,99,255,.12);color:#6C63FF;font-size:11px;text-decoration:none;border-radius:6px;font-weight:700">\uD83D\uDCCC Voir le post source</a></div>';
    }
    // Stats only if enriched
    var statsBlock='';
    if(p.enriched){
      statsBlock='<div style="display:flex;justify-content:center;gap:14px;margin-bottom:14px">'+
        '  <div style="text-align:center"><div style="font-size:20px;font-weight:800;color:#E1306C">'+fmtNum(p.followers)+'</div><div style="font-size:9px;color:#9090a8;text-transform:uppercase">abonnes</div></div>'+
        '  <div style="text-align:center"><div style="font-size:20px;font-weight:800;color:#F77737">'+sc+'/10</div><div style="font-size:9px;color:#9090a8;text-transform:uppercase">qualite</div></div>'+
        '  <div style="text-align:center"><div style="font-size:20px;font-weight:800;color:#6C63FF">'+cs+'/15</div><div style="font-size:9px;color:#9090a8;text-transform:uppercase">client</div></div>'+
        '</div>';
    }
    return '<div class="igf-modal-content" style="text-align:center;max-width:480px;position:relative">'+
      '<button id="igf-tri-close" style="position:absolute;top:12px;right:12px;background:none;border:1.5px solid #2a2a38;color:#e0e0f0;font-size:22px;cursor:pointer;width:36px;height:36px;border-radius:10px;z-index:10">&times;</button>'+
      '<div style="font-size:11px;color:#9090a8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:14px;font-weight:700">'+(idx+1)+' / '+list.length+'</div>'+
      '<div style="display:flex;justify-content:center;margin-bottom:14px">'+pic+'</div>'+
      '<div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:4px">@'+escHtml(p.username)+'</div>'+
      '<div style="font-size:13px;color:#9090a8;margin-bottom:14px">'+escHtml(p.name||'')+'</div>'+
      statsBlock+
      commentBlock+
      (p.bio?'<div style="background:#111118;border:1px solid #2a2a38;border-radius:10px;padding:12px;font-size:12px;color:#d0d0e0;text-align:left;margin-bottom:12px;max-height:100px;overflow-y:auto">'+escHtml(p.bio)+'</div>':'')+
      (contact?'<div style="background:rgba(0,208,132,.06);border:1px solid rgba(0,208,132,.2);border-radius:10px;padding:10px;margin-bottom:14px;text-align:left">'+contact+'</div>':'')+
      srcBlock+
      '<div style="display:flex;gap:10px">'+
      '  <button id="igf-tri-skip" style="flex:1;padding:16px;background:#1a1a24;border:1.5px solid #ff4444;color:#ff4444;font-size:14px;font-weight:800;border-radius:12px;cursor:pointer">\u2716 Passer</button>'+
      '  <button id="igf-tri-keep" style="flex:1;padding:16px;background:linear-gradient(135deg,#00d084,#00b873);border:none;color:#fff;font-size:14px;font-weight:800;border-radius:12px;cursor:pointer">\u2713 Garder</button>'+
      '</div>'+
      '<div style="display:flex;gap:8px;margin-top:8px">'+
      '  <a href="https://www.instagram.com/'+p.username+'/" target="_blank" style="flex:1;padding:9px;background:none;border:1px solid #2a2a38;color:#9090a8;font-size:11px;font-weight:700;border-radius:8px;text-decoration:none;text-align:center">\uD83D\uDC41 Voir profil</a>'+
      '</div>'+
      '</div>';
  }
  function rerender(){modal.innerHTML=build();bindTri();}
  function bindTri(){
    if(idx>=list.length){
      var endBtn=modal.querySelector('#igf-tri-end');
      if(endBtn)endBtn.onclick=function(){modal.remove();renderSearchCards();if(allExtracted.length&&currentExpandUid){var listEl=document.getElementById('igf-exp-list-'+currentExpandUid);if(listEl)expRenderList(currentExpandUid,allExtracted);}};
      return;
    }
    modal.querySelector('#igf-tri-skip').onclick=function(){idx++;rerender();};
    modal.querySelector('#igf-tri-keep').onclick=function(){selected[list[idx].username]=true;idx++;rerender();};
    var closeBtn=modal.querySelector('#igf-tri-close');
    if(closeBtn)closeBtn.onclick=function(){modal.remove();};
  }
  // Close on click outside the content
  modal.onclick=function(e){if(e.target===modal)modal.remove();};
  rerender();
  // Keyboard shortcuts
  document.addEventListener('keydown',function trihandler(e){
    if(!document.body.contains(modal)){document.removeEventListener('keydown',trihandler);return;}
    if(e.key==='Escape'){modal.remove();return;}
    if(e.key==='ArrowRight'||e.key==='Enter'){var k=modal.querySelector('#igf-tri-keep');if(k)k.click();}
    else if(e.key==='ArrowLeft'){var s=modal.querySelector('#igf-tri-skip');if(s)s.click();}
  });
  document.body.appendChild(modal);
};

// ===== CSV =====
$('igf-csv').onclick=function(){
  var src=allExtracted.length?allExtracted:searchResults;
  var sorted=applySort(applyFilters(src));
  if(!sorted.length)return;
  var BOM='\uFEFF';
  var lines=['Username,Nom,Abonnes,Bio,Email,Telephone,Site,Score,Client,FR,Contacte,Commentaire,Posts source,URL Instagram'];
  sorted.forEach(function(p){
    function q(s){return '"'+(String(s||'')).replace(/"/g,'""').replace(/\n/g,' ')+'"';}
    var srcPosts=(p.sourcePosts||[]).map(function(s){return 'https://instagram.com/p/'+s;}).join(' | ');
    var firstComment=(p.comments&&p.comments[0])||'';
    lines.push([q(p.username),q(p.name),p.followers,q(p.bio),q((p.emails||[]).join('; ')),q((p.phones||[]).join('; ')),q(p.extUrl),calcScore(p),calcClientScore(p),(p.isFR?'Oui':'Non'),(p.isContacted?'Oui':'Non'),q(firstComment),q(srcPosts),'https://www.instagram.com/'+p.username+'/'].join(','));
  });
  var csv=BOM+lines.join('\n');
  var blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='ig_finder_'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
};

})();
