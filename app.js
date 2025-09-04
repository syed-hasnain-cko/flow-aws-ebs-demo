
require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const routes = require('./backend/api-route-controller');
const http = require('http');
const WebSocket = require('ws');
const config = require('./config')
const app = express();
const ngrok = require('ngrok');
const PORT = process.env.PORT || 4244;

// Middleware
app.use(express.static(path.join(__dirname, 'frontend')));
app.use(express.static(path.join(__dirname, 'backend')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors({ origin: '*' }));
app.use(routes);

let wss;
let httpServer;

app.post('/webhook', (req, res) => {
    if(req.headers.authorization == process.env.WEBHOOK_SECRET){
        const event = req.body;
        console.log('Received webhook event:', event);
    
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(event));
            }
        });
    
        res.sendStatus(200);
    }
    else{
        res.sendStatus(403);
    }

});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/index.html'));
});


httpServer = http.createServer(app);
wss = new WebSocket.Server({ server: httpServer });


wss.on('connection', ws => {
    console.log('Client connected');
      const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 2000);

    ws.on('message', message => {
        console.log('Received message:', message);
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});


httpServer.listen(PORT, () => {
    console.log(`HTTP Server is listening on port: ${PORT}`);
});


process.on('uncaughtException', (err) => {
        console.error('There was an uncaught error', err);
        process.exit(1);
});
    
process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        process.exit(1);
});


