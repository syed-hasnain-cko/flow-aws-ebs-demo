function formatJSON(data) {
    let formatted = '<ul class="json-list">';
    for (const key in data) {
        if (typeof data[key] === 'object' && data[key] !== null) {
            formatted += `<li><strong>${key}:</strong> ${formatJSON(data[key])}</li>`;
        } else {
            formatted += `<li><strong>${key}:</strong> ${data[key]}</li>`;
        }
    }
    formatted += '</ul>';
    return formatted;
}
function showToast(message, isSuccess = true) {
const toastContainer = document.getElementById('toast-container');
toastContainer.className = isSuccess ? 'toast-container toast-success' : 'toast-container toast-error';
toastContainer.textContent = message;
toastContainer.style.display = 'block';
setTimeout(() => {
toastContainer.style.display = 'none';
}, 6000);
}

async function fetchPaymentDetails(id){
    queryParams = new URLSearchParams({
            paymentId: id,
        });

        const paymentResponse = await fetch(`/get-payment-details?${queryParams.toString()}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });
         return await paymentResponse.json();
}

async function voidPayment(id){
    const queryParams = new URLSearchParams({
        paymentId: id,
    });
    try{
        const voidResponse = await fetch(`/void-payment?${queryParams.toString()}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    });
     if (voidResponse.ok) {
                showToast('Payment voided successfully!');
            } else {
                showToast('Failed to void payment', false);
            }
    }
    catch(error){
        showToast('Failed to void payment', false);
    }
}

async function capturePayment(id){
    const queryParams = new URLSearchParams({
        paymentId: id,
    });
    try{
        const captureResponse = await fetch(`/capture-payment?${queryParams.toString()}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    });
     if (captureResponse.ok) {
                showToast('Payment captured successfully!');
            } else {
                showToast('Failed to capture payment', false);
            }
    }
    catch(error){
        showToast('Failed to capture payment', false);
    }
}

async function refundPayment(id){
    const queryParams = new URLSearchParams({
        paymentId: id,
    });
    try{
        const refundResponse = await fetch(`/refund-payment?${queryParams.toString()}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    });
     if (refundResponse.ok) {
                showToast('Payment refunded successfully!');
            } else {
                showToast('Failed to refund payment', false);
            }
    }
    catch(error){
        showToast('Failed to refund payment', false);
    }
}

async function updatePaymentDetailsData(id){
    let paymentData = await fetchPaymentDetails(id);

    document.getElementById('action-buttons').style.display = 'block';
    // Clear previous action buttons
    document.getElementById('action-buttons').innerHTML = '';

    // Display action buttons based on the returned data
    if(paymentData._links?.capture == null && paymentData._links?.void == null && paymentData._links?.refund == null){
        disableActionButtons();
    }
    else{
        if (paymentData._links?.capture) {
        const captureButton = document.createElement('button');
        captureButton.textContent = 'Capture';
        captureButton.classList.add('main-button');
        captureButton.addEventListener('click', async () => {
            await capturePayment(paymentData.id)
        });
        document.getElementById('action-buttons').appendChild(captureButton);
    }
    if (paymentData._links?.void) {
        const voidButton = document.createElement('button');
        voidButton.textContent = 'Void';
        voidButton.classList.add('main-button');
        voidButton.addEventListener('click', async () => {
            await voidPayment(paymentData.id);
        });
        document.getElementById('action-buttons').appendChild(voidButton);
    }
    if (paymentData._links?.refund) {
        const refundButton = document.createElement('button');
        refundButton.textContent = 'Refund';
        refundButton.classList.add('main-button');
        refundButton.addEventListener('click', async () => {
            await refundPayment(paymentData.id)
        });
        document.getElementById('action-buttons').appendChild(refundButton);
    }
    }  

    document.getElementById('payment-details-response').innerHTML = formatJSON(paymentData);

    const actionsResponse = await fetch(`/get-payment-actions?paymentId=${paymentData.id}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        }
    });
    const actionsData = await actionsResponse.json();
    document.getElementById('payment-actions-response').innerHTML = formatJSON(actionsData);
    document.getElementById('payment-actions-container').style.display = 'block';
    document.getElementById('payment-details-container').classList.remove('full-width');
    document.getElementById('details-container').style.display = 'flex';
}

function disableActionButtons(){
    document.getElementById('further-actions-button').disabled = true
    document.getElementById('further-actions-button').classList.add('disabled-button');
    document.getElementById('action-buttons').style.display = 'none';
}

