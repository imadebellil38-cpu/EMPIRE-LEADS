(function(){
if(!location.hostname.includes('instagram.com')){alert('Ouvre ce bookmarklet sur instagram.com');return;}
if(document.getElementById('igm-overlay')){document.getElementById('igm-overlay').remove();return;}

var SEEN_KEY='igm_seen_monteurs';
function getSeenProfiles(){try{return JSON.parse(localStorage.getItem(SEEN_KEY)||'[]');}catch(e){return[];}}
function saveSeenProfiles(list){try{localStorage.setItem(SEEN_KEY,JSON.stringify(list));}catch(e){}}
function addToSeen(usernames){var s=getSeenProfiles();var set=new Set(s);usernames.forEach(function(u){set.add(u);});saveSeenProfiles(Array.from(set));}

function extractEmails(text){return(text||'').match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)||[];}
function extractPhones(text){var raw=(text||'').match(/(?:\+?\d{1,4}[\s\-.]?)?\(?\d{1,4}\)?[\s\-.]?\d{2,4}[\s\-.]?\d{2,4}[\s\-.]?\d{0,4}/g)||[];return raw.filter(function(p){return p.replace(/\D/g,'').length>=7;});}

var QUERIES=[
  'monteur vid\u00e9o','video editor','montage vid\u00e9o','\u00e9diteur vid\u00e9o','monteur freelance',
  'post production','motion designer','montage youtube','montage tiktok','montage reels',
  'montage clip','video editing','editing freelance','monteur professionnel',
  'monteur vid\u00e9o paris','video editor paris','montage vid\u00e9o paris',
  'monteur vid\u00e9o lyon','video editor lyon','monteur vid\u00e9o marseille',
  'monteur vid\u00e9o bordeaux','monteur vid\u00e9o lille','monteur vid\u00e9o toulouse',
  'monteur vid\u00e9o nantes','monteur vid\u00e9o nice','monteur vid\u00e9o strasbourg',
  'monteur vid\u00e9o rennes','monteur vid\u00e9o grenoble','monteur vid\u00e9o rouen',
  'monteur vid\u00e9o toulon','monteur vid\u00e9o metz','monteur vid\u00e9o nancy',
  'monteur vid\u00e9o reims','monteur vid\u00e9o dijon','monteur vid\u00e9o angers',
  'monteur vid\u00e9o le havre','monteur vid\u00e9o saint-etienne','monteur vid\u00e9o clermont',
  'monteur vid\u00e9o tours','monteur vid\u00e9o amiens','monteur vid\u00e9o limoges',
  'monteur vid\u00e9o caen','monteur vid\u00e9o brest','monteur vid\u00e9o perpignan',
  'monteur vid\u00e9o nimes','monteur vid\u00e9o pau','monteur vid\u00e9o bayonne',
  'monteur vid\u00e9o avignon','monteur vid\u00e9o poitiers','monteur vid\u00e9o rochelle',
  'monteur vid\u00e9o valenciennes','monteur vid\u00e9o troyes','monteur vid\u00e9o chartres',
  'monteur vid\u00e9o geneve','monteur vid\u00e9o lausanne','monteur vid\u00e9o zurich',
  'monteur vid\u00e9o bruxelles','monteur vid\u00e9o liege','monteur vid\u00e9o charleroi',
  'monteur vid\u00e9o montreal','monteur vid\u00e9o quebec',
  'video editor lyon','video editor marseille','video editor bordeaux',
  'video editor lille','video editor toulouse','video editor nantes',
  'video editor geneve','video editor bruxelles','video editor montreal',
  'montage youtube freelance','montage tiktok freelance','montage reels freelance',
  'post production paris','post production lyon','motion designer paris',
  'monteur vid\u00e9o freelance','editing freelance paris','editing freelance france'
];

var S={
  i:'padding:9px 11px;background:#111118;border:1.5px solid #2a2a38;border-radius:8px;color:#e0e0f0;font-size:14px;outline:none',
  s:'padding:9px 11px;background:#111118;border:1.5px solid #2a2a38;border-radius:8px;color:#e0e0f0;font-size:13px;outline:none;cursor:pointer',
  t:'display:inline-block;font-size:9px;padding:1px 5px;border-radius:20px;margin-left:4px',
};

var ov=document.createElement('div');
ov.id='igm-overlay';
ov.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(8,8,15,.45);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);overflow-y:auto;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';

ov.innerHTML='<div style="max-width:1060px;margin:0 auto;padding:16px">'+

'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid #2a2a38">'+
'  <div>'+
'    <div style="font-size:20px;font-weight:800;letter-spacing:-.5px">'+
'      <span style="background:linear-gradient(135deg,#E1306C,#F77737);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Monteur Vid\u00e9o</span>'+
'      <span style="color:#e0e0f0"> Finder</span>'+
'    </div>'+
'    <div style="font-size:12px;color:#c0c0d0;margin-top:2px">Recherche automatique de monteurs vid\u00e9o francophones</div>'+
'  </div>'+
'  <div style="display:flex;gap:8px;align-items:center">'+
'    <span id="igm-seen-count" style="font-size:11px;color:#c0c0d0"></span>'+
'    <button id="igm-clear-history" style="background:none;border:1px solid #2a2a38;color:#c0c0d0;font-size:10px;padding:4px 8px;border-radius:6px;cursor:pointer">Vider historique</button>'+
'    <button id="igm-close" style="background:none;border:1px solid #2a2a38;color:#e0e0f0;font-size:22px;cursor:pointer;width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center">&times;</button>'+
'  </div>'+
'</div>'+

'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:flex-end">'+
'  <div style="display:flex;flex-direction:column;gap:4px">'+
'    <label style="font-size:10px;color:#fff;text-transform:uppercase;letter-spacing:.05em;font-weight:600">Min abonn\u00e9s</label>'+
'    <input id="igm-min" type="number" value="0" style="width:95px;'+S.i+'">'+
'  </div>'+
'  <div style="display:flex;flex-direction:column;gap:4px">'+
'    <label style="font-size:10px;color:#fff;text-transform:uppercase;letter-spacing:.05em;font-weight:600">Max abonn\u00e9s</label>'+
'    <input id="igm-max" type="number" value="100000" style="width:105px;'+S.i+'">'+
'  </div>'+
'  <div style="display:flex;flex-direction:column;gap:4px">'+
'    <label style="font-size:10px;color:#fff;text-transform:uppercase;letter-spacing:.05em;font-weight:600">R\u00e9sultats max</label>'+
'    <input id="igm-count" type="number" value="100" style="width:80px;'+S.i+'">'+
'  </div>'+
'  <div style="display:flex;flex-direction:column;gap:4px">'+
'    <label style="font-size:10px;color:#fff;text-transform:uppercase;letter-spacing:.05em;font-weight:600">Trier</label>'+
'    <select id="igm-sort" style="'+S.s+'"><option value="followers_desc">Abonn\u00e9s \u2193</option><option value="followers_asc">Abonn\u00e9s \u2191</option><option value="score">Score \u2193</option><option value="name">Nom</option></select>'+
'  </div>'+
'</div>'+

'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">'+
'  <button id="igm-go" style="flex:1;min-width:140px;padding:14px 20px;background:linear-gradient(135deg,#E1306C,#F77737);color:#fff;font-size:16px;font-weight:700;border:none;border-radius:10px;cursor:pointer;box-shadow:0 4px 14px rgba(225,48,108,.35)">\uD83D\uDD0D Trouver des monteurs vid\u00e9o</button>'+
'  <button id="igm-stop" style="padding:14px 16px;background:#1a1a24;border:1.5px solid #ff4444;color:#ff4444;font-size:13px;font-weight:600;border-radius:10px;cursor:pointer;display:none">\u23F9 Stop</button>'+
'  <button id="igm-csv" style="padding:14px 16px;background:#1a1a24;border:1.5px solid #00d084;color:#00d084;font-size:13px;font-weight:600;border-radius:10px;cursor:pointer;display:none">\u2B07 Exporter CSV</button>'+
'</div>'+

'<div id="igm-prog-wrap" style="margin-bottom:10px;display:none">'+
'  <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">'+
'    <div style="flex:1;height:5px;background:#1a1a24;border-radius:3px;overflow:hidden"><div id="igm-bar" style="height:100%;width:0;background:linear-gradient(90deg,#E1306C,#F77737);transition:width .4s;border-radius:3px"></div></div>'+
'    <div id="igm-counter" style="font-size:20px;font-weight:800;color:#E1306C;min-width:80px;text-align:right">0</div>'+
'  </div>'+
'  <div id="igm-status" style="font-size:12px;color:#d0d0e0;min-height:16px"></div>'+
'</div>'+

'<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">'+
'  <div style="flex:1;min-width:80px;background:#111118;border:1px solid #2a2a38;border-radius:8px;padding:8px 12px"><div style="font-size:9px;color:#c0c0d0;text-transform:uppercase;margin-bottom:2px">Trouv\u00e9s</div><div id="igm-stat-total" style="font-size:18px;font-weight:700;color:#E1306C">0</div></div>'+
'  <div style="flex:1;min-width:80px;background:#111118;border:1px solid #2a2a38;border-radius:8px;padding:8px 12px"><div style="font-size:9px;color:#c0c0d0;text-transform:uppercase;margin-bottom:2px">Emails</div><div id="igm-stat-email" style="font-size:18px;font-weight:700;color:#00d084">0</div></div>'+
'  <div style="flex:1;min-width:80px;background:#111118;border:1px solid #2a2a38;border-radius:8px;padding:8px 12px"><div style="font-size:9px;color:#c0c0d0;text-transform:uppercase;margin-bottom:2px">Sites</div><div id="igm-stat-site" style="font-size:18px;font-weight:700;color:#F77737">0</div></div>'+
'  <div style="flex:1;min-width:80px;background:#111118;border:1px solid #2a2a38;border-radius:8px;padding:8px 12px"><div style="font-size:9px;color:#c0c0d0;text-transform:uppercase;margin-bottom:2px">D\u00e9j\u00e0 vus</div><div id="igm-stat-seen" style="font-size:18px;font-weight:700;color:#6C63FF">0</div></div>'+
'</div>'+

'<div style="overflow-x:auto;border-radius:10px;border:1px solid #2a2a38">'+
'  <table id="igm-table" style="width:100%;border-collapse:collapse;min-width:700px">'+
'    <thead><tr style="background:#111118">'+
'      <th style="padding:8px 10px;text-align:left;font-size:10px;color:#c0c0d0;text-transform:uppercase;width:30px">#</th>'+
'      <th style="padding:8px 10px;text-align:left;font-size:10px;color:#c0c0d0;text-transform:uppercase">Profil</th>'+
'      <th style="padding:8px 10px;text-align:left;font-size:10px;color:#E1306C;text-transform:uppercase">Abonn\u00e9s</th>'+
'      <th style="padding:8px 10px;text-align:left;font-size:10px;color:#c0c0d0;text-transform:uppercase">Bio</th>'+
'      <th style="padding:8px 10px;text-align:left;font-size:10px;color:#c0c0d0;text-transform:uppercase">Contact</th>'+
'      <th style="padding:8px 10px;text-align:left;font-size:10px;color:#c0c0d0;text-transform:uppercase">Score</th>'+
'    </tr></thead>'+
'    <tbody id="igm-body"></tbody>'+
'  </table>'+
'</div>'+

'</div>';

document.body.appendChild(ov);

var $=function(id){return document.getElementById(id);};
$('igm-close').onclick=function(){ov.remove();};
$('igm-clear-history').onclick=function(){localStorage.removeItem(SEEN_KEY);updateSeenCount();};

function updateSeenCount(){var c=getSeenProfiles().length;$('igm-seen-count').textContent=c?c+' vus':'';}
updateSeenCount();

function sleep(ms){return new Promise(function(r){setTimeout(r,ms);})}
function fmtNum(n){return n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'k':String(n);}
function escHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function igfetch(url){return fetch(url,{headers:{'X-IG-App-ID':'936619743392459','X-Requested-With':'XMLHttpRequest'},credentials:'include'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();});}
function setStatus(m){var el=$('igm-status');if(el)el.textContent=m;}
function setProgress(p){var w=$('igm-prog-wrap');var b=$('igm-bar');if(w)w.style.display='block';if(b)b.style.width=Math.min(100,p)+'%';}

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

var results=[];
var enrichedCount=0;
var searching=false;

function applyFilters(arr){
  var minF=parseInt($('igm-min').value)||0;
  var maxF=parseInt($('igm-max').value)||9999999;
  return arr.filter(function(p){return p.followers>=minF&&p.followers<=maxF;});
}

function applySort(arr){
  var key=$('igm-sort').value;
  var c=arr.slice();
  if(key==='followers_desc')c.sort(function(a,b){return b.followers-a.followers;});
  else if(key==='followers_asc')c.sort(function(a,b){return a.followers-b.followers;});
  else if(key==='score')c.sort(function(a,b){return calcScore(b)-calcScore(a);});
  else c.sort(function(a,b){return(a.name||a.username).localeCompare(b.name||b.username);});
  return c;
}

function updateStats(){
  var f=applyFilters(results);
  $('igm-stat-total').textContent=f.length;
  $('igm-stat-email').textContent=f.filter(function(p){return p.emails&&p.emails.length;}).length;
  $('igm-stat-site').textContent=f.filter(function(p){return!!p.extUrl;}).length;
  $('igm-stat-seen').textContent=getSeenProfiles().length;
}

function render(){
  var filtered=applyFilters(results);
  var sorted=applySort(filtered);
  updateStats();
  var b=$('igm-body');if(!b)return;
  b.innerHTML='';
  if(!sorted.length){b.innerHTML='<tr><td colspan="6" style="padding:30px;text-align:center;color:#c0c0d0;font-size:13px">Lance la recherche pour trouver des monteurs vid\u00e9o</td></tr>';return;}
  sorted.forEach(function(p,i){
    var tr=document.createElement('tr');
    tr.style.cssText='border-bottom:1px solid #1a1a24;transition:background .15s;cursor:pointer';
    tr.onmouseenter=function(){tr.style.background='rgba(255,255,255,.025)';};
    tr.onmouseleave=function(){tr.style.background='';};
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
      '<td style="padding:8px 10px;color:#c0c0d0;font-size:11px">'+(i+1)+'</td>'+
      '<td style="padding:8px 10px"><a href="https://www.instagram.com/'+p.username+'/" target="_blank" style="color:#E1306C;font-weight:600;text-decoration:none;font-size:13px">@'+p.username+'</a>'+badges+'<div style="font-size:10px;color:#c0c0d0">'+escHtml(p.name)+'</div></td>'+
      '<td style="padding:8px 10px;color:#E1306C;font-weight:700;font-size:13px">'+fmtNum(p.followers)+'</td>'+
      '<td style="padding:8px 10px;font-size:11px;color:#d0d0e0;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+escHtml(p.bio)+'">'+escHtml(p.bio)+'</td>'+
      '<td style="padding:8px 10px">'+contact+'</td>'+
      '<td style="padding:8px 10px;font-weight:700;color:'+scColor+';font-size:13px">'+sc+'<span style="font-size:9px;color:#c0c0d0">/10</span></td>';
    b.appendChild(tr);
  });
}

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
    verified:!!usr.is_verified,emails:emails,phones:phones,lastPostTs:lastPostTs,
  };
}

$('igm-go').onclick=async function(){
  if(searching)return;
  searching=true;results=[];enrichedCount=0;
  var maxR=Math.max(1,parseInt($('igm-count').value)||100);
  $('igm-stop').style.display='block';
  $('igm-csv').style.display='none';
  $('igm-go').disabled=true;$('igm-go').style.opacity='.5';
  $('igm-counter').textContent='0';
  render();
  var seen=new Set(getSeenProfiles());
  for(var qi=0;qi<QUERIES.length;qi++){
    if(!searching||enrichedCount>=maxR)break;
    var q=QUERIES[qi];
    setStatus('Recherche : "'+q+'" ('+enrichedCount+'/'+maxR+')');
    setProgress((qi/QUERIES.length)*30);
    try{
      var d=await igfetch('https://www.instagram.com/api/v1/web/search/topsearch/?context=blended&query='+encodeURIComponent(q)+'&include_reel=false');
      for(var ui=0;ui<(d.users||[]).length;ui++){
        if(!searching||enrichedCount>=maxR)break;
        var un=(d.users[ui].user||{}).username;if(!un||seen.has(un))continue;seen.add(un);
        setStatus('@'+un);setProgress(30+(enrichedCount/maxR)*68);
        $('igm-counter').textContent=enrichedCount;
        try{var p=await enrichUser(un);if(p){enrichedCount++;results.push(p);$('igm-counter').textContent=enrichedCount;render();}}catch(e2){}
        await sleep(350);
      }
    }catch(e){setStatus('Erreur sur "'+q+'" — on continue...');}
    await sleep(500);
  }
  addToSeen(results.map(function(p){return p.username;}));updateSeenCount();
  searching=false;
  $('igm-stop').style.display='none';$('igm-go').disabled=false;$('igm-go').style.opacity='1';
  setProgress(100);
  var f=applyFilters(results);
  var msg='Termin\u00e9 \u2014 '+enrichedCount+' monteurs trouv\u00e9s';
  if(enrichedCount<maxR)msg+=' (maximum atteint pour cette recherche)';
  setStatus(msg);
  if(results.length)$('igm-csv').style.display='block';
};

$('igm-stop').onclick=function(){searching=false;setStatus('Arr\u00eat\u00e9.');};

function buildCSV(list){
  var BOM='\uFEFF';
  var lines=['Username,Nom,Abonn\u00e9s,Bio,Email,T\u00e9l\u00e9phone,Site,Score,Instagram'];
  list.forEach(function(p){
    function q(s){return '"'+(String(s||'')).replace(/"/g,'""').replace(/\n/g,' ')+'"';}
    lines.push([q(p.username),q(p.name),p.followers,q(p.bio),q((p.emails||[]).join('; ')),q((p.phones||[]).join('; ')),q(p.extUrl),calcScore(p),'https://www.instagram.com/'+p.username+'/'].join(','));
  });
  return BOM+lines.join('\n');
}
$('igm-csv').onclick=function(){
  var sorted=applySort(applyFilters(results));
  var blob=new Blob([buildCSV(sorted)],{type:'text/csv;charset=utf-8'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='monteurs_video_'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
};

$('igm-sort').onchange=function(){render();};
render();
})();
