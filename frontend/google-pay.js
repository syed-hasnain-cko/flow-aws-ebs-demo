// google-pay.js is wrapped in an IIFE to keep all locals off window.
// Only window.onGooglePayLoaded is intentionally global (called by the SDK script tag).
(function() {

let googleCurrency = undefined;
let googleTotalPrice = undefined;
let merchantId = undefined;
let paymentRequest;

// Express Checkout state — populated by onPaymentDataChanged() below, read by
// processGooglePayPayment() to add the customer's selected shipping cost
// onto the final payment amount.
let expressShippingStateGoogle = { isExpress: false, selectedRate: null, shippingCost: 0, lastCountry: null };

const threeDSToggle = document.getElementById('3ds-toggle-google');
const captureToggle = document.getElementById('capture-toggle-google');
const paymentTypeSelect = document.getElementById('payment-type-select-google');
const nameInput = document.getElementById('name-input-google');
const emailInput = document.getElementById('email-input-google');
const amountInput = document.getElementById('amount-input-google');
const currencySelect = document.querySelector("#currency-select-google-pay")
const countrySelect = document.querySelector("#country-select-google-pay")
const gBtnType = document.getElementById('google-button-type');
const gBtnColor = document.getElementById('google-button-color');
const gLocale = document.getElementById('google-locale');
const gAllowCredit = document.getElementById('google-allow-credit');
const gAllowDebit = document.getElementById('google-allow-debit');

paymentRequest = {

  currency: currencySelect.value,
  amount: 10,
  payment_type: paymentTypeSelect.value,
  capture: captureToggle.checked ? true : false,
  success_url: `${window.location.protocol}//${window.location.host}/success.html`,
  failure_url: `${window.location.protocol}//${window.location.host}/failure.html`,
  customer: {
      email: emailInput.value,
      name: nameInput.value
  },
  '3ds': {
      enabled: threeDSToggle.checked ? true : false
  }
}

// CURRENCIES is provided globally by modules/data.js

const googleConfig = {
  apiVersion: 2,
  apiVersionMinor: 0,
  allowedPaymentMethods: [
    {
      type: "CARD",
      parameters: {
     
        allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
        allowedCardNetworks: [
          "AMEX",
          "DISCOVER",
          "INTERAC",
          "JCB",
          "MASTERCARD",
          "VISA",
        ]
      },
      tokenizationSpecification: {
        type: "PAYMENT_GATEWAY",
        parameters: {
          gateway: "checkoutltd",
          gatewayMerchantId: "pk_pshdwp3uuie5vwfjujdlclhtsex",
        },
      },
    },
  ],
  transactionInfo: {
    countryCode: "GB",
    currencyCode: "GBP",
    totalPriceStatus: "FINAL",
    totalPrice: "1.00",
  },
};

let paymentsClient = null;

// Fires when the customer changes their shipping address or shipping option
// inside the Google Pay sheet — only actually triggered when the request's
// callbackIntents includes SHIPPING_ADDRESS/SHIPPING_OPTION (Express mode
// below); harmless to always register since it's otherwise never called.
async function onPaymentDataChanged(intermediatePaymentData) {
  try {
    const trigger = intermediatePaymentData.callbackTrigger;
    const subtotal = parseFloat(amountInput.value);
    const currencyCode = currencySelect.value.toUpperCase();

    if (trigger === 'INITIALIZE' || trigger === 'SHIPPING_ADDRESS') {
      const countryCode = (intermediatePaymentData.shippingAddress?.countryCode || '').toUpperCase();
      expressShippingStateGoogle.lastCountry = countryCode;

      if (!isExpressShippingCountryServiceable(countryCode)) {
        return {
          error: {
            reason: 'SHIPPING_ADDRESS_UNSERVICEABLE',
            message: 'We do not ship to this country (simulated).',
            intent: 'SHIPPING_ADDRESS'
          }
        };
      }

      const rates = getExpressShippingRates(countryCode);
      const defaultRate = rates[0];
      expressShippingStateGoogle.selectedRate = defaultRate;
      expressShippingStateGoogle.shippingCost = defaultRate.amount;

      return {
        newShippingOptionParameters: {
          defaultSelectedOptionId: defaultRate.id,
          shippingOptions: rates.map(r => ({ id: r.id, label: r.label, description: r.detail }))
        },
        newTransactionInfo: {
          currencyCode,
          totalPriceStatus: 'FINAL',
          totalPrice: (subtotal + defaultRate.amount).toFixed(2)
        }
      };
    }

    if (trigger === 'SHIPPING_OPTION') {
      const rates = getExpressShippingRates(expressShippingStateGoogle.lastCountry);
      const selected = rates.find(r => r.id === intermediatePaymentData.shippingOptionData.id) || rates[0];
      expressShippingStateGoogle.selectedRate = selected;
      expressShippingStateGoogle.shippingCost = selected.amount;

      return {
        newTransactionInfo: {
          currencyCode,
          totalPriceStatus: 'FINAL',
          totalPrice: (subtotal + selected.amount).toFixed(2)
        }
      };
    }
  } catch (e) {
    console.error('onPaymentDataChanged error:', e);
  }
  return {};
}

// Google requires the inverse too: a client built WITH paymentDataCallbacks
// must be used with a non-empty callbackIntents request, and a client built
// WITHOUT it must never be used with SHIPPING_ADDRESS/SHIPPING_OPTION/etc in
// callbackIntents. Since PaymentsClient can't be reconfigured after
// construction, Standard and Express each get their own cached singleton —
// picked at call time via the `useExpress` flag, chosen from the toggle at
// click time in onGooglePaymentButtonClicked.
let paymentsClientExpress = null;
let googlePayConfigInitialized = false;

function getGooglePaymentsClient(config, useExpress) {
  if (useExpress) {
    if (paymentsClientExpress === null) {
      paymentsClientExpress = new google.payments.api.PaymentsClient({
        environment: "TEST",
        paymentDataCallbacks: { onPaymentDataChanged },
      });
    }
  } else if (paymentsClient === null) {
    // FORCE environment to TEST for the demo to prevent production validation errors
    paymentsClient = new google.payments.api.PaymentsClient({
      environment: "TEST",
    });
  }

  if (!googlePayConfigInitialized && config) {
    googleConfig.allowedPaymentMethods[0].tokenizationSpecification.parameters.gatewayMerchantId = config.publicKey;
    merchantId = config.googleMerchantId;
    googlePayConfigInitialized = true;
  }

  return useExpress ? paymentsClientExpress : paymentsClient;
}

window.onGooglePayLoaded = function() {
  window.activeWallet = 'google';
  const paymentsClient = getGooglePaymentsClient(window.APP_CONFIG, false);

  const isReadyToPayRequest = Object.assign({}, googleConfig);
  delete isReadyToPayRequest.transactionInfo;

  paymentsClient
    .isReadyToPay(isReadyToPayRequest)
    .then(function (response) {
      if (response.result) {
        addGooglePayButton();
      }
    })
    .catch(function (err) {
      console.error("G-Pay Ready Error:", err);
    });
}


function addGooglePayButton() {
  const googleContainer = document.getElementById("google-container");
  googleContainer.innerHTML = '';

  const paymentsClient = getGooglePaymentsClient();
  
  // Apply dynamic button options
  const button = paymentsClient.createButton({
      buttonType: gBtnType.value,
      buttonColor: gBtnColor.value,
      buttonLocale: gLocale.value,
      onClick: onGooglePaymentButtonClicked,
  });

  googleContainer.appendChild(button);
  googleContainer.style.display = 'flex'; 
}


function onGooglePaymentButtonClicked() {
  const allowedAuthMethods = window.getChipSelectedValues("auth-methods-chips");
  const allowedCardNetworks = window.getChipSelectedValues("schemes-chips");
  const allowedTypes = window.getChipSelectedValues("card-type-chips");

  // PaymentDataRequest data-collection toggles (Google Pay API for Web).
  const billingToggle = document.getElementById('google-billing-toggle');
  const billingFormatSelect = document.getElementById('google-billing-format-select');
  const billingPhoneToggle = document.getElementById('google-billing-phone-toggle');
  const shippingToggle = document.getElementById('google-shipping-toggle');
  const shippingPhoneToggle = document.getElementById('google-shipping-phone-toggle');
  const emailToggle = document.getElementById('google-email-toggle');

  // VALIDATION: Force defaults if chips are empty to prevent OR_BIBED_06
  const finalAuth = allowedAuthMethods.length > 0 ? allowedAuthMethods : ["PAN_ONLY", "CRYPTOGRAM_3DS"];
  const finalNetworks = allowedCardNetworks.length > 0 ? allowedCardNetworks : ["VISA", "MASTERCARD"];

  // FORMATTING: Ensure price is a string with 2 decimal places
  const totalPrice = amountInput.value;

  // Apply to Google Config
  const params = googleConfig.allowedPaymentMethods[0].parameters;
  params.allowedAuthMethods = finalAuth;
  params.allowedCardNetworks = finalNetworks;
  
  // Apply Card Type Toggles
  params.allowCreditCards = allowedTypes.includes('credit');

  // billingAddressRequired/Parameters live under allowedPaymentMethods[0].parameters —
  // returned in paymentData.paymentMethodData.info.billingAddress.
  params.billingAddressRequired = billingToggle.checked;
  if (billingToggle.checked) {
      params.billingAddressParameters = {
          format: billingFormatSelect.value,
          phoneNumberRequired: billingPhoneToggle.checked
      };
  } else {
      delete params.billingAddressParameters;
  }

  // shippingAddressRequired/Parameters and emailRequired are top-level
  // PaymentDataRequest fields — returned in paymentData.shippingAddress / paymentData.email.
  googleConfig.shippingAddressRequired = shippingToggle.checked;
  if (shippingToggle.checked) {
      googleConfig.shippingAddressParameters = {
          phoneNumberRequired: shippingPhoneToggle.checked
      };
  } else {
      delete googleConfig.shippingAddressParameters;
  }
  googleConfig.emailRequired = emailToggle.checked;

  // Express Checkout — off by default (see google-express-toggle in
  // wallets.html) so the plain flow above is unaffected unless enabled.
  const isExpressGoogle = document.getElementById('google-express-toggle')?.checked || false;
  expressShippingStateGoogle = { isExpress: isExpressGoogle, selectedRate: null, shippingCost: 0, lastCountry: null };

  if (isExpressGoogle) {
    // Express requires SHIPPING_ADDRESS/SHIPPING_OPTION callbacks, which in
    // turn require shippingAddressRequired — force it on regardless of the
    // toggle above.
    googleConfig.callbackIntents = ["SHIPPING_ADDRESS", "SHIPPING_OPTION"];
    googleConfig.shippingAddressRequired = true;
    if (!googleConfig.shippingAddressParameters) {
        googleConfig.shippingAddressParameters = { phoneNumberRequired: shippingPhoneToggle.checked };
    }
    // Seed with rates for the country selected in the UI — onPaymentDataChanged
    // above replaces this once the customer enters their real shipping address.
    const initialRates = getExpressShippingRates(countrySelect.value);
    googleConfig.shippingOptionRequired = true;
    googleConfig.shippingOptionParameters = {
        defaultSelectedOptionId: initialRates[0].id,
        shippingOptions: initialRates.map(r => ({ id: r.id, label: r.label, description: r.detail }))
    };
  } else {
    // Standard mode uses the plain client (no paymentDataCallbacks
    // registered — see getGooglePaymentsClient) so callbackIntents must be
    // absent here too; Google errors if a client without the callback is
    // ever sent a non-empty SHIPPING_ADDRESS/SHIPPING_OPTION/etc intent list.
    delete googleConfig.callbackIntents;
    delete googleConfig.shippingOptionRequired;
    delete googleConfig.shippingOptionParameters;
  }

  googleConfig.transactionInfo.currencyCode = currencySelect.value.toUpperCase();
  googleConfig.transactionInfo.totalPrice = totalPrice;

  // IMPORTANT: For TEST environment, merchantId can often be omitted to fix OR_BIBED_06
  googleConfig.merchantInfo = {
    merchantName: "Syed Demo Store"
  };

  // Only include if you are testing a specific registered production ID
if (merchantId && merchantId.length > 10 && merchantId !== "12345678901234567890") {
      googleConfig.merchantInfo.merchantId = merchantId;
  }

  console.log("Final Google Config:", JSON.stringify(googleConfig, null, 2));

  const paymentsClient = getGooglePaymentsClient(undefined, isExpressGoogle);
  paymentsClient
    .loadPaymentData(googleConfig)
    .then(function (paymentData) {

      // Parse the Google Pay SDK response
      const tokenObj = JSON.parse(paymentData.paymentMethodData.tokenizationData.token);

      const sdkLogData = {
          source: "Google Pay",
          // What we asked Google to collect vs. what actually came back — lets you
          // see the effect of the billing/shipping/email toggles above.
          requestedConfig: {
              billingAddressRequired: params.billingAddressRequired,
              billingAddressParameters: params.billingAddressParameters || null,
              shippingAddressRequired: googleConfig.shippingAddressRequired,
              shippingAddressParameters: googleConfig.shippingAddressParameters || null,
              emailRequired: googleConfig.emailRequired
          },
          type: paymentData.paymentMethodData.type,
          description: paymentData.paymentMethodData.description,
          info: paymentData.paymentMethodData.info, // Contains card network, last 4, and billingAddress if requested
          email: paymentData.email || "Not requested",
          shippingAddress: paymentData.shippingAddress || "Not requested",
          // What actually gets forwarded to /google-pay -> CKO Payments API as
          // shipping.address, converted from shippingAddress above.
          shippingSentToPayments: buildCkoShippingFromGoogleAddress(paymentData.shippingAddress) || "Not sent (no shipping address collected)",
          // Only present when Express Checkout is enabled — shows the simulated
          // shipping rate selected inside the sheet and the resulting grand total.
          expressCheckout: expressShippingStateGoogle.isExpress ? {
              country: expressShippingStateGoogle.lastCountry,
              selectedRate: expressShippingStateGoogle.selectedRate,
              subtotal: amountInput.value,
              shippingCost: expressShippingStateGoogle.shippingCost,
              grandTotal: (parseFloat(amountInput.value) + expressShippingStateGoogle.shippingCost).toFixed(2)
          } : "Not enabled",
          tokenizationData: {
              gateway: "checkoutltd",
              token: {
                  signature: tokenObj.signature,
                  protocolVersion: tokenObj.protocolVersion,
                  signedMessage: "{Encrypted JSON Message}" // Truncated for readability
              }
          }
      };
      sessionStorage.setItem('wallet_debug_log', JSON.stringify(sdkLogData));

      const debugContainer = document.getElementById('apple-pay-debugger');
      const logElement = document.getElementById('apple-sdk-log');

      // Update header to be generic if it's currently "Apple SDK Log"
      debugContainer.querySelector('h3').innerText = "Wallet SDK Authorization Log";
      debugContainer.style.display = 'block';

      logElement.innerHTML = formatJSON(sdkLogData);
      processGooglePayPayment(paymentData);
    })
    .catch(function (err) {
      // If the sheet closes without payment, hide the loader
      document.getElementById('payment-loader').style.display = 'none';
      console.error("Google Pay Error:", err);
    });
}

// Converts Google's shippingAddress shape into Checkout.com's Payments API
// `shipping.address` shape. Returns undefined when no shipping address was
// collected (nothing to send) — JSON.stringify drops undefined properties,
// so this cleanly omits `shipping` from the request body entirely for that case.
function buildCkoShippingFromGoogleAddress(addr) {
    if (!addr) return undefined;
    return {
        address: {
            address_line1: addr.address1,
            address_line2: addr.address2,
            city: addr.locality,
            state: addr.administrativeArea,
            zip: addr.postalCode,
            country: addr.countryCode ? addr.countryCode.toUpperCase() : undefined
        },
        phone: addr.phoneNumber ? { number: addr.phoneNumber } : undefined
    };
}

async function processGooglePayPayment(paymentData) {

document.getElementById('payment-loader').style.display = 'flex';
  let currencyInfo = CURRENCIES.find(c => c.iso4217 === currencySelect.value);

  // Fallback to base 100 if for some reason the lookup fails (prevents the crash)
  let base = currencyInfo ? currencyInfo.base : 100;

  let paymentToken = paymentData.paymentMethodData.tokenizationData.token;

  // Express Checkout adds the customer-selected shipping cost (picked inside
  // the sheet via onPaymentDataChanged's SHIPPING_OPTION trigger) on top of
  // the product subtotal.
  const googleGrandTotalMajor = expressShippingStateGoogle.isExpress
      ? parseFloat(amountInput.value) + expressShippingStateGoogle.shippingCost
      : parseFloat(amountInput.value);

  paymentRequest = {
    signature: JSON.parse(paymentToken).signature,
    protocolVersion: JSON.parse(paymentToken).protocolVersion,
    signedMessage: JSON.parse(paymentToken).signedMessage,
    currency: currencySelect.value,
    price: googleTotalPrice,
    amount: parseInt(googleGrandTotalMajor*base),
    payment_type: paymentTypeSelect.value,
    capture: captureToggle.checked ? true : false,
    reference: '#Order_' + Math.floor(Math.random() * 1000) + 1,
    processing_channel_id: window.APP_CONFIG.processingChannelId,
    success_url: `${window.location.protocol}//${window.location.host}/success.html`,
    failure_url: `${window.location.protocol}//${window.location.host}/failure.html`,
    customer: {
        email: emailInput.value,
        name: nameInput.value
    },
    // Present whenever the sheet collected a shipping address (Standard mode
    // with "Require Shipping Address" checked, or Express Checkout) —
    // undefined (omitted) otherwise.
    shipping: buildCkoShippingFromGoogleAddress(paymentData.shippingAddress),
    '3ds': {
        enabled: threeDSToggle.checked ? true : false
    }
  }
console.log(paymentRequest)
  await fetch(`${window.APP_CONFIG.apiBaseUrl}/google-pay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(paymentRequest),
  })
    .then(async (response) => await response.json())
    .then((data) => {
      addToApiLog('POST', `google pay payment - /payments`, data.payment?.id ? 201 : 422, paymentRequest, data);
      console.log("Payment Response:", data);
      if(data.payment.status == 'Pending' && data.payment._links?.redirect){
        window.location.href = data.payment._links?.redirect?.href;
      }
      else if(data.payment.status == 'Authorized' || data.payment.status == 'Captured' || data.payment.status == 'Card Verified'){
        window.location.href = `${window.location.protocol}//${window.location.host}/success.html?paymentId=${data.payment.id}`
      }
      else{
        window.location.href = `${window.location.protocol}//${window.location.host}/failure.html?paymentId=${data.payment.id}`
      }

    })
    .catch((error) => {
      document.getElementById('payment-loader').style.display = 'none';
      console.error("Error:", error);
      
    });
}

currencySelect.addEventListener('change', (e) => {
  googleConfig.transactionInfo.currencyCode = e.target.value;
  paymentRequest.currency = e.target.value;
});

countrySelect.addEventListener('change', (e) => {
  googleConfig.transactionInfo.countryCode = e.target.value;

});


threeDSToggle.addEventListener('change', (e) =>{
  console.log(e.target.checked)
  paymentRequest['3ds'].enabled = e.target.checked;
});

captureToggle.addEventListener('change', (e) =>{
  console.log(e.target.checked)
  paymentRequest.capture = e.target.checked;
});

paymentTypeSelect.addEventListener('change', (e) => {
paymentRequest.payment_type = e.target.value;
});

nameInput.addEventListener('input', (e) => {
paymentRequest.customer.name = e.target.value;
});

emailInput.addEventListener('input', (e) => {
paymentRequest.customer.email = e.target.value;
});

amountInput.addEventListener('input', (e) => {
let currency = CURRENCIES.find(c => c.iso4217 == googleCurrency);
paymentRequest.amount = parseInt(amountInput.value*currency?.base);
});

})(); // end IIFE