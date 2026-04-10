// =============================================
// Payment Actions Module
// Fetch, void, capture, refund operations +
// payment detail / action display helpers.
// Depends on: utils.js (showToast, showKlarnaToast, formatJSON)
//             api-log.js (addToApiLog)
//             window.APP_CONFIG (frontend-config.js)
// =============================================

async function fetchPaymentDetails(id){
    queryParams = new URLSearchParams({
            paymentId: id,
        });

        const paymentResponse = await fetch(`${window.APP_CONFIG.apiBaseUrl}/get-payment-details?${queryParams.toString()}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });
const response = await paymentResponse.json();
        await addToApiLog('GET', `get payment details: ${id} - /payments/${id}`, response.id ? 201 : 422, {}, response)
         return await response;
}

async function voidPayment(id){
    const queryParams = new URLSearchParams({
        paymentId: id,
    });
    try{
        const voidResponse = await fetch(`${window.APP_CONFIG.apiBaseUrl}/void-payment?${queryParams.toString()}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }

    });
     const response = await voidResponse.json();
     await addToApiLog('POST', `void payment: ${id} - /payments/${id}/voids`, response.action_id ? 202 : 422, {}, response)

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
        const captureResponse = await fetch(`${window.APP_CONFIG.apiBaseUrl}/capture-payment?${queryParams.toString()}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    });
    const response = await captureResponse.json();
    await addToApiLog('POST', `capture payment: ${id} - /payments/${id}/captures`, response.action_id ? 202 : 422, {}, response)
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
        const refundResponse = await fetch(`${window.APP_CONFIG.apiBaseUrl}/refund-payment?${queryParams.toString()}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    });
    const response = await refundResponse.json();
    await addToApiLog('POST', `refund payment: ${id} - /payments/${id}/refunds`, refundResponse.ok ? 202 : 422, {}, response)
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

async function getPaymentSetup(setupId){
    try{
            const getQueryParams = new URLSearchParams({ setupId });
            const getSetupResponse = await fetch(`${window.APP_CONFIG.apiBaseUrl}/get-payment-setup?${getQueryParams.toString()}`, { method: 'GET' });
            const response = await getSetupResponse.json();
            await addToApiLog('GET', `get payment setup: ${setupId} - /payments/setups/${setupId}`, response.id ? 200 : 422, {}, response)
            return response;
    }
    catch(e){
        showKlarnaToast('Failed to fetch payment setup. Please try again.', 'error');
        console.error('getPaymentSetup error:', e);
    }
}

async function confirmPaymentSetup(setupId, methodName){
    try {
        const queryParams = new URLSearchParams({ setupId, methodName });
        const res = await fetch(`${window.APP_CONFIG.apiBaseUrl}/confirm-payment-setups?${queryParams.toString()}`, { method: 'POST' });
        const response = await res.json();
        const logStatus = res.ok ? (response.id ? 201 : 200) : res.status;
        await addToApiLog('POST', `confirm ${methodName} payment setup: ${response.id || setupId} - /payments/setups/${setupId}/confirm/${methodName}`, logStatus, {}, response);
        return response;
    } catch(e) {
        showKlarnaToast('Failed to confirm payment setup. Please try again.', 'error');
        console.error('confirmPaymentSetup error:', e);
    }
}

async function updatePaymentDetailsData(id){
    let paymentData = await fetchPaymentDetails(id);

    document.getElementById('action-buttons').style.display = 'flex';
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
    console.log(paymentData)
    document.getElementById('payment-details-response').innerHTML = formatJSON(paymentData);

    const actionsResponse = await fetch(`${window.APP_CONFIG.apiBaseUrl}/get-payment-actions?paymentId=${paymentData.id}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        }
    });
    const actionsData = await actionsResponse.json();
     await addToApiLog('GET', `get payment actions: - /payments/${id}/actions`, actionsResponse.ok? 200 : 422, {}, actionsData)
    console.log(actionsData)
    document.getElementById('payment-actions-response').innerHTML = formatJSON(actionsData);
    document.getElementById('payment-actions-container').style.display = 'block';
    document.getElementById('payment-details-container').classList.remove('full-width');
    document.getElementById('details-container').style.display = 'flex';
}

function updateWalletDetailsData(data){
    document.getElementById('wallet-token-details-response').innerHTML = formatJSON(data);
    document.getElementById('wallet-details-response').innerHTML = formatJSON(data);
    document.getElementById('wallet-details-container').style.display = 'block';
    document.getElementById('wallet-token-details-container').style.display = 'block';
    document.getElementById('wallet-details-container').classList.remove('full-width');
    document.getElementById('wallet-details-data-container').style.display = 'flex';
}

function disableActionButtons(){
    document.getElementById('further-actions-button').disabled = true
    document.getElementById('further-actions-button').classList.add('disabled-button');
    document.getElementById('action-buttons').style.display = 'none';
}
