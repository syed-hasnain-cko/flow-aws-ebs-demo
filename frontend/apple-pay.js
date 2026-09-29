// apple-pay.js is wrapped in an IIFE to keep all locals off window.
// Only window.addApplePayButton is intentionally global (called by wallets.js / tab UI).
(function() {

let appleCurrency = undefined;
let appleTotalPrice = undefined;
let applePaymentRequest;
let request;

// Express Checkout state — populated by session.onshippingcontactselected /
// onshippingmethodselected below, read by performPayment() to add the
// customer's selected shipping cost onto the final payment amount.
let expressShippingState = { isExpress: false, selectedRate: null, shippingCost: 0, lastCountry: null };

// NOTE: These element IDs use the '-google' suffix intentionally.
// The Wallets tab shares a single set of form fields for both Apple Pay and Google Pay.
// Do NOT rename these to '-apple' — it would break the shared form.
const threeDSToggleApple = document.getElementById('3ds-toggle-google');
const captureToggleApple = document.getElementById('capture-toggle-google');
const paymentTypeSelectApple = document.getElementById('payment-type-select-google');
const nameInputApple = document.getElementById('name-input-google');
const emailInputApple = document.getElementById('email-input-google');
const amountInputApple = document.getElementById('amount-input-google');
const currencySelectApple = document.querySelector("#currency-select-google-pay")
// Shared locale select (same '-google' sharing convention as the other fields above) —
// google-pay.js's `gLocale` is private to its own IIFE, so Apple Pay must read this by ID directly.
const localeSelectApple = document.getElementById('google-locale');

applePaymentRequest = {

  currency: appleCurrency,
  amount: 10,
  payment_type: paymentTypeSelectApple.value,
  capture: captureToggleApple.checked ? true : false,
  success_url: `${window.location.protocol}//${window.location.host}/success.html`,
  failure_url: `${window.location.protocol}//${window.location.host}/failure.html`,
  customer: {
      email: emailInputApple.value,
      name: nameInputApple.value
  },
  '3ds': {
      enabled: threeDSToggleApple.checked ? true : false
  }
}

// CURRENCIES is provided globally by modules/data.js (CURRENCIES_APPLE removed — duplicate)

const appleButtonType = document.getElementById('apple-button-type');
const appleButtonStyle = document.getElementById('apple-button-style');
const appleMerchantCapsSelect = document.getElementById('apple-merchant-capabilities');


document.getElementById('apple-button').addEventListener('click', function() {
    addApplePayButton();
});



window.addApplePayButton = function() {
    window.activeWallet = 'apple';
    const container = document.getElementById("google-container");
    container.innerHTML = ''; // Force clear

    if (window.ApplePaySession) {
        // canMakePaymentsWithActiveCard() requires full production-grade merchant
        // validation and unreliably reports false in dev/sandbox even with real
        // cards in Wallet — canMakePayments() is the reliable device-level check.
        Promise.resolve(ApplePaySession.canMakePayments()).then((canMakePayments) => {
            if (canMakePayments) {
                const button = document.createElement('button');
                button.onclick = startApplePaySession;

                button.className = 'apple-pay-button';
                button.setAttribute('lang', localeSelectApple.value);
                button.setAttribute('data-type', appleButtonType.value);
                button.setAttribute('data-style', appleButtonStyle.value);

                container.appendChild(button);
                container.style.display = 'flex';

                console.log(`Button Rendered: Type=${appleButtonType.value}, Style=${appleButtonStyle.value}`);
            } else {
                container.innerHTML = '<p class="token-value" style="color:#dc2626; padding: 15px;">No active cards available.</p>';
                container.style.display = 'block';
            }
        }).catch((err) => console.error("Apple Pay Error: ", err));
    }
}


function startApplePaySession() {
  try {

    // Update to read from chips
let allowedCardNetworksApple = window.getChipSelectedValues("schemes-chips");
let merchantCapabilities = window.getChipSelectedValues("apple-caps-chips");
    // ApplePayPaymentRequest.requiredBillingContactFields / requiredShippingContactFields —
    // whichever fields are checked here are required in the Apple Pay sheet and returned
    // on event.payment.billingContact / event.payment.shippingContact below.
    let requiredBillingContactFields = window.getChipSelectedValues("apple-billing-fields-chips");
    let requiredShippingContactFields = window.getChipSelectedValues("apple-shipping-fields-chips");

    appleCurrency = document.querySelector("#currency-select-google-pay").value.toUpperCase();
    appleTotalPrice = document.querySelector("#amount-input-google").value;
    let countryCodeApple = document.querySelector("#country-select-google-pay").value;

    let allowedNetworks = modifyCardNetworks(allowedCardNetworksApple);


    // Dynamically pull Merchant Capabilities from the UI
    if (merchantCapabilities.length === 0) merchantCapabilities = ["supports3DS"];

    request = {
        countryCode: countryCodeApple,
        currencyCode: appleCurrency,
        supportedNetworks: allowedNetworks,
        merchantCapabilities: merchantCapabilities, // Dynamic from UI
        total: { label: "Syed Demo Shop", amount: appleTotalPrice },
    };

    // Only attach these arrays when at least one field is checked — an empty
    // array is equivalent to omitting the field for Apple, but omitting it
    // outright keeps the logged "requestedConfig" honest about what was asked for.
    if (requiredBillingContactFields.length > 0) {
        request.requiredBillingContactFields = requiredBillingContactFields;
    }
    if (requiredShippingContactFields.length > 0) {
        request.requiredShippingContactFields = requiredShippingContactFields;
    }

    // Express Checkout — off by default (see apple-express-toggle in
    // wallets.html) so the plain flow above is unaffected unless enabled.
    const isExpressApple = document.getElementById('apple-express-toggle')?.checked || false;
    expressShippingState = { isExpress: isExpressApple, selectedRate: null, shippingCost: 0, lastCountry: null };

    if (isExpressApple) {
        // Express requires a shipping address to compute cost — force postalAddress
        // even if the chip group above doesn't have it checked.
        request.requiredShippingContactFields = requiredShippingContactFields.includes('postalAddress')
            ? requiredShippingContactFields
            : [...requiredShippingContactFields, 'postalAddress'];
        request.shippingType = 'shipping';
        // Seed with rates for the billing country selected in the UI — Apple
        // requires an initial shippingMethods list before any address is
        // entered in the sheet; onshippingcontactselected below replaces it
        // once the customer provides their real shipping address.
        const initialRates = getExpressShippingRates(countryCodeApple);
        request.shippingMethods = initialRates.map(r => ({
            label: r.label, detail: r.detail, amount: r.amount.toFixed(2), identifier: r.id
        }));
    }

    var session = new ApplePaySession(3, request);

    session.onvalidatemerchant = function(event) {
        validateApplePaySession(event.validationURL, function(merchantSession) {
            session.completeMerchantValidation(merchantSession);
        });
    };

    if (isExpressApple) {
        // Fires when the customer enters/changes their shipping address inside
        // the Apple Pay sheet — recompute available shipping methods + total,
        // or reject the address outright if it's in our simulated unserviceable list.
        session.onshippingcontactselected = function(event) {
            const contact = event.shippingContact;
            const countryCode = (contact.countryCode || '').toUpperCase();
            expressShippingState.lastCountry = countryCode;

            if (!isExpressShippingCountryServiceable(countryCode)) {
                session.completeShippingContactSelection({
                    newShippingMethods: [],
                    newTotal: { label: "Syed Demo Shop", amount: appleTotalPrice },
                    newLineItems: [],
                    errors: [new ApplePayError('shippingContactInvalid', 'countryCode', 'We do not ship to this country (simulated).')]
                });
                return;
            }

            const rates = getExpressShippingRates(countryCode);
            const defaultRate = rates[0];
            expressShippingState.selectedRate = defaultRate;
            expressShippingState.shippingCost = defaultRate.amount;

            const newShippingMethods = rates.map(r => ({
                label: r.label, detail: r.detail, amount: r.amount.toFixed(2), identifier: r.id
            }));
            const newTotalAmount = (parseFloat(appleTotalPrice) + defaultRate.amount).toFixed(2);

            session.completeShippingContactSelection({
                newShippingMethods,
                newTotal: { label: "Syed Demo Shop", amount: newTotalAmount },
                newLineItems: [
                    { label: "Subtotal", amount: appleTotalPrice },
                    { label: defaultRate.label, amount: defaultRate.amount.toFixed(2) }
                ]
            });
        };

        // Fires when the customer picks a shipping method from the list above —
        // recompute the grand total for that specific rate.
        session.onshippingmethodselected = function(event) {
            const rates = getExpressShippingRates(expressShippingState.lastCountry);
            const selected = rates.find(r => r.id === event.shippingMethod.identifier) || rates[0];
            expressShippingState.selectedRate = selected;
            expressShippingState.shippingCost = selected.amount;

            const newTotalAmount = (parseFloat(appleTotalPrice) + selected.amount).toFixed(2);
            session.completeShippingMethodSelection({
                newTotal: { label: "Syed Demo Shop", amount: newTotalAmount },
                newLineItems: [
                    { label: "Subtotal", amount: appleTotalPrice },
                    { label: selected.label, amount: selected.amount.toFixed(2) }
                ]
            });
        };
    }

// Add to your onpaymentauthorized callback in apple-pay.js
session.onpaymentauthorized = function(event) {
    // 1. Log the SDK response for debugging

    const sdkLogData = {
        source: "Apple Pay",
        // What we asked Apple to collect vs. what actually came back — lets you
        // see the effect of the "Required Billing/Shipping Contact Fields" chips.
        requestedConfig: {
            requiredBillingContactFields: request.requiredBillingContactFields || [],
            requiredShippingContactFields: request.requiredShippingContactFields || []
        },
        token: {
            paymentData: "{Encrypted Data}", // Don't log full blob to keep UI clean
            paymentMethod: event.payment.token.paymentMethod,
            transactionIdentifier: event.payment.token.transactionIdentifier
        },
        billingContact: event.payment.billingContact || "Not requested",
        shippingContact: event.payment.shippingContact || "Not requested",
        // What actually gets forwarded to /apple-pay -> CKO Payments API as
        // shipping.address, converted from shippingContact above.
        shippingSentToPayments: buildCkoShippingFromAppleContact(event.payment.shippingContact) || "Not sent (no shipping contact collected)",
        // What actually gets forwarded to /apple-pay -> CKO Payments API as
        // source.billing_address/source.phone, converted from billingContact above.
        billingSentToPayments: buildCkoBillingFromAppleContact(event.payment.billingContact) || "Not sent (no billing contact collected)",
        // Only present when Express Checkout is enabled — shows the simulated
        // shipping rate selected inside the sheet and the resulting grand total.
        expressCheckout: expressShippingState.isExpress ? {
            country: expressShippingState.lastCountry,
            selectedRate: expressShippingState.selectedRate,
            subtotal: appleTotalPrice,
            shippingCost: expressShippingState.shippingCost,
            grandTotal: (parseFloat(appleTotalPrice) + expressShippingState.shippingCost).toFixed(2)
        } : "Not enabled"
    };
    sessionStorage.setItem('wallet_debug_log', JSON.stringify(sdkLogData));

    const debugContainer = document.getElementById('apple-pay-debugger');
    const logElement = document.getElementById('apple-sdk-log');

    debugContainer.style.display = 'block';

    // We use your existing formatJSON helper for consistency
    logElement.innerHTML = formatJSON(sdkLogData);

    // 2. Proceed with your existing payment logic
    performPayment(event.payment, function(outcome) {
        if (outcome.approved) {
            session.completePayment(ApplePaySession.STATUS_SUCCESS);
        } else {
            session.completePayment(ApplePaySession.STATUS_FAILURE);
        }
    });
};

    session.begin();
  } catch(e) {
    console.error(e);
  }
}


function validateApplePaySession(appleUrl, callback) {
     fetch(`${window.APP_CONFIG.apiBaseUrl}/validate-apple-session`, {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(
            {appleUrl},
        ),
    })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) {
          addToApiLog('POST', 'validate apple pay session - /validate-apple-session', response.status, { appleUrl }, data);
          // Merchant validation failed silently before this — Apple's
          // ApplePaySession never gets completeMerchantValidation(), so the
          // sheet just cancels without ever prompting for biometrics.
          console.error("Apple Pay merchant validation failed:", data);
          if (data?.certDiagnostic) {
              console.error("Apple Pay certificate diagnostic:", data.certDiagnostic);
          }
          showToast(
              data?.certDiagnostic?.isExpired
                  ? 'Apple Pay certificate has expired — see console for details.'
                  : (data?.error || 'Apple Pay merchant validation failed.'),
              'error'
          );
          return;
      }
      addToApiLog('POST', 'validate apple pay session - /validate-apple-session', 200, { appleUrl }, data);
      console.log(data);
      callback(data);
    })
    .catch((error) => {
        console.error("Error:", error);
        showToast('Apple Pay merchant validation request failed.', 'error');
    });
}

// Converts Apple's ApplePayPaymentContact shape (billingContact/shippingContact)
// into Checkout.com's Payments API `shipping.address` shape. Returns undefined
// when no shipping contact was collected (nothing to send) — JSON.stringify
// drops undefined properties, so this cleanly omits `shipping` from the
// request body entirely for that case.
function buildCkoShippingFromAppleContact(contact) {
    if (!contact) return undefined;
    return {
        address: {
            address_line1: contact.addressLines?.[0],
            address_line2: contact.addressLines?.[1],
            city: contact.locality,
            state: contact.administrativeArea,
            zip: contact.postalCode,
            country: contact.countryCode ? contact.countryCode.toUpperCase() : undefined
        },
        phone: contact.phoneNumber ? { number: contact.phoneNumber } : undefined
    };
}

// Converts Apple's billingContact into the { address, phone } shape CKO's
// Payments API expects on source.billing_address / source.phone for a token
// source (see PaymentRequestTokenSource) — same field shapes as shipping,
// just a different destination in the request body.
function buildCkoBillingFromAppleContact(contact) {
    if (!contact) return undefined;
    return {
        address: {
            address_line1: contact.addressLines?.[0],
            address_line2: contact.addressLines?.[1],
            city: contact.locality,
            state: contact.administrativeArea,
            zip: contact.postalCode,
            country: contact.countryCode ? contact.countryCode.toUpperCase() : undefined
        },
        phone: contact.phoneNumber ? { number: contact.phoneNumber } : undefined
    };
}

function performPayment(details, callback) {

    document.getElementById('payment-loader').style.display = 'flex';

    // Integration Engineer View: Quick table of the key metadata
    console.table({
        "Network": details.token.paymentMethod.network,
        "Type": details.token.paymentMethod.type,
        "Transaction ID": details.token.transactionIdentifier
    });
    console.log(
        "Payload generated by Apple Pay before the tokenization",
        JSON.stringify(details.token.paymentData)
    );

let currency = CURRENCIES.find(c => c.iso4217 == appleCurrency);

  // Express Checkout adds the customer-selected shipping cost (picked inside
  // the sheet via onshippingmethodselected) on top of the product subtotal.
  const appleGrandTotalMajor = expressShippingState.isExpress
      ? parseFloat(amountInputApple.value) + expressShippingState.shippingCost
      : parseFloat(amountInputApple.value);

  applePaymentRequest = {
    details : details,
    currency: appleCurrency,
    price: appleTotalPrice,
    amount: parseInt(appleGrandTotalMajor*currency?.base),
    payment_type: paymentTypeSelectApple.value,
    capture: captureToggleApple.checked ? true : false,
    reference: '#Order_' + Math.floor(Math.random() * 1000) + 1,
    processing_channel_id: window.APP_CONFIG.processingChannelId,
    success_url: `${window.location.protocol}//${window.location.host}/success.html`,
    failure_url: `${window.location.protocol}//${window.location.host}/failure.html`,
    // Wallet-provided billingContact overrides the plain email/name inputs
    // when present — falls back to the inputs otherwise.
    customer: {
        email: details.billingContact?.emailAddress || emailInputApple.value,
        name: (details.billingContact?.givenName || details.billingContact?.familyName)
            ? `${details.billingContact?.givenName || ''} ${details.billingContact?.familyName || ''}`.trim()
            : nameInputApple.value,
        phone: details.billingContact?.phoneNumber ? { number: details.billingContact.phoneNumber } : undefined
    },
    // Present whenever the sheet collected a shipping contact (Standard mode
    // with "Required Shipping Contact Fields" checked, or Express Checkout) —
    // undefined (omitted) otherwise.
    shipping: buildCkoShippingFromAppleContact(details.shippingContact),
    // Same idea for billing — forwarded to source.billing_address/source.phone
    // on the backend (see /apple-pay in api-route-controller.js).
    billing: buildCkoBillingFromAppleContact(details.billingContact),
    '3ds': {
        enabled: threeDSToggleApple.checked ? true : false
    }
  }

    fetch(`${window.APP_CONFIG.apiBaseUrl}/apple-pay`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(applePaymentRequest),
    })
    .then((response) => response.json())
    .then((data) => {
      addToApiLog('POST', `apple pay payment - /payments`, data.payment?.id ? 201 : 422, applePaymentRequest, data);
      if(data.payment.status == 'Authorized' || data.payment.status == 'Captured' || data.payment.status == 'Card Verified'){
        window.location.href = `${window.location.protocol}//${window.location.host}/success.html?paymentId=${data.payment.id}`
      }
      else{
        window.location.href = `${window.location.protocol}//${window.location.host}/failure.html?paymentId=${data.payment.id}`
      }
      callback(data.payment)
    })
    .catch((error) => {
        document.getElementById('payment-loader').style.display = 'none';
        console.error("Error:", error);
    });
}

currencySelectApple.addEventListener('change', (e) => {
  applePaymentRequest.currency = e.target.value;
});


threeDSToggleApple.addEventListener('change', (e) =>{
  console.log(e.target.checked)
  applePaymentRequest['3ds'].enabled = e.target.checked;
});

captureToggleApple.addEventListener('change', (e) =>{
  console.log(e.target.checked)
  applePaymentRequest.capture = e.target.checked;
});

paymentTypeSelectApple.addEventListener('change', (e) => {
applePaymentRequest.payment_type = e.target.value;
});

nameInputApple.addEventListener('input', (e) => {
applePaymentRequest.customer.name = e.target.value;
});

emailInputApple.addEventListener('input', (e) => {
applePaymentRequest.customer.email = e.target.value;
});

amountInputApple.addEventListener('input', (e) => {
let currency = CURRENCIES.find(c => c.iso4217 == appleCurrency);
applePaymentRequest.amount = parseInt(amountInputApple.value*currency?.base);
});

})(); // end IIFE
