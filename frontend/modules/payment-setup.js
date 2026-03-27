// =============================================
// Payment Setup Module
// =============================================

let activeSetupResponse = null;
let _cardActiveSession = null; // stored for theme re-mount
let currentSetupId = null;
let setupWebhookPoller = null;

const FAILED_STATUSES = ['Declined', 'Canceled', 'Expired', 'Failed'];

const METHOD_REQUIREMENTS = {
    klarna: [
        { id: 'klarna-locale', label: 'Device Locale', path: 'customer.device.locale', value: 'en-GB' },
        { id: 'klarna-city', label: 'Billing City', path: 'billing.address.city', value: 'London' },
        { id: 'klarna-zip', label: 'Billing Zip', path: 'billing.address.zip', value: 'W1T 4TP' },
        { id: 'klarna-addr', label: 'Address Line 1', path: 'billing.address.address_line1', value: '25 Berners St' },
        { id: 'klarna-country', label: 'Billing Country', path: 'billing.address.country', value: 'DE' },
        { id: 'klarna-email', label: 'Customer Email', path: 'customer.email.address', value: 'smhasnain@gmail.com' },
        { id: 'klarna-name', label: 'Customer Name', path: 'customer.name', value: 'Syed Hasnain' }
    ],
    bizum: [
        { id: 'bizum-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'bizum-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
        { id: 'bizum-ccode', label: 'Phone Country Code', path: 'customer.phone.country_code', value: '34' },
        { id: 'bizum-phone', label: 'Phone Number', path: 'customer.phone.number', value: '700000000' },
    ],
    eps: [
        { id: 'eps-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'eps-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
    ],
    ideal: [
        { id: 'ideal-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'ideal-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
    ],
    bancontact: [
        { id: 'bancontact-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'bancontact-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
        { id: 'bancontact-name', label: 'Customer Name', path: 'customer.name', value: 'Syed Hasnain' },
        { id: 'bancontact-email', label: 'Customer Email', path: 'customer.email.address', value: 'smhasnain@gmail.com' },
        { id: 'bancontact-country', label: 'Customer Country', path: 'customer.billing_address.country', value: 'BE' },
    ],
    twint: [
        { id: 'twint-ref', label: 'Reference', path: 'reference', value: '#Order_TWINT_001' },
        { id: 'twint-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'twint-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
    ],
    kakaopay: [
        { id: 'kakaopay-ref', label: 'Reference', path: 'reference', value: '#Order_KAKAO_001' },
        { id: 'kakaopay-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'kakaopay-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
        { id: 'kakaopay-name', label: 'Customer Name', path: 'customer.name', value: 'Syed Hasnain' },
        { id: 'kakaopay-email', label: 'Customer Email', path: 'customer.email.address', value: 'smhasnain@gmail.com' },
    ],
    sepa: [
        { id: 'sepa-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'sepa-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
        { id: 'sepa-city', label: 'Billing City', path: 'billing.address.city', value: 'London' },
        { id: 'sepa-zip', label: 'Billing Zip', path: 'billing.address.zip', value: 'W1T 4TP' },
        { id: 'sepa-addr', label: 'Address Line 1', path: 'billing.address.address_line1', value: '25 Berners St' },
        { id: 'sepa-addr-2', label: 'Address Line 2', path: 'billing.address.address_line2', value: 'xyz' },
        { id: 'sepa-country', label: 'Billing Country', path: 'billing.address.country', value: 'GB' },
    ],
    paypal: [
        { id: 'paypal-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'paypal-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
    ],
    googlepay: [
        { id: 'googlepay-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'googlepay-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
    ],
    applepay: [
        { id: 'applepay-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'applepay-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
    ],
};

// Methods that require order line items in the PATCH body
const METHODS_WITH_ORDER_ITEMS = new Set(['klarna', 'paypal', 'kakaopay']);

// Informational notes shown above the fields for certain methods
const METHOD_NOTES = {
    twint: '⚠️ Twint requires CHF currency. Re-initialize the setup with currency set to CHF if you see a currency flag.',
    kakaopay: '⚠️ KakaoPay may require a specific currency (e.g. KRW). Re-initialize with the correct currency if you see a currency flag.',
    card: 'ℹ️ Card uses Checkout.com Flow for tokenization. Click "Update Payment Setup" to load the card form.',
    instrument: 'ℹ️ No additional fields required. Patching will enable this instrument for the setup.',
};

// Brand colours, abbreviations and Simple Icons CDN logos for each payment method card.
// logo: null → falls back to abbr text inside the coloured badge.
const METHOD_DISPLAY = {
    klarna:     { bg: '#FFB3C7', color: '#1a1a1a', abbr: 'K',    logo: 'https://cdn.simpleicons.org/klarna/000000'     },
    bizum:      { bg: '#004EE4', color: '#fff',    abbr: 'BZ',   logo: 'https://cdn.simpleicons.org/bizum/ffffff'      },
    eps:        { bg: '#CC0000', color: '#fff',    abbr: 'EPS',  logo: null                                            },
    ideal:      { bg: '#CC0066', color: '#fff',    abbr: 'iD',   logo: 'https://cdn.simpleicons.org/ideal/ffffff'      },
    bancontact: { bg: '#005498', color: '#fff',    abbr: 'BC',   logo: 'https://cdn.simpleicons.org/bancontact/ffffff' },
    twint:      { bg: '#00A0E6', color: '#fff',    abbr: 'TW',   logo: 'https://cdn.simpleicons.org/twint/ffffff'      },
    kakaopay:   { bg: '#FAE100', color: '#3C1E1E', abbr: 'KP',   logo: 'https://cdn.simpleicons.org/kakaotalk/3C1E1E' },
    sepa:       { bg: '#003399', color: '#fff',    abbr: 'SEPA', logo: null                                            },
    paypal:     { bg: '#009CDE', color: '#fff',    abbr: 'PP',   logo: 'https://cdn.simpleicons.org/paypal/ffffff'     },
    googlepay:  { bg: '#4285F4', color: '#fff',    abbr: 'G',    logo: 'https://pay.google.com/about/static_kcs/images/logos/google-pay-logo.svg'  },
    applepay:   { bg: '#1c1c1e', color: '#fff',    abbr: '🍎',   logo: 'https://cdn.simpleicons.org/applepay/ffffff'   },
    card:       { bg: '#17a34a', color: '#fff',    abbr: 'CKO',  logo: 'https://cdn.simpleicons.org/checkout/ffffff'   },
    instrument: { bg: '#64748b', color: '#fff',    abbr: '🔧',   logo: null                                            },
};

// Exposed so openTab in script.js can reset setup state when switching away
window.clearSetupTabState = function () {
    currentSetupId = null;
    activeSetupResponse = null;
    stopSetupWebhookPolling();

    const methodsContainer = document.getElementById('setup-methods-container');
    const responseContainer = document.getElementById('setup-response-container');
    const actionArea = document.getElementById('setup-action-area');
    const sdkWidget = document.getElementById('sdk-widget-container');
    const finalStatus = document.getElementById('final-status-area');

    if (methodsContainer) methodsContainer.style.display = 'none';
    if (responseContainer) responseContainer.style.display = 'none';
    if (actionArea) actionArea.style.display = 'none';
    if (sdkWidget) sdkWidget.style.display = 'none';
    if (finalStatus) finalStatus.style.display = 'none';

    const grid = document.getElementById('methods-grid');
    const inputsArea = document.getElementById('dynamic-inputs-area');
    const jsonOutput = document.getElementById('setup-json-output');
    const klarnaList = document.getElementById('klarna_container');

    if (grid) grid.innerHTML = '';
    if (inputsArea) inputsArea.innerHTML = '';
    if (jsonOutput) jsonOutput.innerText = '';
    if (klarnaList) klarnaList.innerHTML = '';

    const oldConfirmBtn = document.getElementById('final-confirm-btn');
    if (oldConfirmBtn) oldConfirmBtn.remove();
    const oldCardPay = document.getElementById('setup-card-pay-btn');
    if (oldCardPay) oldCardPay.remove();

    const patchBtn = document.getElementById('patch-setup-btn');
    if (patchBtn) patchBtn.style.display = 'none';
};

function renderMethodToggles(methods) {
    const grid = document.getElementById('methods-grid');
    grid.innerHTML = '';
    const tokens = getThemeTokens();
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(190px, 1fr))';
    grid.style.gap = '12px';

    methods.forEach(m => {
        const display = METHOD_DISPLAY[m] || { bg: 'var(--accent)', color: '#fff', abbr: m.substring(0, 2).toUpperCase() };
        const methodInfo = activeSetupResponse?.payment_methods?.[m];
        const flags = methodInfo?.flags || [];
        const flagCount = flags.length;
        const statusLabel = flagCount === 0 ? '✓ No flags' : `${flagCount} flag${flagCount !== 1 ? 's' : ''} pending`;
        const statusColor = flagCount === 0 ? 'var(--success)' : 'var(--warning)';

        const card = document.createElement('div');
        card.className = 'method-card';
        card.style.cssText = `
            padding: 14px 16px 12px;
            border-radius: 14px;
            border: 2px solid var(--border);
            cursor: pointer;
            position: relative;
            overflow: hidden;
            background: var(--bg-card);
            transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, background 0.15s ease;
        `;

        card.innerHTML = `
            <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${display.bg};border-radius:14px 14px 0 0;"></div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px;">
                <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                    <div class="method-logo-badge" style="
                        width:40px;height:40px;flex-shrink:0;
                        border-radius:10px;
                        background:${display.bg};
                        color:${display.color};
                        display:flex;align-items:center;justify-content:center;
                        font-weight:800;font-size:12px;letter-spacing:-0.3px;
                        box-shadow:0 2px 6px ${display.bg}66;
                    "></div>
                    <div style="min-width:0;">
                        <div style="font-weight:700;font-size:13px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.toUpperCase()}</div>
                        <div style="font-size:10px;color:${statusColor};margin-top:3px;font-weight:600;">${statusLabel}</div>
                    </div>
                </div>
                <label class="switch" style="flex-shrink:0;">
                    <input type="checkbox" class="method-toggle" data-method="${m}">
                    <span class="slider round"></span>
                </label>
            </div>
        `;

        // Populate the logo badge: real logo via Simple Icons CDN, abbr text as fallback
        const badge = card.querySelector('.method-logo-badge');
        if (display.logo) {
            const img = document.createElement('img');
            img.src = display.logo;
            img.alt = m;
            img.style.cssText = 'width:26px;height:26px;object-fit:contain;';
            img.onerror = () => {
                img.remove();
                const span = document.createElement('span');
                span.textContent = display.abbr;
                badge.appendChild(span);
            };
            badge.appendChild(img);
        } else {
            const span = document.createElement('span');
            span.textContent = display.abbr;
            badge.appendChild(span);
        }

        const toggle = card.querySelector('.method-toggle');

        // Hover lift effect
        card.addEventListener('mouseover', () => {
            card.style.transform = 'translateY(-3px)';
            card.style.boxShadow = 'var(--shadow-md)';
            if (!toggle.checked) card.style.borderColor = display.bg;
        });
        card.addEventListener('mouseout', () => {
            card.style.transform = '';
            card.style.boxShadow = '';
            if (!toggle.checked) card.style.borderColor = 'var(--border)';
        });

        // Clicking anywhere on the card toggles the checkbox
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.switch')) {
                toggle.checked = !toggle.checked;
                toggle.dispatchEvent(new Event('change'));
            }
        });

        // Highlight card when selected, reset when deselected
        toggle.addEventListener('change', () => {
            if (toggle.checked) {
                card.style.borderColor = display.bg;
                card.style.boxShadow = `0 0 0 3px ${display.bg}40`;
                card.style.background = `${display.bg}12`;
            } else {
                card.style.borderColor = 'var(--border)';
                card.style.boxShadow = '';
                card.style.background = 'var(--bg-card)';
            }
        });

        grid.appendChild(card);
    });

    document.getElementById('setup-methods-container').style.display = 'block';

    // Attach the existing toggle logic — untouched
    document.querySelectorAll('.method-toggle').forEach(t => {
        t.addEventListener('change', handleToggleChange);
    });
}

function handleToggleChange() {
    // Single-select enforcement: when this toggle is turned ON, deselect all others
    // and reset their card highlight. Using direct property mutation (no event dispatch)
    // to avoid re-entrancy.
    if (this.checked) {
        document.querySelectorAll('.method-toggle').forEach(t => {
            if (t !== this && t.checked) {
                t.checked = false;
                const otherCard = t.closest('.method-card');
                if (otherCard) {
                    otherCard.style.borderColor = 'var(--border)';
                    otherCard.style.boxShadow = '';
                    otherCard.style.background = 'var(--bg-card)';
                }
            }
        });
    }

    const activeToggles = Array.from(document.querySelectorAll('.method-toggle:checked')).map(t => t.dataset.method);
    const inputsArea = document.getElementById('dynamic-inputs-area');
    const patchBtn = document.getElementById('patch-setup-btn');

    const hasActiveToggle = activeToggles.length > 0;
    patchBtn.disabled = !hasActiveToggle;
    patchBtn.style.opacity = hasActiveToggle ? "1" : "0.5";
    patchBtn.style.cursor = hasActiveToggle ? "pointer" : "not-allowed";

    // Clear all post-patch UI so stale confirm buttons / status / SDK widget
    // from a previous method don't remain when the user switches selection.
    const oldConfirmBtn = document.getElementById('final-confirm-btn');
    if (oldConfirmBtn) oldConfirmBtn.remove();
    const oldMakePaymentBtn = document.getElementById('make-klarna-payment-btn');
    if (oldMakePaymentBtn) oldMakePaymentBtn.remove();
    const oldPaypalBtn = document.getElementById('make-paypal-payment-btn');
    if (oldPaypalBtn) oldPaypalBtn.remove();
    const oldCardPayBtn = document.getElementById('setup-card-pay-btn');
    if (oldCardPayBtn) oldCardPayBtn.remove();
    const statusArea = document.getElementById('final-status-area');
    if (statusArea) { statusArea.style.display = 'none'; statusArea.innerHTML = ''; }
    const sdkWidget = document.getElementById('sdk-widget-container');
    if (sdkWidget) sdkWidget.style.display = 'none';
    const klarnaContainer = document.getElementById('klarna_container');
    if (klarnaContainer) klarnaContainer.innerHTML = '';
    stopSetupWebhookPolling();

    inputsArea.innerHTML = '';

    activeToggles.forEach(method => {
        const section = document.createElement('div');
        section.className = 'context-area';
        section.style.marginTop = '10px';
        section.innerHTML = `<h4 style="margin-top:0; color:var(--accent);">${method.toUpperCase()} Requirements</h4><div class="inline-form" id="fields-${method}"></div>`;

        // Show a note for methods with special requirements (currency, card details, etc.)
        if (METHOD_NOTES[method]) {
            const note = document.createElement('p');
            note.style.cssText = 'font-size:12px; color:var(--status-action-text); background:var(--status-action-bg); padding:8px 12px; border-radius:6px; margin:4px 0 8px; border:1px solid var(--status-action-border);';
            note.textContent = METHOD_NOTES[method];
            section.insertBefore(note, section.querySelector('.inline-form'));
        }

        if (METHOD_REQUIREMENTS[method]) {
            METHOD_REQUIREMENTS[method].forEach(field => {
                const group = document.createElement('div');
                group.className = 'form-group';
                group.innerHTML = `
                    <label class="text-label" style="font-family: monospace; font-size: 11px; letter-spacing: 0.3px; color: var(--accent);">${field.path}</label>
                    <input type="text" class="text-input patch-field" data-method="${method}" data-path="${field.path}" value="${field.value}">
                `;
                section.querySelector('.inline-form').appendChild(group);
            });
        }

        if (METHODS_WITH_ORDER_ITEMS.has(method)) {
            const template = document.getElementById('order-items-template').content.cloneNode(true);
            const titleEl = template.querySelector('.order-items-title');
            if (titleEl) titleEl.textContent = `${method.toUpperCase()} ORDER ITEMS`;
            section.appendChild(template);
            addKlarnaItemRow(section.querySelector('.order-items-list'));
            section.querySelector('.add-order-item').addEventListener('click', (e) => {
                e.preventDefault();
                addKlarnaItemRow(section.querySelector('.order-items-list'));
            });
        }

        inputsArea.appendChild(section);
    });

    patchBtn.style.display = hasActiveToggle ? 'block' : 'none';
}

async function handleFinalState(response, selectedMethod) {
    const setupId = response.id;
    const methods = response.payment_methods;
    const statusArea = document.getElementById('final-status-area');
    const widgetContainer = document.getElementById('sdk-widget-container');

    statusArea.style.display = 'none';
    widgetContainer.style.display = 'none';
    document.getElementById('klarna_container').innerHTML = '';

    // Only evaluate the method the user selected — ignore others in the response
    const methodName = selectedMethod;
    const methodData = methods?.[methodName];
    if (!methodData) return;

    // Card is always handled via Flow tokenization — bypass the normal status checks
    if (methodName === 'card') {
        initializeCardSetupFlow();
        return;
    }

    if (methodData.initialization === "enabled" || methodData.status === "ready") {
        if (methodData.status === "ready") {
            // ── READY: show confirm button (bizum, eps, ideal, bancontact, etc.) ──
            statusArea.className = 'status-ready';
            statusArea.innerText = `${methodName.toUpperCase()} is Ready!`;
            statusArea.style.display = 'block';
            renderConfirmButton(setupId, methodName, "Confirm & Redirect");
        } else if (methodData.status === "action_required" && methodData.action?.type === "sdk") {
            // ── ACTION REQUIRED: initialize provider SDK (klarna, paypal, etc.) ──
            statusArea.className = 'status-action';
            statusArea.innerText = `${methodName.toUpperCase()} requires SDK Authorization.`;
            statusArea.style.display = 'block';

            if (methodName === 'klarna') {
                initializeKlarnaSDK(methodData.action.client_token, methodData.action.session_id, setupId);
            } 
            else if (methodName === 'paypal') {
                const orderId = methodData.action.order_id;
                const paymentType = document.getElementById('setup-payment-type').value;
                const captureEnabled = document.getElementById('setup-capture-toggle').checked;
                initializePayPalSDK(orderId, setupId, paymentType, captureEnabled);
            }
        } else {
            // ── STILL AVAILABLE: initialization was sent but status didn't advance ──
            renderMethodUnavailable(statusArea, methodName, methodData.flags || []);
        }
    } else {
        // ── AVAILABLE (no initialization sent or method not supported): show flags ──
        renderMethodUnavailable(statusArea, methodName, methodData.flags || []);
    }
}

function renderMethodUnavailable(statusArea, methodName, flags) {
    const flagPills = flags.map(f =>
        `<span style="display:inline-block; background:var(--bg-subtle); border:1px solid var(--border-strong); color:var(--text-secondary); font-family:monospace; font-size:11px; padding:3px 8px; border-radius:20px; margin:3px 4px 3px 0;">${f}</span>`
    ).join('');

    statusArea.className = '';
    statusArea.style.cssText = 'display:block; margin-top:15px; padding:20px; border-radius:12px; text-align:left; background:var(--status-action-bg); border:1.5px solid var(--status-action-border);';
    statusArea.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
            <span style="font-size:22px;">🔒</span>
            <div>
                <div style="font-size:14px; font-weight:700; color:var(--status-action-text); letter-spacing:0.5px;">${methodName.toUpperCase()} — NOT AVAILABLE</div>
                <div style="font-size:11px; color:var(--status-action-text); margin-top:2px; opacity:0.85;">
                    Status: <code style="background:var(--status-action-bg); padding:1px 5px; border-radius:4px; border:1px solid var(--status-action-border);">${flags.length ? 'available' : 'unknown'}</code>
                    — requirements still unmet after PATCH
                </div>
            </div>
        </div>
        <div style="font-size:12px; color:var(--status-action-text); font-weight:600; margin-bottom:8px;">Unresolved flags from the Payments Setups API:</div>
        <div style="margin-bottom:12px; line-height:2;">
            ${flagPills || `<span style="font-size:12px; color:var(--status-action-text); opacity:0.8;">No flags returned — check the JSON response below.</span>`}
        </div>
        <div style="font-size:11px; color:var(--status-action-text); border-top:1px solid var(--status-action-border); padding-top:10px; line-height:1.7; opacity:0.85;">
            The Payments Setups API does not currently support <strong>${methodName}</strong> for this configuration.<br>
            Each flag above maps directly to a missing or invalid field in the PATCH request.<br>
            Review the full response in the JSON panel below for details.
        </div>
    `;
}

async function initializeCardSetupFlow() {
    // Replace the card section in dynamic-inputs-area in-place —
    // clear the info note and render the Flow card form where it was.
    const cardSection = document.getElementById('fields-card')?.closest('.context-area');
    if (!cardSection) return;

    // Clean up any stale Pay button
    const oldBtn = document.getElementById('setup-card-pay-btn');
    if (oldBtn) oldBtn.remove();

    // Read values from the setup form
    const amount      = parseInt(document.getElementById('setup-amount').value) || 100;
    const currency    = document.getElementById('setup-currency').value || 'GBP';
    const paymentType = document.getElementById('setup-payment-type').value || 'Regular';
    const capture     = document.getElementById('setup-capture-toggle').checked;

    // Replace the note + empty fields with a loader message while the session is created
    cardSection.innerHTML = `
        <h4 style="margin-top:0; color:var(--accent);">CARD — Flow Tokenization</h4>
        <p style="font-size:12px; color:var(--text-secondary); margin:4px 0 12px;">Creating payment session…</p>
        <div id="setup-card-form-host"></div>
    `;

    // Create a payment session (required by CheckoutWebComponents)
    const sessionBody = {
        amount,
        currency,
        payment_type:paymentType,
        billing :{
            address:{
                country: 'DE'
            }
        },
        capture,
        disabled_payment_methods: ['remember_me'],
        processing_channel_id: window.APP_CONFIG.processingChannelId,
        success_url:  `${window.location.protocol}//${window.location.host}/success.html`,
        failure_url:  `${window.location.protocol}//${window.location.host}/failure.html`,
        reference:    `#Card_Setup_${Math.floor(Math.random() * 10000)}`,
    };

    let paymentSession;
    try {
        const res = await fetch(`${window.APP_CONFIG.apiBaseUrl}/payment-sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sessionBody),
        });
        paymentSession = await res.json();
        _cardActiveSession = paymentSession; // store for theme re-mount
        addToApiLog('POST', `card tokenization session: ${paymentSession.id} - /payment-sessions`, paymentSession.id ? 201 : 422, sessionBody, paymentSession);
    } catch (err) {
        showKlarnaToast('Failed to create card session. Check the console.', 'error');
        console.error('Card session error:', err);
        cardSection.querySelector('p').textContent = 'Failed to create payment session.';
        return;
    }

    // Update the subtitle now the session is ready
    const subtitle = cardSection.querySelector('p');
    if (subtitle) subtitle.remove();

    const formHost = document.getElementById('setup-card-form-host');
    let cardComponent;
    try {
        cardComponent = await mountCardTokenizer(formHost, paymentSession);
    } catch (err) {
        showKlarnaToast('Failed to load card form. Check the console.', 'error');
        console.error('Card tokenizer mount error:', err);
        return;
    }

    // "Pay" button — tokenizes then POSTs to /payments
    const payBtn = document.createElement('button');
    payBtn.id = 'setup-card-pay-btn';
    payBtn.className = 'main-button';
    payBtn.style.cssText = 'background:var(--success); margin-top:20px; width:100%;';
    payBtn.innerText = 'Pay';

    payBtn.onclick = async () => {
        if (payBtn.disabled) return;
        if (!await cardComponent.isValid()) {
            showKlarnaToast('Please fill in all card details correctly.', 'error');
            return;
        }

        payBtn.disabled = true;
        payBtn.style.opacity = '0.5';
        payBtn.innerText = 'Processing...';

        try {
            const { data: tokenData } = await cardComponent.tokenize();

            const paymentBody = {
                source:{
                    type: 'token',
                    token:  tokenData.token,
                },     
                amount,
                currency,
                payment_type:  paymentType,
                capture,
                processing_channel_id: window.APP_CONFIG.processingChannelId,
                reference:             `#Card_${Math.floor(Math.random() * 10000)}`,
                success_url:  `${window.location.protocol}//${window.location.host}/success.html`,
                failure_url:  `${window.location.protocol}//${window.location.host}/failure.html`,
            };

            const payRes = await fetch(`${window.APP_CONFIG.apiBaseUrl}/payments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(paymentBody),
            });
            const payData = await payRes.json();
            addToApiLog('POST', `card payment - /payments`, payData.payment?.id ? 201 : 422, paymentBody, payData);

            const loader = document.getElementById('payment-loader');
            if (loader) loader.style.display = 'flex';

            const payment = payData.payment;
            if (payment?._links?.redirect) {
                window.location.href = payment._links.redirect.href;
            } else if (payment?.status === 'Authorized' || payment?.status === 'Captured') {
                window.location.href = `success.html?paymentId=${payment.id}`;
            } else if (FAILED_STATUSES.includes(payment?.status)) {
                window.location.href = `failure.html?paymentId=${payment?.id}`;
            } else {
                if (loader) loader.style.display = 'none';
                showKlarnaToast('Unexpected payment response — check JSON output.', 'error');
                payBtn.disabled = false;
                payBtn.style.opacity = '1';
                payBtn.innerText = 'Pay';
                const output = document.getElementById('setup-json-output');
                if (output) {
                    document.getElementById('setup-response-container').style.display = 'block';
                    output.innerText = JSON.stringify(payData, null, 2);
                }
            }
        } catch (err) {
            console.error('Card pay error:', err);
            showKlarnaToast('Payment failed — check the console.', 'error');
            payBtn.disabled = false;
            payBtn.style.opacity = '1';
            payBtn.innerText = 'Pay';
        }
    };

    cardSection.appendChild(payBtn);
}

function initializeKlarnaSDK(clientToken, sessionId, setupId) {
    const statusArea = document.getElementById('final-status-area');
    const widget = document.getElementById('sdk-widget-container');
    widget.style.display = 'block';
    document.getElementById('widget-title').innerText = "Klarna Payment Options";
    statusArea.className = 'status-action';
    statusArea.innerText = 'Approve payment now on Klarna';
    statusArea.style.display = 'block';

    const script = document.createElement('script');
    script.src = "https://x.klarnacdn.net/kp/lib/v1/api.js";
    document.head.appendChild(script);

    script.onload = () => {
        window.Klarna.Payments.init({ client_token: clientToken, session_id: sessionId });
        window.Klarna.Payments.load({
            container: "#klarna_container",
            payment_method_categories: ['pay_over_time', 'pay_later', 'pay_now', 'direct_bank_transfer'],
            instance_id: 'klarna-widget'
        }, (res) => {
            console.log("Klarna Loaded", res);
            renderConfirmButton(setupId, 'klarna', "Authorize & Pay with Klarna", clientToken, sessionId);
        });
    };
}

function initializePayPalSDK(orderId, setupId, paymentType, captureEnabled) {
    const statusArea = document.getElementById('final-status-area');
    const widget = document.getElementById('sdk-widget-container');
    const cfg = window.APP_CONFIG.paypal;

    widget.style.display = 'block';
    document.getElementById('widget-title').innerText = 'PayPal';
    statusArea.className = 'status-action';
    statusArea.innerText = 'Complete your payment via PayPal';
    statusArea.style.display = 'block';

    // Clear any previous PayPal SDK script and button container
    const existingScript = document.querySelector('script[src*="paypal.com/sdk/js"]');
    if (existingScript) existingScript.remove();

    const klarnaContainer = document.getElementById('klarna_container');
    klarnaContainer.innerHTML = '<div id="paypal-button-container" style="max-width:400px; margin:0 auto; padding:16px 0;"></div>';

    const isRecurring = paymentType.toLowerCase() === 'recurring';
    const currency = document.getElementById('setup-currency').value;

    const baseParams = `client-id=${cfg.clientId}&merchant-id=${cfg.merchantId}&currency=${currency}&disable-funding=${cfg.disableFunding}`;
    const dynamicParams = isRecurring
        ? '&intent=tokenize&vault=true'
        : (captureEnabled ? '' : '&intent=authorize');

    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?${baseParams}${dynamicParams}`;
    document.head.appendChild(script);

    addToApiLog('GET', `load PayPal SDK — paypal.com/sdk/js (${isRecurring ? 'tokenize' : captureEnabled ? 'capture' : 'authorize'})`, 200, {}, { orderId, paymentType, captureEnabled });

    script.onload = () => {
        const buttonConfig = {
            onApprove: async function () {
                await handlePayPalApprove(setupId);
            },
            onError: function (err) {
                console.error('PayPal Button Error:', err);
                statusArea.className = 'status-error';
                statusArea.innerText = 'PayPal error — see console for details.';
            },
            onCancel: function () {
                statusArea.className = 'status-action';
                statusArea.innerText = 'PayPal payment cancelled. You can try again.';
            }
        };

        if (isRecurring) {
            buttonConfig.createBillingAgreement = function () { return orderId; };
        } else {
            buttonConfig.createOrder = function () { return orderId; };
        }

        paypal.Buttons(buttonConfig).render('#paypal-button-container');
    };

    script.onerror = () => {
        statusArea.className = 'status-error';
        statusArea.innerText = 'Failed to load PayPal SDK. Check the client ID in frontend-config.js.';
        widget.style.display = 'none';
    };
}

async function handlePayPalApprove(setupId) {
    const loader = document.getElementById('payment-loader');
    const statusArea = document.getElementById('final-status-area');
    try {
        if (loader) loader.style.display = 'flex';

        const data = await confirmPaymentSetup(setupId, 'paypal');
        console.log('PayPal confirm response:', data);

        if (loader) loader.style.display = 'none';

        if (FAILED_STATUSES.includes(data?.status)) {
            if (loader) loader.style.display = 'flex';
            setTimeout(() => { window.location.href = `failure.html?paymentId=${data.id}`; }, 800);
        } else if (data?.id) {
            if (loader) loader.style.display = 'flex';
            setTimeout(() => { window.location.href = `success.html?paymentId=${data.id}`; }, 800);
        } else {
            // Payment approved on PayPal side but setup not yet ready — async path.
            // Show amber pending area and a manual retry button.
            // The webhook poller will also auto-click the button when payment_method_ready fires.
            renderPayPalPendingState(setupId, statusArea);
        }
    } catch (error) {
        console.error('PayPal approval error:', error);
        if (loader) loader.style.display = 'none';
        showKlarnaToast('Failed to process PayPal payment.', 'error');
    }
}

function renderPayPalPendingState(setupId, statusArea) {
    const actionArea = document.getElementById('setup-methods-container');

    // Hide the PayPal SDK widget — user has already approved, no need to show the button again
    const widget = document.getElementById('sdk-widget-container');
    if (widget) widget.style.display = 'none';

    // Remove any stale pending button
    const oldBtn = document.getElementById('make-paypal-payment-btn');
    if (oldBtn) oldBtn.remove();

    // Amber "approved but not yet ready" banner
    if (statusArea) {
        statusArea.className = '';
        statusArea.style.cssText = `
            display: block; margin-top: 15px; padding: 16px 20px;
            border-radius: 12px; text-align: left;
            background: var(--status-action-bg);
            border: 1.5px solid var(--status-action-border);
        `;
        statusArea.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px;">
                <span style="font-size:22px;">⏳</span>
                <div>
                    <div style="font-size:14px; font-weight:700; color:var(--status-action-text);">PayPal Approved — Confirming Payment</div>
                    <div style="font-size:12px; color:var(--status-action-text); margin-top:4px; line-height:1.6; opacity:0.85;">
                        Your PayPal authorisation was received. Waiting for
                        <code style="background:var(--status-action-bg); padding:1px 6px; border-radius:4px; border:1px solid var(--status-action-border);">payment_method_ready</code>
                        — or click 'Confirm Payment' above to confirm manually.
                    </div>
                </div>
            </div>
        `;
    }

    // "Confirm Payment" button
    const btn = document.createElement('button');
    btn.id = 'make-paypal-payment-btn';
    btn.className = 'main-button';
    btn.style.cssText = 'background:var(--success); margin-top:16px; width:100%;';
    btn.innerText = 'Confirm Payment';

    btn.onclick = async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.innerText = 'Processing...';

        const latestSetup = await getPaymentSetup(setupId);
        const output = document.getElementById('setup-json-output');
        if (output) output.innerText = JSON.stringify(latestSetup, null, 2);

        const data = await confirmPaymentSetup(setupId, 'paypal');
        const loader = document.getElementById('payment-loader');
        if (loader) loader.style.display = 'flex';

        if (FAILED_STATUSES.includes(data?.status)) {
            setTimeout(() => { window.location.href = `failure.html?paymentId=${data.id}`; }, 800);
        } else if (data?.id) {
            setTimeout(() => { window.location.href = `success.html?paymentId=${data.id}`; }, 800);
        } else {
            if (loader) loader.style.display = 'none';
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.innerText = 'Confirm Payment';
            showKlarnaToast('Payment method is not ready yet — try again in a few seconds.', 'error');
        }
    };

    if (actionArea) actionArea.appendChild(btn);
}

function renderConfirmButton(setupId, methodName, label, clientToken = 'Klarna Token', sessionId = 'Klarna Session Id') {
    const actionArea = document.getElementById('setup-methods-container');
    const oldBtn = document.getElementById('final-confirm-btn');

    if (!actionArea) return;
    if (oldBtn) oldBtn.remove();

    const btn = document.createElement('button');
    btn.id = 'final-confirm-btn';
    btn.className = 'main-button';
    btn.style.background = 'var(--success)';
    btn.style.marginTop = '20px';
    btn.style.width = '100%';
    btn.innerText = label;

    btn.onclick = async () => {
        if (btn.disabled) return;

        btn.disabled = true;
        btn.style.opacity = "0.5";
        btn.style.cursor = "not-allowed";
        btn.innerText = "Processing...";

        if (methodName === 'bizum' || methodName === 'eps' || methodName === 'ideal' || methodName === 'twint') {
            try {
                const data = await confirmPaymentSetup(setupId, methodName);
                console.log("Confirmation Response:", data);

                if (data._links?.redirect) {
                    window.location.href = data._links.redirect.href;
                } else {
                    document.getElementById('setup-json-output').innerText = JSON.stringify(data, null, 2);
                    btn.style.display = 'none';
                    const loader = document.getElementById('payment-loader');
                    if (loader) loader.style.display = 'flex';

                    if (FAILED_STATUSES.includes(data.status)) {
                        setTimeout(() => {
                            window.location.href = `failure.html?paymentId=${data.id}`;
                        }, 800);
                    } else {
                        showSuccessWithReset(data);
                        setTimeout(() => {
                            window.location.href = `success.html?paymentId=${data.id}`;
                        }, 800);
                    }
                }
            } catch (e) {
                console.error("Confirmation Error", e);
                btn.disabled = false;
                btn.style.opacity = "1";
                btn.style.cursor = "pointer";
                btn.innerText = "Retry Confirmation";
            }
        } else if (methodName === 'klarna') {
            try {
                window.Klarna.Payments.init({
                    client_token: clientToken,
                    session_id: sessionId
                });

                window.Klarna.Payments.authorize(
                    {},
                    async function (response) {
                        console.log('Klarna authorization response:', response);
                        const statusArea = document.getElementById('final-status-area');
                        const patchBtn = document.getElementById('patch-setup-btn');

                        if (response.approved && response.show_form === true) {
                            console.log('User approved the klarna payment:', response);

                            const getSetupResponseJson = await getPaymentSetup(setupId);
                            if (getSetupResponseJson.payment_methods.klarna.status === 'ready') {

                                const data = await confirmPaymentSetup(setupId, methodName);
                                const loader = document.getElementById('payment-loader');
                                if (loader) loader.style.display = 'flex';

                                if (FAILED_STATUSES.includes(data.status)) {
                                    setTimeout(() => {
                                        window.location.href = `failure.html?paymentId=${data.id}`;
                                    }, 800);
                                } else if (data.id) {
                                    setTimeout(() => {
                                        window.location.href = `success.html?paymentId=${data.id}`;
                                    }, 800);
                                } else {
                                    console.log('Unexpected confirm response:', data);
                                    if (loader) loader.style.display = 'none';
                                }
                            } else {
                                btn.remove();

                                statusArea.innerText = 'User already approved the payment on klarna, wait a few seconds while payment gets ready to be submitted';
                                showKlarnaToast('Cannot execute payment right now as status is not ready, Please execute the payment with the button below', type = 'warning');

                                const oldKlarnaPaymentBtn = document.getElementById('make-klarna-payment-btn');

                                if (!actionArea) return;
                                if (oldKlarnaPaymentBtn) oldBtn.remove();

                                const btnKlarna = document.createElement('button');
                                btnKlarna.id = 'make-klarna-payment-btn';
                                btnKlarna.className = 'main-button';
                                btnKlarna.style.background = 'var(--success)';
                                btnKlarna.style.marginTop = '20px';
                                btnKlarna.style.width = '100%';
                                btnKlarna.innerText = 'Make Payment Now';
                                btnKlarna.onclick = async () => {
                                    const paymentSetup = await getPaymentSetup(setupId);
                                    document.getElementById('setup-json-output').innerText = JSON.stringify(paymentSetup, null, 2);
                                    btn.remove();

                                    const data = await confirmPaymentSetup(setupId, methodName);
                                    const loader = document.getElementById('payment-loader');
                                    if (loader) loader.style.display = 'flex';

                                    if (FAILED_STATUSES.includes(data.status)) {
                                        setTimeout(() => {
                                            window.location.href = `failure.html?paymentId=${data.id}`;
                                        }, 800);
                                    } else if (data.id) {
                                        setTimeout(() => {
                                            window.location.href = `success.html?paymentId=${data.id}`;
                                        }, 800);
                                    } else {
                                        if (loader) loader.style.display = 'none';
                                        const paymentSetup = await getPaymentSetup(setupId);
                                        document.getElementById('setup-json-output').innerText = JSON.stringify(paymentSetup, null, 2);
                                        showKlarnaToast('Payment method is not ready, try again in few seconds to make payment again.', 'error');
                                    }
                                };
                                actionArea.appendChild(btnKlarna);
                            }

                        } else {
                            btn.remove();
                            console.log(response);
                            statusArea.innerText = 'User canceled the payment on klarna or did not approve due to some reason.';
                            statusArea.className = 'status-error';
                            if (patchBtn) {
                                patchBtn.disabled = false;
                                patchBtn.style.opacity = "1";
                                patchBtn.style.cursor = "pointer";
                                patchBtn.innerText = 'Update Payment Setup';
                            }
                        }
                    }
                );
            } catch (e) {
                console.error("Error in loading confirmation button for klarna", e);
                btn.disabled = false;
                btn.style.opacity = "1";
                btn.style.cursor = "pointer";
                btn.innerText = "Retry";
            }
        }
    };

    actionArea.appendChild(btn);
}

function showSuccessWithReset(data) {
    const statusArea = document.getElementById('final-status-area');
    if (!statusArea) return;

    statusArea.style.display = 'block';
    statusArea.className = 'status-ready';

    statusArea.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 10px;">
            <p style="margin: 0;">Payment Processed! Status: <strong>${data.status || 'Success'}</strong></p>
            <button id="reset-session-btn" class="main-button"
                style="background: var(--text-secondary); font-size: 13px; width: auto; padding: 10px 20px;">
                Reset Session
            </button>
        </div>
    `;

    setTimeout(() => {
        const resetBtn = document.getElementById('reset-session-btn');
        if (resetBtn) {
            resetBtn.onclick = function () {
                resetSetupUI();
            };
        }
    }, 50);
}

function resetSetupUI() {
    console.log("Force Clearing Setup Tab UI...");

    currentSetupId = null;
    activeSetupResponse = null;

    const amountInput = document.getElementById('setup-amount');
    if (amountInput) amountInput.value = "100";

    const containers = [
        'setup-methods-container',
        'setup-response-container',
        'sdk-widget-container',
        'final-status-area'
    ];

    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const contentToWipe = {
        'methods-grid': '',
        'dynamic-inputs-area': '',
        'setup-json-output': '',
        'klarna_container': ''
    };

    for (let id in contentToWipe) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = contentToWipe[id];
    }

    const confirmBtn = document.getElementById('final-confirm-btn');
    if (confirmBtn) confirmBtn.remove();

    const patchBtn = document.getElementById('patch-setup-btn');
    if (patchBtn) {
        patchBtn.style.display = 'none';
        patchBtn.disabled = false;
        patchBtn.style.opacity = "1";
        patchBtn.style.cursor = "pointer";
        patchBtn.innerText = 'Update Payment Setup';
    }

    const createBtn = document.getElementById('create-setup-btn');
    if (createBtn) {
        createBtn.disabled = false;
        createBtn.innerText = 'Initialize Setup';
        createBtn.style.opacity = "1";
    }

    const mainWrapper = document.querySelector('.wrapper');
    if (mainWrapper) mainWrapper.scrollTo({ top: 0, behavior: 'smooth' });

    const methodsContainer = document.getElementById('setup-methods-container');
    if (methodsContainer) {
        methodsContainer.style.display = 'none';
        const grid = document.getElementById('methods-grid');
        if (grid) grid.innerHTML = '';
    }

    if (createBtn) {
        createBtn.disabled = false;
        createBtn.style.opacity = "1";
        createBtn.innerText = 'Initialize Setup';
    }
}

function validateInitializeForm() {
    const setupInputs = ['setup-amount', 'setup-currency', 'setup-payment-type', 'setup-pc-id'];
    const createBtn = document.getElementById('create-setup-btn');
    const allFilled = setupInputs.every(id => {
        const el = document.getElementById(id);
        return el && el.value.trim() !== "";
    });
    createBtn.disabled = !allFilled;
    createBtn.style.opacity = allFilled ? "1" : "0.5";
    createBtn.style.cursor = allFilled ? "pointer" : "not-allowed";
}

document.addEventListener('DOMContentLoaded', () => {

    // Create Setup button
    document.getElementById('create-setup-btn').addEventListener('click', async () => {
        const setupMethodsContainer = document.getElementById('setup-methods-container');
        const dynamicInputsArea = document.getElementById('dynamic-inputs-area');
        const responseContainer = document.getElementById('setup-response-container');
        const patchBtn = document.getElementById('patch-setup-btn');
        const statusArea = document.getElementById('final-status-area');
        const widgetContainer = document.getElementById('sdk-widget-container');

        const oldConfirmBtn = document.getElementById('final-confirm-btn');
        if (oldConfirmBtn) oldConfirmBtn.remove();

        if (statusArea) {
            statusArea.style.display = 'none';
            statusArea.innerHTML = '';
            statusArea.className = '';
        }

        if (widgetContainer) {
            widgetContainer.style.display = 'none';
            document.getElementById('klarna_container').innerHTML = '';
        }

        if (setupMethodsContainer) setupMethodsContainer.style.display = 'none';
        if (dynamicInputsArea) dynamicInputsArea.innerHTML = '';
        if (responseContainer) responseContainer.style.display = 'none';

        if (patchBtn) {
            patchBtn.style.display = 'none';
            patchBtn.disabled = true;
            patchBtn.style.opacity = "0.5";
            patchBtn.innerText = 'Update Payment Setup';
        }

        const body = {
            amount: parseInt(document.getElementById('setup-amount').value),
            currency: document.getElementById('setup-currency').value,
            payment_type: document.getElementById('setup-payment-type').value,
            processing_channel_id: document.getElementById('setup-pc-id').value,
            settings: {
                capture: document.getElementById('setup-capture-toggle').checked
            }
        };

        const res = await fetch(`${window.APP_CONFIG.apiBaseUrl}/payment-setups`, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json' }
        });

        activeSetupResponse = await res.json();

        await addToApiLog(
            'POST',
            `create payment setup: ${activeSetupResponse?.id ? activeSetupResponse?.id : activeSetupResponse?.request_id} - /payments/setups`,
            activeSetupResponse.id ? 200 : 422,
            body,
            activeSetupResponse
        );

        renderMethodToggles(activeSetupResponse.available_payment_methods);
        document.getElementById('setup-json-output').innerText = JSON.stringify(activeSetupResponse, null, 2);
        document.getElementById('setup-response-container').style.display = 'block';
    });

    // Update (Patch) Setup button
    document.getElementById('patch-setup-btn').addEventListener('click', async () => {
        const patchBody = {
            payment_methods: {},
            amount: parseInt(document.getElementById('setup-amount').value),
            reference: '#Order_' + Math.floor(Math.random() * 1000) + 1,
            currency: document.getElementById('setup-currency').value,
            payment_type: document.getElementById('setup-payment-type').value,
            processing_channel_id: document.getElementById('setup-pc-id').value,
            settings: {
                capture: document.getElementById('setup-capture-toggle').checked
            }
        };

        const allToggles = document.querySelectorAll('.method-toggle');
        allToggles.forEach(t => {
            t.disabled = true;
            t.parentElement.style.opacity = "0.6";
            t.parentElement.style.cursor = "not-allowed - setup is patched alreadyxw";
        });

        const activeToggles = document.querySelectorAll('.method-toggle:checked');
        activeToggles.forEach(t => {
            const method = t.dataset.method;
            patchBody.payment_methods[method] = { initialization: "enabled" };
        });

        document.querySelectorAll('.patch-field').forEach(input => {
            const path = input.dataset.path.split('.');
            let current = patchBody;
            path.forEach((part, index) => {
                if (index === path.length - 1) {
                    current[part] = input.value;
                } else {
                    current[part] = current[part] || {};
                    current = current[part];
                }
            });
        });

        const activeMethod = Array.from(document.querySelectorAll('.method-toggle:checked')).map(t => t.dataset.method)[0];
        if (activeMethod && METHODS_WITH_ORDER_ITEMS.has(activeMethod)) {
            patchBody.order = { items: [] };
            document.querySelectorAll('.order-item-row').forEach(row => {
                patchBody.order.items.push({
                    name: row.querySelector('.k-name').value,
                    quantity: parseInt(row.querySelector('.k-qty').value),
                    unit_price: parseInt(row.querySelector('.k-price').value),
                    total_amount: parseInt(row.querySelector('.k-total').value),
                    reference: row.querySelector('.k-ref').value
                });
            });
        }

        console.log("Final PATCH Body:", JSON.stringify(patchBody, null, 2));

        const btn = document.getElementById('patch-setup-btn');
        const output = document.getElementById('setup-json-output');
        const responseContainer = document.getElementById('setup-response-container');

        if (btn.disabled) return;

        // Validate order items total matches main amount before submitting
        const orderRows = document.querySelectorAll('.order-item-row');
        if (orderRows.length > 0) {
            let itemsTotal = 0;
            orderRows.forEach(row => {
                itemsTotal += parseInt(row.querySelector('.k-total').value) || 0;
            });
            const mainAmount = parseInt(document.getElementById('setup-amount').value) || 0;
            if (itemsTotal !== mainAmount) {
                showKlarnaToast(`Order items total (${itemsTotal}) doesn't match payment amount (${mainAmount}). Please equalise them before patching.`, 'error');
                return;
            }
        }

        btn.disabled = true;
        btn.style.opacity = "0.5";
        btn.style.cursor = "not-allowed";
        btn.innerText = 'Patching...';

        try {
            const queryParams = new URLSearchParams({ setupId: activeSetupResponse.id });
            const res = await fetch(`${window.APP_CONFIG.apiBaseUrl}/update-payment-setups?${queryParams.toString()}`, {
                method: 'PUT',
                body: JSON.stringify(patchBody),
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await res.json();
            await addToApiLog('PUT', `Update payment setup - /payments/setups/${activeSetupResponse.id}`, result.id ? 200 : 422, patchBody, result);
            responseContainer.style.display = 'block';
            output.innerText = JSON.stringify(result, null, 2);
            const selectedMethod = document.querySelector('.method-toggle:checked')?.dataset.method;
            await handleFinalState(result, selectedMethod);

            // Only poll for payment_method_ready when the selected method needs an async
            // authorization step (e.g. Klarna SDK). Methods that are already "ready" in
            // the PATCH response (e.g. bizum, eps, ideal) don't fire this webhook.
            const methodData = result.payment_methods?.[selectedMethod];
            const needsAsyncAuth = methodData?.status === 'action_required';
            if (result.id && needsAsyncAuth) startSetupWebhookPolling(result.id);

            if (result._links?.redirect) {
                const redirectBtn = document.createElement('button');
                redirectBtn.className = 'main-button';
                redirectBtn.style.marginTop = '10px';
                redirectBtn.style.background = 'var(--primary)';
                redirectBtn.innerText = 'Follow Redirect URL';
                redirectBtn.onclick = () => window.location.href = result._links.redirect.href;
                output.parentElement.appendChild(redirectBtn);
            }
            console.log("Updated Payment Setup Response:", result);
        } catch (e) {
            console.error(e);
            output.innerText = "Error: " + e.message;
            allToggles.forEach(t => {
                if (t.checked) t.disabled = false;
                t.parentElement.style.opacity = "1";
            });
            btn.disabled = false;
            btn.style.opacity = "1";
        } finally {
            btn.innerText = 'Update & Patch Setup';
        }
    });

    // Validate form on any input change
    const setupInputs = ['setup-amount', 'setup-currency', 'setup-payment-type', 'setup-pc-id'];
    setupInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', validateInitializeForm);
        document.getElementById(id).addEventListener('change', validateInitializeForm);
    });

    // Show inline warning when main amount diverges from order items total
    document.getElementById('setup-amount').addEventListener('input', () => {
        const rows = document.querySelectorAll('.order-item-row');
        if (rows.length === 0) return;

        let itemsTotal = 0;
        rows.forEach(row => {
            itemsTotal += parseInt(row.querySelector('.k-total').value) || 0;
        });
        const mainAmount = parseInt(document.getElementById('setup-amount').value) || 0;

        let errEl = document.getElementById('amount-mismatch-error');
        if (!errEl) {
            errEl = document.createElement('p');
            errEl.id = 'amount-mismatch-error';
            errEl.style.cssText = 'font-size:12px; color:var(--status-error-text); background:var(--status-error-bg); padding:6px 10px; border-radius:6px; margin:6px 0 0; border:1px solid var(--status-error-border);';
            document.getElementById('setup-amount').parentElement.appendChild(errEl);
        }

        if (mainAmount !== itemsTotal) {
            errEl.textContent = `⚠️ Amount (${mainAmount}) doesn't match order items total (${itemsTotal}). Update items or amount to equalise.`;
            errEl.style.display = 'block';
        } else {
            errEl.style.display = 'none';
        }
    });

    // Set default processing channel ID from APP_CONFIG if input is empty
    const setupPcIdEl = document.getElementById('setup-pc-id');
    if (setupPcIdEl && window.APP_CONFIG?.processingChannelId && !setupPcIdEl.value) {
        setupPcIdEl.value = window.APP_CONFIG.processingChannelId;
    }

    validateInitializeForm();

});

function startSetupWebhookPolling(setupId) {
    stopSetupWebhookPolling(); // clear any existing poller before starting

    const POLL_INTERVAL_MS = 2000;
    const POLL_TIMEOUT_MS = 120000; // 2 minutes
    const startTime = Date.now();

    setupWebhookPoller = setInterval(async () => {
        if (Date.now() - startTime > POLL_TIMEOUT_MS) {
            stopSetupWebhookPolling();
            return;
        }

        try {
            const res = await fetch(`${window.APP_CONFIG.apiBaseUrl}/webhook-event?paymentId=${setupId}`);
            if (res.status === 404) return; // no event yet, keep polling

            const event = await res.json();
            if (!event.found) return;

            console.log('Setup webhook received:', event.type, event.data);
            addToApiLog('WEBHOOK', `${event.type} — /webhook`, 200, {}, event.data);

            if (event.type !== 'payment_method_ready') return;

            stopSetupWebhookPolling();
            showKlarnaToast('Payment method ready — confirming automatically...', 'success');

            // Fetch latest setup state to find which method is now ready
            const latestSetup = await getPaymentSetup(setupId);
            if (!latestSetup || !latestSetup.payment_methods) return;

            // Update the JSON output panel with the latest state
            const output = document.getElementById('setup-json-output');
            if (output) output.innerText = JSON.stringify(latestSetup, null, 2);

            // Find the method that is ready and confirm it
            for (const methodName in latestSetup.payment_methods) {
                if (latestSetup.payment_methods[methodName].status === 'ready') {
                    // If the confirm button is already rendered and enabled, click it
                    // (covers Klarna where the button exists after SDK authorization)
                    const finalConfirmBtn = document.getElementById('final-confirm-btn');
                    const paypalBtn = document.getElementById('make-paypal-payment-btn');
                    const pendingBtn = finalConfirmBtn || paypalBtn;
                    if (pendingBtn && !pendingBtn.disabled) {
                        showKlarnaToast('Payment method ready — confirming...', 'success');
                        pendingBtn.click();
                        return;
                    }

                    // Otherwise confirm directly (covers Bizum and any method
                    // where the button wasn't rendered yet)
                    const data = await confirmPaymentSetup(setupId, methodName);
                    if (!data) return;

                    const loader = document.getElementById('payment-loader');
                    if (loader) loader.style.display = 'flex';

                    if (data._links?.redirect) {
                        setTimeout(() => { window.location.href = data._links.redirect.href; }, 800);
                    } else if (FAILED_STATUSES.includes(data.status)) {
                        setTimeout(() => { window.location.href = `failure.html?paymentId=${data.id}`; }, 800);
                    } else if (data.id) {
                        setTimeout(() => { window.location.href = `success.html?paymentId=${data.id}`; }, 800);
                    }
                    return;
                }
            }
        } catch (e) {
            console.error('Setup webhook poll error:', e);
        }
    }, POLL_INTERVAL_MS);
}

function stopSetupWebhookPolling() {
    if (setupWebhookPoller) {
        clearInterval(setupWebhookPoller);
        setupWebhookPoller = null;
    }
}

// ── Theme change: re-render method cards + re-mount card tokenizer ────────────
document.addEventListener('themechange', async () => {
    // Re-render method toggle cards (picks up new --border, --bg-card, --text-primary)
    if (activeSetupResponse?.payment_methods) {
        const methods = Object.keys(activeSetupResponse.payment_methods);
        if (methods.length > 0) renderMethodToggles(methods);
    }

    // Re-mount card tokenizer if it is currently visible
    const formHost = document.getElementById('setup-card-form-host');
    if (_cardActiveSession && formHost) {
        formHost.innerHTML = '';
        try {
            await mountCardTokenizer(formHost, _cardActiveSession);
        } catch (e) {
            console.warn('Card tokenizer re-mount after theme change failed:', e);
        }
    }
});
