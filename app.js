require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const routes = require('./backend/api-route-controller');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 4244;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors()); // Allow all origins by default, or configure for specific frontend URL
app.use(routes);

let wss;
let httpServer;

// --- API Endpoints ---
app.post('/webhook', (req, res) => {
    if (req.headers.authorization === process.env.WEBHOOK_SECRET) {
        const event = req.body;
        console.log('Received webhook event:', event);

        // Broadcast the event to all connected WebSocket clients
        if (wss) {
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(event));
                }
            });
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(403);
    }
});

// --- Start the Server ---
httpServer = http.createServer(app);
wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', ws => {
    console.log('Client connected');
    const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
    }, 2000);

    ws.on('close', () => {
        console.log('Client disconnected');
        clearInterval(interval);
    });

    ws.on('message', message => {
        console.log('Received message:', message);
    });
});

httpServer.listen(PORT, () => {
    console.log(`HTTP and WebSocket Server is listening on port: ${PORT}`);
});

// --- Error Handling ---
process.on('uncaughtException', (err) => {
    console.error('There was an uncaught error', err);
    // In production, logging to a service is better than exiting
    //process.exit(1); 
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // In production, logging to a service is better than exiting
    // process.exit(1);
});