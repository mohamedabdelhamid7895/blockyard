/* Interactive elements (navbar, tabs, slider, lightbox, forms), the accessibility assist widget and
 * A/B test tracking: their CSS and the small scripts published sites load when a page uses them. */

export const ICONS: Record<string, string> = {
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  pin: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  play: '<path d="m7 4 13 8-13 8z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};

export const iconSVG = (name: string, size = 24) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ICONS.star}</svg>`;

/** Structural CSS for interactive elements. It targets data attributes, so classes stay free for styling. */
export const COMPONENT_CSS = `/* Components */
.sr-only { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
[data-by-skip] { position: absolute; left: 12px; top: -100px; z-index: 1000; }
[data-by-skip]:focus { top: 12px; }
:focus-visible { outline: 2px solid #146ef5; outline-offset: 2px; }
[data-by=navbar] [data-by-toggle] { display: none; align-items: center; justify-content: center; }
@media (max-width: 991px) {
  [data-by=navbar] [data-by-toggle] { display: inline-flex; }
  [data-by=navbar]:not([data-open]) [data-by-menu] { display: none; }
}
[data-by=tabs] [role=tabpanel][hidden] { display: none; }
[data-by-track] { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scroll-behavior: smooth; scrollbar-width: none; }
[data-by-track]::-webkit-scrollbar { display: none; }
[data-by-track] > * { flex: 0 0 100%; scroll-snap-align: start; }
details > summary { cursor: pointer; }
.by-lightbox-dialog { border: 0; padding: 0; background: transparent; max-width: 92vw; max-height: 92vh; }
.by-lightbox-dialog::backdrop { background: rgba(0,0,0,.85); }
.by-lightbox-dialog img { max-width: 92vw; max-height: 86vh; display: block; }
.by-lightbox-dialog button { position: fixed; top: 16px; right: 16px; background: #fff; border: 0; border-radius: 50%; width: 40px; height: 40px; font-size: 20px; cursor: pointer; }
.by-bgvideo { position: relative; overflow: hidden; }
.by-bgvideo > video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
.by-bgvideo > :not(video):not(.by-video-toggle) { position: relative; z-index: 1; }
.by-video-toggle { position: absolute; right: 12px; bottom: 12px; z-index: 2; background: rgba(0,0,0,.6); color: #fff; border: 0; border-radius: 99px; padding: 6px 12px; font: 600 12px/1 system-ui, sans-serif; cursor: pointer; }
.by-form-msg { padding: 14px 16px; border-radius: 8px; background: #e8f7ee; color: #14532d; }
.by-form-msg.error { background: #fdecec; color: #7f1d1d; }
@media (prefers-reduced-motion: reduce) { [data-by-track] { scroll-behavior: auto; } }
`;

/** Navbar toggle, tabs, slider, lightbox, background video and forms. */
export const COMPONENT_RUNTIME = `<script>
(function(){
function q(r,s){return Array.prototype.slice.call(r.querySelectorAll(s))}
function init(){
q(document,'[data-by=navbar]').forEach(function(nav){var b=nav.querySelector('[data-by-toggle]'),m=nav.querySelector('[data-by-menu]');if(!b||!m)return;
  m.id=m.id||'nav-menu-'+Math.random().toString(36).slice(2,7);b.setAttribute('aria-controls',m.id);b.setAttribute('aria-expanded','false');
  b.addEventListener('click',function(){var o=nav.hasAttribute('data-open');if(o)nav.removeAttribute('data-open');else nav.setAttribute('data-open','');b.setAttribute('aria-expanded',String(!o));b.setAttribute('aria-label',o?'Open menu':'Close menu')});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&nav.hasAttribute('data-open')){nav.removeAttribute('data-open');b.setAttribute('aria-expanded','false');b.focus()}})});
q(document,'[data-by=tabs]').forEach(function(t,ti){var tabs=q(t,'[role=tab]'),panes=q(t,'[role=tabpanel]');
  function sel(i,focus){tabs.forEach(function(x,j){x.setAttribute('aria-selected',String(i===j));x.tabIndex=i===j?0:-1;if(panes[j])panes[j].hidden=i!==j});if(focus)tabs[i].focus()}
  tabs.forEach(function(x,j){x.id=x.id||'tab-'+ti+'-'+j;if(panes[j]){panes[j].id=panes[j].id||'panel-'+ti+'-'+j;x.setAttribute('aria-controls',panes[j].id);panes[j].setAttribute('aria-labelledby',x.id);panes[j].tabIndex=0}
    x.addEventListener('click',function(e){e.preventDefault();sel(j)});
    x.addEventListener('keydown',function(e){var k=e.key,n=tabs.length;if(k==='ArrowRight'||k==='ArrowDown'){e.preventDefault();sel((j+1)%n,1)}else if(k==='ArrowLeft'||k==='ArrowUp'){e.preventDefault();sel((j-1+n)%n,1)}else if(k==='Home'){e.preventDefault();sel(0,1)}else if(k==='End'){e.preventDefault();sel(n-1,1)}})});
  var cur=tabs.findIndex(function(x){return x.getAttribute('aria-selected')==='true'});sel(cur<0?0:cur)});
q(document,'[data-by=slider]').forEach(function(s){var tr=s.querySelector('[data-by-track]');if(!tr)return;
  s.setAttribute('role','region');s.setAttribute('aria-roledescription','carousel');
  q(tr,':scope > *').forEach(function(sl,i,a){sl.setAttribute('role','group');sl.setAttribute('aria-roledescription','slide');sl.setAttribute('aria-label',(i+1)+' of '+a.length)});
  function go(d){tr.scrollBy({left:d*tr.clientWidth,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
  q(s,'[data-by-prev]').forEach(function(b){b.addEventListener('click',function(){go(-1)})});q(s,'[data-by-next]').forEach(function(b){b.addEventListener('click',function(){go(1)})});
  tr.tabIndex=0;tr.addEventListener('keydown',function(e){if(e.key==='ArrowRight')go(1);if(e.key==='ArrowLeft')go(-1)})});
q(document,'[data-by=lightbox]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();var d=document.createElement('dialog');d.className='by-lightbox-dialog';
  var img=a.querySelector('img');d.setAttribute('aria-label',(img&&img.alt)||'Image');d.innerHTML='<img alt=""><button type="button" aria-label="Close">×</button>';d.querySelector('img').src=a.getAttribute('href');d.querySelector('img').alt=(img&&img.alt)||'';
  document.body.appendChild(d);d.querySelector('button').onclick=function(){d.close()};d.addEventListener('close',function(){d.remove();a.focus()});d.addEventListener('click',function(ev){if(ev.target===d)d.close()});d.showModal()})});
q(document,'.by-bgvideo > video').forEach(function(v){var b=v.parentNode.querySelector('.by-video-toggle');if(matchMedia('(prefers-reduced-motion: reduce)').matches){v.pause();v.removeAttribute('autoplay')}
  function lab(){if(b){b.textContent=v.paused?'Play video':'Pause video';b.setAttribute('aria-pressed',String(!v.paused))}}if(b)b.onclick=function(){v.paused?v.play():v.pause();lab()};lab()});
q(document,'form[data-by-form]').forEach(function(f){if(!f.getAttribute('action'))return;f.addEventListener('submit',function(e){if(!window.fetch)return;e.preventDefault();var btn=f.querySelector('[type=submit]');if(btn)btn.disabled=true;
  var data={};new FormData(f).forEach(function(v,k){data[k]=typeof v==='string'?v:v.name});
  fetch(f.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({form:f.getAttribute('data-name')||'Form',page:location.pathname,fields:data})})
  .then(function(r){if(!r.ok)throw 0;var m=document.createElement('div');m.className='by-form-msg';m.setAttribute('role','status');m.tabIndex=-1;m.textContent=f.getAttribute('data-success')||'Thank you! Your submission has been received.';f.replaceWith(m);m.focus();document.dispatchEvent(new CustomEvent('by:submit'))})
  .catch(function(){if(btn)btn.disabled=false;var m=f.querySelector('.by-form-msg')||document.createElement('div');m.className='by-form-msg error';m.setAttribute('role','alert');m.textContent=f.getAttribute('data-error')||'Oops! Something went wrong. Please try again.';f.appendChild(m)})})});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
</script>
`;

/* ---- Accessibility assist widget ---- */
export const A11Y_FEATURES: [string, string][] = [
  ['text', 'Bigger text'], ['contrast', 'High contrast'], ['dark', 'Dark contrast'], ['grayscale', 'Grayscale'],
  ['links', 'Highlight links'], ['readable', 'Readable font'], ['spacing', 'Text spacing'], ['animations', 'Stop animations'],
  ['cursor', 'Big cursor'], ['guide', 'Reading guide'], ['images', 'Hide images'], ['speak', 'Read aloud'],
];

/** Self-contained widget: a floating button opening a panel of display adjustments, remembered per visitor. */
export const A11Y_RUNTIME = `<script>
(function(){
var host=document.querySelector('[data-by=a11y]');if(!host)return;
var cfg={pos:host.getAttribute('data-position')||'bottom-right',color:host.getAttribute('data-color')||'#146ef5',label:host.getAttribute('data-label')||'Accessibility',features:(host.getAttribute('data-features')||'text,contrast,dark,grayscale,links,readable,spacing,animations,cursor,guide,images,speak').split(',')};
var NAMES=${JSON.stringify(Object.fromEntries(A11Y_FEATURES))};
var KEY='by-a11y',st={};try{st=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
var css='.by-a11y-btn{position:fixed;z-index:2147483000;width:56px;height:56px;border-radius:50%;border:0;color:#fff;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25);display:grid;place-items:center}'+
'.by-a11y-btn:focus-visible,.by-a11y-panel button:focus-visible{outline:3px solid #ffbf47;outline-offset:2px}'+
'.by-a11y-panel{position:fixed;z-index:2147483001;width:min(340px,calc(100vw - 24px));max-height:min(560px,calc(100vh - 100px));overflow:auto;background:#fff;color:#111;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.3);font:15px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;padding:16px}'+
'.by-a11y-panel h2{font-size:17px;margin:0 0 12px;display:flex;justify-content:space-between;align-items:center}.by-a11y-panel h2 button{border:0;background:#eee;border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:18px}'+
'.by-a11y-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.by-a11y-grid button{min-height:64px;border:2px solid #e3e5ea;background:#f7f8fa;border-radius:12px;cursor:pointer;font:600 13px/1.25 inherit;color:#111;padding:8px}'+
'.by-a11y-grid button[aria-pressed=true]{border-color:var(--by-a11y);background:color-mix(in srgb,var(--by-a11y) 12%,#fff)}.by-a11y-grid small{display:block;font-weight:500;color:#555;margin-top:2px}'+
'.by-a11y-reset{margin-top:12px;width:100%;padding:10px;border-radius:10px;border:0;background:#111;color:#fff;font:600 14px inherit;cursor:pointer}'+
'html.by-a-contrast body{filter:contrast(1.35)}html.by-a-dark{filter:invert(1) hue-rotate(180deg);background:#fff}html.by-a-dark img,html.by-a-dark video,html.by-a-dark iframe,html.by-a-dark .by-a11y-btn,html.by-a-dark .by-a11y-panel{filter:invert(1) hue-rotate(180deg)}'+
'html.by-a-grayscale body{filter:grayscale(1)}html.by-a-links a{outline:2px solid #ffbf47!important;text-decoration:underline!important;background:#fffbe6!important;color:#000!important}'+
'html.by-a-readable body,html.by-a-readable body *:not(svg):not(svg *){font-family:"Atkinson Hyperlegible",Verdana,Tahoma,sans-serif!important}'+
'html.by-a-spacing body *{letter-spacing:.06em!important;word-spacing:.16em!important;line-height:1.8!important}'+
'html.by-a-animations *,html.by-a-animations *::before,html.by-a-animations *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}'+
'html.by-a-cursor,html.by-a-cursor *{cursor:url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2748%27 height=%2748%27 viewBox=%270 0 24 24%27><path d=%27M4 2l16 9-7 2-3 7z%27 fill=%27black%27 stroke=%27white%27 stroke-width=%271.5%27/></svg>") 4 2,auto!important}'+
'html.by-a-images img,html.by-a-images picture,html.by-a-images video{visibility:hidden!important}'+
'.by-a11y-guide{position:fixed;left:0;right:0;height:14px;background:rgba(255,191,71,.35);border-top:2px solid #111;border-bottom:2px solid #111;pointer-events:none;z-index:2147482999}'+
'html.by-a-speak body *:hover{outline:2px dashed var(--by-a11y)}';
var s=document.createElement('style');s.textContent=css;document.head.appendChild(s);
if(cfg.features.indexOf('readable')>=0){var l=document.createElement('link');l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap';document.head.appendChild(l)}
document.documentElement.style.setProperty('--by-a11y',cfg.color);
var right=cfg.pos.indexOf('right')>=0,bottom=cfg.pos.indexOf('bottom')>=0;
var btn=document.createElement('button');btn.type='button';btn.className='by-a11y-btn';btn.style.background=cfg.color;btn.style[right?'right':'left']='20px';btn.style[bottom?'bottom':'top']='20px';
btn.setAttribute('aria-label',cfg.label);btn.setAttribute('aria-expanded','false');btn.setAttribute('aria-controls','by-a11y-panel');
btn.innerHTML='<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="4" r="2"/><path d="M4 7.5l5.5 1.3V13L7.5 21h2.3l2.2-6 2.2 6h2.3L14.5 13V8.8L20 7.5l-.5-2-6 1.3h-3l-6-1.3z"/></svg>';
var panel=document.createElement('div');panel.className='by-a11y-panel';panel.id='by-a11y-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-label',cfg.label);panel.hidden=true;
panel.style[right?'right':'left']='12px';panel.style[bottom?'bottom':'top']='88px';
var guide=null,speaking=false;
function apply(){var h=document.documentElement;cfg.features.forEach(function(f){if(f!=='text'&&f!=='guide'&&f!=='speak')h.classList.toggle('by-a-'+f,!!st[f])});
  h.classList.toggle('by-a-speak',!!st.speak);document.body.style.zoom=st.text?String(1+0.12*st.text):'';
  if(st.guide&&!guide){guide=document.createElement('div');guide.className='by-a11y-guide';document.body.appendChild(guide)}if(!st.guide&&guide){guide.remove();guide=null}
  if(st.animations)q('video').forEach(function(v){v.pause()});
  try{localStorage.setItem(KEY,JSON.stringify(st))}catch(e){}render()}
function q(sel){return Array.prototype.slice.call(document.querySelectorAll(sel))}
function render(){panel.innerHTML='<h2><span>'+cfg.label+'</span><button type="button" aria-label="Close">×</button></h2><div class="by-a11y-grid" role="group" aria-label="Display adjustments"></div><button type="button" class="by-a11y-reset">Reset all</button>';
  var g=panel.querySelector('.by-a11y-grid');cfg.features.forEach(function(f){if(!NAMES[f])return;var b=document.createElement('button');b.type='button';
    var on=f==='text'?st.text>0:!!st[f];b.setAttribute('aria-pressed',String(on));b.innerHTML=NAMES[f]+(f==='text'&&st.text?'<small>Level '+st.text+' of 3</small>':'');
    b.onclick=function(){if(f==='text')st.text=((st.text||0)+1)%4;else st[f]=!st[f];if(f==='speak'&&!st.speak)speechSynthesis&&speechSynthesis.cancel();apply();var nb=panel.querySelectorAll('.by-a11y-grid button')[cfg.features.filter(function(x){return NAMES[x]}).indexOf(f)];nb&&nb.focus()};g.appendChild(b)});
  panel.querySelector('h2 button').onclick=close;panel.querySelector('.by-a11y-reset').onclick=function(){st={};apply();panel.querySelector('.by-a11y-reset').focus()}}
function open(){panel.hidden=false;btn.setAttribute('aria-expanded','true');var f=panel.querySelector('.by-a11y-grid button');f&&f.focus()}
function close(){panel.hidden=true;btn.setAttribute('aria-expanded','false');btn.focus()}
btn.onclick=function(){panel.hidden?open():close()};
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!panel.hidden)close();if(e.altKey&&(e.key==='a'||e.key==='A')){e.preventDefault();panel.hidden?open():close()}});
document.addEventListener('mousemove',function(e){if(guide)guide.style.top=(e.clientY-7)+'px'});
document.addEventListener('click',function(e){if(!st.speak||!window.speechSynthesis||panel.contains(e.target)||btn.contains(e.target))return;var t=(e.target.innerText||e.target.alt||'').trim();if(!t)return;speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(t.slice(0,1000));u.lang=document.documentElement.lang||'en';speechSynthesis.speak(u)},true);
document.body.appendChild(btn);document.body.appendChild(panel);apply();
})();
</script>
`;

/** A/B tracking: records a view of the served variant and a conversion when the goal happens. */
export const abRuntime = (apiBase: string) => `<script>
(function(){
var api=${JSON.stringify(apiBase)};
function send(exp,variant,kind){var k='by_ab_'+exp+'_'+kind;try{if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,'1')}catch(e){}
  var b=JSON.stringify({experiment:exp,variant:variant,kind:kind,visitor:visitor()});if(navigator.sendBeacon)navigator.sendBeacon(api,new Blob([b],{type:'application/json'}));else fetch(api,{method:'POST',body:b,headers:{'Content-Type':'application/json'},keepalive:true})}
function visitor(){var v=cookie('by_vid');if(v)return v;try{v=localStorage.getItem('by_vid')||Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem('by_vid',v)}catch(e){v='anon'}return v}
function cookie(n){var m=document.cookie.match(new RegExp('(?:^|; )'+n+'=([^;]*)'));return m?decodeURIComponent(m[1]):null}
var h=document.documentElement,ab=h.getAttribute('data-ab');
if(ab){var p=ab.split(':'),exp=p[0],v=p[1],goal=h.getAttribute('data-ab-goal')||'cta';send(exp,v,'view');
  if(goal==='form')document.addEventListener('by:submit',function(){send(exp,v,'convert')});
  document.addEventListener('submit',function(){if(goal==='form'||goal==='cta')send(exp,v,'convert')},true);
  document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest(goal==='cta'?'a[class*=button],a[class*=btn],button,[type=submit],[data-ab-goal]':goal.indexOf('click:')===0?goal.slice(6):null);if(t)send(exp,v,'convert')},true)}
(h.getAttribute('data-ab-goals')||'').split(',').filter(Boolean).forEach(function(exp){var v=cookie('by_ab_'+exp);if(v)send(exp,v,'convert')});
})();
</script>
`;
