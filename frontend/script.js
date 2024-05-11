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
        success_url: 'https://flow-demo-syed-env.eba-6sufbpqc.us-east-1.elasticbeanstalk.com/',
        failure_url: 'https://flow-demo-syed-env.eba-6sufbpqc.us-east-1.elasticbeanstalk.com/',
        customer:{
            email:'smhasnain@gmail.com',
            name:'Syed'
        }
    };
    const renderFlowButton = document.getElementById("flow-button")
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
        } catch (error) {
            console.error(error);
        } 
    });
})();


let initializeFlow = async (paymentSession) => {
    console.log(paymentSession)
    
            const checkout = await CheckoutWebComponents({
                publicKey: 'pk_sbox_7za2ppcb4pw7zzdkfzutahfjl4t',
                environment: "sandbox",
                locale: "en-GB",
                paymentSession,
                onReady: () => {
                  console.log("onReady");
                },
                onPaymentCompleted: (_component, paymentResponse) => {
                  console.log("Create Payment with PaymentId: ", paymentResponse.id);
                },
                onChange: (component) => {
                  console.log(
                    `onChange() -> isValid: "${component.isValid()}" for "${
                      component.type
                    }"`,
                  );
                },
                onError: (component, error) => {
                  console.log("onError", error, "Component", component.type);
                },
              });
        
              const flowComponent = checkout.create("flow");
            
              flowComponent.mount(document.getElementById("flow-container"));
            
     
        }