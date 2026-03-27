// =============================================
// Flow Widget Module
// =============================================

let showPayButtonLogic = true;
let showCVVField = true;
let isTokenizeOnly = false;
let paymentSessionBody = {};

// Track mounted session for theme re-init
let _flowActiveSession = null;
let _flowIsTokenizeOnly = false;

const performPaymentSubmission = async (submitData) => {
    try {
        document.getElementById('payment-loader').style.display = 'flex';
        const response = await fetch(`${window.APP_CONFIG.apiBaseUrl}/submit-payment-session`, {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(submitData),
        });
        const jsonResponse = response.json();
        await addToApiLog(
            'POST',
            `submit flow session: ${jsonResponse.id} - /payment-sessions/${jsonResponse.id}/submit`,
            (jsonResponse.id && jsonResponse.status === 'Approved') || (jsonResponse.id && jsonResponse.status === 'Declined') ? 201
                : jsonResponse.id && jsonResponse.status === 'Action Requited' ? 202 : 422,
            submitData,
            jsonResponse
        );
        return jsonResponse;
    } catch (error) {
        document.getElementById('payment-loader').style.display = 'none';
        console.error("❌ Submit error:", error);
        showToast('Payment submission failed. Please try again.', 'error');
    }
};

// getFlowAppearance() and mountCardTokenizer() live in utils.js (shared with payment-setup)

let initializeFlow = async (paymentSession, isTokenizeOnly) => {
    // Store for theme re-mount
    _flowActiveSession = paymentSession;
    _flowIsTokenizeOnly = isTokenizeOnly;

    const appearance = getFlowAppearance();

    const tokenizeButton = document.getElementById("tokenize-button");
    const payButton = document.getElementById("pay-button");
    const tokenizedDataContainer = document.querySelector(".success-payment-message");

    if (!isTokenizeOnly) {

        tokenizeButton.style.display = 'none';
        tokenizedDataContainer.style.display = 'none';
        if (!showPayButtonLogic) {
            payButton.style.display = 'inline';
            payButton.classList.add('main-button');
            payButton.textContent = 'Pay Now';

            payButton.addEventListener('click', () => {
                const isTnCChecked = (handleTnCValidation(flowComponent.type));
                if (isTnCChecked) {
                    payButton.classList.add('disabled-button');
                    payButton.textContent = 'Processing...';
                    flowComponent.submit();
                }
            });
        }

        const handlePaymentAdditionalContentMount = (_component, element) => {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.name = 'injected-payment-agreement-message';
            checkbox.id = _component.selectedPaymentMethodId;
            checkbox.checked = false;

            checkbox.addEventListener('click', () => {
                handleTnCValidation(checkbox.id);
            });

            const label = document.createElement('label');
            const merchantName = "Syed's Shop";
            const text = `I agree to the terms and conditions and authorize ${merchantName} to use my payment details to process the payment.`;
            label.id = `${_component.selectedPaymentMethodId}-label`;
            label.innerHTML = text;
            element.appendChild(checkbox);
            element.appendChild(label);
        };

        const handleSubmit = async (self, sessionData) => {
            if (self.type == "card" || self.type == "stored_card") {
                const submitResponse = await performPaymentSubmission({
                    amount: 2500,
                    sessionData,
                    paymentSessionId: paymentSession.id,
                    items: [{ name: "Order Total", unit_price: 2500, quantity: 1, total_amount: 2500 }],
                    "3ds": { enabled: true },
                    payment_type: "Unscheduled"
                });
                return submitResponse;
            }
        };

        const handleTnCValidation = (checkboxId) => {
            const checkboxElement = document.getElementById(checkboxId);
            const labelElement = document.getElementById(`${checkboxId}-label`);
            if (checkboxElement && !checkboxElement.checked) {
                labelElement.style.color = 'var(--error)';
                return false;
            } else if (checkboxElement) {
                labelElement.style.color = '';
                return true;
            }
            return true;
        };

        const checkout = await CheckoutWebComponents({
            publicKey: window.APP_CONFIG.publicKey,
            environment: "sandbox",
            locale: "en-GB",
            paymentSession,
            appearance: appearance,
            showPayButton: showPayButtonLogic,
            componentOptions: {
                flow: {
                    handlePaymentAdditionalContentMount,
                    displayPaymentAdditionalContent: "above_pay_button",
                    expandFirstPaymentMethod: true,
                    captureCardCvv: showCVVField
                },
                card: {
                    data: {
                        cardholderName: 'Syed Hasnain'
                    },
                    displayCardholderName: "bottom"
                },
                stored_card: {
                    displayMode: "all"
                }
            },
            handleClick: (_self) => {
                let isTnCChecked = handleTnCValidation(_self.selectedPaymentMethodId);
                if (isTnCChecked) {
                    return { continue: true };
                }
                return { continue: false };
            },
            onSubmit: (_self) => {
            },
            onCardBinChanged: (_self, cardMetadata) => {
                //console.log("OnCardBinChanged() Result: ", cardMetadata)
            },
            onTokenized: (_self, tokenizeResult) => {
                console.log("OnTokenized() Result: ", tokenizeResult.data);
            },
            onPaymentCompleted: (_component, paymentResponse) => {
                console.log("Create Payment with PaymentId: ", paymentResponse);
                const loader = document.getElementById('payment-loader');
                if (loader) {
                    loader.style.display = 'flex';
                }
                if (!showPayButtonLogic) {
                    payButton.classList.add("disabled-button");
                    payButton.textContent = 'Pay Now';
                }
                setTimeout(() => {
                    window.location.href = `success.html?paymentId=${paymentResponse.id}`;
                }, 800);
            },
            onChange: (component) => {
                if (!component.isValid()) {
                    if (!showPayButtonLogic)
                        payButton.classList.add('disabled-button');
                } else {
                    if (!showPayButtonLogic)
                        payButton.classList.remove('disabled-button');
                }
            },
            onError: (component, error) => {
                console.log(error.details);
                if (!showPayButtonLogic) {
                    payButton.classList.add('main-button');
                    payButton.textContent = 'Pay Now';
                }
                //window.location.href = `failure.html?error=${encodeURIComponent(error.message)}`;
            },
        });

        const flowComponent = checkout.create("flow",
            {
                //handleSubmit
            }
        );

        flowComponent.mount(document.getElementById("flow-container"));

    } else {

        if (!showPayButtonLogic) {
            payButton.style.display = 'none';
        }

        // Mount the card form first, then show the button below it
        const cardComponent = await mountCardTokenizer(document.getElementById("flow-container"), paymentSession);

        // Move button below the card form, then successMsg below the button
        const flowContainer = document.getElementById("flow-container");
        tokenizeButton.style.cssText = 'display:block; width:fit-content; margin:16px auto 0;';
        flowContainer.appendChild(tokenizeButton);
        flowContainer.appendChild(tokenizedDataContainer); // keeps result below the button

        tokenizeButton.addEventListener('click', async () => {
            if (await cardComponent.isValid()) {
                const { data } = await cardComponent.tokenize();
                tokenizedDataContainer.innerHTML = `
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid var(--border);">
                        <span style="font-size:22px;">✅</span>
                        <div>
                            <div style="font-weight:700; font-size:14px; color:var(--success);">Card Tokenized Successfully</div>
                            <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Token ready for payment processing</div>
                        </div>
                    </div>
                    <div class="token-row"><span class="token-label">Token</span><span class="token-value">${data.token}</span></div>
                    <div class="token-row"><span class="token-label">Scheme</span><span class="token-value">${data.scheme}</span></div>
                    <div class="token-row"><span class="token-label">Card Type</span><span class="token-value">${data.card_type}</span></div>
                    <div class="token-row"><span class="token-label">Last 4</span><span class="token-value">•••• ${data.last4}</span></div>
                    <div class="token-row"><span class="token-label">Expiry</span><span class="token-value">${data.expiry_month}/${data.expiry_year}</span></div>
                `;
                tokenizedDataContainer.style.display = 'block';
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {

    const rememberMeToggle = document.getElementById('remember-me-toggle');
    const threeDSToggle = document.getElementById('3ds-toggle');
    const captureToggle = document.getElementById('capture-toggle');
    const paymentTypeSelect = document.getElementById('payment-type-select');
    const nameInput = document.getElementById('name-input');
    const emailInput = document.getElementById('email-input');
    const amountInput = document.getElementById('amount-input');
    const currencySelect = document.getElementById('currency-select');
    const countrySelect = document.getElementById('country-select');

    let currency = CURRENCIES.find(c => c.iso4217 == currencySelect.value);

    paymentSessionBody = {
        currency: currencySelect.value,
        amount: parseInt(amountInput.value * currency.base),
        payment_type: paymentTypeSelect.value,
        capture: captureToggle.value == 'on' ? false : true,
        reference: '#Order_' + Math.floor(Math.random() * 1000) + 1,
        billing: {
            address: {
                country: countrySelect.value,
                address_line1: "Lauterbergerstr. 23",
                city: "Berlin",
                zip: "12347"
            }
        },
        payment_method_configuration: {
            card: {
                store_payment_details: 'collect_consent'
            },
            stored_card: {
                customer_id: "cus_korriakiszvubcuzaqpv5ujusm"
            }
        },
        //enabled_payment_methods: ["googlepay"],
        disabled_payment_methods: ["remember_me"],
        processing_channel_id: window.APP_CONFIG.processingChannelId,
        success_url: `${window.location.protocol}//${window.location.host}/success.html`,
        failure_url: `${window.location.protocol}//${window.location.host}/failure.html`,
        customer: {
            id: "cus_korriakiszvubcuzaqpv5ujusm"
        },
        '3ds': {
            enabled: threeDSToggle.value == 'on' ? false : true
        },
        processing: {
            pan_preference: 'fpan'
        },
        items: [
            {
                name: "Digital Goods",
                quantity: 1,
                unit_price: parseInt(amountInput.value * currency.base),
                total_amount: parseInt(amountInput.value * currency.base)
            }
        ]
    };

    currencySelect.addEventListener('change', function () {
        paymentSessionBody.currency = this.value;
    });

    countrySelect.addEventListener('change', function () {
        paymentSessionBody.billing.address.country = this.value;
    });

    threeDSToggle.addEventListener('change', function () {
        paymentSessionBody['3ds'].enabled = this.checked;
    });

    captureToggle.addEventListener('change', function () {
        paymentSessionBody.capture = this.checked;
    });

    rememberMeToggle.addEventListener('change', async function () {
        console.log('rememberMeEnabled', this.checked);
        console.log('rememberMeEnabled', this.value);
        if (await !this.checked) {
            paymentSessionBody['disabled_payment_methods'] = ['remember_me'];
        } else {
            delete paymentSessionBody['disabled_payment_methods'];
        }
    });

    paymentTypeSelect.addEventListener('change', (e) => {
        paymentSessionBody.payment_type = e.target.value;
    });

    nameInput.addEventListener('input', (e) => {
        paymentSessionBody.customer.name = e.target.value;
    });

    emailInput.addEventListener('input', (e) => {
        paymentSessionBody.customer.email = e.target.value;
    });

    amountInput.addEventListener('input', (e) => {
        paymentSessionBody.amount = parseInt(amountInput.value * currency.base);
        paymentSessionBody.items[0].unit_price = parseInt(amountInput.value * currency.base);
    });

    // Flow button listeners
    const renderFlowButton = document.getElementById("flow-button");
    const renderTokenizeOnlyButton = document.getElementById("tokenize-only-button");
    const flowContainer = document.getElementById("flow-container");

    renderFlowButton.addEventListener('click', async () => {
        try {
            isTokenizeOnly = false;
            const getResponse = await fetch(`${window.APP_CONFIG.apiBaseUrl}/payment-sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(paymentSessionBody),
            });
            let getData = await getResponse.json();
            await addToApiLog('POST', `create flow payment session: ${getData.id} - /payment-sessions`, getData.id ? 201 : 422, paymentSessionBody, getData);
            flowContainer.style.display = 'block';
            await initializeFlow(getData);
        } catch (error) {
            console.error(error);
            showToast('Failed to create payment session. Please try again.', 'error');
        }
    });

    renderTokenizeOnlyButton.addEventListener('click', async () => {
        try {
            isTokenizeOnly = true;
            const getResponse = await fetch(`${window.APP_CONFIG.apiBaseUrl}/payment-sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(paymentSessionBody),
            });
            let getData = await getResponse.json();
            await addToApiLog('POST', `create tokenization-only flow session: ${getData.id} - /payment-sessions`, getData.id ? 201 : 422, paymentSessionBody, getData);
            flowContainer.style.display = 'block';
            await initializeFlow(getData, isTokenizeOnly);
        } catch (error) {
            console.error(error);
            showToast('Failed to create tokenization session. Please try again.', 'error');
        }
    });

});

// Re-mount the Checkout SDK with updated theme appearance when the user switches theme.
// Uses the stored session — no new API call required.
document.addEventListener('themechange', async () => {
    const flowContainer = document.getElementById('flow-container');
    if (!_flowActiveSession || !flowContainer || flowContainer.style.display === 'none') return;

    // Preserve the static button + message elements, clear only the SDK content
    const tokenizeButton = document.getElementById('tokenize-button');
    const payButton = document.getElementById('pay-button');
    const successMsg = document.querySelector('.success-payment-message');

    // Detach static elements so they survive the innerHTML wipe
    if (tokenizeButton) tokenizeButton.remove();
    if (payButton) payButton.remove();
    if (successMsg) successMsg.remove();

    flowContainer.innerHTML = '';

    // Re-attach static elements
    if (tokenizeButton) flowContainer.appendChild(tokenizeButton);
    if (payButton) flowContainer.appendChild(payButton);
    if (successMsg) flowContainer.appendChild(successMsg);

    // Re-initialize with the stored session and fresh appearance
    await initializeFlow(_flowActiveSession, _flowIsTokenizeOnly);
});
