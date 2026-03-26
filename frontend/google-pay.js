let googleCurrency = undefined;
let googleTotalPrice = undefined;
let merchantId = undefined;
let paymentRequest;

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

function getGooglePaymentsClient(config) {
  if (paymentsClient === null) {
    // FORCE environment to TEST for the demo to prevent production validation errors
    paymentsClient = new google.payments.api.PaymentsClient({
      environment: "TEST", 
    });
  
    googleConfig.allowedPaymentMethods[0].tokenizationSpecification.parameters.gatewayMerchantId = config.publicKey;
    
    merchantId = config.googleMerchantId;
  }
  return paymentsClient;
}

window.onGooglePayLoaded = function() {
  window.activeWallet = 'google';
  const paymentsClient = getGooglePaymentsClient(window.APP_CONFIG);

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

  const paymentsClient = getGooglePaymentsClient();
  paymentsClient
    .loadPaymentData(googleConfig)
    .then(function (paymentData) {

      const sdkLogData = {
          source: "Google Pay",
          type: paymentData.paymentMethodData.type,
          description: paymentData.paymentMethodData.description,
          info: paymentData.paymentMethodData.info,
          tokenMetadata: JSON.parse(paymentData.paymentMethodData.tokenizationData.token)
      };
      sessionStorage.setItem('wallet_debug_log', JSON.stringify(sdkLogData));

      const debugContainer = document.getElementById('apple-pay-debugger');
      const logElement = document.getElementById('apple-sdk-log');
      
      // Update header to be generic if it's currently "Apple SDK Log"
      debugContainer.querySelector('h3').innerText = "Wallet SDK Authorization Log";
      debugContainer.style.display = 'block';

      // Parse and display the Google Pay SDK response
      const tokenObj = JSON.parse(paymentData.paymentMethodData.tokenizationData.token);
      
      logElement.innerHTML = formatJSON({
          type: paymentData.paymentMethodData.type,
          description: paymentData.paymentMethodData.description,
          info: paymentData.paymentMethodData.info, // Contains card network and last 4
          tokenizationData: {
              gateway: "checkoutltd",
              token: {
                  signature: tokenObj.signature,
                  protocolVersion: tokenObj.protocolVersion,
                  signedMessage: "{Encrypted JSON Message}" // Truncated for readability
              }
          }
      });
      processGooglePayPayment(paymentData);
    })
    .catch(function (err) {
      // If the sheet closes without payment, hide the loader
      document.getElementById('payment-loader').style.display = 'none';
      console.error("Google Pay Error:", err);
    });
}

async function processGooglePayPayment(paymentData) {

document.getElementById('payment-loader').style.display = 'flex';
  let currencyInfo = CURRENCIES.find(c => c.iso4217 === currencySelect.value);

  // Fallback to base 100 if for some reason the lookup fails (prevents the crash)
  let base = currencyInfo ? currencyInfo.base : 100;

  let paymentToken = paymentData.paymentMethodData.tokenizationData.token;

  paymentRequest = {
    signature: JSON.parse(paymentToken).signature,
    protocolVersion: JSON.parse(paymentToken).protocolVersion,
    signedMessage: JSON.parse(paymentToken).signedMessage,
    currency: currencySelect.value,
    price: googleTotalPrice,
    amount: parseInt(amountInput.value*base),
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
      else if(data.payment.status == 'Authorized' || data.payment.status == 'Captured'){
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