
(function(){
   
    const paymentSessionBody = {
        currency: 'EUR',
        amount: 2000,
        payment_type: 'Regular',
        capture: true,
        reference: 'ORD-123A',
        billing:{
            address:{
                country:'DE'
            }   
        },
        payment_method_configuration: {
            card: {
                store_payment_details: 'enabled'
            }
        },
        processing_channel_id: 'pc_oxr4t4p3nseejeqdjqk3pdlpm4',
        success_url: `${window.location.protocol}//${window.location.host}/success.html`,
        failure_url: `${window.location.protocol}//${window.location.host}/failure.html`,
        customer:{
            email:'smhasnain@gmail.com',
            name:'Syed'
        },
        '3ds':{
          enabled : false
        },
    };
    const renderFlowButton = document.getElementById("flow-button")
    
    const flowContainer = document.getElementById("flow-container");
    renderFlowButton.addEventListener('click', async () => {

        try {
            const getResponse = await fetch('/payment-sessions', {
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

    document.addEventListener("DOMContentLoaded", function() {
      const renderGoogleButton = document.getElementById("google-button");
      const renderAppleButton = document.getElementById("apple-button");
      const flowContainer = document.getElementById("flow-container");
      const googleContainer = document.getElementById("google-container");
      const appleContainer = document.getElementById("apple-container");
  
  
      renderGoogleButton.addEventListener("click", async () => {
          // Your Google Pay integration logic
      });
  
      renderAppleButton.addEventListener("click", async () => {
          // Your Apple Pay integration logic
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
      };
  
      // Initialize the first tab as active
      document.querySelector(".tab-link").click();
  });

  

  

})();


let initializeFlow = async (paymentSession) => {
    console.log(paymentSession)
    
            const checkout = await CheckoutWebComponents({
                publicKey: "pk_sbox_7za2ppcb4pw7zzdkfzutahfjl4t",
                environment: "sandbox",
                locale: "en-GB",
                paymentSession,
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
        
              const flowComponent = checkout.create("flow");
            
              flowComponent.mount(document.getElementById("flow-container"));
            
     
        }
