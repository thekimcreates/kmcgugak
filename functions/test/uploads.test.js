"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash, generateKeyPairSync } = require("node:crypto");
const { createUploadService, validateManifest, matchesMedia } = require("../lib/service");
const { Storage } = require("@google-cloud/storage");

function fixture() {
    const docs = new Map(), objects = new Map(); let serial = Promise.resolve(), time = Date.now(), generation = 0;
    const snapshot = path => ({ id: path.split("/").pop(), ref: ref(path), exists: docs.has(path), data: () => structuredClone(docs.get(path)) });
    function ref(path) {
        return { path, id: path.split("/").pop(), collection: name => collection(`${path}/${name}`),
            get: async () => snapshot(path), set: async data => docs.set(path, structuredClone(data)),
            update: async data => docs.set(path, { ...docs.get(path), ...structuredClone(data) }), delete: async () => docs.delete(path) };
    }
    function collection(path) {
        return { doc: id => ref(`${path}/${id}`), where: (key, operator, value) => ({ limit: count => ({ get: async () => ({ docs: [...docs.keys()].filter(name => name.startsWith(`${path}/`) && !name.slice(path.length + 1).includes("/") && docs.get(name)[key] < value).slice(0, count).map(snapshot) }) }) }) };
    }
    const db = { collection,
        runTransaction(action) {
            const run = serial.then(async () => {
                const writes = [];
                const result = await action({ get: async record => snapshot(record.path),
                    set: (record, data) => writes.push(() => docs.set(record.path, structuredClone(data))),
                    update: (record, data) => writes.push(() => docs.set(record.path, { ...docs.get(record.path), ...structuredClone(data) })),
                    delete: record => writes.push(() => docs.delete(record.path)) });
                writes.forEach(write => write()); return result;
            });
            serial = run.catch(() => {}); return run;
        },
        batch() { const deletions = []; return { delete: record => deletions.push(record.path), commit: async () => deletions.forEach(path => docs.delete(path)) }; }
    };
    const bucket = { name: "test.firebasestorage.app", file(path, options = {}) {
        return { name: path,
            getMetadata: async () => {
                if (!objects.has(path)) throw Object.assign(new Error("Missing"), { code: 404 });
                return [structuredClone(objects.get(path).metadata)];
            },
            generateSignedPostPolicyV4: async policy => [{ url: `https://storage.googleapis.com/test/`, fields: { key: path, "Content-Type": policy.fields["Content-Type"] }, policy }],
            download: async () => {
                const object = objects.get(path);
                assert.equal(String(options.generation), object.metadata.generation);
                return [object.bytes.subarray(0, 64)];
            },
            copy: async (destination, options) => {
                assert.equal(options.preconditionOpts.ifGenerationMatch, 0);
                assert.equal(typeof options.contentType, "string", "Cloud Storage copy metadata must use the SDK's top-level options");
                assert.equal(typeof options.metadata.firebaseStorageDownloadTokens, "string");
                if (objects.has(destination.name)) throw Object.assign(new Error("Already exists"), { code: 412 });
                const object = objects.get(path);
                objects.set(destination.name, { bytes: object.bytes, metadata: { size: object.bytes.length, generation: String(++generation), contentType: options.contentType, metadata: options.metadata } });
                return [destination];
            },
            delete: async () => objects.delete(path)
        };
    }, deleteFiles: async ({ prefix }) => { for (const key of objects.keys()) if (key.startsWith(prefix)) objects.delete(key); } };
    const service = createUploadService({ db, bucket, now: () => time, serverTimestamp: () => "SERVER_TIME" });
    const picture = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(100)]);
    const file = { id: "12345678-1234-1234-1234-123456789abc", name: "photo.jpg", size: picture.length, mimeType: "image/jpeg", duration: 0, thumbnail: null };
    function stage(policy, data = picture) { objects.set(policy.fields.key, { bytes: data, metadata: { size: data.length, generation: String(++generation), contentType: policy.fields["Content-Type"] } }); }
    async function ready(id = "show-1", ip = "192.0.2.1", manifest = [file]) {
        if (!docs.has(`performances/${id}`)) docs.set(`performances/${id}`, { locationName: "Test concert", date: "2026-09-06", galleryItems: [{ path: "existing.jpg", url: "https://example.com/existing.jpg" }] });
        const code = await service.ensureCode(id);
        const { token } = await service.verify({ performanceId: id, code }, ip);
        const prepared = await service.prepare({ token, files: manifest });
        prepared.files.forEach(item => { stage(item.media); if (item.thumbnail) stage(item.thumbnail); });
        return { code, token, prepared };
    }
    return { db, docs, objects, service, file, stage, ready, advance: milliseconds => { time += milliseconds; } };
}

test("codes persist, differ by performance, and stay outside public documents", async () => {
    const f = fixture();
    for (const id of ["a", "b"]) f.docs.set(`performances/${id}`, { galleryItems: [] });
    const [a, b, repeat] = await Promise.all([f.service.ensureCode("a"), f.service.ensureCode("b"), f.service.ensureCode("a")]);
    assert.match(a, /^\d{4}$/); assert.notEqual(a, b); assert.equal(a, repeat);
    assert.equal(f.docs.get("performances/a").code, undefined);
});
test("wrong codes fail, including a different performance's code, and repeated guesses are limited", async () => {
    const f = fixture();
    f.docs.set("performances/a", {}); f.docs.set("performances/b", {});
    const a = await f.service.ensureCode("a"); await f.service.ensureCode("b");
    for (let i = 0; i < 8; i++) await assert.rejects(f.service.verify({ performanceId: "b", code: a }, "192.0.2.2"), { code: "incorrect-code" });
    await assert.rejects(f.service.verify({ performanceId: "b", code: a }, "192.0.2.2"), { code: "too-many-attempts" });
});
test("forged tokens and expired sessions cannot authorize an upload", async () => {
    const f = fixture(); const { token } = await f.ready();
    await assert.rejects(f.service.prepare({ token: "f".repeat(64), files: [f.file] }), { code: "invalid-session" });
    f.advance(5 * 3600000);
    await assert.rejects(f.service.finish({ token }), { code: "session-expired" });
});
test("manifest rejects duplicate IDs, oversized files, unsupported content, and path injection", () => {
    const { file } = fixture();
    for (const input of [[file, file], [{ ...file, size: 501 * 1024 * 1024 }], [{ ...file, mimeType: "text/html" }], [{ ...file, id: "../../secret/file" }], []]) assert.throws(() => validateManifest(input));
    assert.throws(() => validateManifest([{ ...file, thumbnail: { size: 200000, mimeType: "image/jpeg" } }]));
});
test("a prepared batch cannot be changed and signed policies require the exact size", async () => {
    const f = fixture(); const { token, prepared } = await f.ready();
    assert.deepEqual(prepared.files[0].media.policy.conditions, [["content-length-range", f.file.size, f.file.size]]);
    await assert.rejects(f.service.prepare({ token, files: [{ ...f.file, name: "changed.jpg" }] }), { code: "batch-locked" });
});
test("retrying or concurrently finishing the same batch publishes each file only once", async () => {
    const f = fixture(); const { token } = await f.ready();
    await Promise.all([f.service.finish({ token }), f.service.finish({ token })]);
    await f.service.finish({ token });
    const gallery = f.docs.get("performances/show-1").galleryItems;
    assert.equal(gallery.length, 2); assert.equal(gallery[0].path, "existing.jpg");
    assert.match(gallery[1].url, /alt=media&token=/);
    assert.equal((await f.service.prepare({ token, files: [f.file] })).complete, true);
});
test("concurrent uploaders append to the selected gallery without overwriting other records", async () => {
    const f = fixture(); const a = await f.ready(), b = await f.ready("show-1", "192.0.2.3");
    f.docs.set("performances/other", { galleryItems: [] });
    await Promise.all([f.service.finish({ token: a.token }), f.service.finish({ token: b.token })]);
    assert.equal(f.docs.get("performances/show-1").galleryItems.length, 3);
    assert.equal(f.docs.get("performances/other").galleryItems.length, 0);
});
test("missing uploads and disguised HTML are never added to the public gallery", async () => {
    const f = fixture(); const { token, prepared } = await f.ready();
    f.objects.clear();
    await assert.rejects(f.service.finish({ token }), { code: "missing-file" });
    f.stage(prepared.files[0].media, Buffer.alloc(f.file.size, 0x3c));
    await assert.rejects(f.service.finish({ token }), { code: "invalid-media" });
    assert.equal(f.docs.get("performances/show-1").galleryItems.length, 1);
});
test("a deleted performance cannot receive an in-flight submission", async () => {
    const f = fixture(); const { token } = await f.ready();
    f.docs.delete("performances/show-1");
    await assert.rejects(f.service.finish({ token }), { code: "not-found" });
});
test("cleanup removes abandoned staging files but preserves completed gallery files", async () => {
    const f = fixture(); const { token } = await f.ready(); await f.service.finish({ token });
    const path = f.docs.get("performances/show-1").galleryItems[1].path;
    f.advance(8 * 86400000); await f.service.cleanup();
    assert.ok(f.objects.has(path));
    assert.equal([...f.objects.keys()].filter(key => key.startsWith("gallery-upload-staging/")).length, 0);
});
test("the installed Storage SDK signs a POST policy restricted to one exact object, type, and size", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const storage = new Storage({ projectId: "local-test", credentials: { client_email: "test@example.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) } });
    const [signed] = await storage.bucket("test-bucket").file("gallery-upload-staging/test/image.jpg").generateSignedPostPolicyV4({ expires: Date.now() + 60000, fields: { "Content-Type": "image/jpeg", success_action_status: "201" }, conditions: [["content-length-range", 1234, 1234]] });
    const policy = JSON.parse(Buffer.from(signed.fields.policy, "base64").toString());
    assert.ok(policy.conditions.some(item => item.key === "gallery-upload-staging/test/image.jpg"));
    assert.ok(policy.conditions.some(item => item["Content-Type"] === "image/jpeg"));
    assert.ok(policy.conditions.some(item => Array.isArray(item) && item[0] === "content-length-range" && item[1] === 1234 && item[2] === 1234));
});
test("media signature check accepts WebP and rejects HTML despite image MIME", () => {
    assert.equal(matchesMedia(Buffer.from("RIFF0000WEBPsample"), "image/webp"), true);
    assert.equal(matchesMedia(Buffer.from("<html>not an image</html>"), "image/jpeg"), false);
});

test("code unlock returns gallery and deletion-only batch waits for finish", async () => {
    const f=fixture(); f.docs.set("performances/a",{galleryItems:[{id:"one",url:"https://example.com/one.jpg"},{id:"two",url:"https://example.com/two.mp4",type:"video"}]});
    const code=await f.service.ensureCode("a");
    const result=await f.service.verify({performanceId:"a",code},"deletion-test");
    assert.equal(result.galleryEditing,true); assert.equal(result.galleryItems.length,2);
    const deletions=[result.galleryItems[0].deletionKey];
    const prepared=await f.service.prepare({token:result.token,files:[],deletions});
    assert.deepEqual(prepared.files,[]);assert.equal(f.docs.get("performances/a").galleryItems.length,2);
    const finished=await f.service.finish({token:result.token});
    assert.equal(finished.galleryItems.length,1);assert.equal(finished.galleryItems[0].id,"two");
    await f.service.finish({token:result.token});assert.equal(f.docs.get("performances/a").galleryItems.length,1);
});
test("deletions are scoped to the code's performance and locked on prepare", async () => {
    const f=fixture();
    for(const id of ["a","b"])f.docs.set(`performances/${id}`,{galleryItems:[{id:"same",url:"https://example.com/shared.jpg"}]});
    const a=await f.service.verify({performanceId:"a",code:await f.service.ensureCode("a")},"a");
    const b=await f.service.verify({performanceId:"b",code:await f.service.ensureCode("b")},"b");
    await assert.rejects(f.service.prepare({token:a.token,files:[],deletions:[b.galleryItems[0].deletionKey]}),{code:"invalid-deletions"});
    await assert.rejects(f.service.prepare({token:"f".repeat(64),files:[],deletions:[a.galleryItems[0].deletionKey]}),{code:"invalid-session"});
    await f.service.prepare({token:a.token,files:[],deletions:[a.galleryItems[0].deletionKey]});
    await assert.rejects(f.service.prepare({token:a.token,files:[f.file],deletions:[]}),{code:"batch-locked"});
    f.advance(5*3600000);await assert.rejects(f.service.finish({token:a.token}),{code:"session-expired"});
    assert.equal(f.docs.get("performances/a").galleryItems.length,1);
});
test("mixed edits commit atomically and preserve concurrently added gallery files", async () => {
    const f=fixture();f.docs.set("performances/a",{galleryItems:[{id:"old",url:"https://example.com/old.jpg"}]});
    const access=await f.service.verify({performanceId:"a",code:await f.service.ensureCode("a")},"mixed");
    const prep=await f.service.prepare({token:access.token,files:[f.file],deletions:[access.galleryItems[0].deletionKey]});
    await assert.rejects(f.service.finish({token:access.token}),{code:"missing-file"});
    assert.equal(f.docs.get("performances/a").galleryItems[0].id,"old");
    f.docs.get("performances/a").galleryItems.push({id:"other",url:"https://example.com/other.jpg"});
    f.stage(prep.files[0].media);
    await Promise.all([f.service.finish({token:access.token}),f.service.finish({token:access.token})]);
    const result=f.docs.get("performances/a").galleryItems;
    assert.equal(result.length,2);assert.equal(result[0].id,"other");assert.equal(result[1].name,f.file.name);
});
