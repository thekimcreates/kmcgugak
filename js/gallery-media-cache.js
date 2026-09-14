"use strict";
window.KMCGalleryMedia = (() => {
    const ready = (async()=>{
        if(!('serviceWorker' in navigator))return false;
        try {
            await navigator.serviceWorker.register('/gallery-media-sw.js',{scope:'/performances/'});
            if(!navigator.serviceWorker.controller) await new Promise(resolve=>{
                const done=()=>{navigator.serviceWorker.removeEventListener('controllerchange',done);resolve();};
                navigator.serviceWorker.addEventListener('controllerchange',done);
                setTimeout(done,2500);
            });
            return navigator.serviceWorker.controller?.scriptURL.endsWith('/gallery-media-sw.js');
        }catch(_){return false;}
    })();
    return {
        async source(url){
            const parsed=new URL(url,location.href);
            return ['firebasestorage.googleapis.com','storage.googleapis.com'].includes(parsed.hostname) && await ready
                ? `/performances/__media?url=${encodeURIComponent(url)}` : url;
        },
        attach(video, item, surface){
            let last=-1,disposed=false,serial=0,currentUrl=null;
            const preview=document.createElement('img');
            preview.className='gallery-scrub-frame';preview.alt='';preview.hidden=true;surface.appendChild(preview);
            const canvas=document.createElement('canvas');
            const frameKey=time=>new URL(`/performances/__frame?url=${encodeURIComponent(item.url)}&time=${time}`,location.origin).href;
            const cachePromise=window.caches?.open('kmc-watched-scrub-frames-v1').catch(()=>null);
            async function capture(){
                if(disposed||video.seeking||video.paused||video.readyState<2)return;
                const bucket=Math.floor(video.currentTime/2)*2;
                if(bucket===last)return;last=bucket;
                const cache=await cachePromise;if(!cache||disposed)return;
                if(await cache.match(frameKey(bucket)))return;
                canvas.width=240;canvas.height=Math.max(1,Math.round(240*video.videoHeight/video.videoWidth));
                try{
                    canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
                    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.5));
                    if(blob)await cache.put(frameKey(bucket),new Response(blob,{headers:{'Content-Type':'image/jpeg'}}));
                }catch(_){} // Cross-origin playback without CORS still works normally.
            }
            async function seeking(){
                const token=++serial;preview.hidden=true;
                const cache=await cachePromise;
                const response=await cache?.match(frameKey(Math.floor(video.currentTime/2)*2));
                if(!response)return;
                const blob=await response.blob();
                if(disposed||token!==serial||!video.seeking)return;
                if(currentUrl)URL.revokeObjectURL(currentUrl);
                currentUrl=URL.createObjectURL(blob);preview.src=currentUrl;preview.hidden=false;
            }
            function seeked(){serial++;preview.hidden=true;}
            video.addEventListener('timeupdate',capture);
            video.addEventListener('seeking',seeking);
            video.addEventListener('seeked',seeked);
            video.addEventListener('playing',()=>{navigator.storage?.persist?.().catch(()=>{});},{once:true});
            return ()=>{disposed=true;serial++;preview.remove();if(currentUrl)URL.revokeObjectURL(currentUrl);video.removeEventListener('timeupdate',capture);video.removeEventListener('seeking',seeking);video.removeEventListener('seeked',seeked);};
        }
    };
})();
