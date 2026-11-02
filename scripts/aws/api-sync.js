'use strict';
// npm run api:sync            → DRY RUN: prints what would be created
// npm run api:sync -- --apply → creates the missing resources/methods (Lambda proxy, same shape as the existing ones) and deploys the stage
// Convention copied from this API: /<x> ANY + OPTIONS(mock CORS), and /<x>/{proxy+} ANY + OPTIONS when the route is nested.
// The Lambda already allows the whole API (zzrte604h4/*/*/*), so no per-route permission is needed.
// `--simulate /new-prefix/thing` pretends a route exists in code (to preview — or, with --apply, to test — the plan).
const { aws, guard, PIN, log, ok, warn, fail, hasFlag, flagValue } = require('./lib');
const { listRoutes } = require('./routes');
const { fetchResources, coverage, planFor } = require('./gateway');

const run = (cmd, args) => aws([cmd, ...args]);
const TEST_PREFIX = '/__synctest';

// Returns { missing, plan, applied, deploymentId }. Throws on errors (callers decide how to report).
async function syncRoutes({ apply = false, simulate } = {}) {
    if (simulate && apply && !simulate.startsWith(TEST_PREFIX)) throw new Error(`--simulate together with --apply is only allowed for the test prefix ${TEST_PREFIX} (it would create real resources for a route that does not exist).`);
    let routes = listRoutes();
    if (simulate) routes = [...routes, { method: 'POST', path: simulate }];
    const resources = fetchResources();
    const { missing } = coverage(routes, resources);
    log(`\nAPI Gateway sync (${apply ? 'APPLY' : 'dry run'}) — API ${PIN.restApiId}, stage ${PIN.stage}`);
    if (!missing.length) { ok('nothing to do — every route is already reachable'); return { missing, plan: [], applied: false }; }
    const plan = planFor(missing, resources);
    missing.forEach(m => warn(`${m.methods.join(',')} ${m.path} is not reachable`));
    log('  plan:');
    plan.forEach(p => log(`    + resource ${p}  → ANY (Lambda proxy ${PIN.lambda}) + OPTIONS (mock CORS)`));
    log(`    + deployment to stage “${PIN.stage}”`);
    if (!apply) { log('\n  Dry run only — nothing was changed. Re-run with  -- --apply  to execute.'); return { missing, plan, applied: false }; }

    // reference shapes copied from an existing flat route
    const ref = resources.find(r => r.path === '/payments'); if (!ref) throw new Error('reference resource /payments not found');
    const anyInt = aws(['apigateway', 'get-integration', '--rest-api-id', PIN.restApiId, '--resource-id', ref.id, '--http-method', 'ANY']);
    const optMethod = aws(['apigateway', 'get-method', '--rest-api-id', PIN.restApiId, '--resource-id', ref.id, '--http-method', 'OPTIONS']);
    const optInt = aws(['apigateway', 'get-integration', '--rest-api-id', PIN.restApiId, '--resource-id', ref.id, '--http-method', 'OPTIONS']);
    const optIntResp = aws(['apigateway', 'get-integration-response', '--rest-api-id', PIN.restApiId, '--resource-id', ref.id, '--http-method', 'OPTIONS', '--status-code', '200']);
    const respParams = Object.fromEntries(Object.keys(optMethod.methodResponses['200'].responseParameters || {}).map(k => [k, false]));
    const root = resources.find(r => r.path === '/');
    const idOf = (p) => (resources.find(r => r.path === p) || {}).id;

    for (const p of plan) {
        const parts = p.split('/').filter(Boolean), part = parts[parts.length - 1];
        const parentPath = parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : '/';
        const parentId = idOf(parentPath) || root.id;
        let id = idOf(p);
        if (!id) { id = run('apigateway', ['create-resource', '--rest-api-id', PIN.restApiId, '--parent-id', parentId, '--path-part', part]).id; resources.push({ id, path: p, methods: [] }); ok(`created resource ${p}`); }
        const methods = (resources.find(r => r.id === id).methods) || [];
        if (!methods.includes('ANY')) {
            run('apigateway', ['put-method', '--rest-api-id', PIN.restApiId, '--resource-id', id, '--http-method', 'ANY', '--authorization-type', 'NONE']);
            run('apigateway', ['put-integration', '--rest-api-id', PIN.restApiId, '--resource-id', id, '--http-method', 'ANY', '--type', 'AWS_PROXY', '--integration-http-method', 'POST', '--uri', anyInt.uri]);
            ok(`${p}: ANY → Lambda proxy`);
        }
        if (!methods.includes('OPTIONS')) {
            run('apigateway', ['put-method', '--rest-api-id', PIN.restApiId, '--resource-id', id, '--http-method', 'OPTIONS', '--authorization-type', 'NONE']);
            run('apigateway', ['put-method-response', '--rest-api-id', PIN.restApiId, '--resource-id', id, '--http-method', 'OPTIONS', '--status-code', '200', '--response-parameters', JSON.stringify(respParams)]);
            run('apigateway', ['put-integration', '--rest-api-id', PIN.restApiId, '--resource-id', id, '--http-method', 'OPTIONS', '--type', 'MOCK', '--request-templates', JSON.stringify(optInt.requestTemplates || { 'application/json': '{"statusCode": 200}' })]);
            run('apigateway', ['put-integration-response', '--rest-api-id', PIN.restApiId, '--resource-id', id, '--http-method', 'OPTIONS', '--status-code', '200', '--response-parameters', JSON.stringify(optIntResp.responseParameters || {})]);
            ok(`${p}: OPTIONS (CORS mock)`);
        }
    }
    const dep = run('apigateway', ['create-deployment', '--rest-api-id', PIN.restApiId, '--stage-name', PIN.stage, '--description', `api:sync ${new Date().toISOString()}`]);
    ok(`deployed to stage “${PIN.stage}” (deployment ${dep.id})`);
    return { missing, plan, applied: true, deploymentId: dep.id };
}

// Remove the throwaway test prefix (used only by aws:verify). Refuses to delete anything else.
async function removeTestResources() {
    const res = fetchResources().find(r => r.path === TEST_PREFIX);
    if (!res) return false;
    aws(['apigateway', 'delete-resource', '--rest-api-id', PIN.restApiId, '--resource-id', res.id]);   // children go with it
    aws(['apigateway', 'create-deployment', '--rest-api-id', PIN.restApiId, '--stage-name', PIN.stage, '--description', 'api:verify cleanup']);
    return true;
}

if (require.main === module) {
    (async () => {
        try { guard(); await syncRoutes({ apply: hasFlag('--apply'), simulate: flagValue('--simulate') }); log(''); }
        catch (e) { fail(e.message); }
    })();
}
module.exports = { syncRoutes, removeTestResources, TEST_PREFIX };
