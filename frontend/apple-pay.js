// apple-pay.js is wrapped in an IIFE to keep all locals off window.
// Only window.addApplePayButton is intentionally global (called by wallets.js / tab UI).
(function() {

let appleCurrency = undefined;
let appleTotalPrice = undefined;
let applePaymentRequest;
let request;

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
const appleActiveCardToggle = document.getElementById('apple-active-card-toggle');
const appleMerchantCapsSelect = document.getElementById('apple-merchant-capabilities');


document.getElementById('apple-button').addEventListener('click', function() {
    addApplePayButton();
});



window.addApplePayButton = function() {
    window.activeWallet = 'apple';
    const container = document.getElementById("google-container");
    container.innerHTML = ''; // Force clear

    if (window.ApplePaySession) {
        const checkPromise = appleActiveCardToggle.checked
            ? ApplePaySession.canMakePaymentsWithActiveCard(window.APP_CONFIG.appleMerchantId)
            : Promise.resolve(ApplePaySession.canMakePayments());

        checkPromise.then((canMakePayments) => {
            if (canMakePayments) {
                const button = document.createElement('button');
                button.onclick = startApplePaySession;

                button.className = 'apple-pay-button';
                button.setAttribute('lang', gLocale.value);
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

    var session = new ApplePaySession(3, request);

    session.onvalidatemerchant = function(event) {
        validateApplePaySession(event.validationURL, function(merchantSession) {
            session.completeMerchantValidation(merchantSession);
        });
    };

// Add to your onpaymentauthorized callback in apple-pay.js
session.onpaymentauthorized = function(event) {
    // 1. Log the SDK response for debugging

    const sdkLogData = {
        source: "Apple Pay",
        token: {
            paymentMethod: event.payment.token.paymentMethod,
            transactionIdentifier: event.payment.token.transactionIdentifier
        },
        billingContact: event.payment.billingContact || "Not requested",
        shippingContact: event.payment.shippingContact || "Not requested"
    };
    sessionStorage.setItem('wallet_debug_log', JSON.stringify(sdkLogData));

    const debugContainer = document.getElementById('apple-pay-debugger');
    const logElement = document.getElementById('apple-sdk-log');

    debugContainer.style.display = 'block';

    // We use your existing formatJSON helper for consistency
    logElement.innerHTML = formatJSON({
        token: {
            paymentData: "{Encrypted Data}", // Don't log full blob to keep UI clean
            paymentMethod: event.payment.token.paymentMethod,
            transactionIdentifier: event.payment.token.transactionIdentifier
        },
        billingContact: event.payment.billingContact || "Not requested",
        shippingContact: event.payment.shippingContact || "Not requested"
    });

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
    .then((response) => {
      // Check for non-200 status codes explicitly
      if (!response.ok) {
          // You might want to throw an error here to catch it below
          throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      addToApiLog('POST', 'validate apple pay session - /validate-apple-session', 200, { appleUrl }, data);
      console.log(data)
      callback(data)})
    .catch((error) => {

        console.error("Error:", error);
    });
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

  applePaymentRequest = {
    details : details,
    currency: appleCurrency,
    price: appleTotalPrice,
    amount: parseInt(amountInputApple.value*currency?.base),
    payment_type: paymentTypeSelectApple.value,
    capture: captureToggleApple.checked ? true : false,
    reference: '#Order_' + Math.floor(Math.random() * 1000) + 1,
    processing_channel_id: window.APP_CONFIG.processingChannelId,
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
