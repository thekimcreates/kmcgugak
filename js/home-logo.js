/* KMC Gugak — original drum-color animation, homepage edition. */
(function () {
"use strict";
// Source color layers inside the drum; shared by browser and video renderer.
function createLogoMotion(ctx, logo, makeCanvas) {
  const W=1280,H=480,TAU=Math.PI*2;
  const clamp=x=>Math.max(0,Math.min(1,x));
  const phase=(t,a,b)=>clamp((t-a)/(b-a));
  const smooth=x=>x*x*x*(x*(x*6-15)+10);
  const out=x=>1-Math.pow(1-x,4);
  const mix=(a,b,p)=>a+(b-a)*p;
  const source=makeCanvas(386,391),sc=source.getContext('2d');
  sc.drawImage(logo,0,0);
  const pixels=sc.getImageData(0,0,386,391);
  const palette=[[237,27,65],[1,58,101],[255,217,102],[255,255,255],[118,28,42]];
  const layers=[0,1,2].map(()=>makeCanvas(386,391));
  const layerData=layers.map(c=>c.getContext('2d').createImageData(386,391));
  for(let y=79;y<330;y++)for(let x=131;x<342;x++){
    const i=(y*386+x)*4,r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2];
    let winner=-1,best=Infinity;
    for(let k=0;k<palette.length;k++){
      const p=palette[k],d=(r-p[0])**2+(g-p[1])**2+(b-p[2])**2;
      if(d<best){best=d;winner=k;}
    }
    if(winner<3){for(let c=0;c<4;c++)layerData[winner].data[i+c]=pixels.data[i+c];}
  }
  // Keep each main connected shape; omit isolated compression specks and rim fragments.
  for(const data of layerData){
    const visited=new Uint8Array(386*391);let largest=[];
    for(let pos=0;pos<visited.length;pos++){
      if(visited[pos]||!data.data[pos*4+3])continue;
      const component=[pos];visited[pos]=1;
      for(let head=0;head<component.length;head++){
        const at=component[head],x=at%386,y=Math.floor(at/386);
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          const nx=x+dx,ny=y+dy,n=ny*386+nx;
          if(nx<0||nx>=386||ny<0||ny>=391||visited[n]||!data.data[n*4+3])continue;
          visited[n]=1;component.push(n);
        }
      }
      if(component.length>largest.length)largest=component;
    }
    const keep=new Uint8Array(386*391);for(const p of largest)keep[p]=1;
    for(let p=0;p<keep.length;p++)if(!keep[p])data.data[p*4+3]=0;
  }
  layers.forEach((c,i)=>c.getContext('2d').putImageData(layerData[i],0,0));
  return function render(t){
    ctx.clearRect(0,0,W,H);
    ctx.save();ctx.translate(-160,-210);
    const move=smooth(phase(t,3.35,4.75));
    const cx=mix(800,430,move),cy=450,s=1.12;
    ctx.save();ctx.translate(cx-193*s,cy-195.5*s);ctx.scale(s,s);
    const body=smooth(phase(t,2.35,3.45));
    if(body>0){
      ctx.save();ctx.globalAlpha=body;
      ctx.beginPath();ctx.arc(193,195.5,192,0,TAU);ctx.clip();
      ctx.drawImage(logo,0,0,386,391,0,0,386,391);ctx.restore();
    }
    if(t<3.45){
      ctx.save();ctx.beginPath();ctx.ellipse(236,205,103,125,-.02,0,TAU);ctx.clip();
      function shape(index,start,finish,turns,offset){
        const p=phase(t,start,finish);if(!p)return;
        const settle=out(p),angle=-TAU*turns*(1-settle);
        const opacity=smooth(phase(t,start,start+.5));
        const scale=mix(.58,1,out(phase(t,start,start+1.0)));
        ctx.save();ctx.globalAlpha=opacity;
        ctx.translate(236,205);ctx.rotate(angle);
        ctx.translate(offset*(1-settle),0);ctx.scale(scale,scale);
        ctx.drawImage(layers[index],-236,-205);ctx.restore();
      }
      shape(2,.95,2.65,.62,0);
      shape(1,.18,2.7,1.08,-35);
      shape(0,.34,2.78,1.18,35);
      ctx.restore();
    }
    ctx.restore();
    const originX=430-193*s,originY=450-195.5*s;
    function titleLine(start,end,sy,sh){
      const p=out(phase(t,start,end));if(!p)return;
      ctx.save();ctx.beginPath();ctx.rect(originX+440*s,originY-10,900,460);ctx.clip();
      ctx.globalAlpha=smooth(phase(t,start,start+.5));
      ctx.drawImage(logo,445,sy,599,sh,originX+445*s+190*(1-p),originY+sy*s,599*s,sh*s);
      ctx.restore();
    }
    titleLine(3.9,5.15,0,242);titleLine(4.14,5.43,242,149);
    ctx.restore();
  };
}

    const canvas = document.getElementById('home-logo-canvas');
    const logo = document.getElementById('home-logo-fallback');
    const stage = document.getElementById('home-logo-stage');
    const copy = document.getElementById('home-hero-copy');
    const headerLogo = document.querySelector('#navbar .home-header-logo');
    const headerImage = headerLogo?.querySelector('picture img');
    const root = document.documentElement;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = window.matchMedia('(max-width: 600px)');
    const makeCanvas = (width, height) => {
        const c = document.createElement('canvas');
        c.width = width; c.height = height;
        return c;
    };

    // Handle this link before the generic same-page anchor listener.
    const arrow = document.querySelector('.home-hero-scroll');
    let waitingForSections = false;
    let pendingScrollTimer = 0;
    function scrollToSections() {
        const sections = document.getElementById('performances');
        if (!sections) return;
        const target = sections;
        const headerBottom = document.getElementById('navbar')?.getBoundingClientRect().bottom || 100;
        const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - headerBottom - 20);
        window.scrollTo({ top, behavior: preference.matches ? 'instant' : 'smooth' });
        sections.focus({ preventScroll: true });
    }
    function stopWaitingForSections() {
        waitingForSections = false;
        window.clearTimeout(pendingScrollTimer);
    }
    window.addEventListener('kmc:home-sections-rendered', () => {
        if (waitingForSections) { stopWaitingForSections(); scrollToSections(); }
    });
    // Do not pull visitors back if they have deliberately scrolled elsewhere.
    window.addEventListener('wheel', stopWaitingForSections, { passive: true });
    window.addEventListener('touchstart', stopWaitingForSections, { passive: true });
    arrow?.addEventListener('click', event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        event.stopPropagation();
        history.replaceState(null, "", "#performances");
        scrollToSections();
        if (!document.getElementById('performances')) {
            waitingForSections = true;
            window.clearTimeout(pendingScrollTimer);
            pendingScrollTimer = window.setTimeout(stopWaitingForSections, 10000);
        }
    });

    if (!canvas || !logo || !stage || !copy || !headerLogo) return;
    const FORMATION_SECONDS = 2;
    const FLIGHT_SECONDS = 1;
    const ORIGINAL_TIMELINE = 5.45;
    let frameId = 0, elapsed = 0, previousTime = null;
    let render = null, snapshot = null, flying = false, finished = false;
    let headerFallback = null;
    const smooth = p => p * p * p * (p * (p * 6 - 15) + 10);
    const lerp = (a, b, p) => a + (b - a) * p;

    // Preserve the configured header image. Supply a local fallback if it cannot load.
    function updateHeaderFallback() {
        if (!logo.naturalWidth) return;
        if (!headerFallback) {
            headerFallback = makeCanvas(1044, 391);
            headerFallback.className = 'home-header-logo-fallback';
            headerFallback.setAttribute('aria-hidden', 'true');
            headerLogo.appendChild(headerFallback);
        }
        const isMobile = false;
        headerFallback.width = isMobile ? 386 : 1044;
        const c = headerFallback.getContext('2d');
        if (!c) { headerFallback.hidden = true; return; }
        c.clearRect(0, 0, headerFallback.width, 391);
        c.drawImage(logo, 0, 0, headerFallback.width, 391, 0, 0, headerFallback.width, 391);
        const valid = headerImage?.complete && headerImage.naturalWidth > 0;
        headerFallback.hidden = Boolean(valid);
        headerLogo.classList.toggle('has-logo-fallback', !valid);
    }
    headerImage?.addEventListener('load', updateHeaderFallback);
    headerImage?.addEventListener('error', updateHeaderFallback);
    mobile.addEventListener('change', updateHeaderFallback);

    function pause() {
        window.cancelAnimationFrame(frameId); frameId = 0; previousTime = null;
    }
    function finish() {
        if (finished) return;
        finished = true;
        pause();
        stage.hidden = true;
        canvas.hidden = true;
        canvas.classList.remove('home-logo-flight');
        canvas.removeAttribute('style');
        stage.appendChild(canvas);
        root.classList.remove('home-logo-intro');
        copy.style.removeProperty('opacity');
        updateHeaderFallback();
        document.removeEventListener('visibilitychange', syncPlayback);
        preference.removeEventListener('change', motionChanged);
        window.removeEventListener('pagehide', finish);
        render = null; snapshot = null;
    }
    function beginFlight() {
        render(ORIGINAL_TIMELINE);
        snapshot = makeCanvas(1280, 480);
        snapshot.getContext('2d').drawImage(canvas, 0, 0);
        // Escape the hero's overflow clipping and the header's backdrop filter.
        document.body.appendChild(canvas);
        canvas.classList.add('home-logo-flight');
        canvas.setAttribute('aria-hidden', 'true');
        flying = true;
    }
    function drawFlight(p) {
        const eased = smooth(p);
        // Measure each frame so scrolling, resizing and orientation changes stay aligned.
        const from = stage.getBoundingClientRect();
        const box = headerLogo.getBoundingClientRect();
        const isMobile = false;
        const art = isMobile
            ? { x: 53.84, y: 21.04, w: 432.32, h: 437.92 }
            : { x: 53.84, y: 21.04, w: 1169.28, h: 437.92 };
        const scale = Math.min(box.width / art.w, box.height / art.h);
        const destination = {
            x: box.left + (box.width - art.w * scale) / 2 - art.x * scale,
            y: box.top + (box.height - art.h * scale) / 2 - art.y * scale,
            w: 1280 * scale,
            h: 480 * scale
        };
        canvas.style.left = `${lerp(from.left, destination.x, eased)}px`;
        canvas.style.top = `${lerp(from.top, destination.y, eased)}px`;
        canvas.style.width = `${lerp(from.width, destination.w, eased)}px`;
        canvas.style.height = `${lerp(from.height, destination.h, eased)}px`;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 1280, 480);
        ctx.drawImage(snapshot, 0, 0, 520, 480, 0, 0, 520, 480);
        ctx.globalAlpha = isMobile ? 1 - eased : 1;
        ctx.drawImage(snapshot, 520, 0, 760, 480, 520, 0, 760, 480);
        ctx.globalAlpha = 1;
        copy.style.opacity = String(eased);
    }
    function tick(now) {
        frameId = 0;
        if (finished || document.hidden) { previousTime = null; return; }
        if (previousTime !== null) elapsed += Math.max(0, now - previousTime) / 1000;
        previousTime = now;
        if (elapsed >= FORMATION_SECONDS + FLIGHT_SECONDS) { finish(); return; }
        if (elapsed < FORMATION_SECONDS) render(elapsed * ORIGINAL_TIMELINE / FORMATION_SECONDS);
        else {
            if (!flying) beginFlight();
            drawFlight(Math.min(1, (elapsed - FORMATION_SECONDS) / FLIGHT_SECONDS));
        }
        frameId = window.requestAnimationFrame(tick);
    }
    function syncPlayback() {
        if (finished || !render) return;
        if (document.hidden) pause();
        else if (!frameId) frameId = window.requestAnimationFrame(tick);
    }
    function motionChanged() { if (preference.matches) finish(); }
    function initialize() {
        if (!logo.naturalWidth) return;
        try {
            updateHeaderFallback();
            if (preference.matches) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            render = createLogoMotion(ctx, logo, makeCanvas);
            render(0);
            root.classList.add('home-logo-intro');
            stage.hidden = false;
            canvas.hidden = false;
            document.addEventListener('visibilitychange', syncPlayback);
            preference.addEventListener('change', motionChanged);
            window.addEventListener('pagehide', finish);
            syncPlayback();
        } catch (error) {
            finish();
            console.warn('Homepage logo animation unavailable:', error);
        }
    }
    if (logo.complete) initialize();
    else logo.addEventListener('load', initialize, { once: true });
})();
