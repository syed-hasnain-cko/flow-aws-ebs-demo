# Add Backend Route — Project Skill

You are working inside this Checkout.com demo app. The single backend file that owns all Express routes is:

`amplify/backend/function/flowDemoLambdaSyed/src/api-route-controller.js`

All routes proxy to the Checkout.com API using either `axios` (for raw HTTP) or the `cko` SDK instance (`checkout-sdk-node`). This skill generates a correctly-structured route and tells the developer exactly where to insert it.

---

## STEP 1 — Gather information

Ask these questions all at once:

```
1. HTTP method? (GET / POST / PUT)

2. Route path? (e.g. /my-new-route)
   Convention in this project: kebab-case, verb-noun style (e.g. /capture-payment, /get-payment-details)

3. Which Checkout.com API endpoint does it call?
   e.g. POST https://api.sandbox.checkout.com/payments/{id}/captures
   — If unsure, say what it should do and I'll look it up via the MCP tools.

4. How is the Checkout.com resource ID passed to your route?
   a) Query param  — e.g. req.query.paymentId  (used by: capture, void, refund, get-payment-details)
   b) Request body — e.g. req.body.setupId     (used by: payment-sessions, payment-setups)
   c) No ID needed — e.g. /config

5. Does the Checkout.com request need a body forwarded from the frontend?
   a) Forward req.body directly (most POST/PUT routes)
   b) Empty body {} (capture, void, refund — amount already captured)
   c) Custom body built from req.body fields (e.g. google-pay, apple-pay)

6. Does it need 'Content-Type': 'application/json' in the outbound headers?
   — POST/PUT routes that send a body: YES (see payment-setups, update-payment-setups)
   — GET routes and body-less POSTs (capture/void): NO — Authorization header only is fine

7. Should it use axios (raw HTTP) or the cko SDK (checkout-sdk-node)?
   — Use axios for: any endpoint not well-covered by the SDK (payment-setups, confirm flows)
   — Use cko for: standard payments, tokenization (google-pay and apple-pay already use cko)
   — Default: axios unless you specifically need SDK chaining (tokenize then pay)
```

If the developer doesn't know the Checkout.com endpoint, use `mcp__checkout-developer-mcp__api_search` or `mcp__checkout-developer-mcp__list_operations` to find it before generating code.

---

## STEP 2 — Show what will be generated

Before writing anything, show the developer the exact route code and confirm:

```
I'll add the following route to:
  amplify/backend/function/flowDemoLambdaSyed/src/api-route-controller.js

[show the generated code block here]

Inserted after: [name of the route it will be placed after — pick the most logical neighbour]

Shall I go ahead? (yes/no)
Also: remember to add this path to AWS API Gateway after I write it.
```

---

## STEP 3 — Generate the route

Use the correct template from the patterns below. Read the file first to find the exact insertion point — always insert near logically related routes (e.g. a new capture variant goes near `/capture-payment`).

---

### PATTERN A — GET with query param ID (e.g. get-payment-details, get-payment-actions)

```js
router.get('/route-name', async (req, res) => {
    try {
        const response = await axios.get(`${process.env.GW_URL}/cko-endpoint/${req.query.resourceId}`, {
            headers: {
                Authorization: `Bearer ${API_SECRET_KEY}`,
            },
        });
        res.send(response.data);
    } catch (error) {
        res.status(500).send({ error: error.response?.data || error.message });
    }
});
```

---

### PATTERN B — POST with body forwarded, no Content-Type override needed (e.g. payment-sessions)

```js
router.post('/route-name', async (req, res) => {
    try {
        const response = await axios.post(`${process.env.GW_URL}/cko-endpoint`, req.body, {
            headers: {
                Authorization: `Bearer ${API_SECRET_KEY}`,
            },
        });
        res.send(response.data);
    } catch (error) {
        res.status(500).send({ error: error.response?.data || error.message });
    }
});
```

---

### PATTERN C — POST/PUT with body forwarded + explicit Content-Type (e.g. payment-setups, update-payment-setups)

```js
router.post('/route-name', async (req, res) => {
    try {
        const response = await axios.post(`${process.env.GW_URL}/cko-endpoint`, req.body, {
            headers: {
                Authorization: `Bearer ${API_SECRET_KEY}`,
                'Content-Type': 'application/json',
            },
        });
        res.send(response.data);
    } catch (error) {
        console.error('Route error:', error.response ? error.response.data : error.message);
        res.status(500).send(error.response ? error.response.data : { error: 'Internal Server Error' });
    }
});
```

Use this pattern when forwarding structured JSON to Checkout.com endpoints that are strict about content type (payment-setups, confirm flows, etc.).

---

### PATTERN D — POST with query param ID + empty body (e.g. capture-payment, void-payment)

```js
router.post('/route-name', async (req, res) => {
    try {
        const response = await axios.post(
            `${process.env.GW_URL}/cko-endpoint/${req.query.resourceId}/action`,
            {},
            {
                headers: {
                    Authorization: `Bearer ${API_SECRET_KEY}`,
                },
            }
        );
        res.send(response.data);
    } catch (error) {
        res.status(500).send({ error: error.response?.data || error.message });
    }
});
```

---

### PATTERN E — POST with query param ID + body forwarded (e.g. confirm-payment-setups, update with ID)

```js
router.post('/route-name', async (req, res) => {
    try {
        const response = await axios.post(
            `${process.env.GW_URL}/cko-endpoint/${req.query.resourceId}/sub-action`,
            req.body,
            { headers: { Authorization: `Bearer ${API_SECRET_KEY}` } }
        );
        res.send(response.data);
    } catch (error) {
        res.status(500).send(error.response?.data || error.message);
    }
});
```

---

### PATTERN F — PUT with query param ID + body forwarded (e.g. update-payment-setups)

```js
router.put('/route-name', async (req, res) => {
    try {
        const response = await axios.put(
            `${process.env.GW_URL}/cko-endpoint/${req.query.resourceId}`,
            req.body,
            {
                headers: {
                    Authorization: `Bearer ${API_SECRET_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        res.send(response.data);
    } catch (error) {
        res.status(500).send(error.response ? error.response.data : error.message);
    }
});
```

---

### PATTERN G — CKO SDK route (tokenize + pay, e.g. google-pay, apple-pay)

Use this only when you need to chain `cko.tokens.request()` → `cko.payments.request()`.

```js
router.post('/route-name', async (req, res) => {
    try {
        const token = await cko.tokens.request({
            type: 'tokentype',
            token_data: {
                // extract from req.body
            },
        });

        const payment = await cko.payments.request({
            source: { type: 'token', token: token.token },
            amount:                req.body.amount,
            currency:              req.body.currency,
            reference:             req.body.reference,
            processing_channel_id: req.body.processing_channel_id,
            capture:               req.body.capture,
            '3ds':                 req.body['3ds'],
            success_url:           req.body.success_url,
            failure_url:           req.body.failure_url,
        });

        res.send({ payment });
    } catch (error) {
        console.log(error);
        res.status(500).send({ error: error.message || 'Processing failed' });
    }
});
```

---

## STEP 4 — Post-write checklist

After the route is written, remind the developer:

```
[ ] Route added to api-route-controller.js ✓
[ ] Add this route to AWS API Gateway:
      Method:   [GET/POST/PUT]
      Path:     /route-name
      Integration: Lambda proxy → flowDemoLambdaSyed
[ ] If frontend calls this route: update the fetch URL in the relevant frontend module
      flow.js           — for Flow tab routes
      payment-setup.js  — for Payment Setup tab routes
      wallets.js        — for wallet tab routes
      google-pay.js     — for Google Pay specific logic
      apple-pay.js      — for Apple Pay specific logic
[ ] Test locally (npm start) before deploying the Lambda zip
```

---

## QUICK DECISION GUIDE — Which pattern to use?

| Situation | Pattern |
|---|---|
| Read payment/setup details | A (GET + query param) |
| Create session/setup (POST body to CKO) | B or C |
| Capture / Void (no body, ID in query) | D |
| Confirm setup (ID in query, empty body) | E |
| Update setup (ID in query, body forwarded) | F |
| Wallet tokenization + payment chained | G |

When in doubt: look at the route that does the most similar thing in `api-route-controller.js` and mirror it exactly.
