(function(){
if(!location.hostname.includes('instagram.com')){alert('Ouvre ce bookmarklet sur instagram.com');return;}
if(document.getElementById('igf-overlay')){document.getElementById('igf-overlay').remove();return;}

// ── Build overlay ──
var ov=document.createElement('div');
ov.id='igf-overlay';
ov.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.96);overflow-y:auto;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';

ov.innerHTML='<div style="max-width:960px;margin:0 auto;padding:16px">'+
'<!-- Header -->'+
'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid #2a2a38">'+
'  <div>'+
'    <div style="font-size:20px;font-weight:800;letter-spacing:-.5px">'+
'      <span style="background:linear-gradient(135deg,#E1306C,#F77737);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Instagram</span>'+
'      <span style="color:#e0e0f0"> Finder</span>'+
'    </div>'+
'    <div style="font-size:11px;color:#5a5a70;margin-top:2px">Empire Leads \u2014 aucune API, 0 co\u00fbt</div>'+
'  </div>'+
'  <button id="igf-close" style="background:none;border:1px solid #2a2a38;color:#9090a8;font-size:22px;cursor:pointer;width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;transition:all .2s">&times;</button>'+
'</div>'+
'<!-- Niche row -->'+
'<div style="display:flex;gap:8px;margin-bottom:12px;align-items:stretch">'+
'  <input id="igf-niche" placeholder="monteur video, coach sportif, magasin manga..."'+
'    style="flex:1;min-width:0;padding:13px 15px;background:#111118;border:1.5px solid #2a2a38;border-radius:10px;color:#e0e0f0;font-size:15px;outline:none">'+
'  <button id="igf-voice" title="Recherche vocale"'+
'    style="width:46px;min-height:46px;border-radius:10px;border:1.5px solid #E1306C;background:rgba(225,48,108,.1);color:#E1306C;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">\uD83C\uDF99</button>'+
'</div>'+
'<!-- Filters -->'+
'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'+
'  <div style="display:flex;flex-direction:column;gap:4px">'+
'    <label style="font-size:10px;color:#5a5a70;text-transform:uppercase;letter-spacing:.05em;font-weight:600">Min abonn\u00e9s</label>'+
'    <input id="igf-min" type="number" value="0" style="width:100px;padding:9px 11px;background:#111118;border:1.5px solid #2a2a38;border-radius:8px;color:#e0e0f0;font-size:14px;outline:none">'+
'  </div>'+
'  <div style="display:flex;flex-direction:column;gap:4px">'+
'    <label style="font-size:10px;color:#5a5a70;text-transform:uppercase;letter-spacing:.05em;font-weight:600">Max abonn\u00e9s</label>'+
'    <input id="igf-max" type="number" value="100000" style="width:110px;padding:9px 11px;background:#111118;border:1.5px solid #2a2a38;border-radius:8px;color:#e0e0f0;font-size:14px;outline:none">'+
'  </div>'+
'  <div style="display:flex;flex-direction:column;gap:4px">'+
'    <label style="font-size:10px;color:#5a5a70;text-transform:uppercase;letter-spacing:.05em;font-weight:600">R\u00e9sultats</label>'+
'    <input id="igf-count" type="number" value="50" style="width:80px;padding:9px 11px;background:#111118;border:1.5px solid #2a2a38;border-radius:8px;color:#e0e0f0;font-size:14px;outline:none">'+
'  </div>'+
'  <div style="display:flex;flex-direction:column;gap:4px">'+
'    <label style="font-size:10px;color:#5a5a70;text-transform:uppercase;letter-spacing:.05em;font-weight:600">Type</label>'+
'    <select id="igf-type" style="padding:9px 11px;background:#111118;border:1.5px solid #2a2a38;border-radius:8px;color:#e0e0f0;font-size:13px;outline:none;cursor:pointer">'+
'      <option value="all">Tous</option>'+
'      <option value="verified">V\u00e9rifi\u00e9s</option>'+
'      <option value="biz">Business</option>'+
'    </select>'+
'  </div>'+
'  <div style="display:flex;flex-direction:column;gap:4px">'+
'    <label style="font-size:10px;color:#5a5a70;text-transform:uppercase;letter-spacing:.05em;font-weight:600">Trier par</label>'+
'    <select id="igf-sort" style="padding:9px 11px;background:#111118;border:1.5px solid #2a2a38;border-radius:8px;color:#e0e0f0;font-size:13px;outline:none;cursor:pointer">'+
'      <option value="followers_desc">Abonn\u00e9s \u2193</option>'+
'      <option value="followers_asc">Abonn\u00e9s \u2191</option>'+
'      <option value="relevance">Pertinence</option>'+
'      <option value="name">Nom A-Z</option>'+
'    </select>'+
'  </div>'+
'</div>'+
'<!-- Action buttons -->'+
'<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px">'+
'  <button id="igf-go" style="flex:1;min-width:140px;padding:13px 22px;background:linear-gradient(135deg,#E1306C,#F77737);color:#fff;font-size:15px;font-weight:700;border:none;border-radius:10px;cursor:pointer;box-shadow:0 4px 14px rgba(225,48,108,.35)">'+
'    \uD83D\uDD0D Rechercher'+
'  </button>'+
'  <button id="igf-stop" style="padding:13px 18px;background:#1a1a24;border:1.5px solid #ff4444;color:#ff4444;font-size:14px;font-weight:600;border-radius:10px;cursor:pointer;display:none">'+
'    \u23F9 Stop'+
'  </button>'+
'  <button id="igf-csv" style="padding:13px 18px;background:#1a1a24;border:1.5px solid #00d084;color:#00d084;font-size:14px;font-weight:600;border-radius:10px;cursor:pointer;display:none">'+
'    \u2B07 Export CSV'+
'  </button>'+
'</div>'+
'<!-- Progress -->'+
'<div id="igf-prog-wrap" style="margin-bottom:12px;display:none">'+
'  <div style="height:4px;background:#1a1a24;border-radius:2px;overflow:hidden">'+
'    <div id="igf-bar" style="height:100%;width:0;background:linear-gradient(90deg,#E1306C,#F77737);transition:width .4s ease;border-radius:2px"></div>'+
'  </div>'+
'  <div id="igf-status" style="font-size:13px;color:#9090a8;margin-top:6px;min-height:18px"></div>'+
'</div>'+
'<!-- Stats -->'+
'<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">'+
'  <div style="flex:1;min-width:110px;background:#111118;border:1px solid #2a2a38;border-radius:10px;padding:10px 14px">'+
'    <div style="font-size:10px;color:#5a5a70;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Total trouv\u00e9</div>'+
'    <div id="igf-stat-total" style="font-size:20px;font-weight:700;color:#E1306C">0</div>'+
'  </div>'+
'  <div style="flex:1;min-width:110px;background:#111118;border:1px solid #2a2a38;border-radius:10px;padding:10px 14px">'+
'    <div style="font-size:10px;color:#5a5a70;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Apr\u00e8s filtres</div>'+
'    <div id="igf-stat-filt" style="font-size:20px;font-weight:700;color:#e0e0f0">0</div>'+
'  </div>'+
'  <div style="flex:1;min-width:110px;background:#111118;border:1px solid #2a2a38;border-radius:10px;padding:10px 14px">'+
'    <div style="font-size:10px;color:#5a5a70;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Moy. abonn\u00e9s</div>'+
'    <div id="igf-stat-avg" style="font-size:20px;font-weight:700;color:#e0e0f0">0</div>'+
'  </div>'+
'</div>'+
'<!-- Table -->'+
'<div style="overflow-x:auto;border-radius:10px;border:1px solid #2a2a38">'+
'  <table id="igf-table" style="width:100%;border-collapse:collapse;min-width:580px">'+
'    <thead>'+
'      <tr style="background:#111118">'+
'        <th style="padding:10px 12px;text-align:left;font-size:10px;color:#5a5a70;text-transform:uppercase;letter-spacing:.06em;width:36px">#</th>'+
'        <th id="igf-th-profile" style="padding:10px 12px;text-align:left;font-size:10px;color:#5a5a70;text-transform:uppercase;letter-spacing:.06em;cursor:pointer;white-space:nowrap">Profil</th>'+
'        <th id="igf-th-followers" style="padding:10px 12px;text-align:left;font-size:10px;color:#E1306C;text-transform:uppercase;letter-spacing:.06em;cursor:pointer;white-space:nowrap">Abonn\u00e9s \u2193</th>'+
'        <th style="padding:10px 12px;text-align:left;font-size:10px;color:#5a5a70;text-transform:uppercase;letter-spacing:.06em">Bio</th>'+
'        <th style="padding:10px 12px;text-align:left;font-size:10px;color:#5a5a70;text-transform:uppercase;letter-spacing:.06em">Lien</th>'+
'      </tr>'+
'    </thead>'+
'    <tbody id="igf-body"></tbody>'+
'  </table>'+
'</div>'+
'</div>';

document.body.appendChild(ov);
document.getElementById('igf-close').onclick=function(){ov.remove()};

// ── State ──
var results=[];
var enrichedCount=0;
var searching=false;
var sortKey='followers_desc';

// ── Utils ──
function igfetch(url){
  return fetch(url,{headers:{'X-IG-App-ID':'936619743392459','X-Requested-With':'XMLHttpRequest'},credentials:'include'}).then(function(r){
    if(!r.ok)throw new Error('HTTP '+r.status);
    return r.json();
  });
}
function setStatus(m){var el=document.getElementById('igf-status');if(el)el.textContent=m;}
function setProgress(p){
  var w=document.getElementById('igf-prog-wrap');
  var b=document.getElementById('igf-bar');
  if(w)w.style.display='block';
  if(b)b.style.width=Math.min(100,p)+'%';
}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms);})}
function fmtNum(n){return n>=1000000?(n/1000000).toFixed(1)+'M':n>=1000?(n/1000).toFixed(1)+'k':String(n);}

function applySort(arr){
  var s=document.getElementById('igf-sort');
  var key=s?s.value:sortKey;
  var copy=arr.slice();
  if(key==='followers_desc')copy.sort(function(a,b){return b.followers-a.followers});
  else if(key==='followers_asc')copy.sort(function(a,b){return a.followers-b.followers});
  else if(key==='name')copy.sort(function(a,b){return(a.name||a.username).localeCompare(b.name||b.username)});
  return copy;
}

function applyFilters(arr){
  var minF=parseInt(document.getElementById('igf-min').value)||0;
  var maxF=parseInt(document.getElementById('igf-max').value)||9999999;
  var type=document.getElementById('igf-type').value;
  return arr.filter(function(p){
    if(p.followers<minF||p.followers>maxF)return false;
    if(type==='verified'&&!p.verified)return false;
    if(type==='biz'&&!p.biz)return false;
    return true;
  });
}

function updateStats(filtered){
  document.getElementById('igf-stat-total').textContent=enrichedCount;
  document.getElementById('igf-stat-filt').textContent=filtered.length;
  var avg=filtered.length?Math.round(filtered.reduce(function(s,p){return s+p.followers},0)/filtered.length):0;
  document.getElementById('igf-stat-avg').textContent=fmtNum(avg);
}

function render(){
  var filtered=applyFilters(results);
  var sorted=applySort(filtered);
  updateStats(filtered);
  var b=document.getElementById('igf-body');
  if(!b)return;
  b.innerHTML='';
  if(sorted.length===0){
    b.innerHTML='<tr><td colspan="5" style="padding:40px;text-align:center;color:#5a5a70;font-size:14px">Aucun résultat — essaie d\'élargir les filtres</td></tr>';
    return;
  }
  sorted.forEach(function(p,i){
    var tr=document.createElement('tr');
    tr.style.cssText='border-bottom:1px solid #1a1a24;transition:background .15s';
    tr.onmouseenter=function(){tr.style.background='rgba(255,255,255,.025)'};
    tr.onmouseleave=function(){tr.style.background=''};
    var badges='';
    if(p.verified)badges+='<span style="display:inline-block;font-size:9px;padding:1px 5px;border-radius:20px;background:rgba(0,149,246,.15);color:#0095f6;margin-left:4px">✓ Vérifié</span>';
    if(p.biz)badges+='<span style="display:inline-block;font-size:9px;padding:1px 5px;border-radius:20px;background:rgba(255,215,0,.1);color:#ffd700;margin-left:4px">Pro</span>';
    tr.innerHTML=
      '<td style="padding:9px 12px;color:#5a5a70;font-size:12px">'+(i+1)+'</td>'+
      '<td style="padding:9px 12px">'+
        '<a href="https://www.instagram.com/'+p.username+'/" target="_blank" style="color:#E1306C;font-weight:600;text-decoration:none;font-size:14px">@'+p.username+'</a>'+
        badges+
        '<div style="font-size:11px;color:#5a5a70;margin-top:2px">'+escHtml(p.name)+'</div>'+
      '</td>'+
      '<td style="padding:9px 12px;color:#E1306C;font-weight:700;font-size:14px;white-space:nowrap">'+fmtNum(p.followers)+'</td>'+
      '<td style="padding:9px 12px;font-size:12px;color:#9090a8;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+escHtml(p.bio)+'">'+escHtml(p.bio)+'</td>'+
      '<td style="padding:9px 12px">'+(p.extUrl?'<a href="'+escHtml(p.extUrl)+'" target="_blank" style="color:#9090a8;font-size:12px;text-decoration:none">Site ↗</a>':'')+'</td>';
    b.appendChild(tr);
  });
}

function escHtml(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Sort headers ──
document.getElementById('igf-th-followers').onclick=function(){
  var s=document.getElementById('igf-sort');
  if(s.value==='followers_desc')s.value='followers_asc';
  else s.value='followers_desc';
  this.textContent=s.value==='followers_desc'?'Abonnés ↓':'Abonnés ↑';
  this.style.color='#E1306C';
  render();
};
document.getElementById('igf-th-profile').onclick=function(){
  document.getElementById('igf-sort').value='name';
  render();
};

// ── Voice input ──
document.getElementById('igf-voice').onclick=function(){
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){alert('Reconnaissance vocale non disponible sur ce navigateur');return;}
  var btn=this;
  var r=new SR();
  r.lang='fr-FR';
  r.interimResults=false;
  r.maxAlternatives=1;
  r.onstart=function(){btn.style.background='#E1306C';btn.style.color='#fff';btn.textContent='🔴';};
  r.onresult=function(e){
    var t=e.results[0][0].transcript;
    document.getElementById('igf-niche').value=t;
    setStatus('Vocal: "'+t+'"');
  };
  r.onerror=function(e){setStatus('Erreur micro: '+e.error);};
  r.onend=function(){btn.style.background='rgba(225,48,108,.1)';btn.style.color='#E1306C';btn.textContent='🎤';};
  r.start();
};

// ── Search ──
document.getElementById('igf-go').onclick=async function(){
  var niche=document.getElementById('igf-niche').value.trim();
  if(!niche){document.getElementById('igf-niche').focus();return;}
  if(searching)return;

  searching=true;
  results=[];
  enrichedCount=0;
  var maxR=Math.max(1,Math.min(200,parseInt(document.getElementById('igf-count').value)||50));

  document.getElementById('igf-stop').style.display='block';
  document.getElementById('igf-csv').style.display='none';
  document.getElementById('igf-go').disabled=true;
  document.getElementById('igf-go').style.opacity='.5';
  render();

  // Build query variants
  var queries=[niche];
  var words=niche.split(/\s+/);
  if(words.length>1)queries.push(words.join(''));
  var cities=['paris','lyon','marseille','bordeaux','lille','toulouse','nantes','nice','montpellier','strasbourg','rennes','grenoble','dijon','rouen','caen'];
  cities.forEach(function(c){queries.push(niche+' '+c);});
  [' freelance',' pro',' studio',' agency',' formation',' officiel',' créateur',' creator'].forEach(function(s){queries.push(niche+s);});

  var seen=new Set();

  for(var qi=0;qi<queries.length;qi++){
    if(!searching||enrichedCount>=maxR)break;
    var q=queries[qi];
    setStatus('Recherche: "'+q+'" ('+enrichedCount+'/'+maxR+')...');
    setProgress((qi/queries.length)*25);

    try{
      var d=await igfetch('https://www.instagram.com/api/v1/web/search/topsearch/?context=blended&query='+encodeURIComponent(q)+'&include_reel=false');
      var users=(d.users||[]);
      for(var ui=0;ui<users.length;ui++){
        if(!searching||enrichedCount>=maxR)break;
        var un=(users[ui].user||{}).username;
        if(!un||seen.has(un))continue;
        seen.add(un);
        setStatus('Profil '+(enrichedCount+1)+'/'+maxR+': @'+un+'...');
        setProgress(25+(enrichedCount/maxR)*72);
        try{
          var pd=await igfetch('https://www.instagram.com/api/v1/users/web_profile_info/?username='+encodeURIComponent(un));
          var usr=pd&&pd.data&&pd.data.user;
          if(!usr)continue;
          enrichedCount++;
          var followers=usr.edge_followed_by?usr.edge_followed_by.count:0;
          results.push({
            username:un,
            name:usr.full_name||'',
            followers:followers,
            following:usr.edge_follow?usr.edge_follow.count:0,
            posts:usr.edge_owner_to_timeline_media?usr.edge_owner_to_timeline_media.count:0,
            bio:(usr.biography||'').substring(0,150),
            extUrl:usr.external_url||'',
            biz:!!usr.is_business_account,
            cat:usr.business_category_name||'',
            verified:!!usr.is_verified,
          });
          render();
        }catch(e2){/* profile fetch failed */}
        await sleep(350);
      }
    }catch(e){setStatus('Erreur requête: '+e.message);}
    await sleep(500);
  }

  searching=false;
  document.getElementById('igf-stop').style.display='none';
  document.getElementById('igf-go').disabled=false;
  document.getElementById('igf-go').style.opacity='1';
  setProgress(100);
  var finalFiltered=applyFilters(results);
  setStatus('Terminé — '+enrichedCount+' profils analysés, '+finalFiltered.length+' après filtres');
  if(results.length>0)document.getElementById('igf-csv').style.display='block';
};

// ── Stop ──
document.getElementById('igf-stop').onclick=function(){searching=false;setStatus('Arrêté.');};

// ── CSV Export ──
document.getElementById('igf-csv').onclick=function(){
  var filtered=applyFilters(results);
  var sorted=applySort(filtered);
  var BOM='\uFEFF';
  var lines=['Username,Nom,Abonnés,Following,Posts,Bio,Business,Catégorie,URL externe,Instagram'];
  sorted.forEach(function(p){
    function q(s){return '"'+(String(s||'')).replace(/"/g,'""').replace(/\n/g,' ')+'"';}
    lines.push([q(p.username),q(p.name),p.followers,p.following,p.posts,q(p.bio),(p.biz?'Oui':'Non'),q(p.cat),q(p.extUrl),'https://www.instagram.com/'+p.username+'/'].join(','));
  });
  var blob=new Blob([BOM+lines.join('\n')],{type:'text/csv;charset=utf-8'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='instagram_'+document.getElementById('igf-niche').value.replace(/[^a-z0-9]/gi,'_').toLowerCase()+'_'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
};

// ── Enter key ──
document.getElementById('igf-niche').addEventListener('keydown',function(e){if(e.key==='Enter')document.getElementById('igf-go').click();});

// ── Sort change ──
document.getElementById('igf-sort').onchange=function(){render();};
document.getElementById('igf-type').onchange=function(){render();};
})();
