/* Cache complete byte chunks as they are requested by native video playback. */
const CACHE = 'kmc-watched-video-chunks-v1', CHUNK = 1024 * 1024;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
const allowed = url => url.protocol === 'https:' && ['firebasestorage.googleapis.com', 'storage.googleapis.com'].includes(url.hostname);
const key = (url, part) => new Request(`${self.location.origin}/performances/__cached-video?url=${encodeURIComponent(url)}&part=${part}`);
async function serve(request) {
    const source = new URL(request.url).searchParams.get('url');
    if (!source || !allowed(new URL(source))) return new Response('Unsupported source', {status:400});
    const cache = await caches.open(CACHE);
    const metaKey = key(source, 'meta');
    let metaResponse = await cache.match(metaKey), meta;
    if (metaResponse) meta = await metaResponse.json();
    else {
        const probe = await fetch(source, {headers:{Range:'bytes=0-0'},credentials:'omit'});
        const range = probe.headers.get('Content-Range');
        if (probe.status !== 206 || !range) {
            // Origin without range support: retain ordinary native streaming.
            probe.body?.cancel();
            return fetch(source, {headers: request.headers.has('Range') ? {Range:request.headers.get('Range')} : {},credentials:'omit'});
        }
        meta = {size:Number(range.split('/')[1]),type:probe.headers.get('Content-Type') || 'video/mp4'};
        await probe.body?.cancel();
        if (!Number.isSafeInteger(meta.size) || meta.size <= 0) throw Error('Invalid video size');
        try { await cache.put(metaKey, new Response(JSON.stringify(meta))); } catch (_) {}
    }
    const range = request.headers.get('Range');
    let start=0,end=meta.size-1;
    if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || (!match[1] && !match[2])) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${meta.size}`}});
        if (!match[1]) start=Math.max(0,meta.size-Number(match[2]));
        else { start=Number(match[1]); if(match[2])end=Math.min(end,Number(match[2])); }
        if(start>end || start>=meta.size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${meta.size}`}});
    }
    const abort = new AbortController();
    let cursor=start;
    const stream=new ReadableStream({
        async pull(controller) {
            if(cursor>end){controller.close();return;}
            try {
                const offset=Math.floor(cursor/CHUNK)*CHUNK, last=Math.min(meta.size-1,offset+CHUNK-1);
                const chunkKey=key(source,offset);
                let saved=await cache.match(chunkKey), bytes;
                if(saved) bytes=new Uint8Array(await saved.arrayBuffer());
                else {
                    const response=await fetch(source,{headers:{Range:`bytes=${offset}-${last}`},credentials:'omit',signal:abort.signal});
                    if(response.status!==206 || response.headers.get('Content-Range')!==`bytes ${offset}-${last}/${meta.size}`)throw Error('Unexpected video range');
                    bytes=new Uint8Array(await response.arrayBuffer());
                    if(bytes.length!==last-offset+1)throw Error('Incomplete video range');
                    try{await cache.put(chunkKey,new Response(bytes,{headers:{'Content-Type':meta.type}}));}catch(_){}
                }
                const count=Math.min(end-cursor+1,bytes.length-(cursor-offset));
                controller.enqueue(bytes.slice(cursor-offset,cursor-offset+count));
                cursor+=count;
            } catch(error){controller.error(error);}
        },
        cancel(){abort.abort();}
    },{highWaterMark:0});
    const headers={'Content-Type':meta.type,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Cache-Control':'no-store'};
    if(range)headers['Content-Range']=`bytes ${start}-${end}/${meta.size}`;
    return new Response(stream,{status:range?206:200,headers});
}
self.addEventListener('fetch',event=>{
    const url=new URL(event.request.url);
    if(url.origin===self.location.origin && url.pathname==='/performances/__media') event.respondWith(serve(event.request).catch(()=>new Response('Video unavailable',{status:502})));
});
