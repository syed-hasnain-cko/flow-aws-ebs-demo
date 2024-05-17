// // require('dotenv').config();
// // const express = require('express')
// // const app = express()
// // const path = require('path')
// // const routes = require('./backend/api-route-controller')
// // const cors = require('cors');
// // const bodyParser = require('body-parser');
// // const PORT = process.env.PORT || 4244;

// // app.use(express.static(path.join(__dirname, 'frontend')));
// // app.use(express.static(path.join(__dirname, 'backend')));
// // app.use(cors());
// // app.use(bodyParser.json())

// // app.use(
// //     bodyParser.urlencoded({
// //         extended: true,
// //     })
// // );
// // app.use(
// //     cors({
// //         origin: '*',
// //     })
// // );
// // app.use(routes)
// // app.get('*', (req, res) => {
// //     res.sendFile(path.join(__dirname, 'frontend/index.html'));
// // });

// // app.listen(PORT, () =>{
// //     console.log('Server listening to port: ',PORT)
// // });

// require('dotenv').config();
// const express = require('express');
// const path = require('path');
// const cors = require('cors');
// const bodyParser = require('body-parser');
// const routes = require('./backend/api-route-controller');
// const https = require('https');
// const fs = require('fs');
// const WebSocket = require('ws');

// const app = express();
// const PORT = process.env.PORT || 4244;

// // Middleware
// app.use(express.static(path.join(__dirname, 'frontend')));
// app.use(express.static(path.join(__dirname, 'backend')));
// app.use(cors());
// app.use(bodyParser.json());
// app.use(bodyParser.urlencoded({ extended: true }));
// app.use(cors({ origin: '*' }));
// app.use(routes);

// let wss;
// let server;

// app.post('/webhook', (req, res) => {
//     const event = req.body;
//     console.log('Received webhook event:', event);

//     wss.clients.forEach(client => {
//         if (client.readyState === WebSocket.OPEN) {
//             client.send(JSON.stringify(event));
//         }
//     });

//     res.sendStatus(200);
// });

// app.get('*', (req, res) => {
//     res.sendFile(path.join(__dirname, 'frontend/index.html'));
// });

// if(process.env.ENV == "DEV"){
//     const privateKey = fs.readFileSync('AWS-EBS-SSL-CERTIFICATES/private-key.pem', 'utf8');
//     const certificate = fs.readFileSync('AWS-EBS-SSL-CERTIFICATES/certificate.pem', 'utf8');
//     const credentials = { key: privateKey, cert: certificate };
//     server = https.createServer(credentials, app);
//     wss = new WebSocket.Server({ server });
// }
// else{
//     server = https.createServer(app);
//     wss = new WebSocket.Server({ server });
// }
// // server = https.createServer(app);
// // wss = new WebSocket.Server({ server });

// wss.on('connection', ws => {
//     console.log('Client connected');

//     ws.on('message', message => {
//         console.log('Received message:', message);
//     });

//     ws.on('close', () => {
//         console.log('Client disconnected');
//     });
// });

// server.listen(PORT, () => {
//     console.log(`Server is listening on port: ${PORT}`);
// });

require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const routes = require('./backend/api-route-controller');
const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');

const app = express();
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
    const event = req.body;
    console.log('Received webhook event:', event);

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(event));
        }
    });

    res.sendStatus(200);
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/index.html'));
});

if (process.env.ENV === "DEV") {
    const privateKey = fs.readFileSync('AWS-EBS-SSL-CERTIFICATES/private-key.pem', 'utf8');
    const certificate = fs.readFileSync('AWS-EBS-SSL-CERTIFICATES/certificate.pem', 'utf8');
    const credentials = { key: privateKey, cert: certificate };

    httpServer = http.createServer(credentials,app);
    wss = new WebSocket.Server({ server: httpServer });
} else {
    httpServer = http.createServer(app);
    wss = new WebSocket.Server({ server: httpServer });
}

wss.on('connection', ws => {
    console.log('Client connected');

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
