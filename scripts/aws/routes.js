'use strict';
// List every HTTP route the Express app defines (method + path), by loading the controller with stubs for
// anything that is not installed locally (Lambda-layer packages, the AWS SDK) and walking the router tree.
// No network calls, no real secrets: dummy env values are used just to let the modules load.
const path = require('path');
const Module = require('module');
const { SRC_DIR } = require('./lib');

function makeStub() {
    const stub = new Proxy(function () {}, { get: (t, p) => (p === 'then' || p === Symbol.toPrimitive ? undefined : stub), apply: () => stub, construct: () => stub });
    return stub;
}

function listRoutes() {
    const orig = Module._load, stub = makeStub();
    Module._load = function (request, ...rest) {
        try { return orig.call(this, request, ...rest); }
        catch (e) { if (e.code === 'MODULE_NOT_FOUND' && !request.startsWith('.') && !path.isAbsolute(request)) return stub; throw e; }
    };
    const saved = { ...process.env };
    const dummies = { SECRET_KEY: 'sk_sbox_' + 'x'.repeat(26), GW_URL: 'https://api.sandbox.checkout.com', PROCESSING_CHANNEL_ID: 'pc_' + 'x'.repeat(26), ENV: 'DEV' };
    Object.entries(dummies).forEach(([k, v]) => { if (!process.env[k]) process.env[k] = v; });
    let router;
    try { router = require(path.join(SRC_DIR, 'api-route-controller.js')); }
    finally { Module._load = orig; process.env = saved; }

    const out = [];
    (function walk(r, prefix) {
        (r.stack || []).forEach(l => {
            if (l.route) Object.keys(l.route.methods).forEach(m => out.push({ method: m.toUpperCase(), path: (prefix + l.route.path).replace(/\/+/g, '/') }));
            else if (l.name === 'router' && l.handle && l.handle.stack) {
                const m = l.regexp.toString().match(/^\/\^\\\/(.+?)\\\/\?\(\?=\\\/\|\$\)\/i$/);
                walk(l.handle, prefix + (m ? '/' + m[1].replace(/\\\//g, '/') : ''));
            }
        });
    })(router, '');
    return out.sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
}

if (require.main === module) {
    const fs = require('fs');
    const routes = listRoutes();
    const file = path.join(__dirname, 'routes.manifest.json');
    fs.writeFileSync(file, JSON.stringify(routes, null, 2) + '\n');
    console.log(`${routes.length} routes (${new Set(routes.map(r => r.path)).size} unique paths) → ${path.relative(process.cwd(), file)}`);
}
module.exports = { listRoutes };
