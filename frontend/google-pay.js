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
        ],
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

function addGooglePayButton() {

  const googleContainer = document.getElementById("google-container");
  googleContainer.innerHTML = '';

  while (googleContainer.firstChild) {
      googleContainer.removeChild(googleContainer.firstChild);
  }

  const paymentsClient = getGooglePaymentsClient();
  const button = paymentsClient.createButton({
      onClick: onGooglePaymentButtonClicked,
  });

  googleContainer.appendChild(button);
  googleContainer.style.display = 'block';
}

function onGooglePaymentButtonClicked() {
  let allowedAuthMethods = getMultiSelectSelectedValues("#auth-methods");
  let allowedCardNetworks = getMultiSelectSelectedValues("#schemes");
  let currency = currencySelect.value.toUpperCase();
  let totalPrice = amountInput.value;

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
      processGooglePayPayment(paymentData);
    })
    .catch(function (err) {
      console.error(err);
    });
}

function processGooglePayPayment(paymentData) {

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

  fetch('https://axzepxqz10.execute-api.us-east-1.amazonaws.com/dev/api/google-pay', {
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