
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

    updatePaymentDetailsData(message.id);

};

ws.onclose = () => {
    console.log('Disconnected from WebSocket server');
};
