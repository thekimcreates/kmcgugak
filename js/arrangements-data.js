"use strict";
window.KMC_ARRANGEMENT_DEFAULTS = {
  instruments: [
    {id:"kkwaenggwari",name:"Kkwaenggwari",koreanName:"꽹과리",photoUrl:"assets/instruments/kkwaenggwari.webp",photoPath:""},
    {id:"jing",name:"Jing",koreanName:"징",photoUrl:"assets/instruments/jing.webp",photoPath:""},
    {id:"janggu",name:"Janggu",koreanName:"장구",photoUrl:"assets/instruments/janggu.webp",photoPath:""},
    {id:"buk",name:"Buk",koreanName:"북",photoUrl:"assets/instruments/buk.webp",photoPath:""},
    {id:"sogo",name:"Sogo",koreanName:"소고",photoUrl:"assets/instruments/sogo.webp",photoPath:""},
    {id:"sangmo",name:"Sangmo",koreanName:"상모",photoUrl:"assets/instruments/sangmo.webp",photoPath:""},
    {id:"five-buk",name:"Five Buk",koreanName:"오북",photoUrl:"assets/instruments/fivebuk.webp",photoPath:""}
  ],
  arrangements: [
    {id:"samulnori",name:"Samulnori",koreanName:"사물놀이",photoUrl:"assets/arrangements/samulnori.webp",photoPath:"",order:0,instruments:["kkwaenggwari","jing","janggu","buk"].map((instrumentId,order)=>({instrumentId,description:"Description coming soon.",order}))},
    {id:"nongak",name:"Nongak",koreanName:"농악",photoUrl:"assets/arrangements/nongak.webp",photoPath:"",order:1,instruments:["kkwaenggwari","jing","janggu","buk","sogo","sangmo"].map((instrumentId,order)=>({instrumentId,description:"Description coming soon.",order}))},
    {id:"ogomu",name:"Ogomu",koreanName:"오고무",photoUrl:"assets/arrangements/ogomu.webp",photoPath:"",order:2,instruments:["five-buk","buk"].map((instrumentId,order)=>({instrumentId,description:"Description coming soon.",order}))},
    {id:"nanta",name:"Nanta",koreanName:"난타",photoUrl:"assets/arrangements/nanta.webp",photoPath:"",order:3,instruments:[{instrumentId:"buk",description:"Description coming soon.",order:0}]},
    {id:"sogo",name:"Sogo Dance",koreanName:"소고춤",photoUrl:"assets/arrangements/sogo.webp",photoPath:"",order:4,instruments:[{instrumentId:"sogo",description:"Description coming soon.",order:0}]}
  ]
};

(() => {
 const descriptions = {"samulnori": "Samulnori, deriving from the Korean words, “sa,” meaning four, and “nori,” meaning playing, is a genre of traditional Korean percussion music involving four instruments.\n\nJangu, an hourglass-shaped double-headed drum played with two different sticks, represents rain; Buk, a barrel drum that provides a strong bass pulse, represents the clouds; Kkwaenggwari, a small, high-pitched brass gong that usually leads the group and signals changes in rhythm, represents lightning; Jing, a large gong that creates a deep, resonant sound, represents wind.\n\nTogether, the instruments represent harmony of the universe (yin and yang).", "gilnori": "Gilnori translates street/road play in Korean and is a traditional musical parade or street procession that serves as the opening act for larger folk arts festivals, mask dances (sandae-nori), or outdoor pungmul (farmers' music) performances.\n\nWhile both samulnori and gilnori are outdoor performances, since gilnori is a parade it usually involves a larger ensemble. Like samulnori, the same main four instruments are used. However in addition to it, behind the musicians are performers/actors performing an acrobatic dance with the sangmo, a hat attached with long ribbons, and sogo, a small hand drum.", "sogodance": "Sogo dance is a vibrant, traditional Korean folk dance where performers dance while beating a sogo, a small hand drum. Rather than driving the main tempo of the music, the drumbeats are tightly synchronized with sharp, expressive physical poses. The style of dance that the KMC Gugak team performs is the one catered to theater stages; it is much more elegant, graceful, and disciplined, emphasizing refined posture and intricate footwork over acrobatics.", "ogomu": "Ogomu, translating to “five drum dance” in Korean, is a highly theatrical, visually stunning traditional Korean dance where a dancer stands inside a U-shaped wooden frame surrounded by five separate drums. Ogomu performers rely on extreme core strength and flexibility to play multiple fixed instruments simultaneously while executing a synchronized dance routine. The ogomu instrument is a three-sided wooden frame holding five traditional barrel drums wrapped around a standing performer. A separate group of buks are also played at the side, providing a deep rhythm as a guide.", "nanta": "The style of nanta that the KMC Gugak team plays is a percussion that solely uses buks that are mounted on waist-high frames. Players stand in a synchronized row and perform a choreography, combining standing and squatting moves and creating rhythms by beating the center and sides of the drum with the wooden stick."};
 const aliases = {sogo:"sogodance",사물놀이:"samulnori",길놀이:"gilnori",소고춤:"sogodance",오고무:"ogomu",난타:"nanta"};
 const key = value => String(value || "").toLowerCase().replace(/[\s_-]+/g, "");
 window.KMCArrangementDescription = item => {
  if (typeof item?.description === "string") return item.description;
  for (const value of [item?.name, item?.koreanName, item?.id]) {
   const normalized = key(value), match = aliases[normalized] || normalized;
   if (Object.hasOwn(descriptions, match)) return descriptions[match];
  }
  return "";
 };
 window.KMC_ARRANGEMENT_DEFAULTS.arrangements.forEach(item => { item.description = window.KMCArrangementDescription(item); });
})();
