'use strict';
(() => {
 const items=document.querySelector('#history-items'), fill=document.querySelector('.history-fill');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let observer;
 function element(tag,cls,text){const e=document.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=text;return e;}
 function render(data){
  observer?.disconnect();
  document.querySelector('#information-page-title').textContent=data.title ?? '';
  document.querySelector('#history-mission').textContent=data.mission ?? '';
  items.replaceChildren();
  (Array.isArray(data.items)?data.items:[]).forEach(item=>{
   const li=element('li','history-item'),date=element('time','history-date');
   date.dateTime=item.date||'';
   const parts=(item.date||'').split('-'),month=Number(parts[1]);
   date.append(element('strong','',parts[0]||''),document.createTextNode(month>=1&&month<=12?new Date(2000,month-1,1).toLocaleString('en-US',{month:'long'}):''));
   const dot=element('span','history-dot');dot.setAttribute('aria-hidden','true');
   const copy=element('article','history-copy');
   if(item.status)copy.append(element('span','history-status',item.status));
   copy.append(element('h2','',item.title||''),element('p','',item.text||''));
   if(item.url&&/^https?:\/\//i.test(item.url)){const a=element('a','information-link',item.linkLabel||'Learn more');a.href=item.url;copy.append(a);}
   li.append(date,dot,copy);items.append(li);
  });
  document.querySelector('.history-track').hidden=!items.children.length;
  if('IntersectionObserver' in window&&!reduced){document.documentElement.classList.add('history-motion');observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('revealed');observer.unobserve(e.target);}}),{threshold:.08});[...items.children].forEach(x=>observer.observe(x));}
  update();
 }
 let queued=false;
 function update(){const r=document.querySelector('.history-track').getBoundingClientRect(),line=innerHeight*.65;fill.style.transform=`scaleY(${Math.max(0,Math.min(1,(line-r.top)/(r.height||1)))})`;[...items.children].forEach(x=>x.classList.toggle('is-active',x.getBoundingClientRect().top<line));queued=false;}
 function schedule(){if(!queued){queued=true;requestAnimationFrame(update);}}
 addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);
 render(window.KMCHistoryDefaults);
 function applyInformation(data){render(data?.aboutHistory || window.KMCHistoryDefaults);}
 document.addEventListener('kmc:site-information-loaded',event=>applyInformation(event.detail));
 const loaded=window.KMCSiteInformation?.getLastLoaded?.();
 if(loaded)applyInformation(loaded);
 const db=window.kmcFirebase?.db;
 if(db){const unsubscribe=db.collection('siteContent').doc('information').onSnapshot(snap=>{const data=snap.data();applyInformation({aboutHistory:data?.aboutHistory ?? data?.aboutHistoryPreview});},error=>console.warn('History refresh unavailable:',error.code));addEventListener('pagehide',unsubscribe,{once:true});}
})();
