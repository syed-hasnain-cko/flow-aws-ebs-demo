
require('dotenv').config();
const express = require('express')
const bodyParser = require('body-parser')
const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware')
const routes = require('./api-route-controller');
const config = require('./config');

// declare a new express app
const app = express()
const router = express.Router();

app.use(bodyParser.json({ verify: (req, res, buf) => { req.rawBody = buf; } }))
app.use(bodyParser.urlencoded({ extended: true }));


app.use(awsServerlessExpressMiddleware.eventContext())

// Serve frontend config as a JS file so the browser can read env vars
app.get('/frontend-config.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`window.APP_CONFIG = ${JSON.stringify({
      apiBaseUrl: config.apiBaseUrl || '',
      processingChannelId: config.processingChannelId || '',
      publicKey: config.pk || '',
      googleMerchantId: config.googleMerchantId || '',
      appleMerchantId: config.appleMerchantId || ''
  })};`);
});

// Enable CORS for all methods
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "*")
  next()
});

app.use(routes);
app.use('/', router); 

process.on('uncaughtException', (err) => {
    console.error('Uncaught error:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});


module.exports = app
