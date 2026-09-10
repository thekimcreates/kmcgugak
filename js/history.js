'use strict';
(() => {
 const items=document.querySelector('#history-items'), fill=document.querySelector('.history-fill');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let observer;
 function element(tag,cls,text){const e=document.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=text;return e;}
 function render(data){
  observer?.disconnect();
  document.querySelector("#history-content").hidden=false;
  document.querySelector("#history-load-status").hidden=true;
  document.querySelector("#information-page").setAttribute("aria-busy","false");
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

 const page=document.querySelector('#information-page'),status=document.querySelector('#history-load-status');
 let hasContent=false,unsubscribe=null;
 function showStatus(message){if(hasContent)return;status.textContent=message;page.setAttribute('aria-busy','false');}
 const db=window.kmcFirebase?.db;
 if(!db){showStatus('Unable to load this page. Please reload to try again.');return;}
 const timeout=setTimeout(()=>showStatus('Still connecting. Please check your connection or reload to try again.'),12000);
 function start(){
  unsubscribe=db.collection('siteContent').doc('information').onSnapshot({includeMetadataChanges:true},snap=>{
   const data=snap.data();
   const history=data?.aboutHistory ?? data?.aboutHistoryPreview;
   if(history && typeof history==='object' && Array.isArray(history.items)){
    clearTimeout(timeout);hasContent=true;render(history);
   }else if(!snap.metadata.fromCache){
    clearTimeout(timeout);hasContent=false;document.querySelector('#history-content').hidden=true;status.hidden=false;
    showStatus('About our team will be available soon.');
   }
  },error=>{clearTimeout(timeout);showStatus('Unable to load this page. Please reload to try again.');console.warn('History refresh unavailable:',error.code);});
 }
 start();
 addEventListener('pagehide',()=>{unsubscribe?.();unsubscribe=null;clearTimeout(timeout);});
 addEventListener('pageshow',event=>{if(event.persisted&&!unsubscribe)start();});
})();
