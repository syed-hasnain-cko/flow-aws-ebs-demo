

const formatJSON = (data) => {
    const stringify = (obj, indent = 0) => {
        let html = '';
        const spacing = '&nbsp;'.repeat(indent * 4);

        for (const key in obj) {
            let value = obj[key];
            
            // LOGIC FIX: Check if string is actually stringified JSON (like Google's signedMessage)
            if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
                try {
                    value = JSON.parse(value);
                } catch (e) { /* Not JSON, keep as string */ }
            }

            const isObject = typeof value === 'object' && value !== null;

            html += `<div style="line-height: 1.6; font-size: 13px;">`;
            html += `<span style="color: #64748b; font-weight: 600;">${spacing}${key}:</span> `;

            if (isObject) {
                html += `<span style="color: #94a3b8; font-size: 11px;">{</span>`;
                html += stringify(value, indent + 1);
                html += `<div style="color: #94a3b8; font-size: 11px;">${spacing}}</div>`;
            } else {
                const color = typeof value === 'string' ? '#059669' : '#0052FF';
                // Wrap long strings (like base64 tags) so they don't break the layout
                const displayValue = typeof value === 'string' && value.length > 50 
                    ? value.substring(0, 47) + '...' 
                    : value;
                html += `<span style="color: ${color}; font-family: 'JetBrains Mono', monospace; font-weight: 500;">${displayValue}</span>`;
            }
            html += `</div>`;
        }
        return html;
    };

    return `<div style="background: #ffffff; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: left;">${stringify(data)}</div>`;
};

async function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const btn = element.previousElementSibling.querySelector('.copy-btn');
    
    // Get the text, removing HTML tags if you're using the "Simple & Pretty" formatter
    const textToCopy = element.innerText;

    try {
        await navigator.clipboard.writeText(textToCopy);
        
        // Visual Feedback
        const originalText = btn.innerText;
        btn.innerText = 'Copied!';
        btn.classList.add('copied');
        
        // Show a toast as well (using the function we built earlier)
        if (typeof showToast === 'function') {
            showToast('Json copied to clipboard');
        }

        setTimeout(() => {
            btn.innerText = originalText;
            btn.classList.remove('copied');
        }, 1000);
        
    } catch (err) {
        console.error('Failed to copy: ', err);
    }
}


function showToast(message, type = 'success') {
    const toast = document.getElementById('toast-container');
    toast.textContent = message;
    toast.className = `toast-container toast-${type}`;
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.display = 'none';
    }, 4000);
}

function showKlarnaToast(message, type = 'success') {
    const toast = document.getElementById('toast-container-klarna');
    toast.textContent = message;
    toast.className = `toast-container toast-${type}`;
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.display = 'none';
    }, 4000);
}

async function fetchPaymentDetails(id){
    queryParams = new URLSearchParams({
            paymentId: id,
        });

        const paymentResponse = await fetch(`https://zzrte604h4.execute-api.us-east-1.amazonaws.com/staging/get-payment-details?${queryParams.toString()}`, {
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
        const voidResponse = await fetch(`https://zzrte604h4.execute-api.us-east-1.amazonaws.com/staging/void-payment?${queryParams.toString()}`, {
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
        const captureResponse = await fetch(`https://zzrte604h4.execute-api.us-east-1.amazonaws.com/staging/capture-payment?${queryParams.toString()}`, {
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
        const refundResponse = await fetch(`https://zzrte604h4.execute-api.us-east-1.amazonaws.com/staging/refund-payment?${queryParams.toString()}`, {
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

async function getPaymentSetup(setupId){
    try{
            const getQueryParams = new URLSearchParams({ setupId });
            const getSetupResponse = await fetch(`https://zzrte604h4.execute-api.us-east-1.amazonaws.com/staging/get-payment-setup?${getQueryParams.toString()}`, { method: 'GET' });
            return await getSetupResponse.json();
    }
    catch(e){

    }
}

async function confirmPaymentSetup(setupId, methodName){
            try{
           const queryParams = new URLSearchParams({ setupId, methodName });
            const res = await fetch(`https://zzrte604h4.execute-api.us-east-1.amazonaws.com/staging/confirm-payment-setups?${queryParams.toString()}`, { method: 'POST' });
            return await res.json();
            }
            catch(e){

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

    const actionsResponse = await fetch(`https://zzrte604h4.execute-api.us-east-1.amazonaws.com/staging/get-payment-actions?paymentId=${paymentData.id}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        }
    });
    const actionsData = await actionsResponse.json();
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

function getMultiSelectSelectedValues(id) {
    return Array.prototype.slice
      .call(document.querySelectorAll(id + " option:checked"), 0)
      .map(function (v, i, a) {
        return v.value;
      });
  }

function modifyCardNetworks(cardNetworks) {
    return cardNetworks.map(network => {
        let lowerCaseNetwork = network.toLowerCase();
        if (lowerCaseNetwork === 'mastercard') {
            return 'masterCard';
        }
        return lowerCaseNetwork;
    });
}

  function getConfig(callback) {
    fetch("https://zzrte604h4.execute-api.us-east-1.amazonaws.com/staging/config", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => response.json())
      .then((data) => {
        let env;
        if (data.isLive) env = "Production";
        callback(data);
      })
      .catch((error) => {
        console.error("Error:", error);
      });
  }

/**
 * Gets values from modern chip-based multi-selects
 * @param {string} containerId - The ID of the div containing the checkboxes
 */
window.getChipSelectedValues = function(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    const checked = container.querySelectorAll('input.chip-input:checked');
    return Array.from(checked).map(el => el.value);
};

/**
 * Truncates long strings within an object for UI display purposes
 * while keeping the console log full for technical debugging.
 */
function truncateResponse(obj, maxLength = 100) {
    // Create a deep copy so we don't accidentally corrupt the actual data
    const cleanObj = JSON.parse(JSON.stringify(obj));
    
    const recurse = (current) => {
        for (let key in current) {
            if (typeof current[key] === 'string' && current[key].length > maxLength) {
                current[key] = current[key].substring(0, maxLength) + "... [TRUNCATED]";
            } else if (typeof current[key] === 'object' && current[key] !== null) {
                recurse(current[key]);
            }
        }
    };
    
    recurse(cleanObj);
    return cleanObj;
}

function addKlarnaItemRow(container) {
    const row = document.createElement('div');
    row.className = 'inline-form klarna-item-row';
    row.style.borderBottom = "1px solid #e2e8f0";
    row.style.paddingBottom = "10px";
    row.style.marginBottom = "10px";
    row.innerHTML = `
        <div class="form-group"><label class="text-label">Name</label><input type="text" class="text-input k-name" value="Digital Item"></div>
        <div class="form-group"><label class="text-label">Qty</label><input type="number" class="text-input k-qty" value="1"></div>
        <div class="form-group"><label class="text-label">Unit Price</label><input type="number" class="text-input k-price" value="999"></div>
        <div class="form-group"><label class="text-label">Total</label><input type="number" class="text-input k-total" value="999"></div>
        <div class="form-group"><label class="text-label">Ref</label><input type="text" class="text-input k-ref" value="SKU-001"></div>
    `;
    container.appendChild(row);
}
