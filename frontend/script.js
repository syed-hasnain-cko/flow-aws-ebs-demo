

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


// --- Populate Payment Setup Currencies ---
const setupCurrencySelect = document.getElementById('setup-currency');
if (setupCurrencySelect) {
    CURRENCIES.forEach(currency => {
        const option = document.createElement('option');
        if (currency.iso4217 === 'EUR') option.selected = true;
        option.value = currency.iso4217;
        option.text = currency.iso4217;
        setupCurrencySelect.appendChild(option);
    });
}

// --- Populate Payment Setup Countries ---
const setupCountrySelect = document.getElementById('setup-country');
if (setupCountrySelect) {
    COUNTRIES.forEach(country => {
        const option = document.createElement('option');
        if (country.alpha2Code === 'DE') option.selected = true;
        option.value = country.alpha2Code;
        option.text = country.name;
        setupCountrySelect.appendChild(option);
    });
}

  window.activeWallet = null;

const rememberMeToggle = document.getElementById('remember-me-toggle');
    const threeDSToggle = document.getElementById('3ds-toggle');
    const captureToggle = document.getElementById('capture-toggle');
    const paymentTypeSelect = document.getElementById('payment-type-select');
    const nameInput = document.getElementById('name-input');
    const emailInput = document.getElementById('email-input');
    const amountInput = document.getElementById('amount-input');
   
   let paymentSessionBody;
   let isTokenizeOnly = false;
   
   
    document.addEventListener('DOMContentLoaded', function() {

      let currency = CURRENCIES.find(c => c.iso4217 == currencySelect.value);

    //    paymentSessionBody = {
    //       currency: currencySelect.value,
    //       amount: parseInt(amountInput.value*currency.base),
    //       payment_type: paymentTypeSelect.value,
    //       capture: captureToggle.value == 'on' ? false : true,
    //       reference: '#Order_' + Math.floor(Math.random() * 1000) + 1,
    //       billing: {
    //           address: {
    //               country: countrySelect.value
    //           }
    //       },
    //       payment_method_configuration: {
    //           card: {
    //              // store_payment_details: 'enabled'
    //             store_payment_details: 'collect_consent'
    //             //customer_id : "cus_korriakiszvubcuzaqpv5ujusm"
    //           }
    //       },
    //       //enabled_payment_methods: ["googlepay"],
    //       processing_channel_id: 'pc_oxr4t4p3nseejeqdjqk3pdlpm4',
    //       success_url: `${window.location.protocol}//${window.location.host}/success.html`,
    //       failure_url: `${window.location.protocol}//${window.location.host}/failure.html`,
    //       customer: {
    //           email: emailInput.value,
    //           name: nameInput.value,
    //           phone: {
    //             country_code: "+49",
    //             number: "17670805174"
    // }
    //       },
    //       '3ds': {
    //           enabled: threeDSToggle.value == 'on' ? false : true
    //       },
    //       items:[
    //         {
    //           name: "Digital Goods",
    //           quantity: 1,
    //           unit_price: parseInt(amountInput.value*currency.base),
    //           total_amount: parseInt(amountInput.value*currency.base)
    //         }
    //       ]
    //   };

            paymentSessionBody = {
          currency: currencySelect.value,
          amount: parseInt(amountInput.value*currency.base),
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
                customer_id : "cus_korriakiszvubcuzaqpv5ujusm"
               }
          },
          //enabled_payment_methods: ["googlepay"],
          disabled_payment_methods: ["remember_me"],
          processing_channel_id: 'pc_oxr4t4p3nseejeqdjqk3pdlpm4',
          success_url: `${window.location.protocol}//${window.location.host}/success.html`,
          failure_url: `${window.location.protocol}//${window.location.host}/failure.html`,
          customer: {
             id: "cus_korriakiszvubcuzaqpv5ujusm"
    }
         ,
          '3ds': {
              enabled: threeDSToggle.value == 'on' ? false : true
          },
          processing: {
              pan_preference : 'fpan'
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

         rememberMeToggle.addEventListener('change', async function() {
          console.log('rememberMeEnabled' , this.checked)
          console.log('rememberMeEnabled' , this.value)
          if(await !this.checked){
            paymentSessionBody['disabled_payment_methods'] = ['remember_me']
          }else{
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
        paymentSessionBody.amount = parseInt(amountInput.value*currency.base);
        paymentSessionBody.items[0].unit_price = parseInt(amountInput.value*currency.base); 
  });


  
 window.openTab = function(evt, tabName) {
    const tabLinks = document.getElementsByClassName("tab-link");
    const tabContents = document.getElementsByClassName("tab-content");

if (tabName !== 'setup-tab') {
        // 1. Reset Global State
        currentSetupId = null;
        activeSetupResponse = null;

        // 2. Hide Dynamic Containers
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

        // 3. Clear Dynamic HTML content
        const grid = document.getElementById('methods-grid');
        const inputsArea = document.getElementById('dynamic-inputs-area');
        const jsonOutput = document.getElementById('setup-json-output');
        const klarnaList = document.getElementById('klarna_container');

        if (grid) grid.innerHTML = '';
        if (inputsArea) inputsArea.innerHTML = '';
        if (jsonOutput) jsonOutput.innerText = '';
        if (klarnaList) klarnaList.innerHTML = '';

        // 4. Remove any "Confirm" buttons injected via JS
        const oldConfirmBtn = document.getElementById('final-confirm-btn');
        if (oldConfirmBtn) oldConfirmBtn.remove();
        
        // 5. Hide the Patch Button (reset to initial state)
        const patchBtn = document.getElementById('patch-setup-btn');
        if (patchBtn) patchBtn.style.display = 'none';
    }
    // CLEANUP LOGIC: 
    // If we are NOT on the Google/Wallet tab, clear wallet states and containers
    if (tabName !== 'google-tab') {
        window.activeWallet = null;
        const container = document.getElementById("google-container");
        if(container) {
            container.innerHTML = '';
            container.style.display = 'none';
        }
        // Also hide the SDK debugger if it's open
        const debuggerArea = document.getElementById('apple-pay-debugger');
        if(debuggerArea) debuggerArea.style.display = 'none';
    }

    // Standard tab switching logic
    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].classList.remove("active");
    }

    for (let i = 0; i < tabLinks.length; i++) {
        tabLinks[i].classList.remove("active");
    }

    document.getElementById(tabName).classList.add("active");
    evt.currentTarget.classList.add("active");

    // Load or remove Google SDK script based on the tab
    if (tabName === 'google-tab') {
        loadGooglePayScript();
    } else {
        removeGooglePayScript();
    }
};
  
      // Initialize the first tab as active
      document.querySelector(".tab-link").click();
  
  });

          const renderGoogleButton = document.getElementById("google-button");
  
      renderGoogleButton.addEventListener("click", async () => {
          onGooglePayLoaded();
      });
  
    const renderFlowButton = document.getElementById("flow-button")
    const renderTokenizeOnlyButton = document.getElementById("tokenize-only-button")
    const flowContainer = document.getElementById("flow-container");
    renderFlowButton.addEventListener('click', async () => {

        try {
          isTokenizeOnly = false;
            const getResponse = await fetch('https://zzrte604h4.execute-api.us-east-1.amazonaws.com/staging/payment-sessions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(paymentSessionBody),
            });

            let getData = await getResponse.json();
            await addToApiLog('POST', `create flow payment session: ${getData.id} - /payment-sessions`, getData.id ? 201 : 422, paymentSessionBody, getData)
            flowContainer.style.display = 'block';
            await initializeFlow(getData);
          
           
        } catch (error) {
            console.error(error);
        } 
    });
     renderTokenizeOnlyButton.addEventListener('click', async () => {

        try {
           isTokenizeOnly = true;
            const getResponse = await fetch('https://zzrte604h4.execute-api.us-east-1.amazonaws.com/staging/payment-sessions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(paymentSessionBody),
            });
    
            let getData = await getResponse.json();
            await addToApiLog('POST', `create tokenization-only flow session: ${getData.id} - /payment-sessions`, getData.id ? 201 : 422, paymentSessionBody, getData)
    flowContainer.style.display = 'block';
            await initializeFlow(getData, isTokenizeOnly);
          
        } catch (error) {
            console.error(error);
        } 
    });
}

)();


// 1. Listen for standard dropdown/toggle changes
const walletInputs = [
    'google-button-type', 'google-button-color', 'google-locale', 
    'google-allow-credit', 'google-allow-debit', 
    'apple-button-type', 'apple-button-style', 'apple-active-card-toggle'
];

walletInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('change', () => {
            triggerWalletRerender();
        });
    }
});

// 2. Listen for the new modern "Chips" (Schemes, Auth Methods, etc.)
const chipContainers = ['schemes-chips', 'apple-caps-chips', 'auth-methods-chips'];
chipContainers.forEach(containerId => {
    const container = document.getElementById(containerId);
    if (container) {
        container.addEventListener('change', (e) => {
            if (e.target.classList.contains('chip-input')) {
                triggerWalletRerender();
            }
        });
    }
});

/**
 * Shared function to decide which wallet to refresh
 */
function triggerWalletRerender() {
    const container = document.getElementById("google-container");
    // Only act if the wallet container is currently active/visible
    if (container && (container.style.display === 'flex' || container.style.display === 'block')) {
        
        if (window.activeWallet === 'google' && typeof window.onGooglePayLoaded === 'function') {
            console.log("🛠️ Central Watcher: Refreshing Google Pay...");
            window.onGooglePayLoaded();
        } 
        else if (window.activeWallet === 'apple' && typeof window.addApplePayButton === 'function') {
            console.log("🛠️ Central Watcher: Refreshing Apple Pay...");
            window.addApplePayButton();
        }
    }
}


const performPaymentSubmission = async (submitData) => {

  try {
    document.getElementById('payment-loader').style.display = 'flex';
    const response = await fetch("https://zzrte604h4.execute-api.us-east-1.amazonaws.com/staging/submit-payment-session", {
      method: "POST",
      headers: {
          'Content-Type': 'application/json' 
      },
      body: JSON.stringify(submitData),
    });
    const jsonResponse = response.json()
    await addToApiLog('POST', `submit flow session: ${jsonResponse.id} - /payment-sessions/${jsonResponse.id}/submit`, (jsonResponse.id && jsonResponse.status === 'Approved') || (jsonResponse.id && jsonResponse.status === 'Declined')  ? 201 : jsonResponse.id && jsonResponse.status === 'Action Requited' ? 202 : 422, submitData, jsonResponse)
    return jsonResponse;
  } catch (error) {
    document.getElementById('payment-loader').style.display = 'none';
    console.error("❌ Submit error:", error);
  }
};

let showPayButtonLogic = true;
let showCVVField = true;

let initializeFlow = async (paymentSession, isTokenizeOnly) => {

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
          fontFamily: "Lato, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', 'Noto Sans', 'Liberation Sans', Arial, sans-serif",
          fontSize: "16px",
          lineHeight: "24px",
          fontWeight: 400,
          letterSpacing: 0
      },
      label: {
          fontFamily: "Lato, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', 'Noto Sans', 'Liberation Sans', Arial, sans-serif",
          fontSize: "14px",
          lineHeight: "20px",
          fontWeight: 400,
          letterSpacing: 0
      },
      input: {
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', 'Noto Sans', 'Liberation Sans', Arial, sans-serif",
          fontSize: "16px",
          lineHeight: "20px",
          fontWeight: 400,
          letterSpacing: 0
      },
      button: {
          fontFamily: "Lato, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', 'Noto Sans', 'Liberation Sans', Arial, sans-serif",
          fontSize: "16px",
          lineHeight: "24px",
          fontWeight: 700,
          letterSpacing: 0
      },
      footnote: {
          fontFamily: "Lato, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', 'Noto Sans', 'Liberation Sans', Arial, sans-serif",
          fontSize: "14px",
          lineHeight: "20px",
          fontWeight: 400,
          letterSpacing: 0
      }
  }

  const tokenizeButton = document.getElementById("tokenize-button")
  const payButton = document.getElementById("pay-button")
   const tokenizedDataContainer = document.querySelector(".success-payment-message");
    if(!isTokenizeOnly){

      tokenizeButton.style.display = 'none';
      tokenizedDataContainer.style.display = 'none';
      if(!showPayButtonLogic){
    payButton.style.display = 'inline';
      payButton.classList.add('main-button');
      payButton.textContent = 'Pay Now';

payButton.addEventListener('click', () => {

  const isTnCChecked = (handleTnCValidation(flowComponent.type))
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

  if(self.type == "card" || self.type == "stored_card"){
  // 1. Send the 'submitData' to your server-side endpoint
  const submitResponse = await performPaymentSubmission({
                          amount: 2500,
                          sessionData,
                          paymentSessionId: paymentSession.id,
                          items: [
                            {
                              name: "Order Total",
                              unit_price: 2500, 
                              quantity: 1,
                              total_amount: 2500 
                            }
                          ],
                          "3ds":{
                            enabled:true
                          },
                          payment_type: "Unscheduled"
                  });

  // 2. Return the unmodified response body from the server to Flow
  return submitResponse;
  }
 
};


/**
 * Checks a single T&C checkbox and updates the label's color for visual feedback.
 * @param {string} checkboxId - The unique ID of the checkbox (e.g., 'stored_card-1').
 * @returns {boolean} True if the T&C is checked, false otherwise.
 */
const handleTnCValidation = (checkboxId) => {

  const checkboxElement = document.getElementById(checkboxId);
  const labelElement = document.getElementById(`${checkboxId}-label`);
  
  if (checkboxElement && !checkboxElement.checked) {
    labelElement.style.color = 'red';
    return false;
  } else if (checkboxElement) {
    labelElement.style.color = ''; 
    return true;
  }
  return true; 
};


            const checkout = await CheckoutWebComponents({
                publicKey: "pk_sbox_7za2ppcb4pw7zzdkfzutahfjl4t",
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
                            captureCardCvv:showCVVField
                 },
                 card:{
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
                    let isTnCChecked = handleTnCValidation(_self.selectedPaymentMethodId)
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
                  console.log("OnTokenized() Result: ", tokenizeResult.data)
                    // if (tokenizeResult.data.card_type === 'DEBIT') {
                    //         return {
                    //             continue: false,
                    //             errorMessage: `Debit cards are not accepted`,
                    //         };
                    //       }
                    //         return { continue: true };
                }
                 ,
                onPaymentCompleted: (_component, paymentResponse) => {
                  console.log("Create Payment with PaymentId: ", paymentResponse);
                    const loader = document.getElementById('payment-loader');
                  if (loader) {
        loader.style.display = 'flex';
                }
                  if(!showPayButtonLogic)
                           {
                              payButton.classList.add("disabled-button")
                              payButton.textContent = 'Pay Now';
                           }
                  setTimeout(() => {
                 window.location.href = `success.html?paymentId=${paymentResponse.id}`;
                  }, 800);
                },
                onChange: (component) => {

                  if(!component.isValid()){
                     if(!showPayButtonLogic)
                        payButton.classList.add('disabled-button');       
                                               
                  }
                  else{
                     if(!showPayButtonLogic)
                      payButton.classList.remove('disabled-button');
                  }
                 
                  // console.log(
                  //   `onChange() -> isValid: "${component.isValid()}" for "${
                  //     component.type
                  //   }"`,
                  // );
                },


                onError: (component, error) => {
                  console.log(error.details);
                   if(!showPayButtonLogic){
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
             //console.log(flowComponent)
          
              // const individualComponent = checkout.create("paypal");
              // if(await individualComponent.isAvailable()){
              //   individualComponent.mount(document.getElementById("flow-container"));
              // }
            
}
else{
 if(!showPayButtonLogic){
  payButton.style.display = 'none';
 }
  
   
 tokenizeButton.addEventListener('click', async () => {
    if (await cardComponent.isValid()) {
        const { data } = await cardComponent.tokenize();
        tokenizedDataContainer.style.display = 'none';
        // Beautiful Structured Output
        tokenizedDataContainer.innerHTML = `
            <div style="font-weight:700; margin-bottom:10px; color:#1e293b;">Card Tokenized Successfully</div>
            <div class="token-row"><span class="token-label">Token</span><span class="token-value">${data.token}</span></div>
            <div class="token-row"><span class="token-label">Scheme</span><span class="token-value">${data.scheme}</span></div>
            <div class="token-row"><span class="token-label">Card Type</span><span class="token-value">${data.card_type}</span></div>
            <div class="token-row"><span class="token-label">Last 4</span><span class="token-value">•••• ${data.last4}</span></div>
            <div class="token-row"><span class="token-label">Expiry</span><span class="token-value">${data.expiry_month}/${data.expiry_year}</span></div>
        `;
        tokenizedDataContainer.style.display = 'block';
    }
});

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
                 component
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

   // At the top of your Payment Setup section in script.js
let activeSetupResponse = null;

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
       
    ]
};

// --- 1. Create Setup Call ---
document.getElementById('create-setup-btn').addEventListener('click', async () => {


const setupMethodsContainer = document.getElementById('setup-methods-container');
    const dynamicInputsArea = document.getElementById('dynamic-inputs-area');
    const responseContainer = document.getElementById('setup-response-container');
    const patchBtn = document.getElementById('patch-setup-btn');
    const statusArea = document.getElementById('final-status-area');
    const widgetContainer = document.getElementById('sdk-widget-container');

    // 2. CRITICAL: Remove the injected Confirm Button if it exists
    const oldConfirmBtn = document.getElementById('final-confirm-btn');
    if (oldConfirmBtn) oldConfirmBtn.remove();

    // 3. Reset visibility and content
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
        patchBtn.disabled = true; // Keep disabled until toggle is flipped
        patchBtn.style.opacity = "0.5";
        patchBtn.innerText = 'Update Payment Setup';
    }

    const body = {
        amount: parseInt(document.getElementById('setup-amount').value),
        currency: document.getElementById('setup-currency').value,
        payment_type: document.getElementById('setup-payment-type').value,
        processing_channel_id: document.getElementById('setup-pc-id').value
    };

    const res = await fetch('https://zzrte604h4.execute-api.us-east-1.amazonaws.com/staging/payment-setups', { method: 'POST', body: JSON.stringify(body), headers: {'Content-Type': 'application/json'}});
    
    activeSetupResponse = await res.json();

    await addToApiLog('POST', `create payment setup: ${activeSetupResponse?.id ? activeSetupResponse?.id: activeSetupResponse?.request_id} - /payments/setups`, activeSetupResponse.id ? 200 : 422, body, activeSetupResponse)
    
    renderMethodToggles(activeSetupResponse.available_payment_methods);
    document.getElementById('setup-json-output').innerText = JSON.stringify(activeSetupResponse, null, 2);
    document.getElementById('setup-response-container').style.display = 'block';
    
});

// --- 2. Render Toggles ---
function renderMethodToggles(methods) {
    const grid = document.getElementById('methods-grid');
    grid.innerHTML = '';
    methods.forEach(m => {
        const card = document.createElement('div');
        card.className = 'context-area'; // Reuse your styling
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
    
    // Attach Toggle Listeners
    document.querySelectorAll('.method-toggle').forEach(t => {
        t.addEventListener('change', handleToggleChange);
    });
}

// --- 3. Handle Expansion ---
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
    
    inputsArea.innerHTML = ''; // Clear and Re-render
    
    activeToggles.forEach(method => {
        if (METHOD_REQUIREMENTS[method]) {
            const section = document.createElement('div');
            section.className = 'context-area';
            section.style.marginTop = '10px';
            section.innerHTML = `<h4 style="margin-top:0; color:#6366f1;">${method.toUpperCase()} Requirements</h4><div class="inline-form" id="fields-${method}"></div>`;
            
            METHOD_REQUIREMENTS[method].forEach(field => {
                const group = document.createElement('div');
                group.className = 'form-group';
                group.innerHTML = `
                    <label class="text-label">${field.label}</label>
                    <input type="text" class="text-input patch-field" data-method="${method}" data-path="${field.path}" value="${field.value}">
                `;
                section.querySelector('.inline-form').appendChild(group);
            });

            // Add Klarna Order Items Table specifically
        if (method === 'klarna') {

            const template = document.getElementById('klarna-items-template').content.cloneNode(true);
            section.appendChild(template);
            // Add initial row
            addKlarnaItemRow(section.querySelector('#klarna-items-list'));
            
            section.querySelector('#add-klarna-item').addEventListener('click', (e) => {
                e.preventDefault();
                addKlarnaItemRow(document.getElementById('klarna-items-list'));
            });
        }

            inputsArea.appendChild(section);
        }
    });

    patchBtn.style.display = hasActiveToggle ? 'block' : 'none';
}

// --- 4. Patch Logic ---
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
        // Optional: Add visual feedback that they are locked
        t.parentElement.style.opacity = "0.6";
        t.parentElement.style.cursor = "not-allowed - setup is patched alreadyxw";
    });

    const activeToggles = document.querySelectorAll('.method-toggle:checked');
    
    activeToggles.forEach(t => {
        const method = t.dataset.method;
        patchBody.payment_methods[method] = { initialization: "enabled" };
    });

    // Map inputs to the JSON body
    document.querySelectorAll('.patch-field').forEach(input => {
        const path = input.dataset.path.split('.'); // e.g. ["billing", "address", "city"]
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

    if (patchBody.payment_methods.klarna) {
        patchBody.order = { items: [] };
        document.querySelectorAll('.klarna-item-row').forEach(row => {
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
    btn.disabled = true;
    btn.style.opacity = "0.5";
    btn.style.cursor = "not-allowed";
    btn.innerText = 'Patching...';

    try{
       const queryParams = new URLSearchParams({
        setupId: activeSetupResponse.id,
    });
    const res = await fetch(`https://zzrte604h4.execute-api.us-east-1.amazonaws.com/staging/update-payment-setups?${queryParams.toString()}`, { 
        method: 'PUT', 
        body: JSON.stringify(patchBody), 
        headers: {'Content-Type': 'application/json'}
    });
    const result = await res.json();
    await addToApiLog('PUT', `Update payment setup - /payments/setups/${activeSetupResponse.id}`, result.id ? 200 : 422, patchBody, result)
    responseContainer.style.display = 'block';
    output.innerText = JSON.stringify(result, null, 2);
    await handleFinalState(result);

       if (result._links?.redirect) {
            const redirectBtn = document.createElement('button');
            redirectBtn.className = 'main-button';
            redirectBtn.style.marginTop = '10px';
            redirectBtn.style.background = '#0ea5e9';
            redirectBtn.innerText = 'Follow Redirect URL';
            redirectBtn.onclick = () => window.location.href = result._links.redirect.href;
            
            // Append the button below the JSON output
            output.parentElement.appendChild(redirectBtn);
        }
    console.log("Updated Payment Setup Response:", result);
    }
    catch (e) 
  { 
    console.error(e); 
    output.innerText = "Error: " + e.message;
    allToggles.forEach(t => {
            if (t.checked) t.disabled = false; 
            t.parentElement.style.opacity = "1";
        });
        btn.disabled = false;
        btn.style.opacity = "1";
    }
    finally{
        btn.innerText = 'Update & Patch Setup';
    }
 
});


async function handleFinalState(response) {
    const setupId = response.id;
    const methods = response.payment_methods;
    const statusArea = document.getElementById('final-status-area');
    const widgetContainer = document.getElementById('sdk-widget-container');
    
    // Clear previous UI
    statusArea.style.display = 'none';
    widgetContainer.style.display = 'none';
    document.getElementById('klarna_container').innerHTML = '';

    // Iterate through methods to find what was just "enabled"
    for (let methodName in methods) {
        const methodData = methods[methodName];
        
        if (methodData.initialization === "enabled" || methodData.status === "ready") {
            
            // CASE 1: Status is READY (e.g., Bizum)
            if (methodData.status === "ready") {
                statusArea.className = 'status-ready';
                statusArea.innerText = `${methodName.toUpperCase()} is Ready!`;
                statusArea.style.display = 'block';
                
                renderConfirmButton(setupId, methodName, "Confirm & Redirect");
            } 
            
            // CASE 2: Action Required (e.g., Klarna SDK)
            else if (methodData.status === "action_required" && methodData.action?.type === "sdk") {
                statusArea.className = 'status-action';
                statusArea.innerText = `${methodName.toUpperCase()} requires SDK Authorization.`;
                statusArea.style.display = 'block';
                
                if (methodName === 'klarna') {
                   initializeKlarnaSDK(methodData.action.client_token, methodData.action.session_id, setupId);
                }
            }
        }
    }
}

// Klarna SDK Specific Initialization
function initializeKlarnaSDK(clientToken, sessionId ,setupId) {
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
            payment_method_categories: ['pay_over_time', 'pay_later','pay_now','direct_bank_transfer'] ,
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
    btn.style.width = '100%'
    btn.innerText = label;
    
    btn.onclick = async () => {
        if (btn.disabled) return;
        
        btn.disabled = true;
        btn.style.opacity = "0.5";
        btn.style.cursor = "not-allowed";
        btn.innerText = "Processing...";

        if(methodName === 'bizum') {

            try {
            const data = await confirmPaymentSetup(setupId,methodName);
            // Log for debugging
            console.log("Confirmation Response:", data);

            if (data._links?.redirect) {
                // Handle Redirect (e.g. Bizum)
                window.location.href = data._links.redirect.href;
            } else {
                // 2. Handle Success UI - Show result and Reset button
                document.getElementById('setup-json-output').innerText = JSON.stringify(data, null, 2);
                
                // We call the success function for any successful response that isn't a redirect
                showSuccessWithReset(data);
                
                // Hide the confirm button as it's no longer needed
                btn.style.display = 'none';
                const loader = document.getElementById('payment-loader');
                  if (loader) {
                    loader.style.display = 'flex';
                }
                setTimeout(() => {
                 window.location.href = `success.html?paymentId=${data.id}`;
                  }, 800);
            }
        } catch (e) {
            console.error("Confirmation Error", e);
            btn.disabled = false;
            btn.style.opacity = "1";
            btn.style.cursor = "pointer";
            btn.innerText = "Retry Confirmation";
        }
        }

        else if(methodName === 'klarna'){

            try{

                    window.Klarna.Payments.init({
                    client_token: clientToken,
                    session_id: sessionId
    });

    // Authorize payment after loading the widget
    window.Klarna.Payments.authorize(
        {},
        async function(response) {
          console.log('Klarna authorization response:', response);
               const statusArea = document.getElementById('final-status-area');
                   const patchBtn = document.getElementById('patch-setup-btn');

          if(response.approved && response.show_form === true) {
            console.log('User approved the klarna payment:', response)

            const getSetupResponseJson = await getPaymentSetup(setupId);
            if(getSetupResponseJson.status === 'ready'){

                const data = await confirmPaymentSetup(setupId, methodName);
                if(data.status === 'Pending'){
                  const loader = document.getElementById('payment-loader');
                  if (loader) {
                    loader.style.display = 'flex';
                }
                setTimeout(() => {
                 window.location.href = `success.html?paymentId=${data.id}`;
                  }, 800);
                }
                else{
                    console.log('data after payment succeeded but status is not pending', data)
                }
            }
       
            else{
                btn.remove();
                
                statusArea.innerText = 'User already approved the payment on klarna, wait a few seconds while payment gets ready to be submitted'
                showKlarnaToast('Cannot execute payment right now as status is not ready, Please execute the payment with the button below', type = 'warning')

                const oldKlarnaPaymentBtn = document.getElementById('make-klarna-payment-btn');

                if (!actionArea) return;
                if (oldKlarnaPaymentBtn) oldBtn.remove();

                const btnKlarna = document.createElement('button');
                btnKlarna.id = 'make-klarna-payment-btn';
                btnKlarna.className = 'main-button';
                btnKlarna.style.background = '#059669';
                btnKlarna.style.marginTop = '20px';
                btnKlarna.style.width = '100%'
                btnKlarna.innerText = 'Make Payment Now';
                btnKlarna.onclick = async () => {
                    const paymentSetup = await getPaymentSetup(setupId);
                     document.getElementById('setup-json-output').innerText = JSON.stringify(paymentSetup, null, 2);
                    btn.remove();

                const data = await confirmPaymentSetup(setupId, methodName);
                if(data.status === 'Pending'){
                  const loader = document.getElementById('payment-loader');
                  if (loader) {
                    loader.style.display = 'flex';
                }
                setTimeout(() => {
                 window.location.href = `success.html?paymentId=${data.id}`;
                  }, 800);
                }
                else{
                    const paymentSetup = await getPaymentSetup(setupId);
                     document.getElementById('setup-json-output').innerText = JSON.stringify(paymentSetup, null, 2);

                    showKlarnaToast('Payment method is not ready, try again in few seconds to make payment again.', type = 'error')
                }
                }
                actionArea.appendChild(btnKlarna)
            }
  
          } else {
            btn.remove();
            console.log(response)
            statusArea.innerText = 'User canceled the payment on klarna or did not approve due to some reason.'
            statusArea.className = 'status-error';
            if (patchBtn) {
           
            patchBtn.disabled = false;       // CRITICAL: Re-enable the button
            patchBtn.style.opacity = "1";    // Restore visual state
            patchBtn.style.cursor = "pointer";
            patchBtn.innerText = 'Update Payment Setup';
    }
          }
        }
    );

            }
            catch(e){
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

/**
 * Injects the success message and the Reset Session button
 */
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

    // Use a direct onclick assignment for the dynamic button
    setTimeout(() => {
        const resetBtn = document.getElementById('reset-session-btn');
        if (resetBtn) {
            resetBtn.onclick = function() {
                resetSetupUI(); // Call the explicit reset function
            };
        }
    }, 50);
}

function resetSetupUI() {
    console.log("Force Clearing Setup Tab UI...");

    // 1. Reset Global State
    currentSetupId = null;
    activeSetupResponse = null;

    // 2. Clear Step 1 Inputs
    const amountInput = document.getElementById('setup-amount');
    if (amountInput) amountInput.value = "100";

    // 3. Reset Step 2 & 3 Containers
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

    // 4. Wipe Dynamic Content
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

    // 5. Remove any persistent buttons
const confirmBtn = document.getElementById('final-confirm-btn');
    if (confirmBtn) confirmBtn.remove();
    
    const patchBtn = document.getElementById('patch-setup-btn');
    if (patchBtn) {
        patchBtn.style.display = 'none';
        patchBtn.disabled = false;       // CRITICAL: Re-enable the button
        patchBtn.style.opacity = "1";    // Restore visual state
        patchBtn.style.cursor = "pointer";
        patchBtn.innerText = 'Update Payment Setup';
    }

    const createBtn = document.getElementById('create-setup-btn');
    if (createBtn) {
        createBtn.disabled = false;
        createBtn.innerText = 'Initialize Setup';
        createBtn.style.opacity = "1";
    }

    // 6. Scroll back to the top of the tab smoothly
    const mainWrapper = document.querySelector('.wrapper');
    if (mainWrapper) mainWrapper.scrollTo({ top: 0, behavior: 'smooth' });

    const methodsContainer = document.getElementById('setup-methods-container');
    if (methodsContainer) {
        methodsContainer.style.display = 'none';
        // Clear the grid to remove old disabled toggles
        const grid = document.getElementById('methods-grid');
        if (grid) grid.innerHTML = '';
    }

    // Ensure Step 1 button is ready
    if (createBtn) {
        createBtn.disabled = false;
        createBtn.style.opacity = "1";
        createBtn.innerText = 'Initialize Setup';
    }
}

//Validating input types data to create a setup
const setupInputs = ['setup-amount', 'setup-currency', 'setup-payment-type', 'setup-pc-id'];
const createBtn = document.getElementById('create-setup-btn');

function validateInitializeForm() {
    const allFilled = setupInputs.every(id => {
        const el = document.getElementById(id);
        return el && el.value.trim() !== "";
    });
    createBtn.disabled = !allFilled;
    createBtn.style.opacity = allFilled ? "1" : "0.5";
    createBtn.style.cursor = allFilled ? "pointer" : "not-allowed";
}

// Attach listeners to all 4 inputs
setupInputs.forEach(id => {
    document.getElementById(id).addEventListener('input', validateInitializeForm);
    document.getElementById(id).addEventListener('change', validateInitializeForm);
});

// Run once on load
validateInitializeForm();
