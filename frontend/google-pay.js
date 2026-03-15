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


[gBtnType, gBtnColor, gLocale, gAllowCredit, gAllowDebit].forEach(el => {
    el.addEventListener('change', () => {
        const container = document.getElementById("google-container");
        if (container.style.display === 'flex') {
            onGooglePayLoaded(); // Re-checks readiness and re-renders
        }
    });
});

paymentRequest = {

  currency: googleCurrency,
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

const CURRENCIES = [
  { iso4217: 'AED', base: 100 },
  { iso4217: 'ARS', base: 100 },
  { iso4217: 'AUD', base: 100 },
  { iso4217: 'BHD', base: 1000 },
  { iso4217: 'BRL', base: 100 },
  { iso4217: 'CHF', base: 100 },
  { iso4217: 'CNY', base: 100 },
  { iso4217: 'COP', base: 100 },
  { iso4217: 'EGP', base: 100 },
  { iso4217: 'EUR', base: 100 },
  { iso4217: 'GBP', base: 100 },
  { iso4217: 'HKD', base: 100 },
  { iso4217: 'KWD', base: 1000 },
  { iso4217: 'MXN', base: 100 },
  { iso4217: 'NOK', base: 100 },
  { iso4217: 'NZD', base: 100 },
  { iso4217: 'PLN', base: 100 },
  { iso4217: 'QAR', base: 100 },
  { iso4217: 'SEK', base: 100 },
  { iso4217: 'SGD', base: 100 },
  { iso4217: 'SAR', base: 100 },
  { iso4217: 'USD', base: 100 },
];

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
      //  allowCreditCards: false,   
   // allowDebitCards: true
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
    paymentsClient = new google.payments.api.PaymentsClient({
      environment: config.isLive ? "PRODUCTION" : "TEST",
    });
    merchantId = config.googleMerchantId;
    googleConfig.allowedPaymentMethods[0].tokenizationSpecification.parameters.gatewayMerchantId =
      config.pk;
  }
  return paymentsClient;
}

function onGooglePayLoaded() {
  const config = getConfig((config) => {
    const paymentsClient = getGooglePaymentsClient(config);
    paymentsClient
      .isReadyToPay(googleConfig)
      .then(function (response) {
        if (response.result) {
          addGooglePayButton();
        }
      })
      .catch(function (err) {
        console.error(err);
      });
    });
}

// function addGooglePayButton() {
//   const googleContainer = document.getElementById("google-container");
//   googleContainer.innerHTML = '';

//   while (googleContainer.firstChild) {
//       googleContainer.removeChild(googleContainer.firstChild);
//   }

//   const paymentsClient = getGooglePaymentsClient();
//   const button = paymentsClient.createButton({
//       onClick: onGooglePaymentButtonClicked,
//   });

//   googleContainer.appendChild(button);
  
//   googleContainer.style.display = 'flex'; 
// }

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
  let allowedAuthMethods = getMultiSelectSelectedValues("#auth-methods");
  let allowedCardNetworks = getMultiSelectSelectedValues("#schemes");
  let currency = currencySelect.value.toUpperCase();
  let totalPrice = amountInput.value;
  const allowCredit = gAllowCredit.checked;
  const allowDebit = gAllowDebit.checked;
  
  // If neither is checked, default to both to avoid OR_BIBED_06
  if (!allowCredit && !allowDebit) {
      googleConfig.allowedPaymentMethods[0].parameters.allowCreditCards = true;
      googleConfig.allowedPaymentMethods[0].parameters.allowDebitCards = true;
  } else {
      googleConfig.allowedPaymentMethods[0].parameters.allowCreditCards = allowCredit;
      googleConfig.allowedPaymentMethods[0].parameters.allowDebitCards = allowDebit;
  }
  googleCurrency = currency;
  googleTotalPrice = totalPrice;

  googleConfig.allowedPaymentMethods[0].parameters.allowedAuthMethods =
    allowedAuthMethods;
  googleConfig.allowedPaymentMethods[0].parameters.allowedCardNetworks =
    allowedCardNetworks;
  googleConfig.transactionInfo.currencyCode = currency;
  googleConfig.transactionInfo.totalPrice = totalPrice;
  googleConfig.merchantInfo = {
    merchantName: "Syed Demo Store",
    merchantId,
  };

  console.log(googleConfig);
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
      console.error(err);
    });
}

function onGooglePaymentButtonClicked() {
  const allowedAuthMethods = getMultiSelectSelectedValues("#auth-methods");
  const allowedCardNetworks = getMultiSelectSelectedValues("#schemes");
  const currency = currencySelect.value.toUpperCase();
  const totalPrice = amountInput.value;
  
  const allowCredit = gAllowCredit.checked;
  const allowDebit = gAllowDebit.checked;

  googleCurrency = currency;
  googleTotalPrice = totalPrice;

  // Update Parameters
  const params = googleConfig.allowedPaymentMethods[0].parameters;
  params.allowedAuthMethods = allowedAuthMethods;
  params.allowedCardNetworks = allowedCardNetworks;

  // Logic: Only apply restrictions if they aren't BOTH checked
  // If both are checked, Google prefers the parameters to be absent or default
  if (allowCredit && allowDebit) {
      delete params.allowCreditCards;
      delete params.allowDebitCards;
  } else {
      params.allowCreditCards = allowCredit;
      params.allowDebitCards = allowDebit;
  }

  // Update Transaction Info
  googleConfig.transactionInfo.currencyCode = currency;
  googleConfig.transactionInfo.totalPrice = totalPrice;

  // Merchant Info Fix
  googleConfig.merchantInfo = {
    merchantName: "Syed Demo Store"
  };
  
  // Only add merchantId if it's actually defined and we aren't in a pure test env
  if (merchantId && merchantId !== "") {
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

function processGooglePayPayment(paymentData) {

document.getElementById('payment-loader').style.display = 'flex';
  let currency = CURRENCIES.find(c => c.iso4217 == googleCurrency);

  paymentToken = paymentData.paymentMethodData.tokenizationData.token;

  paymentRequest = {
    signature: JSON.parse(paymentToken).signature,
    protocolVersion: JSON.parse(paymentToken).protocolVersion,
    signedMessage: JSON.parse(paymentToken).signedMessage,
    currency: googleCurrency,
    price: googleTotalPrice,
    amount: parseInt(amountInput.value*currency.base),
    payment_type: paymentTypeSelect.value,
    capture: captureToggle.checked ? true : false,
    reference: '#Order_' + Math.floor(Math.random() * 1000) + 1,
    processing_channel_id: 'pc_oxr4t4p3nseejeqdjqk3pdlpm4',
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

  fetch('https://zzrte604h4.execute-api.us-east-1.amazonaws.com/staging/google-pay', {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(paymentRequest),
  })
    .then((response) => response.json())
    .then((data) => {
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