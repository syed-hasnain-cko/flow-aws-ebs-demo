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

function disableActionButtons(){
    document.getElementById('further-actions-button').disabled = true
    document.getElementById('further-actions-button').classList.add('disabled-button');
    document.getElementById('action-buttons').style.display = 'none';
}