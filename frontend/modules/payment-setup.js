// =============================================
// Payment Setup Module
// =============================================

let activeSetupResponse = null;
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
    card: 'ℹ️ Card requires hosted card input fields (card_details_required) and cannot be patched via simple fields.',
    instrument: 'ℹ️ No additional fields required. Patching will enable this instrument for the setup.',
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

    const patchBtn = document.getElementById('patch-setup-btn');
    if (patchBtn) patchBtn.style.display = 'none';
};

function renderMethodToggles(methods) {
    const grid = document.getElementById('methods-grid');
    grid.innerHTML = '';
    methods.forEach(m => {
        const card = document.createElement('div');
        card.className = 'context-area';
        card.style.padding = '15px';
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:700;">${m.toUpperCase()}</span>
                <label class="switch">
                    <input type="checkbox" class="method-toggle" data-method="${m}">
                    <span class="slider round"></span>
                </label>
            </div>
        `;
        grid.appendChild(card);
    });
    document.getElementById('setup-methods-container').style.display = 'block';

    document.querySelectorAll('.method-toggle').forEach(t => {
        t.addEventListener('change', handleToggleChange);
    });
}

function handleToggleChange() {
    const activeToggles = Array.from(document.querySelectorAll('.method-toggle:checked')).map(t => t.dataset.method);
    const inputsArea = document.getElementById('dynamic-inputs-area');
    const patchBtn = document.getElementById('patch-setup-btn');
    const allToggles = document.querySelectorAll('.method-toggle');

    const hasActiveToggle = activeToggles.length > 0;
    patchBtn.disabled = !hasActiveToggle;
    patchBtn.style.opacity = hasActiveToggle ? "1" : "0.5";
    patchBtn.style.cursor = hasActiveToggle ? "pointer" : "not-allowed";

    if (activeToggles.length > 0) {
        allToggles.forEach(t => {
            if (!t.checked) t.disabled = true;
        });
    } else {
        allToggles.forEach(t => t.disabled = false);
    }

    inputsArea.innerHTML = '';

    activeToggles.forEach(method => {
        const section = document.createElement('div');
        section.className = 'context-area';
        section.style.marginTop = '10px';
        section.innerHTML = `<h4 style="margin-top:0; color:#6366f1;">${method.toUpperCase()} Requirements</h4><div class="inline-form" id="fields-${method}"></div>`;

        // Show a note for methods with special requirements (currency, card details, etc.)
        if (METHOD_NOTES[method]) {
            const note = document.createElement('p');
            note.style.cssText = 'font-size:12px; color:#92400e; background:#fef3c7; padding:8px 12px; border-radius:6px; margin:4px 0 8px;';
            note.textContent = METHOD_NOTES[method];
            section.insertBefore(note, section.querySelector('.inline-form'));
        }

        if (METHOD_REQUIREMENTS[method]) {
            METHOD_REQUIREMENTS[method].forEach(field => {
                const group = document.createElement('div');
                group.className = 'form-group';
                group.innerHTML = `
                    <label class="text-label">${field.label}</label>
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

    if (methodData.initialization === "enabled" || methodData.status === "ready") {
        if (methodData.status === "ready") {
            statusArea.className = 'status-ready';
            statusArea.innerText = `${methodName.toUpperCase()} is Ready!`;
            statusArea.style.display = 'block';
            renderConfirmButton(setupId, methodName, "Confirm & Redirect");
        } else if (methodData.status === "action_required" && methodData.action?.type === "sdk") {
            statusArea.className = 'status-action';
            statusArea.innerText = `${methodName.toUpperCase()} requires SDK Authorization.`;
            statusArea.style.display = 'block';

            if (methodName === 'klarna') {
                initializeKlarnaSDK(methodData.action.client_token, methodData.action.session_id, setupId);
            }
        }
    }
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

function renderConfirmButton(setupId, methodName, label, clientToken = 'Klarna Token', sessionId = 'Klarna Session Id') {
    const actionArea = document.getElementById('setup-methods-container');
    const oldBtn = document.getElementById('final-confirm-btn');

    if (!actionArea) return;
    if (oldBtn) oldBtn.remove();

    const btn = document.createElement('button');
    btn.id = 'final-confirm-btn';
    btn.className = 'main-button';
    btn.style.background = '#059669';
    btn.style.marginTop = '20px';
    btn.style.width = '100%';
    btn.innerText = label;

    btn.onclick = async () => {
        if (btn.disabled) return;

        btn.disabled = true;
        btn.style.opacity = "0.5";
        btn.style.cursor = "not-allowed";
        btn.innerText = "Processing...";

        if (methodName === 'bizum') {
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
                                btnKlarna.style.background = '#059669';
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
                style="background: #475569; font-size: 13px; width: auto; padding: 10px 20px;">
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
            processing_channel_id: document.getElementById('setup-pc-id').value
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
            processing_channel_id: document.getElementById('setup-pc-id').value
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
                redirectBtn.style.background = '#0ea5e9';
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
            errEl.style.cssText = 'font-size:12px; color:#b91c1c; background:#fee2e2; padding:6px 10px; border-radius:6px; margin:6px 0 0;';
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
                    const existingBtn = document.getElementById('final-confirm-btn');
                    if (existingBtn && !existingBtn.disabled) {
                        existingBtn.click();
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
