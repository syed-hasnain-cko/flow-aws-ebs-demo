const axios = require('axios');
const router = require('express').Router();
const path = require('path');
const https = require('https');
require('dotenv').config()
const {Checkout} = require('checkout-sdk-node');
const config = require('../config');
const fs = require("fs");

const cko = new Checkout(config.sk, { pk: config.pk, timeout: 10000 });

const API_SECRET_KEY = config.sk;

router.post('/payment-sessions', async (req, res) => {

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

router.get("/.well-known/apple-developer-merchantid-domain-association.txt", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/apple-developer-merchantid-domain-association.txt"));
});

router.get("/.well-known/apple-developer-merchantid-domain-association.txt", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/apple-developer-merchantid-domain-association-dev.txt"));
});

router.post("/google-pay", async (req, res) => {
    const { signature, protocolVersion, signedMessage, currency, price } =
      req.body;
    try {
      const token = await cko.tokens.request({
        type: "googlepay",
        token_data: {
          signature,
          protocolVersion,
          signedMessage,
        },
      });
  
      console.log("Google Pay tokenization outcome", token);
  
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
      res.send(payment);
    } catch (error) {
      console.log(error);
      res.sendStatus(500)(error);
    }
  });

  router.post("/validate-apple-session", async (req, res) => {
  const { appleUrl } = req.body;

  let httpsAgent, cert, key;

    cert = path.join(__dirname, "/certificates/certificate_sandbox-syed.pem");
    key = path.join(__dirname, "/certificates/certificate_sandbox-syed.key");


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
    console.log(err);
    
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

    console.log("Apple Pay tokenization outcome", token);

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
      res.send(payment);
      console.log("Apple Pay payment outcome", payment);
  } catch (err) {
    res.status(500).send(err);
  }
});
  
  router.get("/config", (req, res) => {
    res.send(config);
  });



module.exports = router;