"use strict";
window.KMCHistoryEditor = (() => {
 let onChange=()=>{};
 const list=document.querySelector('#editor-items');

 function read(){return {title:document.querySelector('#edit-title').value.trim(),mission:document.querySelector('#edit-mission').value.trim(),items:[...list.children].map(card=>Object.fromEntries([...card.querySelectorAll('[data-field]')].map(input=>[input.dataset.field,input.value.trim()])))};}
 function render(data){document.querySelector('#edit-title').value=data.title||'';document.querySelector('#edit-mission').value=data.mission||'';list.replaceChildren();(data.items||[]).forEach((item,index)=>{
  const card=document.createElement('article');card.className='history-editor-card';const h=document.createElement('h3');h.textContent=`Milestone ${index+1}`;card.append(h);
  const actions=document.createElement('div');actions.className='history-editor-actions';
  ['Move Up','Move Down','Remove'].forEach((label,n)=>{const b=document.createElement('button');b.type='button';b.className='admin-secondary-button';b.textContent=label;b.disabled=(n===0&&index===0)||(n===1&&index===data.items.length-1);b.onclick=()=>{const d=read();if(n===2)d.items.splice(index,1);else{const to=index+(n===0?-1:1);[d.items[index],d.items[to]]=[d.items[to],d.items[index]];}render(d);onChange();};actions.append(b);});card.append(actions);
  [['date','Date','month'],['title','Title','text'],['text','Description','textarea'],['status','Status (optional)','text'],['linkLabel','Link Label (optional)','text'],['url','Link URL (optional)','url']].forEach(([key,label,type])=>{const wrap=document.createElement('div');wrap.className='admin-field';const l=document.createElement('label');const input=document.createElement(type==='textarea'?'textarea':'input');input.id=`milestone-${index}-${key}`;l.htmlFor=input.id;l.textContent=label;if(type==='textarea')input.rows=4;else input.type=type;input.dataset.field=key;input.value=item[key]||'';input.required=key==='date'||key==='title';wrap.append(l,input);card.append(wrap);});list.append(card);
 });}

 return {
  populate(data,change){onChange=change;render(data || window.KMCHistoryDefaults);},
  read,
  validate(){const data=read();if(!data.title)return 'Enter a page title.';
   for(const item of data.items){if(!item.title || !/^\d{4}-(0[1-9]|1[0-2])$/.test(item.date))return 'Each milestone needs a title and a valid month.';
    if(item.url && (!/^https?:\/\//i.test(item.url) || !item.linkLabel))return 'Each timeline link needs an http or https URL and a label.';}
   return '';
  },
  add(){const data=read();data.items.push({date:'',title:'',text:'',status:'',linkLabel:'',url:''});render(data);onChange();}
 };
})();
document.querySelector('#add-history-milestone').addEventListener('click',()=>window.KMCHistoryEditor.add());
