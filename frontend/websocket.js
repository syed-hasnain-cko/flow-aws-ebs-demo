
let ws;
if(window.location.hostname.includes('localhost'))
 ws = new WebSocket(`ws://${window.location.hostname}:4244`);
else{
    ws = new WebSocket(`wss://${window.location.hostname}`);
}

ws.onopen = () => {
    console.log('Connected to WebSocket server');
};

ws.onmessage = event => {
    const message = JSON.parse(event.data);
    console.log('Received message:', message);
if(message.type != 'payment_declined' || message.type != 'payment_canceled' || message.type != 'payment_void_declined' 
|| message.type != 'payment_capture_declined' || message.type != 'payment_refund_declined' || message.type != 'payout_declined'
|| message.type != 'payment_expired'){
    updatePaymentDetailsData(message.data.id);
    showToast(`${message.type} success confirmation`)
}
    else{
        showToast(`${message.type} action - Failure`,false)
    }

};

ws.onclose = () => {
    console.log('Disconnected from WebSocket server');
};
