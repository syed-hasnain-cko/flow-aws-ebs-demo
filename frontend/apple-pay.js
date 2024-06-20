let appleCurrency = undefined;
let appleTotalPrice = undefined;
let applePaymentRequest;

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

const CURRENCIES_APPLE = [
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


// document.getElementById('apple-button').addEventListener('click', () => {
// const appleButton = document.getElementById("google-container");

// if (window.ApplePaySession) {
//   console.info("Apple Pay: Looks like your device/browser supports Apple Pay");
//   const config = getConfig((config) => {
//     var promise = ApplePaySession.canMakePaymentsWithActiveCard(
//       config.appleMerchantId
//     );
//     promise
//       .then((canMakePayments) => {
//         if (canMakePayments) {
//           console.log(
//             "Apple Pay: You can do Apple Pay with the merchant id you have configured, and the cards you have in your wallet"
//           );
//         } else {
//           console.error(
//             "Apple Pay: It seems like you can not do Apple Pay with this merchant id you have configured or with the cards you have in your wallet. Perhaps you did not whitelist the domain, or the merchant id you used is not correct, or the cards you have are not ok."
//           );
          
//         }
//       })
//       .catch((err) => {
//         console.error("Apple Pay: ", err);
//       });
//   });
// } else {
//   console.error(
//     "Apple Pay: Looks like your device/browser does not supports Apple Pay"
//   );
// }

// appleButton.addEventListener("click", () => {
//   let allowedCardNetworksApple = getMultiSelectSelectedValues("#schemes");
//   appleCurrency = document.querySelector("#currency-select-google-pay").value.toUpperCase();
//   appleTotalPrice = document.querySelector("#amount-input-google").value;
//   countryCodeApple = document.querySelector("#country-select-google-pay").value;

//   var request = {
//     countryCode: countryCodeApple,
//     currencyCode: appleCurrency,
//     supportedNetworks: allowedCardNetworksApple,
//     merchantCapabilities: ["supports3DS"],
//     total: { label: "Syed Demo Store", amount: appleTotalPrice },
//   };
//   var session = new ApplePaySession(6, request);

//   session.onvalidatemerchant = function (event) {
//     validateApplePaySession(event.validationURL, function (merchantSession) {
//       session.completeMerchantValidation(merchantSession);
//     });
//   };
//   session.onpaymentauthorized = function (event) {
//     performPayment(event.payment, function (outcome) {
//       if (outcome.approved) {
//         session.completePayment(ApplePaySession.STATUS_SUCCESS);
//         console.log("Apple Pay payment outcome", outcome);
//       } else {
//         session.completePayment(ApplePaySession.STATUS_FAILURE);
//         console.log("Apple Pay payment failure", outcome);
//       }
//     });
//   };

//   session.begin();
// });

// var validateApplePaySession = function (appleUrl, callback) {
//   fetch("/validate-apple-session", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify({
//       appleUrl,
//     }),
//   })
//     .then((response) => response.json())
//     .then((data) => {
//       callback(data);
//     })
//     .catch((error) => {
//       console.error("Error:", error);
//     });
// };

// var performPayment = async function (details, callback) {
//   console.log(
//     "Payload generated by Apple Pay before the tokenization",
//     JSON.stringify(details.token.paymentData)
//   );
//   await fetch("/apple-pay", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify({
//       details: details,
//       currency: appleCurrency,
//       price: appleTotalPrice,
//     }),
//   })
//     .then((response) => response.json())
//     .then((data) => {
//       var tokenId = document.getElementById('tokenId')
//       tokenId.innerHTML = data.type + ' : ' + data.token;
//       callback(data);
//     })
//     .catch((error) => {
//       console.error("Error:", error);
//     });
// };

// })

document.getElementById('apple-button').addEventListener('click', function() {
    addApplePayButton();
});

function addApplePayButton() {
    const container = document.getElementById("google-container");

    // Clear the container before adding the new button
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    if (window.ApplePaySession) {
        console.info("Apple Pay: Looks like your device/browser supports Apple Pay");
        const config = getConfig((config) => {
            var promise = ApplePaySession.canMakePaymentsWithActiveCard(
                config.appleMerchantId
            );
            promise
                .then((canMakePayments) => {
                    if (canMakePayments) {
                        console.log(
                            "Apple Pay: You can do Apple Pay with the merchant id you have configured, and the cards you have in your wallet"
                        );

                        // Add the Apple Pay button
                        const button = document.createElement('button');
                        button = 'Apple Pay';
                        button.onclick = startApplePaySession;
                        container.classList.add('apple-pay-button');
                        container.classList.add('apple-pay-button-black');
                        container.appendChild(button);

                    } else {
                        console.error(
                            "Apple Pay: It seems like you cannot do Apple Pay with this merchant id you have configured or with the cards you have in your wallet. Perhaps you did not whitelist the domain, or the merchant id you used is not correct, or the cards you have are not ok."
                        );
                    }
                })
                .catch((err) => {
                    console.error("Apple Pay: ", err);
                });
        });
    } else {
        console.error(
            "Apple Pay: Looks like your device/browser does not support Apple Pay"
        );
    }
}

function startApplePaySession() {
    let allowedCardNetworksApple = getMultiSelectSelectedValues("#schemes");
    let appleCurrency = document.querySelector("#currency-select-google-pay").value.toUpperCase();
    let appleTotalPrice = document.querySelector("#amount-input-google").value;
    let countryCodeApple = document.querySelector("#country-select-google-pay").value;

    var request = {
        countryCode: countryCodeApple,
        currencyCode: appleCurrency,
        supportedNetworks: allowedCardNetworksApple,
        merchantCapabilities: ["supports3DS"],
        total: { label: "Syed Demo Store", amount: appleTotalPrice },
    };

    var session = new ApplePaySession(6, request);

    session.onvalidatemerchant = function(event) {
        validateApplePaySession(event.validationURL, function(merchantSession) {
            session.completeMerchantValidation(merchantSession);
        });
    };

    session.onpaymentauthorized = function(event) {
        performPayment(event.payment, function(outcome) {
            if (outcome.approved) {
                session.completePayment(ApplePaySession.STATUS_SUCCESS);
                console.log("Apple Pay payment outcome", outcome);
            } else {
                session.completePayment(ApplePaySession.STATUS_FAILURE);
                console.log("Apple Pay payment failure", outcome);
            }
        });
    };

    session.begin();
}

function validateApplePaySession(appleUrl, callback) {
    fetch("/validate-apple-session", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            appleUrl,
        }),
    })
    .then((response) => response.json())
    .then((data) => {
        callback(data);
    })
    .catch((error) => {
        console.error("Error:", error);
    });
}

function performPayment(details, callback) {
    console.log(
        "Payload generated by Apple Pay before the tokenization",
        JSON.stringify(details.token.paymentData)
    );

    fetch("/apple-pay", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            details: details,
            currency: appleCurrency,
            price: appleTotalPrice,
        }),
    })
    .then((response) => response.json())
    .then((data) => {
        var tokenId = document.getElementById('tokenId')
        tokenId.innerHTML = data.type + ' : ' + data.token;
        callback(data);
    })
    .catch((error) => {
        console.error("Error:", error);
    });
}
