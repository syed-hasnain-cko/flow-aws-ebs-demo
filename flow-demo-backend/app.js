// This file will be placed in the Amplify function's folder (e.g., amplify/backend/function/myApiFunction/src)

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const routes = require('./api-route-controller');

const app = express();
const router = express.Router();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());
app.use('/', router); // Mount all API routes under the /api path

// Mount your routes from api-route-controller.js
router.use(routes);


// Error Handling
process.on('uncaughtException', (err) => {
    console.error('Uncaught error:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});