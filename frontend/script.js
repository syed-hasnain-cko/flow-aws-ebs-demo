
(function(){

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
  
  const COUNTRIES = [
    { name: 'Germany', alpha2Code: 'DE' },
    { name: 'United Kingdom', alpha2Code: 'GB' },
    { name: 'United States', alpha2Code: 'US' },
    { name: 'France', alpha2Code: 'FR' },
    { name: 'Italy', alpha2Code: 'IT' },
    { name: 'Spain', alpha2Code: 'ES' },
    { name: 'Netherlands', alpha2Code: 'NL' },
    { name: 'Belgium', alpha2Code: 'BE' },
    { name: 'Switzerland', alpha2Code: 'CH' },
    { name: 'Austria', alpha2Code: 'AT' },
    { name: 'Finland', alpha2Code: 'FI' },
    { name: 'Czech Republic', alpha2Code: 'CK' },
    { name: 'Estonia', alpha2Code: 'ES' },
    { name: 'Denmark', alpha2Code: 'DK' },
    { name: 'Poland', alpha2Code: 'PL' },
    { name: 'Portugal', alpha2Code: 'PT' },
    { name: 'Sweden', alpha2Code: 'SE' },
    { name: 'Norway', alpha2Code: 'NO' },
    { name: 'Hungary', alpha2Code: 'HU' },
    { name: 'Kuwait', alpha2Code: 'KW' },
    { name: 'Qatar', alpha2Code: 'QA' },
    { name: 'Bahrain', alpha2Code: 'BH' },
    { name: 'Newzealand', alpha2Code: 'AZ' },
    { name: 'Egypt', alpha2Code: 'EG' },
    { name: 'Brazil', alpha2Code: 'BR' },
    { name: 'Hongkong', alpha2Code: 'HK' },
    { name: 'Australia', alpha2Code: 'AU' },
    { name: 'United Arab Emirates', alpha2Code: 'AU' },
  ];
  
  const Currencies = CURRENCIES.map(currency => currency.iso4217);
  

  const currencySelect = document.getElementById('currency-select');
  Currencies.forEach(currency => {
    const option = document.createElement('option');
    if (currency === 'EUR') {
      option.selected = true;
  }
    option.value = currency;
    option.text = currency;
    currencySelect.appendChild(option);
  });

  const currencySelectGooglePay = document.getElementById('currency-select-google-pay');
  Currencies.forEach(currency => {
    const option = document.createElement('option');
    if (currency === 'EUR') {
      option.selected = true;
  }
    option.value = currency;
    option.text = currency;
    currencySelectGooglePay.appendChild(option);
  });
  
  
  const countrySelect = document.getElementById('country-select');
  COUNTRIES.forEach(country => {
    const option = document.createElement('option');
    if (country.alpha2Code === 'DE') {
      option.selected = true;
  }
    option.value = country.alpha2Code;
    option.text = country.name;
    countrySelect.appendChild(option);
  });

  const countrySelectGoogle = document.getElementById('country-select-google-pay');
  COUNTRIES.forEach(country => {
    const option = document.createElement('option');
    if (country.alpha2Code === 'DE') {
      option.selected = true;
  }
    option.value = country.alpha2Code;
    option.text = country.name;
    countrySelectGoogle.appendChild(option);
  });

    const threeDSToggle = document.getElementById('3ds-toggle');
    const captureToggle = document.getElementById('capture-toggle');
    const paymentTypeSelect = document.getElementById('payment-type-select');
    const nameInput = document.getElementById('name-input');
    const emailInput = document.getElementById('email-input');
    const amountInput = document.getElementById('amount-input');
   
   let paymentSessionBody;
   let isTokenizeOnly = false;
   const walletsTCs = false;
    document.addEventListener('DOMContentLoaded', function() {

      let currency = CURRENCIES.find(c => c.iso4217 == currencySelect.value);

       paymentSessionBody = {
          currency: currencySelect.value,
          amount: parseInt(amountInput.value*currency.base),
          payment_type: paymentTypeSelect.value,
          capture: captureToggle.value == 'on' ? false : true,
          reference: '#Order_' + Math.floor(Math.random() * 1000) + 1,
          billing: {
              address: {
                  country: countrySelect.value
              }
          },
          payment_method_configuration: {
              card: {
                  store_payment_details: 'enabled'
              }
          },
          //enabled_payment_methods: ["googlepay"],
          processing_channel_id: 'pc_oxr4t4p3nseejeqdjqk3pdlpm4',
          success_url: `${window.location.protocol}//${window.location.host}/success.html`,
          failure_url: `${window.location.protocol}//${window.location.host}/failure.html`,
          customer: {
              email: emailInput.value,
              name: nameInput.value 
          },
          '3ds': {
              enabled: threeDSToggle.value == 'on' ? false : true
          },
          items:[
            {
              name: "Digital Goods",
              quantity: 1,
              unit_price: parseInt(amountInput.value*currency.base),
              total_amount: parseInt(amountInput.value*currency.base)
            }
          ]
      };
  
      currencySelect.addEventListener('change', function() {
          paymentSessionBody.currency = this.value;
      });
  
      countrySelect.addEventListener('change', function() {
          paymentSessionBody.billing.address.country = this.value;
      });
  
      threeDSToggle.addEventListener('change', function() {
          paymentSessionBody['3ds'].enabled = this.checked;
      });
  
      captureToggle.addEventListener('change', function() {
          paymentSessionBody.capture = this.checked;
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
        paymentSessionBody.amount = parseInt(amountInput.value*currency.base);
        paymentSessionBody.items[0].unit_price = parseInt(amountInput.value*currency.base); 
  });
  
  });
  
    const renderFlowButton = document.getElementById("flow-button")
    const renderTokenizeOnlyButton = document.getElementById("tokenize-only-button")
    const flowContainer = document.getElementById("flow-container");
    renderFlowButton.addEventListener('click', async () => {

        try {
          isTokenizeOnly = false;
            const getResponse = await fetch('https://lxqp09nxv2.execute-api.us-east-1.amazonaws.com/dev/api/payment-sessions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(paymentSessionBody),
            });
    
            let getData = await getResponse.json();
    
            console.log('Get request completed:', getData);
            await initializeFlow(getData);
            flowContainer.style.display = 'block';
           
        } catch (error) {
            console.error(error);
        } 
    });
     renderTokenizeOnlyButton.addEventListener('click', async () => {

        try {
           isTokenizeOnly = true;
            const getResponse = await fetch('https://lxqp09nxv2.execute-api.us-east-1.amazonaws.com/dev/api/payment-sessions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(paymentSessionBody),
            });
    
            let getData = await getResponse.json();
    
            console.log('Get request completed:', getData);
            await initializeFlow(getData, isTokenizeOnly);
            flowContainer.style.display = 'block';
        } catch (error) {
            console.error(error);
        } 
    });

    document.addEventListener("DOMContentLoaded", function() {
      const renderGoogleButton = document.getElementById("google-button");
      const renderAppleButton = document.getElementById("apple-button");
  
      renderGoogleButton.addEventListener("click", async () => {
          onGooglePayLoaded();
      });
  
      renderAppleButton.addEventListener("click", async () => {
          //  Apple Pay integration logic
      });
  
      window.openTab = function(evt, tabName) {
          const tabLinks = document.getElementsByClassName("tab-link");
          const tabContents = document.getElementsByClassName("tab-content");
  
          for (let i = 0; i < tabContents.length; i++) {
              tabContents[i].classList.remove("active");
          }
  
          for (let i = 0; i < tabLinks.length; i++) {
              tabLinks[i].classList.remove("active");
          }
  
          document.getElementById(tabName).classList.add("active");
          evt.currentTarget.classList.add("active");

          if (tabName === 'google-tab') {
            loadGooglePayScript();
        } else {
            removeGooglePayScript();
        }
      };
  
      // Initialize the first tab as active
      document.querySelector(".tab-link").click();
  });

})();


let initializeFlow = async (paymentSession, isTokenizeOnly) => {
    console.log(paymentSession)

    const appearance = {
      colorAction: "#E05650",
      colorBackground: "#F7F7F5",
      colorBorder: "#F2F2F2",
      colorDisabled: "#BABABA",
      colorError: "#ff0000",
      colorFormBackground: "#FFFFFF",
      colorFormBorder: "#DFDFDF",
      colorInverse: "#F2F2F2",
      colorOutline: "#E1AAA8",
      colorPrimary: "#000000",
      colorSecondary: "#000000",
      colorSuccess: "#06DDB2",
      borderRadius: [
          "8px",
          "50px"
      ],
      subheading: {
          fontFamily: "Lato, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', 'Noto Sans', 'Liberation Sans', Arial, sans-serif;",
          fontSize: "16px",
          lineHeight: "24px",
          fontWeight: 400,
          letterSpacing: 0
      },
      label: {
          fontFamily: "Lato, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', 'Noto Sans', 'Liberation Sans', Arial, sans-serif;",
          fontSize: "14px",
          lineHeight: "20px",
          fontWeight: 400,
          letterSpacing: 0
      },
      input: {
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', 'Noto Sans', 'Liberation Sans', Arial, sans-serif;",
          fontSize: "16px",
          lineHeight: "20px",
          fontWeight: 400,
          letterSpacing: 0
      },
      button: {
          fontFamily: "Lato, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', 'Noto Sans', 'Liberation Sans', Arial, sans-serif;",
          fontSize: "16px",
          lineHeight: "24px",
          fontWeight: 700,
          letterSpacing: 0
      },
      footnote: {
          fontFamily: "Lato, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', 'Noto Sans', 'Liberation Sans', Arial, sans-serif;",
          fontSize: "14px",
          lineHeight: "20px",
          fontWeight: 400,
          letterSpacing: 0
      }
  }
  let isInjectedCheckboxAccepted = false;
  const tokenizeButton = document.getElementById("tokenize-button")
  const payButton = document.getElementById("pay-button")
   const tokenizedDataContainer = document.querySelector(".success-payment-message");
    if(!isTokenizeOnly){

      tokenizeButton.style.display = 'none';
      tokenizedDataContainer.style.display = 'none';
       payButton.style.display = 'inline';

//       const handlePaymentAdditionalContentMount = (component, containerElement) => {
//    const merchantName = "Sony";
//         const text = `I agree to the terms and conditions and authorize ${merchantName} to use my payment details to process the payment.`;
        
//         containerElement.innerHTML = `
//             <div class="checkbox-container">
//                 <input type="checkbox" id="payment-agreement" class="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 mr-2 required">
//                 <label for="payment-agreement" class="text-sm text-gray-700">${text}</label>
//             </div>
//         `;

//         const identifier = seTuptnc(component.type);
//         return identifier;
// };

payButton.addEventListener('click', () => {
  if (isInjectedCheckboxAccepted) {
    flowComponent.submit();
  }
});
const handlePaymentAdditionalContentMount = (_component, element) => {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.name = 'injected-payment-agreement-message';
  checkbox.addEventListener('click', () => {
    isInjectedCheckboxAccepted = checkbox.checked;
    console.log(isInjectedCheckboxAccepted)
  });

  const label = document.createElement('label');
      const merchantName = "Sony";
         const text = `I agree to the terms and conditions and authorize ${merchantName} to use my payment details to process the payment.`;
  label.innerHTML = text;

  element.appendChild(checkbox);
  element.appendChild(label);
         const identifier = setupTnc(component.type);
        return identifier;
 
};
const handlePaymentAdditionalContentUnmount = (component, containerElement, mountIdentifier) => {
  containerElement.innerHTML = '';

  cleanupTnc(mountIdentifier);
};
            const checkout = await CheckoutWebComponents({
                publicKey: "pk_sbox_7za2ppcb4pw7zzdkfzutahfjl4t",
                environment: "sandbox",
                locale: "en-GB",
                paymentSession,
                appearance: appearance,
                showPayButton: false,
                  componentOptions: {
                      flow: {
                            handlePaymentAdditionalContentMount,
                            handlePaymentAdditionalContentUnmount
                 }
                  },
                  handleClick: (_self) => {
                  if (true) {
                return { continue: true };
                }
                return { continue: false };
                },
                onSubmit: (_self) => {
                  console.log("OnSubmit() Result: ",_self)
                },
                 onCardBinChanged: (_self, cardMetadata) => {
                  console.log("OnCardBinChanged() Result: ", cardMetadata)
                 },
                 onTokenized: (_self, tokenizeResult) => {
                  console.log("OnTokenized() Result: ", tokenizeResult.data)
                    if (tokenizeResult.data.card_type === 'DEBIT') {
                            return {
                                continue: false,
                                errorMessage: `Credit cards are not accepted`,
                            };
                          }
                            return { continue: true };
                }
                 ,
                onPaymentCompleted: (_component, paymentResponse) => {
                  console.log("Create Payment with PaymentId: ", paymentResponse);
                  //console.log("Create Payment with PaymentId: ", _component);
                  //window.location.href = `success.html?paymentId=${paymentResponse.id}`;
                },
                onChange: (component) => {
                  // console.log(
                  //   `onChange() -> isValid: "${component.isValid()}" for "${
                  //     component.type
                  //   }"`,
                  // );
                },

                onError: (component, error) => {
                  console.log(error.details);
                  //window.location.href = `failure.html?error=${encodeURIComponent(error.message)}`;
                },
              });
        
              const flowComponent = checkout.create("flow");
            
              flowComponent.mount(document.getElementById("flow-container"));
              console.log(flowComponent)
             // flowComponent.unselect();
              // const googlepay = checkout.create("googlepay");
              // if(await googlepay.isAvailable()){
              //   googlepay.mount(document.getElementById("flow-container"));
              // }
            
}
else{

   payButton.style.display = 'none';
   
  tokenizeButton.addEventListener('click', async() =>{
    if(await cardComponent.isValid()){
    const {data} = await cardComponent.tokenize();
    console.log(data)
    
          tokenizedDataContainer.innerHTML = "Card tokenization completed.<br>" + "Card Token: <span class=\"token\">" + data.token + "</span></br>"
  + "Issuer: <span class=\"token\">" + data.issuer + "</span></br>"
    + "Card Type: <span class=\"token\">" + data.card_type + "</span></br>"
      + "Cardholder Name: <span class=\"token\">" + data.name + "</span></br>"
      + "Scheme: <span class=\"token\">" + data.scheme + "</span></br>"
      + "BIN: <span class=\"token\">" + data.bin + "</span></br>"
      + "Last4: <span class=\"token\">" + data.last4 + "</span></br>";
    }
    tokenizedDataContainer.style.display = 'block';
  })
  tokenizeButton.style.display = 'inline-block';
   const checkout = await CheckoutWebComponents({
                publicKey: "pk_sbox_7za2ppcb4pw7zzdkfzutahfjl4t",
                environment: "sandbox",
                locale: "en-GB",
                paymentSession,
                appearance: appearance,
                onReady: () => {  
                },
                onPaymentCompleted: (_component, paymentResponse) => {
                  console.log("Create Payment with PaymentId: ", paymentResponse);
                  window.location.href = `success.html?paymentId=${paymentResponse.id}`;
                },
                onChange: (component) => {
                  console.log(
                    `onChange() -> isValid: "${component.isValid()}" for "${
                      component.type
                    }"`,
                  );
                },
                onError: (component, error) => {
                  console.log("onError", error, "Component", component);
                  window.location.href = `failure.html?error=${encodeURIComponent(error.message)}`;
                },
              });
        
              const cardComponent = checkout.create("card",{
                showPayButton : false
              });
             if(await cardComponent.isAvailable()){
                cardComponent.mount(document.getElementById("flow-container"));
             }
}
        }

        function loadGooglePayScript() {
          const script = document.createElement('script');
          script.src = "https://pay.google.com/gp/p/js/pay.js";
          script.async = true;
          document.head.appendChild(script);
          script.id = "google-pay-sdk";
      }
  
      function removeGooglePayScript() {
          const script = document.getElementById("google-pay-sdk");
          if (script) {
              script.remove();
          }
      }