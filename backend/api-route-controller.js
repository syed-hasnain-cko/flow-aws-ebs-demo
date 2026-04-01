const axios = require('axios');
const router = require('express').Router();
const path = require('path');
const https = require('https');
require('dotenv').config()
const {Checkout} = require('checkout-sdk-node');
const config = require('./config');
const fs = require("fs");

const cko = new Checkout(config.sk, { pk: config.pk, timeout: 10000 });

const API_SECRET_KEY = config.sk;

// Structured JSON logger — searchable in log output
function log(level, route, message, data = {}) {
    console.log(JSON.stringify({
        level, route, message,
        timestamp: new Date().toISOString(),
        ...data
    }));
}

router.post('/payment-sessions', async (req, res) => {
    if (!req.body || !req.body.amount || !req.body.currency) {
        return res.status(400).send({ error: 'amount and currency are required' });
    }
    try {
        const response = await axios.post(`${process.env.GW_URL}/payment-sessions`, req.body, {
            headers: {
                Authorization: `Bearer ${API_SECRET_KEY}`,
            },
        });
        res.send(response.data);
    } catch (error) {
        res.status(500).send({
            error: error,
        });
    } 

})

router.post('/payment-setups', async (req, res) => {
    try {
        const response = await axios.post(`${process.env.GW_URL}/payment-setups`, req.body, {
            headers: {
                Authorization: `Bearer ${API_SECRET_KEY}`,
                'Content-Type': 'application/json'
            },
        });
        res.send(response.data);
    } catch (error) {
        log('error', '/payment-setups', 'setup_error', { message: error.response ? JSON.stringify(error.response.data) : error.message });
        res.status(500).send(error.response ? error.response.data : { error: "Internal Server Error" });
    } 
});

router.get('/get-payment-details', async(req, res) => {
    try {
        const response = await axios.get(`${process.env.GW_URL}/payments/${req.query.paymentId}`, {
            headers: {
                Authorization: `Bearer ${API_SECRET_KEY}`,
            },
        });
        res.send(response.data);
    } catch (error) {
        res.status(500).send({
            error: error,
        });
    } 
})

router.get('/get-payment-actions', async(req, res) => {
    try {
        const response = await axios.get(`${process.env.GW_URL}/payments/${req.query.paymentId}/actions`, {
            headers: {
                Authorization: `Bearer ${API_SECRET_KEY}`,
            },
        });
        res.send(response.data);
    } catch (error) {
        res.status(500).send({
            error: error,
        });
    } 
})

router.post('/capture-payment', async(req,res) => {
    if (!req.query.paymentId || !/^pay_[a-zA-Z0-9]+$/.test(req.query.paymentId)) {
        return res.status(400).send({ error: 'Invalid or missing paymentId' });
    }
    try{
        const response = await axios.post(`${process.env.GW_URL}/payments/${req.query.paymentId}/captures`, {}, {
            headers: {
                Authorization: `Bearer ${API_SECRET_KEY}`,
            },
        });
        res.send(response.data);
    }
    catch(error){
        res.status(500).send({
            error: error,
        });
    }
})

router.post('/void-payment', async(req,res) => {
    if (!req.query.paymentId || !/^pay_[a-zA-Z0-9]+$/.test(req.query.paymentId)) {
        return res.status(400).send({ error: 'Invalid or missing paymentId' });
    }
    try{
        const response = await axios.post(`${process.env.GW_URL}/payments/${req.query.paymentId}/voids`,{}, {
            headers: {
                Authorization: `Bearer ${API_SECRET_KEY}`,
            },
        });
        res.send(response.data);
    }
    catch(error){
        res.status(500).send({
            error: error,
        });
    }
})

router.post('/refund-payment', async(req,res) => {
    if (!req.query.paymentId || !/^pay_[a-zA-Z0-9]+$/.test(req.query.paymentId)) {
        return res.status(400).send({ error: 'Invalid or missing paymentId' });
    }
    try{
        const response = await axios.post(`${process.env.GW_URL}/payments/${req.query.paymentId}/refunds`, {}, {
            headers: {
                Authorization: `Bearer ${API_SECRET_KEY}`,
            },
        });
        res.send(response.data);
    }
    catch(error){
        res.status(500).send({
            error: error,
        });
    }
})

router.post("/google-pay", async (req, res) => {
    const { signature, protocolVersion, signedMessage, currency, price } = req.body;
    if (!signature || !protocolVersion || !signedMessage) {
        return res.status(400).send({ error: 'Missing required Google Pay token fields' });
    }
    if (!req.body.amount || typeof req.body.amount !== 'number' || req.body.amount <= 0) {
        return res.status(400).send({ error: 'amount must be a positive number' });
    }
    try {
      const token = await cko.tokens.request({
        type: "googlepay",
        token_data: {
          signature,
          protocolVersion,
          signedMessage,
        },
      });
  
      log('info', '/google-pay', 'tokenization_outcome', { tokenType: token.type });
  
      const payment = await cko.payments.request({
        source: {
          type: "token",
          token: token.token,
        },
        amount: req.body.amount,
        currency : currency,
        reference: req.body.reference,
        customer:req.body.customer,
        '3ds':req.body['3ds'],
        capture: req.body.capture,
        processing_channel_id:req.body.processing_channel_id,
        success_url:req.body.success_url,
        failure_url:req.body.failure_url,
        payment_type:req.body.payment_type

      });
      res.send({
        payment: payment,
        token_info: {
       token: token,
        token_data: {
          signature,
          protocolVersion,
          signedMessage,
        }
        }
 
        });
    } catch (error) {
      log('error', '/google-pay', 'payment_error', { message: error.message });
      res.status(500).send({ error: error.message || 'Google Pay processing failed' });
    }
  });

  router.post("/validate-apple-session", async (req, res) => {
  const { appleUrl } = req.body;

  let httpsAgent, cert, key;

    cert = path.join(__dirname, "./certificates/certificate_sandbox-syed.pem");
    key = path.join(__dirname, "./certificates/certificate_sandbox-syed.key");


  httpsAgent = new https.Agent({
    rejectUnauthorized: false,
    cert:await fs.readFileSync(cert),
    key: await fs.readFileSync(key),
  });

  try {
    const response = await axios.post(
      appleUrl,
      {
        merchantIdentifier: config.appleMerchantId,
        domainName : `www.demo-syed.de`,
        displayName: "Syed Demo Store",
      },
      {
        httpsAgent,
      }
    );
    res.send(response.data);
  } catch (err) {
    log('error', '/validate-apple-session', 'session_error', { message: err.message });
    res.status(500).send({ error: err.message });
  }
});

router.post("/apple-pay", async (req, res) => {  
  const { version, data, signature, header } =
    req.body.details.token.paymentData;

  try {
    const token = await cko.tokens.request({
      token_data: {
        version: version,
        data: data,
        signature: signature,
        header: {
          ephemeralPublicKey: header.ephemeralPublicKey,
          publicKeyHash: header.publicKeyHash,
          transactionId: header.transactionId,
        },
      },
    });

    log('info', '/apple-pay', 'tokenization_outcome', { tokenType: token.type });

      const payment = await cko.payments.request({
        source: {
          type: "token",
          token: token.token,
        },
        amount: req.body.amount,
        currency : req.body.currency,
        reference: req.body.reference,
        customer:req.body.customer,
        '3ds':req.body['3ds'],
        capture: req.body.capture,
        processing_channel_id:req.body.processing_channel_id,
        success_url:req.body.success_url,
        failure_url:req.body.failure_url,
        payment_type:req.body.payment_type

      });

      let paymentAndTokenResponse = {
        paymentData : req.body.details.token.paymentData,
        token : token,
        payment: payment
      }
      log('info', '/apple-pay', 'payment_outcome', { paymentId: payment?.id, status: payment?.status });
      res.send(paymentAndTokenResponse);
  } catch (err) {
    res.status(500).send(err);
  }
});
  
router.post("/payments", async (req, res) => {
    try {
        const payment = await cko.payments.request({
            source: {
                type: "token",
                token: req.body.token,
            },
            amount:                req.body.amount,
            currency:              req.body.currency,
            reference:             req.body.reference || `#Order_${Math.floor(Math.random() * 10000)}`,
            customer:              req.body.customer,
            '3ds':                 req.body['3ds'],
            capture:               req.body.capture,
            processing_channel_id: req.body.processing_channel_id,
            success_url:           req.body.success_url,
            failure_url:           req.body.failure_url,
            payment_type:          req.body.payment_type,
        });
        res.send({ payment });
    } catch (error) {
        log('error', '/payments', 'payment_error', { message: error.message });
        res.status(500).send({ error: error.message || 'Payment processing failed' });
    }
});

  router.get("/config", (req, res) => {
    res.send(config);
  });



module.exports = router;