"use strict";
document.addEventListener('DOMContentLoaded',()=>{
    const selector='h1, .performance-location, .arrangement-title, .logo-text h2, .admin-brand-title';
    let pending=false;
    function fit(){
        pending=false;
        document.querySelectorAll(selector).forEach(node=>{
            if(!node.getClientRects().length)return;
            node.style.fontSize='';
            const normal=parseFloat(getComputedStyle(node).fontSize);
            const parent=node.closest('.performance-card-content, .card-content') || node.parentElement;
            const hero=node.closest('.hero');
            const limit=hero ? Math.max(48,hero.clientHeight-150) : parent?.clientHeight || Infinity;
            const fits=()=>node.scrollWidth<=node.clientWidth+1 && node.getBoundingClientRect().height<=limit;
            if(!fits()){
                let low=8,high=normal;
                for(let i=0;i<12;i++) {const mid=(low+high)/2;node.style.fontSize=mid+'px';if(fits())low=mid;else high=mid;}
                node.style.fontSize=low+'px';
            }
            // No scale-up beyond the stylesheet's normal size.
        });
    }
    const schedule=()=>{if(!pending){pending=true;requestAnimationFrame(fit);}};
    new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true});
    new ResizeObserver(schedule).observe(document.documentElement);
    window.addEventListener('resize',schedule);
    document.fonts?.ready.then(schedule);schedule();
});
