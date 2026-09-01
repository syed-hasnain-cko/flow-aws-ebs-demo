const axios = require('axios');
const router = require('express').Router();
const path = require('path');
const https = require('https');
require('dotenv').config()
const {Checkout} = require('checkout-sdk-node');
const config = require('./config');
const fs = require("fs");

const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");

const secretsManager = new SecretsManagerClient();

const cko = new Checkout(config.sk, { pk: config.pk, timeout: 10000 });

const API_SECRET_KEY = config.sk;

const webhookEventStore = new Map();

router.post('/payment-sessions', async (req, res) => {
  if (!req.body || !req.body.amount || !req.body.currency) {
      return res.status(400).send({ error: 'amount and currency are required' });
  }
  // overrideSecretKey lets the Forward API tab tokenize using its own configured
  // secret key instead of the global SECRET_KEY, without affecting any other tab.
  const { overrideSecretKey, ...sessionBody } = req.body;
  try {
      const response = await axios.post(`${process.env.GW_URL}/payment-sessions`, sessionBody, {
          headers: {
              Authorization: `Bearer ${overrideSecretKey || API_SECRET_KEY}`,
          },
      });
      res.send(response.data);
  } catch (error) {
      res.status(error.response?.status || 500).send(error.response?.data || { error: error.message });
  }

})

router.post('/payment-setups', async (req, res) => {
    try {
        const response = await axios.post(`${process.env.GW_URL}/payments/setups`, req.body, {
            headers: {
                Authorization: `Bearer ${API_SECRET_KEY}`,
                'Content-Type': 'application/json'
            },
        });
        res.send(response.data);
    } catch (error) {
        console.error("Payment Setup Error:", error.response ? error.response.data : error.message);
        res.status(500).send(error.response ? error.response.data : { error: "Internal Server Error" });
    } 
});

router.put('/update-payment-setups', async (req, res) => {
    try {
        const response = await axios.put(`${process.env.GW_URL}/payments/setups/${req.query.setupId}`, req.body, {
            headers: {
                Authorization: `Bearer ${API_SECRET_KEY}`,
                'Content-Type': 'application/json'
            },
        });
        res.send(response.data);
    } catch (error) {
        res.status(500).send(error.response ? error.response.data : error.message);
    }
});

router.post('/confirm-payment-setups', async (req, res) => {
    try {
        const response = await axios.post(
            `${process.env.GW_URL}/payments/setups/${req.query.setupId}/confirm/${req.query.methodName}`, {},
            { headers: { Authorization: `Bearer ${API_SECRET_KEY}` } }
        );
        res.send(response.data);
    } catch (error) {
        res.status(500).send(error.response?.data || error.message);
    }
});

router.get('/get-payment-setup', async (req, res) => {
  try {
      const response = await axios.get(
          `${process.env.GW_URL}/payments/setups/${req.query.setupId}`, 
          { headers: { Authorization: `Bearer ${API_SECRET_KEY}` } }
      );
      res.send(response.data);
  } catch (error) {
      res.status(500).send(error.response?.data || error.message);
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
        res.status(500).send({ error: error.response?.data || error.message });
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
        res.status(500).send({ error: error.response?.data || error.message });
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
        res.status(500).send({ error: error.response?.data || error.message });
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
        res.status(500).send({ error: error.response?.data || error.message });
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
        res.status(500).send({ error: error.response?.data || error.message });
    }
})

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
      console.log(error);
      res.status(500).send({ error: error.message || 'Google Pay processing failed' });
    }
  });

router.post("/validate-apple-session", async (req, res) => {
   
 let requestBody = req.body;
 console.log("RequestBody", requestBody)
  if (!requestBody || Object.keys(requestBody).length === 0) {
    if (req.apiGateway && req.apiGateway.event && req.apiGateway.event.body) {
      try {
        requestBody = JSON.parse(req.apiGateway.event.body);
      } catch (e) {
        console.error("Failed to parse API Gateway event body:", e);
        return res.status(400).send({ error: "Invalid JSON in request body from API Gateway" });
      }
    }
  }



  const { appleUrl } = requestBody;
  console.log(appleUrl)

   if (!appleUrl || typeof appleUrl !== 'string' || !appleUrl.startsWith('https://')) {
    return res.status(400).send({ error: "Invalid or missing appleUrl" });
  }

  let applePayCertName = process.env.APPLE_PAY_SYED_CERT_SECRET_NAME;
  let applePayKeyName = process.env.APPLE_PAY_SYED_KEY_SECRET_NAME;

  try {
    const certSecret = await secretsManager.send(
      new GetSecretValueCommand({
        SecretId: applePayCertName,
      })
    );
    const keySecret = await secretsManager.send(
      new GetSecretValueCommand({
        SecretId: applePayKeyName,
      })
    );
    const cert = certSecret.SecretString;
    const key = keySecret.SecretString;

  const postData = JSON.stringify({
      merchantIdentifier: config.appleMerchantId,
      domainName: process.env.DOMAIN_NAME,
      displayName: process.env.DISPLAY_NAME,
    });
    
    // Calculate content length (REQUIRED for POST requests to Apple)
    const postDataLength = Buffer.byteLength(postData, 'utf8');

    const url = new URL(appleUrl);
    
    // 💡 Use explicit hostname and path from the URL object
    const requestOptions = {
      hostname: url.hostname, 
      port: 443, 
      path: url.pathname,
      method: "POST",
      
      cert: cert, 
      key: key,
      
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postDataLength 
      },
    };

    const appleReq = https.request(requestOptions, (appleRes) => {
      let data = '';
      appleRes.on('data', (chunk) => {
        data += chunk;
      });
      appleRes.on('end', () => {
        // Apple's merchant validation endpoint returns plain text/HTML (not JSON)
        // on cert/domain/merchantId mismatches — log the raw body + status so the
        // actual reason is visible instead of a generic "failed to parse" 500.
        console.log("Apple merchant validation response:", appleRes.statusCode, data);
        try {
          res.status(appleRes.statusCode).send(JSON.parse(data));
        } catch (parseError) {
          res.status(appleRes.statusCode || 500).send({
            error: "Apple's merchant validation response was not valid JSON",
            appleStatusCode: appleRes.statusCode,
            appleResponseBody: data
          });
        }
      });
    });

    appleReq.on('error', (e) => {
      console.error(e);
      res.status(400).send({ error: e.message });
    });

    appleReq.write(postData);
    appleReq.end();

  } catch (err) {
    console.log(err);
    res.status(400).send({ error: err.message });
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

      let paymentAndTokenResponse = {
        paymentData : req.body.details.token.paymentData,
        token : token,
        payment: payment
      }
      res.send(paymentAndTokenResponse);
      console.log("Apple Pay payment outcome", payment);
  } catch (err) {
    res.status(500).send({ error: err.message || 'Apple Pay processing failed' });
  }
});




router.post("/submit-payment-session", async (req, res) => {
  
  const paymentSessionId = req.body.paymentSessionId;
  const flowSubmitData = req.body.sessionData;
  const items = req.body.items
  const threeds = req.body['3ds']


  const sessionReq = {
      amount : req.body.amount,
      session_data: flowSubmitData?.session_data,
      items: items,
      "3ds": threeds,
      payment_type: req.body.payment_type,
      // Forwarded when set (e.g. Alma requires capture:true — no manual-capture support)
      capture: req.body.capture
  };
  
  
  if (!paymentSessionId || !sessionReq.session_data) {
      return res.status(400).send({ error: "Missing required data in request." });
  }

  try {
      const response = await axios.post(
          `${process.env.GW_URL}/payment-sessions/${paymentSessionId}/submit`,
          sessionReq,
          {
              headers: {
                  Authorization: `Bearer ${API_SECRET_KEY}`,
              },
          }
      );
      res.send(response.data);
  } catch (error) {
      // Flow's handleSubmit contract requires the unmodified CKO response body
      // back (per SubmitPaymentSession docs) so it can recognize a submit error
      // and call onError / stop the "Verifying Transaction" state. Wrapping this
      // in { error: ... } with a hardcoded 500 broke that contract — Flow just
      // hung indefinitely instead of surfacing the real payment_flow_invalid /
      // declined reason.
      res.status(error.response?.status || 500).send(
          error.response?.data || { message: "An unknown error occurred during payment submission." }
      );
  }
});
  
  router.get("/config", (req, res) => {
    res.send({
        pk: config.pk,
        isLive: config.isLive,
        appleMerchantId: config.appleMerchantId,
        googleMerchantId: config.googleMerchantId,
        processingChannelId: config.processingChannelId
    });
  });

  router.post('/webhook', (req, res) => {
    if (req.headers['authorization'] !== process.env.WEBHOOK_SECRET) {
        return res.sendStatus(401);
    }

    const event = req.body;
    const paymentId = event?.data?.id;

    if (paymentId) {
        webhookEventStore.set(paymentId, {
            type: event.type,
            data: event.data,
            receivedAt: Date.now()
        });
        console.log(`Webhook stored: type=${event.type}, paymentId=${paymentId}`);
    }

    res.sendStatus(200);
});

router.get('/webhook-event', (req, res) => {
    const { paymentId } = req.query;

    if (!paymentId) {
        return res.status(400).send({ error: 'paymentId query param is required' });
    }

    const event = webhookEventStore.get(paymentId);

    if (!event) {
        return res.status(404).send({ found: false });
    }

    webhookEventStore.delete(paymentId);
    res.send({ found: true, ...event });
});

router.post('/card-metadata', async (req, res) => {
  try {
      const response = await axios.post(
          `${process.env.GW_URL}/metadata/card`,
          req.body,
          {
              headers: {
                  Authorization:  `Bearer ${API_SECRET_KEY}`,
                  'Content-Type': 'application/json',
              },
          }
      );
      return res.status(response.status).json(response.data);
  } catch (error) {
      return res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

router.post('/payouts', async (req, res) => {
  try {
      if (!req.body || !req.body.amount || !req.body.currency || !req.body.destination) {
          return res.status(400).json({ error: 'amount, currency, and destination are required' });
      }

      const configState = {
          currencyAccountId:   config.currencyAccountId   || 'MISSING',
          processingChannelId: config.processingChannelId || 'MISSING',
          gwUrl:               process.env.GW_URL          || 'MISSING',
      };
      console.log('[/payouts] config state:', JSON.stringify(configState));

      if (!config.currencyAccountId) {
          return res.status(400).json({ error: 'CURRENCY_ACCOUNT_ID not set in Lambda env vars', configState });
      }
      if (!config.processingChannelId) {
          return res.status(400).json({ error: 'PROCESSING_CHANNEL_ID not set in Lambda env vars', configState });
      }

      const payoutBody = {
          ...req.body,
          source: {
              type: 'currency_account',
              id:   config.currencyAccountId,
          },
          processing_channel_id: config.processingChannelId,
      };

      console.log('[/payouts] sending to CKO:', JSON.stringify({
          amount:   payoutBody.amount,
          currency: payoutBody.currency,
          sourceId: payoutBody.source.id,
          processingChannelId: payoutBody.processing_channel_id,
          destType: payoutBody.destination?.type,
      }));

      const response = await axios.post(`${process.env.GW_URL}/payments`, payoutBody, {
          headers: {
              Authorization:  `Bearer ${API_SECRET_KEY}`,
              'Content-Type': 'application/json',
          },
      });

      console.log('[/payouts] CKO response status:', response.status);
      return res.status(response.status).json(response.data);

  } catch (error) {
      const errPayload = {
          error:   error.message,
          ckoData: error.response?.data || null,
          status:  error.response?.status || null,
      };
      console.error('[/payouts] error:', JSON.stringify(errPayload));
      return res.status(error.response?.status || 500).json(errPayload);
  }
});
router.get('/forward-config', (_req, res) => {
  res.send({
      publicKey: config.forwardPublicKey,
      processingChannelId: config.forwardProcessingChannelId,
      // Secret key is intentionally returned so the UI can pre-fill an editable
      // field for this already-sandboxed test suite. It is only ever used for
      // Forward API calls and stored client-side in localStorage, never in code.
      secretKey: config.forwardSecretKey,
      // Default auth for the built-in Stripe/Adyen destinations — sourced from env,
      // never hardcoded. Empty string if unset; UI falls back to a placeholder.
      stripeApiKey: config.forwardStripeApiKey,
      adyenApiKey: config.forwardAdyenApiKey,
  });
});

router.post('/forward-request', async (req, res) => {
  const { overrideSecretKey, ...forwardBody } = req.body || {};
  if (!forwardBody || !forwardBody.source || !forwardBody.destination_request) {
      return res.status(400).json({ error: 'source and destination_request are required' });
  }
  try {
      const response = await axios.post(`${process.env.GW_URL}/forward`, forwardBody, {
          headers: {
              Authorization: `Bearer ${overrideSecretKey || config.forwardSecretKey}`,
              'Content-Type': 'application/json',
          },
      });
      return res.status(response.status).json(response.data);
  } catch (error) {
      log('error', '/forward-request', 'forward_error', { message: error.response ? JSON.stringify(error.response.data) : error.message });
      return res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

router.get('/forward-request', async (req, res) => {
  const { id, overrideSecretKey } = req.query;
  if (!id) {
      return res.status(400).json({ error: 'id query param is required' });
  }
  try {
      const response = await axios.get(`${process.env.GW_URL}/forward/${id}`, {
          headers: { Authorization: `Bearer ${overrideSecretKey || config.forwardSecretKey}` },
      });
      return res.status(response.status).json(response.data);
  } catch (error) {
      return res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

router.get('/forward-customer-instruments', async (req, res) => {
  const { customerId, overrideSecretKey } = req.query;
  if (!customerId) {
      return res.status(400).json({ error: 'customerId query param is required' });
  }
  const secretKey = overrideSecretKey || config.forwardSecretKey;
  try {
      const customerRes = await axios.get(`${process.env.GW_URL}/customers/${customerId}`, {
          headers: { Authorization: `Bearer ${secretKey}` },
      });
      const instrumentRefs = customerRes.data?.instruments || [];

      const instruments = await Promise.all(instrumentRefs.map(async (ref) => {
          try {
              const instRes = await axios.get(`${process.env.GW_URL}/instruments/${ref.id}`, {
                  headers: { Authorization: `Bearer ${secretKey}` },
              });
              return instRes.data;
          } catch (e) {
              return { id: ref.id, type: ref.type, error: 'Failed to load instrument details' };
          }
      }));

      return res.json({ customerId, instruments });
  } catch (error) {
      return res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

router.get('/forward-jwks', async (_req, res) => {
  try {
      const response = await axios.get('https://forward.sandbox.checkout.com/.well-known/jwks');
      return res.status(response.status).json(response.data);
  } catch (error) {
      return res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

router.post("/payments", async (req, res) => {
  try {
      const payment = await cko.payments.request({
          source: {
              type: "token",
              token: req.body.source.token,
          },
          amount:                req.body.amount,
          capture: req.body.capture,
          currency:              req.body.currency,
          reference:             req.body.reference || `#Order_${Math.floor(Math.random() * 10000)}`,
          processing_channel_id: req.body.processing_channel_id,
          success_url:           req.body.success_url,
          failure_url:           req.body.failure_url,
          payment_type:          req.body.payment_type,
      });
      res.send({ payment });
  } catch (error) {
      console.log(error);
      res.status(500).send({ error: error.message || 'Payment processing failed' });
  }
});

router.use('/competitors/stripe', require('./competitors/stripe-routes'));


module.exports = router;