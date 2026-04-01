# Add Payment Method — Project Skill

You are working inside this Checkout.com demo app. You know the codebase exactly. When this skill is invoked, guide the developer through adding a new payment method end-to-end, touching exactly the right files and locations.

---

## STEP 1 — Gather information

Ask these questions all at once before writing any code:

```
1. What is the payment method name? (e.g. mbway, alipay, pix, satispay)
   — Use the exact lowercase string that Checkout.com expects in the `type` field.

2. What type is it?
   a) Redirect APM   — /payments or payment-setups API returns a redirect URL, user goes to bank/provider site
   b) SDK APM        — provider SDK opens a pop-up or payment sheet (like Klarna, PayPal)
   c) Wallet         — native device wallet (Google Pay / Apple Pay pattern — unlikely for new additions here)

3. What fields does this method require in the PATCH body (payment-setups PUT)?
   Common ones: success_url, failure_url, customer.name, customer.email.address,
   billing.address.city/zip/address_line1/country, reference, customer.phone.country_code/number
   — If unsure, call `mcp__checkout-developer-mcp__api_search` with the method name to look up required fields.

4. Does it require order line items (items[] array) in the PATCH body? (Yes/No)
   Currently: klarna, paypal, kakaopay require this. Most redirect APMs do not.

5. Is there a special note to show the user in the UI?
   e.g. "Requires CHF currency" or "Only available in Portugal"
   (Leave blank if none.)

6. Brand colour and abbreviation for the method card UI?
   e.g. bg: '#FF6600', color: '#fff', abbr: 'MB'
   — If you know the brand, suggest it. Otherwise ask.

7. Does Simple Icons have a logo for it? (https://simpleicons.org — search the method name)
   If yes: provide the slug, e.g. 'mbway' → https://cdn.simpleicons.org/mbway/ffffff
   If no or unsure: use null (falls back to the abbr text).

8. Does this method need a DEDICATED backend route, or does it go through the existing
   payment-setups flow (POST /payment-setups → PUT /update-payment-setups → POST /confirm-payment-setups)?
   — Redirect APMs: almost always use the existing setup flow — NO new route needed.
   — SDK APMs (PayPal/Klarna pattern): NO new route — the SDK handles the browser-side authorization.
   — Wallets or methods with custom tokenization: YES, dedicated route needed.
```

Use `mcp__checkout-developer-mcp__api_search` or `mcp__checkout-developer-mcp__get_operation` to validate required fields before proceeding. Do not guess field names — wrong field paths mean the PATCH silently fails.

---

## STEP 2 — Identify every change needed

Based on the answers, determine which of these 5 locations need changes. Confirm with the developer before writing:

```
Files I will modify:
  1. frontend/modules/payment-setup.js  — METHOD_REQUIREMENTS entry        [always]
  2. frontend/modules/payment-setup.js  — METHOD_DISPLAY entry              [always]
  3. frontend/modules/payment-setup.js  — METHOD_NOTES entry                [if note exists]
  4. frontend/modules/payment-setup.js  — METHODS_WITH_ORDER_ITEMS          [if needs items[]]
  5. frontend/modules/payment-setup.js  — handleFinalState SDK branch       [SDK APMs only]
  6. amplify/backend/function/flowDemoLambdaSyed/src/api-route-controller.js [if dedicated route needed]

Shall I go ahead? (yes/no)
```

---

## STEP 3 — Write the changes

### 3a. METHOD_REQUIREMENTS entry

Add the new method inside the `METHOD_REQUIREMENTS` object in `frontend/modules/payment-setup.js`, after the last existing entry (before the closing `}`).

**Field id convention:** `{methodname}-{fieldshortname}` — e.g. `mbway-success`, `mbway-phone`
**Path convention:** matches the Checkout.com PATCH request body path exactly — e.g. `settings.success_url`, `billing.address.city`

Always include `success_url` and `failure_url` for any redirect APM:
```js
    newmethod: [
        { id: 'newmethod-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'newmethod-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
        // ... additional required fields
    ],
```

Insert it by editing the exact closing `},` line of the last entry in `METHOD_REQUIREMENTS`. Read the file first to find the exact insertion point.

### 3b. METHOD_DISPLAY entry

Add inside the `METHOD_DISPLAY` object in `frontend/modules/payment-setup.js`, after the last existing entry:

```js
    newmethod: { bg: '#BRANDCOLOR', color: '#fff', abbr: 'XX', logo: 'https://cdn.simpleicons.org/slug/ffffff' },
```

If no Simple Icons logo: use `logo: null` — the `abbr` text renders as a fallback badge automatically.

### 3c. METHOD_NOTES entry (only if needed)

Add inside the `METHOD_NOTES` object:
```js
    newmethod: '⚠️ Your note here.',
```

### 3d. METHODS_WITH_ORDER_ITEMS (only if method requires items[])

Add the method name string to the Set:
```js
const METHODS_WITH_ORDER_ITEMS = new Set(['klarna', 'paypal', 'kakaopay', 'newmethod']);
```

### 3e. handleFinalState SDK branch (SDK APMs only)

For SDK-type APMs (those where `methodData.status === 'action_required'` and `methodData.action.type === 'sdk'`), add an `else if` branch inside the existing SDK block in `handleFinalState`:

```js
} else if (methodName === 'newmethod') {
    const clientToken = methodData.action.client_token;
    // or whatever token field the SDK uses
    initializeNewMethodSDK(clientToken, setupId);
}
```

Then write the `initializeNewMethodSDK` function following the same pattern as `initializeKlarnaSDK` or `initializePayPalSDK` in the same file. Ask the developer about the SDK script URL and initialization API before writing this.

### 3f. Backend route (only if dedicated route needed)

In `amplify/backend/function/flowDemoLambdaSyed/src/api-route-controller.js`, add a new route following the project's exact boilerplate. Read the `/add-backend-route` skill or follow the pattern below:

```js
router.post('/newmethod-pay', async (req, res) => {
    try {
        const response = await axios.post(`${process.env.GW_URL}/payments`, req.body, {
            headers: {
                Authorization: `Bearer ${API_SECRET_KEY}`,
                'Content-Type': 'application/json'
            },
        });
        res.send(response.data);
    } catch (error) {
        res.status(500).send(error.response?.data || error.message);
    }
});
```

Remind the developer: **every new route in api-route-controller.js also needs to be added as an endpoint in AWS API Gateway manually.**

---

## STEP 4 — Verify the integration

After writing all changes, walk through this checklist with the developer:

```
[ ] METHOD_REQUIREMENTS key matches the exact type string Checkout.com expects
    (Check: does the PATCH to /payments/setups/{id} accept `payment_methods.{key}`?)
[ ] All required field paths validated against the Checkout.com API docs (use MCP)
[ ] METHOD_DISPLAY entry has a unique bg colour — not reusing an existing one
[ ] If SDK APM: SDK script URL confirmed from the provider's docs
[ ] If new backend route: added to AWS API Gateway before testing
[ ] Test: Initialize a setup with the new method appearing in the methods grid
[ ] Test: Toggle the method ON — required fields should render under it
[ ] Test: Click "Update Payment Setup" — check the PATCH response has no flags
[ ] Test: For redirect APMs — confirm button appears and redirects correctly
```

---

## REFERENCE — Existing method patterns to mirror

**Minimal redirect APM (iDEAL pattern):**
```js
ideal: [
    { id: 'ideal-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
    { id: 'ideal-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
],
```

**Redirect APM with customer fields (Bancontact pattern):**
```js
bancontact: [
    { id: 'bancontact-success', label: 'Success URL',     path: 'settings.success_url',               value: window.location.origin + '/success.html' },
    { id: 'bancontact-failure', label: 'Failure URL',     path: 'settings.failure_url',               value: window.location.origin + '/failure.html' },
    { id: 'bancontact-name',    label: 'Customer Name',   path: 'customer.name',                      value: 'Syed Hasnain' },
    { id: 'bancontact-email',   label: 'Customer Email',  path: 'customer.email.address',             value: 'smhasnain@gmail.com' },
    { id: 'bancontact-country', label: 'Customer Country',path: 'customer.billing_address.country',   value: 'BE' },
],
```

**APM with billing address (Klarna/SEPA pattern):**
```js
sepa: [
    { id: 'sepa-success', label: 'Success URL',     path: 'settings.success_url',              value: window.location.origin + '/success.html' },
    { id: 'sepa-failure', label: 'Failure URL',     path: 'settings.failure_url',              value: window.location.origin + '/failure.html' },
    { id: 'sepa-city',    label: 'Billing City',    path: 'billing.address.city',              value: 'London' },
    { id: 'sepa-zip',     label: 'Billing Zip',     path: 'billing.address.zip',               value: 'W1T 4TP' },
    { id: 'sepa-addr',    label: 'Address Line 1',  path: 'billing.address.address_line1',     value: '25 Berners St' },
    { id: 'sepa-country', label: 'Billing Country', path: 'billing.address.country',           value: 'GB' },
],
```

**APM with phone number (Bizum pattern):**
```js
bizum: [
    { id: 'bizum-success', label: 'Success URL',          path: 'settings.success_url',              value: window.location.origin + '/success.html' },
    { id: 'bizum-failure', label: 'Failure URL',          path: 'settings.failure_url',              value: window.location.origin + '/failure.html' },
    { id: 'bizum-ccode',   label: 'Phone Country Code',   path: 'customer.phone.country_code',       value: '34' },
    { id: 'bizum-phone',   label: 'Phone Number',         path: 'customer.phone.number',             value: '700000000' },
],
```
