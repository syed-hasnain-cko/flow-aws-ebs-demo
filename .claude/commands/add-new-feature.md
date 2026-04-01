# Add New Feature — Project Skill

You are a full-stack engineer working inside this Checkout.com demo app (Syed's Testing Suite). You know the codebase exactly. When this skill is invoked, you orchestrate the end-to-end addition of a new testable feature — from API research through UI, backend route, and tab wiring — following the exact design language of the existing app.

---

## HOW THIS SKILL IS INVOKED

The user invokes this skill with an optional free-text argument:

```
/add-new-feature "FeatureName - <free-form instructions describing UI intent and behaviour>"
```

Examples:
```
/add-new-feature "Payouts - Introduce a dropdown selection as a first question on UI to give options whether user wants to test card payout or bank payout and based on required fields of API, render required fields on UI for certain payout testing"

/add-new-feature "Disputes - Show a list of disputes for a payment ID and allow the user to accept or submit evidence"

/add-new-feature "Hosted Payments Page - Let the user fill in amount, currency, and description to generate a hosted payment page link"
```

**Parse the argument immediately:**
- Everything before ` - ` is the **Feature Name**.
- Everything after ` - ` is the **Custom Instructions** — treat these as binding design and UX requirements for this feature. Let them override or extend any defaults in this skill.

If no argument is provided, ask the user: *"What feature would you like to add? Describe it as: FeatureName - <what you want the UI to do>"*

---

## STEP 1 — Research the Checkout.com API

Before asking anything, use the MCP tools to research the feature:

1. Call `mcp__checkout-developer-mcp__api_search` with the feature name as the query.
2. If results are found, call `mcp__checkout-developer-mcp__get_operation` on the most relevant endpoint(s) to get full request schema.
3. Call `mcp__checkout-developer-mcp__get_schema` on any referenced schema objects to resolve field types, enums, required/optional status, and descriptions.
4. If the feature has sub-types (e.g. card payout vs bank payout as in the example), research each sub-type separately.

**Field type → UI control mapping (use this throughout):**

| Checkout.com API field type | UI control to generate |
|---|---|
| `string` with `enum` values | `<select class="select-input">` with one `<option>` per enum value |
| `string` (free text, URL, reference) | `<input type="text" class="text-input">` |
| `string` (email) | `<input type="email" class="text-input">` |
| `integer` / `number` | `<input type="number" class="text-input">` |
| `boolean` | Toggle switch: `<label class="switch"><input type="checkbox"><span class="slider round"></span></label>` |
| `object` (nested) | Render each child field using the rules above, grouped under a subtle sub-header |
| `array` | Not rendered inline — note it as "advanced / not in scope" unless Custom Instructions say otherwise |

Mark optional fields with a lighter label style (add `style="opacity:0.7"` to the label). Required fields get no modification.

---

## STEP 2 — Intake questions (ask all at once)

After research, present a single message with these questions. Pre-fill answers where the API research already gave you certainty:

```
Based on my API research for "[Feature Name]", here is what I need to confirm:

1. NEW TAB OR EXISTING TAB?
   Should this feature live in a brand-new tab in main.html, or inside an existing tab?
   Existing tabs: Checkout Flow | Wallets | Payment Setup
   → If new tab: what should the tab button label be? (e.g. "Payouts")

2. TAB FILE NAME (only if new tab)
   Suggested file: frontend/tabs/[feature-slug].html
   Confirm or rename?

3. JS MODULE FILE
   Suggested: frontend/modules/[feature-slug].js
   This will hold all frontend logic for this feature.
   Confirm or rename?

4. CUSTOM INSTRUCTIONS REVIEW
   I parsed these instructions from your command:
   "[Custom Instructions]"
   Anything to add or change?

5. FIELDS FOUND IN API (confirm before I build UI)
   I found the following fields for this feature. I'll map them to UI controls as shown.
   Tell me if any should be skipped, pre-filled differently, or presented differently:

   [List each field found from MCP research in this format:]
   - `field_path` (type: string/enum/boolean/integer) [required/optional]
     → UI: [text input / dropdown (values: ...) / toggle]
     → Default value I'll use: [sensible default or blank]

6. BACKEND ROUTES NEEDED
   Based on the API, I'll need to add:
   [List each HTTP method + path you'll add, e.g.]
   - POST /payouts → proxies to POST https://api.sandbox.checkout.com/payouts
   - GET /get-payout → proxies to GET https://api.sandbox.checkout.com/payouts/{id}

   Confirm, or tell me if any should be skipped or combined?
```

Wait for the user to reply before writing any code.

---

## STEP 3 — Confirm the full change plan

After intake, show a precise file-change plan and ask for a final go-ahead:

```
Here is everything I will do:

FILES I WILL CREATE:
  [ ] frontend/tabs/[feature-slug].html       — Tab HTML partial
  [ ] frontend/modules/[feature-slug].js      — Feature JS module

FILES I WILL MODIFY:
  [ ] frontend/tabs/main.html                 — Add tab button + tab content div  [if new tab]
  [ ] frontend/script.js                      — Wire dropdown population + tab init logic  [if new tab needs dropdowns or tab-switch side effects]
  [ ] amplify/backend/function/flowDemoLambdaSyed/src/api-route-controller.js
                                              — Add [N] new route(s) via /add-backend-route skill

Shall I go ahead? (yes / no / adjust)
```

Do not write a single line of code until the user confirms.

---

## STEP 4 — Build the tab HTML partial (if new tab)

Create `frontend/tabs/[feature-slug].html`. Follow the **exact** structural and CSS conventions of the existing tabs:

### HTML structure rules (mirror existing tabs exactly):

```html
<!-- Top-level wrapper — always context-area, same as other tabs -->
<div class="context-area">

    <!-- Section header style -->
    <h2 class="section-header">1. [First Section Title]</h2>

    <!-- Field rows always use inline-form + form-group -->
    <div class="inline-form">

        <!-- Text/number input -->
        <div class="form-group">
            <label for="[feature]-[field]" class="text-label">[Label]</label>
            <input type="text" id="[feature]-[field]" class="text-input" value="[default]">
        </div>

        <!-- Enum dropdown -->
        <div class="form-group">
            <label for="[feature]-[field]" class="select-label">[Label]</label>
            <select id="[feature]-[field]" class="select-input">
                <option value="[val1]" selected>[Val1]</option>
                <option value="[val2]">[Val2]</option>
            </select>
        </div>

        <!-- Boolean toggle -->
        <div class="form-group">
            <label for="[feature]-[field]" class="toggle-label">[Label]</label>
            <label class="switch">
                <input type="checkbox" id="[feature]-[field]">
                <span class="slider round"></span>
            </label>
        </div>

    </div>

    <!-- Action button row -->
    <div class="button-group">
        <button id="[feature]-submit-btn" class="main-button">[Action Label]</button>
    </div>

</div>

<!-- Result/response display — same pattern as other tabs -->
<div id="[feature]-result" class="context-area" style="display:none;">
    <h2 class="section-header">Result</h2>
    <pre id="[feature]-result-body" class="json-code-block"></pre>
</div>
```

**Custom Instructions override:** If the user's custom instructions describe a specific layout (e.g. "introduce a dropdown selection as a first question"), honour it exactly — render the conditional dropdown first, then show/hide subsequent field groups using `style="display:none"` and JS logic in the module.

**If sub-types are involved** (e.g. card payout vs bank payout):
- Render a top `<select class="select-input">` for the sub-type choice.
- Wrap each sub-type's fields in a `<div id="[feature]-[subtype]-fields" style="display:none;">`.
- The JS module will show/hide these on change.

**IDs convention:** `[feature-slug]-[fieldname]` — e.g. `payouts-destination-type`, `payouts-account-number`.

---

## STEP 5 — Build the JS module

Create `frontend/modules/[feature-slug].js`. Follow this template structure:

```js
// =============================================
// [Feature Name] Module
// Handles: [brief description]
// =============================================

(function () {

    // ----- Config / constants -----
    const API_BASE = window.API_BASE_URL || '';  // picks up local or Lambda base

    // ----- DOM helpers -----
    function val(id) { return document.getElementById(id)?.value ?? ''; }
    function checked(id) { return document.getElementById(id)?.checked ?? false; }
    function show(id) { const el = document.getElementById(id); if (el) el.style.display = ''; }
    function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

    // ----- Sub-type switching (if applicable) -----
    // [Only include if feature has sub-types from Custom Instructions]
    function onSubTypeChange() {
        const type = val('[feature]-type-select');
        // hide all sub-type field groups
        // ['subtype1', 'subtype2'].forEach(t => hide(`[feature]-${t}-fields`));
        // show(  `[feature]-${type}-fields`);
    }

    // ----- Build request body from UI state -----
    function buildRequestBody() {
        return {
            // map each UI field ID to the exact CKO API field path
            // field_name: val('[feature]-[field]'),
            // boolean_field: checked('[feature]-[field]'),
        };
    }

    // ----- Submit handler -----
    async function onSubmit() {
        const btn = document.getElementById('[feature]-submit-btn');
        btn.disabled = true;
        btn.textContent = 'Processing...';

        const body = buildRequestBody();

        try {
            // logApiCall is defined in frontend/utils.js — always use it
            logApiCall('POST', '/[route-name]', body);

            const resp = await fetch(`${API_BASE}/[route-name]`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await resp.json();
            logApiResponse('/[route-name]', resp.status, data);

            // Show result
            show('[feature]-result');
            document.getElementById('[feature]-result-body').textContent =
                JSON.stringify(data, null, 2);

            // Handle redirects if applicable
            if (data.redirect_url) {
                window.open(data.redirect_url, '_blank');
            }

        } catch (err) {
            logApiResponse('/[route-name]', 0, { error: err.message });
            showToast('Request failed: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '[Action Label]';
        }
    }

    // ----- Init -----
    function init() {
        const submitBtn = document.getElementById('[feature]-submit-btn');
        if (!submitBtn) return;  // tab not loaded

        submitBtn.addEventListener('click', onSubmit);

        // Sub-type change listener (if applicable)
        // document.getElementById('[feature]-type-select')
        //     ?.addEventListener('change', onSubTypeChange);
        // onSubTypeChange(); // set initial state
    }

    // Wire up after DOM ready (tab HTML is injected by loader.js)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
```

**Rules:**
- Always use `logApiCall` and `logApiResponse` from `frontend/utils.js` — these feed the API Activity Log sidebar.
- Always use `showToast` from `frontend/utils.js` for user-facing error messages.
- Use `window.API_BASE_URL` for the base URL (set by loader.js for Lambda, falls back to empty string for local).
- Never hardcode the API base URL.
- If the feature has multiple API calls (e.g. fetch list then take action), chain them inside the submit handler or add separate buttons following the numbered section pattern (`1. [Action]`, `2. [Action]`).

---

## STEP 6 — Wire the new tab into main.html (if new tab)

Read `frontend/tabs/main.html` first, then add:

**1. Tab button** — append inside `.tab-container` after the last existing `<button class="tab-link">`:
```html
<button class="tab-link" onclick="openTab(event, '[feature-slug]-tab')">[Tab Label]</button>
```

**2. Tab content div** — append after the last existing `<div class="tab-content">`:
```html
<div id="[feature-slug]-tab" class="tab-content"></div>
```

---

## STEP 7 — Wire the tab into loader.js / script.js

Read `frontend/tabs/loader.js` (the Lambda entry point). Find where existing tabs are loaded (look for `fetch` calls that load `.html` partials into tab content divs). Add a parallel entry for the new tab:

```js
fetch('frontend/tabs/[feature-slug].html')
    .then(r => r.text())
    .then(html => {
        document.getElementById('[feature-slug]-tab').innerHTML = html;
        // Run module init after HTML is injected
        if (typeof init[FeatureSlug] === 'function') init[FeatureSlug]();
    });
```

Then read `frontend/script.js`. If the new tab needs:
- **Currency dropdown** — add a block mirroring the existing currency population blocks, targeting the new select ID.
- **Country dropdown** — same pattern.
- **Tab-switch side effects** — add an `else if` branch inside `openTab()` for cleanup if needed.

Only add what is actually needed. Do not add boilerplate that the feature won't use.

---

## STEP 8 — Add backend route(s) via /add-backend-route skill

For each backend route identified in Step 2, invoke the `/add-backend-route` skill logic directly — do not ask the user to run it separately. Execute it inline:

1. Determine the correct pattern (A–G) from the route's HTTP method, ID passing, and body behaviour.
2. Read `amplify/backend/function/flowDemoLambdaSyed/src/api-route-controller.js` to find the correct insertion point (near logically related routes).
3. Write the route using the exact boilerplate from the `/add-backend-route` skill.
4. After writing, remind the user:

```
⚠️  AWS API Gateway — manual step required for each new route:
    Method: [GET/POST/PUT]   Path: /[route-name]
    Integration: Lambda proxy → flowDemoLambdaSyed
```

---

## STEP 9 — Post-build checklist

Present this checklist to the user when done:

```
DONE — here is what was built:

✅  frontend/tabs/[feature-slug].html       — Tab UI with [N] fields
✅  frontend/modules/[feature-slug].js      — Module with submit handler
✅  frontend/tabs/main.html                 — New tab button + content div added  [if applicable]
✅  frontend/script.js                      — Tab wiring updated  [if applicable]
✅  api-route-controller.js                 — [N] route(s) added

MANUAL STEPS (do these before testing in production):
[ ] Add each new route to AWS API Gateway (see ⚠️ notes above)
[ ] Deploy Lambda zip after route changes
[ ] Test locally first: npm start → http://localhost:4244

QUICK TEST FLOW:
1. Open the app → navigate to [Tab Label] tab
2. [Describe the expected first interaction based on Custom Instructions]
3. Fill in the fields → click [Action Label]
4. Watch the API Activity Log sidebar for the request/response
5. [Any redirect or follow-up action the user should expect]
```

---

## DESIGN REFERENCE — CSS classes used in this app

Always use these exact classes — do not invent new ones:

| Element | Class |
|---|---|
| Outer section card | `context-area` |
| Section title | `section-header` |
| Field row | `inline-form` |
| Individual field wrapper | `form-group` |
| Text/number input label | `text-label` |
| Text/number input | `text-input` |
| Select label | `select-label` |
| Select | `select-input` |
| Toggle label | `toggle-label` |
| Toggle wrapper | `switch` |
| Toggle track | `slider round` |
| Primary action button | `main-button` |
| Button row | `button-group` |
| JSON response display | `json-code-block` |
| Section divider | `<hr style="margin: 30px 0; border: 0; border-top: 1px solid var(--border);">` |

Theme-aware colour tokens (use these in inline styles, never hardcode hex):
`var(--bg)`, `var(--bg-subtle)`, `var(--border)`, `var(--border-strong)`,
`var(--text)`, `var(--text-secondary)`, `var(--accent)`, `var(--success)`, `var(--error)`
