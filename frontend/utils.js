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