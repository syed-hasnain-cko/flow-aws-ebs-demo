const ws = new WebSocket(`wss://${window.location.host}`);

ws.onopen = () => {
    console.log('Connected to WebSocket server');
};

ws.onmessage = event => {
    const message = JSON.parse(event.data);
    console.log('Received message:', message);

    const statusMessage = document.getElementById('status-message');
    const modal = document.getElementById('modal');
    const closeButton = document.getElementsByClassName('close-button')[0];

    statusMessage.innerText = JSON.stringify(message, null, 2); // Format JSON nicely
    modal.style.display = 'block';

    closeButton.onclick = function() {
        modal.style.display = 'none';
    };

    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    };
};

ws.onclose = () => {
    console.log('Disconnected from WebSocket server');
};
