(function(){
if(!location.hostname.includes('instagram.com')){alert('Ouvre ce bookmarklet sur instagram.com');return;}
if(document.getElementById('igm-overlay')){document.getElementById('igm-overlay').remove();return;}

// ── Helpers ──
function extractEmails(text){return(text||'').match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)||[];}
function extractPhones(text){var raw=(text||'').match(/(?:\+?\d{1,4}[\s\-.]?)?\(?\d{1,4}\)?[\s\-.]?\d{2,4}[\s\-.]?\d{2,4}[\s\-.]?\d{0,4}/g)||[];return raw.filter(function(p){return p.replace(/\D/g,'').length>=7;});}
function igfetch(url){return fetch(url,{headers:{'X-IG-App-ID':'936619743392459','X-Requested-With':'XMLHttpRequest','X-ASBD-ID':'129477'},credentials:'include'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();});}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms);})}
function fmtNum(n){return n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'k':String(n);}
function escHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function escAttr(s){return escHtml(s).replace(/'/g,'&#39;');}

// ── Queries (monteurs video uniquement) ──
var QUERIES=[
  'monteur video','video editor','montage video','editeur video','monteur freelance',
  'post production','motion designer','montage youtube','montage tiktok','montage reels',
  'monteur professionnel','editing freelance',
  'monteur video paris','monteur video lyon','monteur video marseille',
  'monteur video bordeaux','monteur video lille','monteur video toulouse',
  'monteur video nantes','monteur video nice','monteur video strasbourg',
  'monteur video rennes','monteur video grenoble',
  'monteur video geneve','monteur video lausanne','monteur video bruxelles',
  'monteur video montreal',
  'video editor paris','video editor lyon','video editor marseille',
  'montage youtube freelance','montage tiktok freelance',
  'monteur video freelance','editing freelance france'
];

// ── Build overlay ──
var ov=document.createElement('div');
ov.id='igm-overlay';
ov.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(8,8,15,.7);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);overflow-y:auto;font-family:-apple-system,BlinkMacSystemFont,"Inter",sans-serif;animation:igmFadeIn .3s ease;';

// Inject styles
var styleEl=document.createElement('style');
styleEl.textContent='@keyframes igmFadeIn{from{opacity:0}to{opacity:1}}@keyframes igmSlideDown{from{opacity:0;transform:translateY(-6px);max-height:0}to{opacity:1;transform:translateY(0);max-height:2000px}}@keyframes igmSpin{to{transform:rotate(360deg)}}.igm-card{transition:all .25s ease}.igm-card:hover{background:rgba(255,255,255,.03)!important;border-color:rgba(225,48,108,.3)!important}.igm-btn-action{transition:all .15s ease}.igm-btn-action:hover{transform:translateY(-1px);filter:brightness(1.15)}.igm-btn-action:active{transform:translateY(0)}.igm-expand{animation:igmSlideDown .35s ease;overflow:hidden}.igm-spinner{width:14px;height:14px;border:2px solid rgba(225,48,108,.2);border-top-color:#E1306C;border-radius:50%;animation:igmSpin .8s linear infinite;display:inline-block;vertical-align:middle}#igm-overlay::-webkit-scrollbar{width:10px}#igm-overlay::-webkit-scrollbar-track{background:#0a0a0f}#igm-overlay::-webkit-scrollbar-thumb{background:#2a2a38;border-radius:5px}#igm-overlay::-webkit-scrollbar-thumb:hover{background:#3a3a48}';
document.head.appendChild(styleEl);

ov.innerHTML='<div style="max-width:920px;margin:0 auto;padding:24px 18px 60px">'+

// Header
'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:22px">'+
'  <div>'+
'    <div style="font-size:24px;font-weight:900;letter-spacing:-.5px;line-height:1">'+
'      <span style="background:linear-gradient(135deg,#E1306C,#F77737);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Monteur Video</span>'+
'      <span style="color:#fff"> Finder</span>'+
'    </div>'+
'    <div style="font-size:12px;color:#9090a8;margin-top:4px">Trouve des monteurs video freelance + extrais leur audience</div>'+
'  </div>'+
'  <button id="igm-close" style="background:none;border:1.5px solid #2a2a38;color:#e0e0f0;font-size:24px;cursor:pointer;width:44px;height:44px;border-radius:12px;transition:all .15s ease" onmouseover="this.style.borderColor=\'#E1306C\';this.style.color=\'#E1306C\'" onmouseout="this.style.borderColor=\'#2a2a38\';this.style.color=\'#e0e0f0\'">&times;</button>'+
'</div>'+

// Status / progress card
'<div id="igm-status-wrap" style="background:linear-gradient(135deg,rgba(225,48,108,.06),rgba(247,119,55,.04));border:1px solid rgba(225,48,108,.18);border-radius:14px;padding:16px;margin-bottom:16px">'+
'  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'+
'    <div id="igm-status" style="font-size:13px;color:#e0e0f0;font-weight:600">Initialisation...</div>'+
'    <div style="display:flex;align-items:center;gap:10px">'+
'      <div id="igm-counter" style="font-size:22px;font-weight:900;background:linear-gradient(135deg,#E1306C,#F77737);-webkit-background-clip:text;-webkit-text-fill-color:transparent">0</div>'+
'      <button id="igm-stop" style="padding:7px 14px;background:#1a1a24;border:1.5px solid #ff4444;color:#ff4444;font-size:11px;font-weight:700;border-radius:8px;cursor:pointer">\u23F9 Stop</button>'+
'    </div>'+
'  </div>'+
'  <div style="height:5px;background:rgba(255,255,255,.05);border-radius:3px;overflow:hidden"><div id="igm-bar" style="height:100%;width:0;background:linear-gradient(90deg,#E1306C,#F77737);transition:width .4s;border-radius:3px"></div></div>'+
'</div>'+

// Stats bar
'<div id="igm-stats" style="display:none;gap:10px;margin-bottom:16px;flex-wrap:wrap">'+
'  <div style="flex:1;min-width:120px;background:#111118;border:1px solid #2a2a38;border-radius:12px;padding:14px"><div style="font-size:10px;color:#9090a8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;font-weight:600">Monteurs</div><div id="igm-stat-total" style="font-size:24px;font-weight:900;color:#E1306C">0</div></div>'+
'  <div style="flex:1;min-width:120px;background:#111118;border:1px solid #2a2a38;border-radius:12px;padding:14px"><div style="font-size:10px;color:#9090a8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;font-weight:600">Avec email</div><div id="igm-stat-email" style="font-size:24px;font-weight:900;color:#00d084">0</div></div>'+
'  <div style="flex:1;min-width:120px;background:#111118;border:1px solid #2a2a38;border-radius:12px;padding:14px"><div style="font-size:10px;color:#9090a8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;font-weight:600">Avec site</div><div id="igm-stat-site" style="font-size:24px;font-weight:900;color:#F77737">0</div></div>'+
'</div>'+

// Action buttons (CSV)
'<div style="display:flex;gap:10px;margin-bottom:14px">'+
'  <button id="igm-csv" style="padding:11px 18px;background:#1a1a24;border:1.5px solid #00d084;color:#00d084;font-size:12px;font-weight:700;border-radius:10px;cursor:pointer;display:none;transition:all .15s ease" onmouseover="this.style.background=\'rgba(0,208,132,.1)\'" onmouseout="this.style.background=\'#1a1a24\'">\u2B07 Telecharger CSV</button>'+
'</div>'+

// Cards container
'<div id="igm-cards" style="display:flex;flex-direction:column;gap:10px"></div>'+

'</div>';

document.body.appendChild(ov);

var $=function(id){return document.getElementById(id);};
$('igm-close').onclick=function(){ov.remove();styleEl.remove();};

// ── State ──
var monteurs=[]; // search results
var searching=false;
var expandedKey=null; // currently expanded row key (username + action)

function setStatus(m){$('igm-status').textContent=m;}
function setProgress(p){$('igm-bar').style.width=Math.min(100,p)+'%';}
function setCounter(n){$('igm-counter').textContent=n;}

// ── Enrich profile ──
async function enrichUser(un){
  try{
    var pd=await igfetch('https://www.instagram.com/api/v1/users/web_profile_info/?username='+encodeURIComponent(un));
    var usr=pd&&pd.data&&pd.data.user;if(!usr)return null;
    var bio=usr.biography||'';
    var emails=extractEmails(bio);var phones=extractPhones(bio);
    if(usr.business_email&&emails.indexOf(usr.business_email)===-1)emails.push(usr.business_email);
    if(usr.business_phone_number&&phones.indexOf(usr.business_phone_number)===-1)phones.push(usr.business_phone_number);
    return{
      username:un,
      name:usr.full_name||'',
      userId:usr.id||'',
      followers:usr.edge_followed_by?usr.edge_followed_by.count:0,
      bio:bio.substring(0,200),
      extUrl:usr.external_url||'',
      biz:!!usr.is_business_account,
      verified:!!usr.is_verified,
      emails:emails,
      phones:phones,
      profilePic:usr.profile_pic_url_hd||usr.profile_pic_url||'',
    };
  }catch(e){return null;}
}

function calcScore(p){
  var s=0;
  if(p.emails&&p.emails.length)s+=4;
  if(p.phones&&p.phones.length)s+=2;
  if(p.extUrl)s+=2;
  if(p.biz)s+=1;
  if(p.followers>=100&&p.followers<=100000)s+=1;
  return Math.min(10,s);
}

function updateStats(){
  $('igm-stats').style.display='flex';
  $('igm-stat-total').textContent=monteurs.length;
  $('igm-stat-email').textContent=monteurs.filter(function(p){return p.emails&&p.emails.length;}).length;
  $('igm-stat-site').textContent=monteurs.filter(function(p){return!!p.extUrl;}).length;
}

// ── Render monteur cards ──
function renderCards(){
  updateStats();
  var box=$('igm-cards');box.innerHTML='';
  if(!monteurs.length){
    box.innerHTML='<div style="background:#111118;border:1px dashed #2a2a38;border-radius:14px;padding:30px;text-align:center;color:#9090a8;font-size:13px">Aucun monteur trouve. Recherche en cours...</div>';
    return;
  }
  var sorted=monteurs.slice().sort(function(a,b){return calcScore(b)-calcScore(a);});
  sorted.forEach(function(p,i){
    var card=document.createElement('div');
    card.className='igm-card';
    card.style.cssText='background:#111118;border:1.5px solid #1f1f2c;border-radius:14px;overflow:hidden';

    var sc=calcScore(p);
    var scColor=sc>=7?'#00d084':sc>=4?'#F77737':'#9090a8';
    var scBg=sc>=7?'rgba(0,208,132,.12)':sc>=4?'rgba(247,119,55,.12)':'rgba(144,144,168,.1)';

    var pic=p.profilePic?'<img src="'+escAttr(p.profilePic)+'" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid #2a2a38;flex-shrink:0" onerror="this.style.display=\'none\'">':'<div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#E1306C,#F77737);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:18px;flex-shrink:0">'+escHtml((p.username||'?').charAt(0).toUpperCase())+'</div>';

    var contact='';
    if(p.emails&&p.emails.length)contact+='<span style="color:#00d084;font-size:11px;display:inline-flex;align-items:center;gap:3px;margin-right:8px">\u2709 '+escHtml(p.emails[0])+'</span>';
    if(p.phones&&p.phones.length)contact+='<span style="color:#d0d0e0;font-size:11px;display:inline-flex;align-items:center;gap:3px;margin-right:8px">\uD83D\uDCDE '+escHtml(p.phones[0])+'</span>';
    if(p.extUrl)contact+='<a href="'+escAttr(p.extUrl)+'" target="_blank" style="color:#F77737;font-size:11px;text-decoration:none;display:inline-flex;align-items:center;gap:3px">\uD83C\uDF10 Site</a>';

    card.innerHTML=
      '<div style="display:flex;align-items:center;gap:14px;padding:14px 16px">'+
        '<div style="color:#3a3a48;font-size:11px;font-weight:700;width:22px">'+(i+1)+'</div>'+
        pic+
        '<div style="flex:1;min-width:0">'+
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'+
            '<a href="https://www.instagram.com/'+p.username+'/" target="_blank" style="color:#fff;font-weight:700;text-decoration:none;font-size:14px">@'+p.username+'</a>'+
            (p.verified?'<span style="color:#0095f6">\u2713</span>':'')+
            (p.biz?'<span style="background:rgba(255,215,0,.15);color:#ffd700;font-size:9px;padding:2px 7px;border-radius:10px;font-weight:700">PRO</span>':'')+
          '</div>'+
          '<div style="font-size:11px;color:#9090a8;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(p.name||'')+'</div>'+
          (contact?'<div style="margin-top:6px">'+contact+'</div>':'')+
        '</div>'+
        '<div style="text-align:right;flex-shrink:0">'+
          '<div style="font-size:15px;font-weight:800;color:#E1306C">'+fmtNum(p.followers)+'</div>'+
          '<div style="font-size:9px;color:#9090a8;text-transform:uppercase;letter-spacing:.05em;font-weight:600">abonnes</div>'+
        '</div>'+
        '<div style="background:'+scBg+';color:'+scColor+';font-size:14px;font-weight:800;padding:8px 12px;border-radius:10px;flex-shrink:0;min-width:48px;text-align:center">'+sc+'<span style="font-size:9px;opacity:.7">/10</span></div>'+
      '</div>'+
      // Action bar
      '<div style="display:flex;gap:6px;padding:0 16px 14px 16px">'+
        '<button class="igm-btn-action" data-action="followers" data-user="'+escAttr(p.username)+'" data-uid="'+escAttr(p.userId)+'" style="flex:1;padding:10px;background:linear-gradient(135deg,rgba(225,48,108,.18),rgba(247,119,55,.12));border:1px solid rgba(225,48,108,.4);color:#E1306C;font-size:11px;font-weight:800;border-radius:9px;cursor:pointer">\uD83D\uDC65 Abonnes</button>'+
        '<button class="igm-btn-action" data-action="comments" data-user="'+escAttr(p.username)+'" data-uid="'+escAttr(p.userId)+'" style="flex:1;padding:10px;background:linear-gradient(135deg,rgba(247,119,55,.18),rgba(252,175,69,.12));border:1px solid rgba(247,119,55,.4);color:#F77737;font-size:11px;font-weight:800;border-radius:9px;cursor:pointer">\uD83D\uDCAC Commentateurs</button>'+
        '<button class="igm-btn-action" data-action="likers" data-user="'+escAttr(p.username)+'" data-uid="'+escAttr(p.userId)+'" style="flex:1;padding:10px;background:linear-gradient(135deg,rgba(252,175,69,.18),rgba(255,215,0,.12));border:1px solid rgba(252,175,69,.4);color:#FCAF45;font-size:11px;font-weight:800;border-radius:9px;cursor:pointer">\u2764\uFE0F Likers</button>'+
      '</div>'+
      // Inline expansion zone (empty by default)
      '<div id="igm-expand-'+escAttr(p.username)+'" class="igm-expand-zone" style="display:none"></div>';

    box.appendChild(card);
  });

  // Bind action buttons
  box.querySelectorAll('.igm-btn-action').forEach(function(btn){
    btn.onclick=function(){
      var action=this.getAttribute('data-action');
      var user=this.getAttribute('data-user');
      var uid=this.getAttribute('data-uid');
      toggleExpand(action,user,uid,this);
    };
  });
}

// ── Expand / collapse inline ──
function getExpandZone(username){return document.getElementById('igm-expand-'+username);}

function collapseAll(){
  document.querySelectorAll('.igm-expand-zone').forEach(function(z){z.style.display='none';z.innerHTML='';});
  expandedKey=null;
}

async function toggleExpand(action,user,uid,btn){
  var key=user+':'+action;
  if(expandedKey===key){
    collapseAll();
    return;
  }
  collapseAll();
  expandedKey=key;
  var zone=getExpandZone(user);
  if(!zone)return;
  zone.style.display='block';
  zone.className='igm-expand-zone igm-expand';
  zone.innerHTML='<div style="padding:0 16px 16px 16px">'+
    '<div style="background:#0a0a0f;border:1px solid #2a2a38;border-radius:12px;padding:14px">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'+
        '<div style="display:flex;align-items:center;gap:8px">'+
          '<div class="igm-spinner"></div>'+
          '<div id="igm-exp-status-'+user+'" style="font-size:12px;color:#d0d0e0;font-weight:600">Demarrage...</div>'+
        '</div>'+
        '<div id="igm-exp-counter-'+user+'" style="font-size:16px;font-weight:800;color:#E1306C">0</div>'+
      '</div>'+
      '<div style="height:4px;background:#1a1a24;border-radius:2px;overflow:hidden;margin-bottom:12px"><div id="igm-exp-bar-'+user+'" style="height:100%;width:0;background:linear-gradient(90deg,#E1306C,#F77737);transition:width .4s"></div></div>'+
      '<div id="igm-exp-list-'+user+'" style="display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow-y:auto"></div>'+
    '</div>'+
  '</div>';
  await runExtraction(action,user,uid);
}

function expSetStatus(user,m){var el=document.getElementById('igm-exp-status-'+user);if(el)el.textContent=m;}
function expSetCounter(user,n){var el=document.getElementById('igm-exp-counter-'+user);if(el)el.textContent=n;}
function expSetProgress(user,p){var el=document.getElementById('igm-exp-bar-'+user);if(el)el.style.width=Math.min(100,p)+'%';}

function expRenderList(user,list){
  var listEl=document.getElementById('igm-exp-list-'+user);if(!listEl)return;
  listEl.innerHTML='';
  var sorted=list.slice().sort(function(a,b){return calcScore(b)-calcScore(a);});
  sorted.forEach(function(p,i){
    var sc=calcScore(p);
    var scColor=sc>=7?'#00d084':sc>=4?'#F77737':'#9090a8';
    var pic=p.profilePic?'<img src="'+escAttr(p.profilePic)+'" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:1.5px solid #2a2a38;flex-shrink:0" onerror="this.style.display=\'none\'">':'<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#E1306C,#F77737);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;flex-shrink:0">'+escHtml((p.username||'?').charAt(0).toUpperCase())+'</div>';
    var contact='';
    if(p.emails&&p.emails.length)contact+='<span style="color:#00d084;font-size:10px">\u2709 '+escHtml(p.emails[0])+'</span> ';
    if(p.extUrl)contact+='<a href="'+escAttr(p.extUrl)+'" target="_blank" style="color:#F77737;font-size:10px;text-decoration:none">\uD83C\uDF10</a>';
    var sourcePost='';
    if(p.sourcePosts&&p.sourcePosts.length){
      sourcePost='<a href="https://www.instagram.com/p/'+p.sourcePosts[0]+'/" target="_blank" style="font-size:9px;color:#9090a8;text-decoration:none">\uD83D\uDCCC '+(p.sourcePosts.length>1?p.sourcePosts.length+' posts':'1 post')+'</a>';
    }
    var row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:10px;padding:8px 10px;background:#111118;border:1px solid #1a1a24;border-radius:9px';
    row.innerHTML=
      '<div style="color:#3a3a48;font-size:10px;font-weight:700;width:22px;text-align:right">'+(i+1)+'</div>'+
      pic+
      '<div style="flex:1;min-width:0">'+
        '<a href="https://www.instagram.com/'+p.username+'/" target="_blank" style="color:#E1306C;font-weight:700;font-size:12px;text-decoration:none">@'+p.username+'</a>'+
        '<div style="font-size:10px;color:#9090a8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(p.name||'')+'</div>'+
        (contact?'<div style="margin-top:2px">'+contact+'</div>':'')+
        (sourcePost?'<div>'+sourcePost+'</div>':'')+
      '</div>'+
      '<div style="color:#E1306C;font-weight:700;font-size:11px;white-space:nowrap">'+fmtNum(p.followers)+'</div>'+
      '<div style="color:'+scColor+';font-weight:800;font-size:12px;width:32px;text-align:right">'+sc+'</div>';
    listEl.appendChild(row);
  });
}

// ── Get user posts ──
async function getUserPosts(userId,maxPosts){
  maxPosts=maxPosts||10;
  try{
    var d=await igfetch('https://www.instagram.com/api/v1/feed/user/'+userId+'/?count='+maxPosts);
    return(d.items||[]).map(function(m){
      return{
        id:m.id||(m.pk?String(m.pk):''),
        shortcode:m.code||'',
      };
    }).filter(function(p){return!!p.id;});
  }catch(e){return [];}
}

// ── Get user_id ──
async function getUserId(username,fallback){
  if(fallback)return fallback;
  try{
    var pd=await igfetch('https://www.instagram.com/api/v1/users/web_profile_info/?username='+encodeURIComponent(username));
    var usr=pd&&pd.data&&pd.data.user;
    return usr?usr.id:null;
  }catch(e){return null;}
}

// ── Extract followers ──
async function fetchFollowersList(username,userId){
  var collected=[];var seen={};var maxIdParam='';var page=0;
  while(searching&&collected.length<150&&page<12){
    page++;
    try{
      var url='https://www.instagram.com/api/v1/friendships/'+userId+'/followers/?count=50';
      if(maxIdParam)url+='&max_id='+encodeURIComponent(maxIdParam);
      var fd=await igfetch(url);
      var batch=fd.users||[];
      if(!batch.length)break;
      batch.forEach(function(u){if(u.username&&!seen[u.username]){seen[u.username]=true;collected.push({username:u.username,sourcePosts:[]});}});
      expSetStatus(username,collected.length+' abonnes collectes...');
      expSetProgress(username,5+(collected.length/150)*30);
      if(fd.next_max_id)maxIdParam=fd.next_max_id;else break;
      await sleep(900);
    }catch(e){expSetStatus(username,'Acces limite');break;}
  }
  return collected;
}

// ── Extract commenters from all posts ──
async function fetchCommentersList(username,userId){
  var posts=await getUserPosts(userId,8);
  if(!posts.length){expSetStatus(username,'Aucun post');return [];}
  expSetStatus(username,posts.length+' posts \u2014 extraction...');
  var collected={};
  for(var i=0;i<posts.length;i++){
    if(!searching)break;
    var post=posts[i];
    expSetStatus(username,'Post '+(i+1)+'/'+posts.length+' \u2014 commentaires');
    expSetProgress(username,5+((i+1)/posts.length)*30);
    var minId='',atts=0;
    while(atts<3){
      atts++;
      try{
        var url='https://www.instagram.com/api/v1/media/'+post.id+'/comments/?can_support_threading=true&permalink_enabled=false';
        if(minId)url+='&min_id='+encodeURIComponent(minId);
        var d=await igfetch(url);
        var comments=d.comments||[];
        if(!comments.length)break;
        comments.forEach(function(c){
          var un=c.user&&c.user.username;
          if(un){
            if(!collected[un])collected[un]={username:un,sourcePosts:[]};
            if(post.shortcode&&collected[un].sourcePosts.indexOf(post.shortcode)===-1)collected[un].sourcePosts.push(post.shortcode);
          }
        });
        if(d.next_min_id)minId=d.next_min_id;else break;
        await sleep(700);
      }catch(e){break;}
    }
    expSetCounter(username,Object.keys(collected).length);
    await sleep(500);
  }
  return Object.keys(collected).map(function(k){return collected[k];});
}

// ── Extract likers from all posts ──
async function fetchLikersList(username,userId){
  var posts=await getUserPosts(userId,8);
  if(!posts.length){expSetStatus(username,'Aucun post');return [];}
  expSetStatus(username,posts.length+' posts \u2014 extraction...');
  var collected={};
  for(var i=0;i<posts.length;i++){
    if(!searching)break;
    var post=posts[i];
    expSetStatus(username,'Post '+(i+1)+'/'+posts.length+' \u2014 likers');
    expSetProgress(username,5+((i+1)/posts.length)*30);
    try{
      var d=await igfetch('https://www.instagram.com/api/v1/media/'+post.id+'/likers/');
      (d.users||[]).forEach(function(u){
        if(u.username){
          if(!collected[u.username])collected[u.username]={username:u.username,sourcePosts:[]};
          if(post.shortcode&&collected[u.username].sourcePosts.indexOf(post.shortcode)===-1)collected[u.username].sourcePosts.push(post.shortcode);
        }
      });
    }catch(e){}
    expSetCounter(username,Object.keys(collected).length);
    await sleep(800);
  }
  return Object.keys(collected).map(function(k){return collected[k];});
}

// ── Run extraction with inline display ──
async function runExtraction(action,username,userIdHint){
  if(searching)return;
  searching=true;

  expSetStatus(username,'Recuperation du profil...');
  expSetProgress(username,3);
  var userId=await getUserId(username,userIdHint);
  if(!userId){expSetStatus(username,'\u274C Profil introuvable');searching=false;return;}

  var rawList=[];
  if(action==='followers')rawList=await fetchFollowersList(username,userId);
  else if(action==='comments')rawList=await fetchCommentersList(username,userId);
  else if(action==='likers')rawList=await fetchLikersList(username,userId);

  if(!rawList.length){
    expSetStatus(username,'\u26A0 Aucun resultat (compte prive ou Instagram a limite)');
    searching=false;
    return;
  }

  // Enrich
  var enriched=[];
  var max=Math.min(rawList.length,150);
  for(var i=0;i<rawList.length&&i<max;i++){
    if(!searching)break;
    var item=rawList[i];
    expSetStatus(username,'Analyse @'+item.username+' ('+(i+1)+'/'+max+')');
    expSetProgress(username,35+(i/max)*60);
    var p=await enrichUser(item.username);
    if(p){
      p.sourcePosts=item.sourcePosts||[];
      enriched.push(p);
      expSetCounter(username,enriched.length);
      expRenderList(username,enriched);
    }
    await sleep(380);
  }

  searching=false;
  expSetProgress(username,100);
  var label=action==='followers'?'abonnes':(action==='comments'?'commentateurs':'likers');
  expSetStatus(username,'\u2705 '+enriched.length+' '+label);
}

// ── Auto-search monteurs at startup ──
async function autoSearchMonteurs(){
  searching=true;
  setStatus('Recherche de monteurs video...');setProgress(2);setCounter(0);
  var seen={};
  for(var qi=0;qi<QUERIES.length;qi++){
    if(!searching||monteurs.length>=40)break;
    var q=QUERIES[qi];
    setStatus('Recherche : "'+q+'" \u2014 '+monteurs.length+' trouves');
    setProgress(2+(qi/QUERIES.length)*25);
    try{
      var d=await igfetch('https://www.instagram.com/api/v1/web/search/topsearch/?context=blended&query='+encodeURIComponent(q)+'&include_reel=false');
      var users=d.users||[];
      for(var ui=0;ui<users.length&&monteurs.length<40;ui++){
        if(!searching)break;
        var u=users[ui].user||{};
        var un=u.username;if(!un||seen[un])continue;seen[un]=true;
        setStatus('Analyse @'+un+'...');setProgress(25+(monteurs.length/40)*70);
        var p=await enrichUser(un);
        if(p){
          monteurs.push(p);
          setCounter(monteurs.length);
          renderCards();
        }
        await sleep(350);
      }
    }catch(e){}
    await sleep(500);
  }
  searching=false;
  setProgress(100);
  setStatus('\u2705 '+monteurs.length+' monteurs trouves \u2014 Clique sur les boutons pour extraire leur audience');
  if(monteurs.length)$('igm-csv').style.display='inline-block';
}

$('igm-stop').onclick=function(){searching=false;setStatus('Arrete.');};

// ── CSV export ──
$('igm-csv').onclick=function(){
  if(!monteurs.length)return;
  var BOM='\uFEFF';
  var lines=['Username,Nom,Abonnes,Bio,Email,Telephone,Site,Score,URL Instagram'];
  var sorted=monteurs.slice().sort(function(a,b){return calcScore(b)-calcScore(a);});
  sorted.forEach(function(p){
    function q(s){return '"'+(String(s||'')).replace(/"/g,'""').replace(/\n/g,' ')+'"';}
    lines.push([q(p.username),q(p.name),p.followers,q(p.bio),q((p.emails||[]).join('; ')),q((p.phones||[]).join('; ')),q(p.extUrl),calcScore(p),'https://www.instagram.com/'+p.username+'/'].join(','));
  });
  var csv=BOM+lines.join('\n');
  var blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='monteurs_video_'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
};

// Auto-start
autoSearchMonteurs();

})();
