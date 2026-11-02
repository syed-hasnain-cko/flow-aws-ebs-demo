'use strict';
// Compare the routes the code defines with what API Gateway exposes (read-only helpers + the plan builder).
const { aws, PIN } = require('./lib');

function fetchResources() {
    const res = aws(['apigateway', 'get-resources', '--rest-api-id', PIN.restApiId, '--limit', '500', '--embed', 'methods']);
    return res.items.map(r => ({ id: r.id, path: r.path, parentId: r.parentId, methods: Object.keys(r.resourceMethods || {}) }));
}

// Express `/a/:id` → gateway `/a/{id}`; a route is "covered" when
//   - a resource with exactly that shape has a non-OPTIONS method, or
//   - an ancestor prefix has a `{proxy+}` child with a non-OPTIONS method (the catch-all convention used for /standalone, /competitors, /disputes).
function coverage(routes, resources) {
    const live = resources.filter(r => r.methods.some(m => m !== 'OPTIONS'));
    const exact = new Set(live.map(r => r.path.replace(/\{[^}]+\}/g, 'X')));
    const proxies = new Set(live.filter(r => r.path.endsWith('/{proxy+}')).map(r => r.path.slice(0, -'/{proxy+}'.length)));
    const byPath = new Map();
    routes.forEach(r => { if (!byPath.has(r.path)) byPath.set(r.path, []); byPath.get(r.path).push(r.method); });
    const covered = [], missing = [];
    for (const [p, methods] of [...byPath].sort()) {
        const shape = p.replace(/:[^/]+/g, 'X');
        let how = exact.has(shape) ? 'exact' : null;
        if (!how) {
            const parts = shape.split('/');                       // ['', 'standalone', 'vault']
            for (let i = 2; i <= parts.length - 1; i++) {         // every ancestor prefix that is shorter than the route itself
                const pre = parts.slice(0, i).join('/');
                if (proxies.has(pre)) { how = `proxy ${pre}/{proxy+}`; break; }
            }
        }
        (how ? covered : missing).push({ path: p, methods, how });
    }
    return { covered, missing };
}

// What has to exist for a missing route, following this API's own convention: a top-level resource /<x> (ANY + OPTIONS),
// plus /<x>/{proxy+} (ANY + OPTIONS) when the route has deeper segments.
function planFor(missing, resources) {
    const have = new Set(resources.map(r => r.path));
    const wanted = new Map();
    missing.forEach(m => {
        const seg = m.path.split('/')[1];
        wanted.set('/' + seg, true);
        if (m.path.split('/').length > 2) wanted.set(`/${seg}/{proxy+}`, true);
    });
    return [...wanted.keys()].filter(p => !have.has(p) || !resources.find(r => r.path === p).methods.some(x => x !== 'OPTIONS')).sort();
}

module.exports = { fetchResources, coverage, planFor };
