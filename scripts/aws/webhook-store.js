'use strict';
// The shared webhook event store's AWS resources (see amplify/.../src/webhook-store.js).
//   npm run webhook:store              → DRY RUN: does the table exist, is TTL on, can the Lambda's role use it?
//   npm run webhook:store -- --apply   → creates what is missing (idempotent): DynamoDB table (on-demand, TTL attribute "ttl")
//                                         + an inline policy on the Lambda's execution role limited to THAT table only.
// Touches nothing else. The role is read from the pinned Lambda; the account number is never printed.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { aws, guard, PIN, mask, log, ok, warn, fail, hasFlag } = require('./lib');

const TABLE = 'flowDemoWebhookEvents-staging';      // keep in step with TABLE in webhook-store.js
const POLICY = 'flowDemoWebhookEventsAccess';
const APPLY = hasFlag('--apply');

const exists = (fn) => { try { return fn(); } catch (e) { if (/ResourceNotFound|NoSuchEntity|cannot be found/i.test(e.message)) return null; throw e; } };

(async () => {
    log(`\nWebhook store (${APPLY ? 'APPLY' : 'dry run'}) — table ${TABLE}`);
    const { role } = guard(); ok(`signed in as ${role}`);
    const account = aws(['sts', 'get-caller-identity']).Account;
    const roleName = aws(['lambda', 'get-function-configuration', '--function-name', PIN.lambda]).Role.split('/').pop();
    const arn = `arn:aws:dynamodb:${PIN.region}:${account}:table/${TABLE}`;

    // 1. table
    let t = exists(() => aws(['dynamodb', 'describe-table', '--table-name', TABLE]).Table);
    if (t) ok(`table exists (${t.TableStatus}, ${(t.BillingModeSummary || {}).BillingMode || 'provisioned'})`);
    else if (APPLY) {
        aws(['dynamodb', 'create-table', '--table-name', TABLE, '--attribute-definitions', 'AttributeName=pk,AttributeType=S', 'AttributeName=sk,AttributeType=S',
            '--key-schema', 'AttributeName=pk,KeyType=HASH', 'AttributeName=sk,KeyType=RANGE', '--billing-mode', 'PAY_PER_REQUEST']);
        aws(['dynamodb', 'wait', 'table-exists', '--table-name', TABLE], { json: false });
        ok('table created'); t = true;
    } else warn('table is missing — would create it (on-demand billing)');

    // 2. TTL
    if (t) {
        const ttl = aws(['dynamodb', 'describe-time-to-live', '--table-name', TABLE]).TimeToLiveDescription || {};
        if (ttl.TimeToLiveStatus === 'ENABLED' || ttl.TimeToLiveStatus === 'ENABLING') ok(`TTL on attribute "${ttl.AttributeName}"`);
        else if (APPLY) { aws(['dynamodb', 'update-time-to-live', '--table-name', TABLE, '--time-to-live-specification', 'Enabled=true,AttributeName=ttl']); ok('TTL enabled on "ttl"'); }
        else warn('TTL is off — would enable it on attribute "ttl"');
    }

    // 3. role policy
    const pol = exists(() => aws(['iam', 'get-role-policy', '--role-name', roleName, '--policy-name', POLICY]));
    if (pol) ok(`role has ${POLICY}`);
    else if (APPLY) {
        const doc = { Version: '2012-10-17', Statement: [{ Sid: 'WebhookEventsTable', Effect: 'Allow', Action: ['dynamodb:PutItem', 'dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:DeleteItem', 'dynamodb:BatchWriteItem'], Resource: arn }] };
        const f = path.join(os.tmpdir(), `webhook-policy-${process.pid}.json`);
        fs.writeFileSync(f, JSON.stringify(doc), { mode: 0o600 });
        try { aws(['iam', 'put-role-policy', '--role-name', roleName, '--policy-name', POLICY, '--policy-document', `file://${f}`], { json: false }); }
        finally { fs.unlinkSync(f); }
        ok(`policy ${POLICY} added to the Lambda role (this one table only)`);
    } else warn(`the Lambda role has no ${POLICY} — would add it (PutItem/GetItem/Query/DeleteItem/BatchWriteItem on this table only)`);

    log(APPLY ? '\nDone.\n' : '\nDry run only — nothing was changed. Re-run with  -- --apply  to create what is missing.\n');
})().catch(e => fail(mask(e.message)));
