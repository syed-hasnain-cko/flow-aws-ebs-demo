'use strict';
// npm run aws:check — read-only: who am I, and are the pinned Lambda / API / stage reachable and wired together?
const { aws, guard, PIN, PROFILE, API_BASE, log, ok, warn, fail } = require('./lib');
const { fetchResources } = require('./gateway');
try {
    log(`\nAWS setup check (profile ${PROFILE}, ${PIN.region})`);
    const { role } = guard(); ok(`signed in as role ${role}`);
    const fn = aws(['lambda', 'get-function-configuration', '--function-name', PIN.lambda]);
    ok(`Lambda ${PIN.lambda}: ${fn.Runtime}, ${(fn.CodeSize / 1048576).toFixed(1)} MB, status ${fn.LastUpdateStatus}, last modified ${fn.LastModified}`);
    const api = aws(['apigateway', 'get-rest-api', '--rest-api-id', PIN.restApiId]);
    ok(`API Gateway “${api.name}” (${PIN.restApiId})`);
    const st = aws(['apigateway', 'get-stage', '--rest-api-id', PIN.restApiId, '--stage-name', PIN.stage]);
    ok(`stage “${PIN.stage}” — last deployed ${st.lastUpdatedDate}`);
    const ref = fetchResources().find(r => r.path === '/payments');
    const integ = aws(['apigateway', 'get-integration', '--rest-api-id', PIN.restApiId, '--resource-id', ref.id, '--http-method', 'ANY']);
    if (String(integ.uri).includes(`function:${PIN.lambda}/`)) ok('API Gateway → Lambda wiring points at the pinned function'); else warn('the /payments integration does not point at the pinned Lambda');
    log(`  ℹ live base URL: ${API_BASE}\n`);
} catch (e) { fail(e.message); }
