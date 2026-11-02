'use strict';
// npm run api:diff — read-only: which routes in the code are NOT reachable through API Gateway?
const { guard, log, ok, warn, fail, PIN, hasFlag } = require('./lib');
const { listRoutes } = require('./routes');
const { fetchResources, coverage, planFor } = require('./gateway');
try {
    guard();
    const routes = listRoutes(), resources = fetchResources();
    const { covered, missing } = coverage(routes, resources);
    log(`\nRoutes in code: ${routes.length} (${covered.length + missing.length} paths) · API Gateway resources: ${resources.length} (stage ${PIN.stage})`);
    const via = {}; covered.forEach(c => { via[c.how] = (via[c.how] || 0) + 1; });
    Object.entries(via).forEach(([k, n]) => ok(`${n} path${n > 1 ? 's' : ''} covered — ${k}`));
    if (!missing.length) { ok('every route is reachable through API Gateway — nothing to add\n'); process.exit(0); }
    warn(`${missing.length} path(s) NOT reachable:`);
    missing.forEach(m => log(`      ${m.methods.join(',').padEnd(12)} ${m.path}`));
    log(`  → needs: ${planFor(missing, resources).join(', ')}   (run: npm run api:sync   [dry run]  /  npm run api:sync -- --apply)\n`);
    process.exit(hasFlag('--no-fail') ? 0 : 1);
} catch (e) { fail(e.message); }
