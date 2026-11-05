'use strict';
// =============================================================================
// Shared webhook event store
// Every Lambda container used to keep webhooks in its OWN memory, so an event delivered to container A was invisible to a
// browser poll answered by container B. This module keeps them in one DynamoDB table (TTL'd) that every container reads.
//
//   put(ns, key, payload, { uid, ring, slot, ttlSec }) → store an event under <ns>#<key> (with ring:true also in the <ns> ring buffer).
//                                                    slot:true = ONE item per key that each new event overwrites (the old Map.set
//                                                    behaviour) — consuming it is a single atomic delete, so exactly one caller wins.
//   take(ns, key, 'latest' | 'oldest')            → consume: 'latest' returns the newest event and clears the slot (old
//                                                    one-slot behaviour); 'oldest' returns the oldest and removes only it (a queue)
//   all(ns, key)                                  → every unexpired event for the key, oldest first, NOT consumed
//   recent(ns, limit)                             → the newest ring-buffer events, newest first, NOT consumed
//
// Table (created by `npm run webhook:store -- --apply`): pk (S) = "<ns>#<key>", sk (S) = "<receivedAt ms, 13 digits>#<uid>",
// attrs uid, json, ttl (epoch seconds — DynamoDB TTL, deletes lazily, so reads also check expiresAt).
// Safety net: when a DynamoDB write FAILS (outage, missing permission, SDK absent) the event is kept in this container's memory
// instead and reads merge both, so the worst case is the old per-container behaviour — never a dropped event. While DynamoDB is
// healthy nothing is kept in memory (otherwise a container could hand out an event another container already consumed).
// Nothing here ever throws to a caller.
// =============================================================================
const crypto = require('crypto');

const TABLE = process.env.WEBHOOK_TABLE || 'flowDemoWebhookEvents-staging';
const DEFAULT_TTL_SEC = 15 * 60;
const RING = '__ALL';
const RING_MAX = 200;
const CALL_TIMEOUT_MS = 2500;

let sdkOverride = null;          // tests only
let client = null;
let unavailable = false;         // the SDK itself is missing (local run) — don't retry on every call

function sdk() {
    if (sdkOverride) return sdkOverride;
    if (unavailable) return null;
    try { return require('@aws-sdk/client-dynamodb'); }          // provided by the Node.js Lambda runtime
    catch (e) { unavailable = true; console.log('[webhook-store] AWS SDK not available — memory only:', e.message); return null; }
}
async function send(makeCommand) {
    const m = sdk(); if (!m) return null;
    try {
        client = client || new m.DynamoDBClient({ maxAttempts: 2 });
        return await client.send(makeCommand(m), { abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
    } catch (e) {
        console.log(`[webhook-store] DynamoDB call failed (${e.name || 'error'}): ${String(e.message || e).slice(0, 160)}`);
        return null;
    }
}

// ---- in-memory mirror ---------------------------------------------------------------------------------------------------
const mem = new Map();           // pk → [{ sk, ev }]
const pad = (n) => String(n).padStart(13, '0');
const alive = (ev) => !ev.expiresAt || ev.expiresAt > Date.now();
function memList(pk) {
    const fresh = (mem.get(pk) || []).filter(x => alive(x.ev));
    const capped = pk.endsWith('#' + RING) ? fresh.slice(-RING_MAX) : fresh;
    if (capped.length) mem.set(pk, capped); else mem.delete(pk);
    return capped;
}
const memAdd = (pk, entry) => { const l = memList(pk); l.push(entry); mem.set(pk, l); };

// ---- DynamoDB ---------------------------------------------------------------------------------------------------------------
async function dbPut(pk, entry) {
    const ttl = Math.floor(entry.ev.expiresAt / 1000);
    return send(m => new m.PutItemCommand({ TableName: TABLE, Item: { pk: { S: pk }, sk: { S: entry.sk }, uid: { S: entry.ev.uid }, json: { S: JSON.stringify(entry.ev) }, ttl: { N: String(ttl) } } }));
}
async function dbQuery(pk, forward, limit) {
    const r = await send(m => new m.QueryCommand({ TableName: TABLE, KeyConditionExpression: 'pk = :p', ExpressionAttributeValues: { ':p': { S: pk } }, ScanIndexForward: forward, Limit: limit, ConsistentRead: true }));
    if (!r || !r.Items) return [];
    return r.Items.map(it => { try { return { sk: it.sk.S, ev: JSON.parse(it.json.S), db: true }; } catch (e) { return null; } }).filter(x => x && alive(x.ev));
}
// Atomic: DeleteItem with ALL_OLD returns the item only to the ONE caller that actually removed it — that is what makes
// "consume" exactly-once when several containers (or several polls) race for the same event.
async function dbClaim(pk, sk) {
    const r = await send(m => new m.DeleteItemCommand({ TableName: TABLE, Key: { pk: { S: pk }, sk: { S: sk } }, ReturnValues: 'ALL_OLD' }));
    return !!(r && r.Attributes);
}
async function dbDelete(pk, entries) {
    for (let i = 0; i < entries.length; i += 25) {
        const chunk = entries.slice(i, i + 25);
        await send(m => new m.BatchWriteItemCommand({ RequestItems: { [TABLE]: chunk.map(e => ({ DeleteRequest: { Key: { pk: { S: pk }, sk: { S: e.sk } } } })) } }));
    }
}

// ---- merged view ------------------------------------------------------------------------------------------------------------
async function list(pk, forward, limit) {
    const byUid = new Map();       // a redelivered event (same uid) shows up once; `dups` keeps every stored copy so a consume can remove them all
    const add = (x) => { const cur = byUid.get(x.ev.uid); if (cur) cur.dups.push(x); else byUid.set(x.ev.uid, { ...x, dups: [x] }); };
    (await dbQuery(pk, forward, limit)).forEach(add);
    memList(pk).forEach(add);
    const rows = [...byUid.values()].sort((a, b) => (a.ev.receivedAt - b.ev.receivedAt) || (a.sk < b.sk ? -1 : 1));
    if (!forward) rows.reverse();
    return rows.slice(0, limit);
}
const publicEvent = (ev) => { const { uid, expiresAt, ...rest } = ev; return rest; };

async function put(ns, key, payload, opts = {}) {
    try {
        const receivedAt = Date.now();
        const uid = String(opts.uid || `${receivedAt}-${crypto.randomBytes(4).toString('hex')}`);
        const ev = { ...payload, receivedAt, uid, expiresAt: receivedAt + (opts.ttlSec || DEFAULT_TTL_SEC) * 1000 };
        const entry = { sk: opts.slot ? 'slot' : `${pad(receivedAt)}#${uid}`, ev };
        const pks = [];
        if (key) pks.push(`${ns}#${key}`);
        if (opts.ring) pks.push(`${ns}#${RING}`);
        await Promise.all(pks.map(async (pk) => {
            if (await dbPut(pk, entry)) return;
            if (opts.slot && pk === `${ns}#${key}`) mem.set(pk, [entry]); else memAdd(pk, entry);      // DynamoDB failed → this container's memory
        }));
        return publicEvent(ev);
    } catch (e) { console.log('[webhook-store] put failed:', e.message); return null; }
}

async function take(ns, key, mode = 'latest') {
    try {
        const pk = `${ns}#${key}`;
        const oldest = mode === 'oldest';
        const rows = await list(pk, oldest, oldest ? 5 : 25);
        // latest (a one-slot store): only the newest event can win; if someone else already took it the slot is gone → null.
        // oldest (a queue): a caller that loses a race moves on to the next event.
        for (const row of oldest ? rows : rows.slice(0, 1)) {
            const memUids = new Set(memList(pk).map(x => x.ev.uid));
            let won;
            if (row.db) won = await dbClaim(pk, row.dups.find(d => d.db).sk);
            else { won = memUids.has(row.ev.uid); }
            if (!won) continue;
            // winner: also remove redelivered copies and (latest) everything else in the slot — best effort, nobody else can return them as "this" event
            const others = oldest ? row.dups.filter(d => d.sk !== row.sk) : rows.flatMap(r => r.dups).filter(d => d.sk !== row.sk);
            const uids = new Set([row.ev.uid, ...others.map(d => d.ev.uid)]);
            const rest = memList(pk).filter(x => !uids.has(x.ev.uid));
            if (rest.length) mem.set(pk, rest); else mem.delete(pk);
            await dbDelete(pk, others.filter(d => d.db));
            return publicEvent(row.ev);
        }
        return null;
    } catch (e) { console.log('[webhook-store] take failed:', e.message); return null; }
}

async function all(ns, key) {
    try { return (await list(`${ns}#${key}`, true, 100)).map(r => publicEvent(r.ev)); }
    catch (e) { console.log('[webhook-store] all failed:', e.message); return []; }
}

async function recent(ns, limit = RING_MAX) {
    try { return (await list(`${ns}#${RING}`, false, limit)).map(r => publicEvent(r.ev)); }
    catch (e) { console.log('[webhook-store] recent failed:', e.message); return []; }
}

module.exports = { put, take, all, recent, TABLE, _test: { setSdk: (m) => { sdkOverride = m; client = null; }, reset: () => { mem.clear(); client = null; } } };
