// =============================================
// Disputes Testing Routes
// Mounted at /disputes via router.use() in api-route-controller.js.
//
// Disputes aren't created directly — Checkout.com's sandbox generates a test
// dispute when a payment is made with a specific amount + card expiry combo
// (see /developer-resources/testing/disputes-testing docs). So this file has
// one extra route (create-test-payment) on top of the real Disputes API
// proxy routes, purely to make that trigger payment easy from the UI.
//
// The Disputes API isn't covered by the checkout-sdk-node client already
// used elsewhere in this file for payments, so these routes call it directly
// via axios + GW_URL, the same pattern already used for /payment-setups.
// =============================================

const axios = require('axios');
const router = require('express').Router();
const config = require('../config');
const { Checkout } = require('checkout-sdk-node');

const cko = new Checkout(config.sk, { pk: config.pk, timeout: 10000 });
const API_SECRET_KEY = config.sk;

function ckoHeaders() {
  return { Authorization: `Bearer ${API_SECRET_KEY}` };
}

// Creates the payment that triggers a sandbox test dispute. Uses a raw card
// source (not a token) because the exact card number + expiry + amount combo
// is what Checkout.com's sandbox matches against — this mirrors CKO's own
// documented dispute-testing request shape exactly.
router.post('/create-test-payment', async (req, res) => {
  try {
    const { number, expiry_month, expiry_year, cvv, name } = req.body.source || {};
    if (!number || !expiry_month || !expiry_year || !req.body.amount || !req.body.currency) {
      return res.status(400).json({ error: 'source.number, source.expiry_month, source.expiry_year, amount and currency are required' });
    }
    const payment = await cko.payments.request({
      source: {
        type: 'card',
        number,
        expiry_month,
        expiry_year,
        cvv,
        name,
      },
      amount: req.body.amount,
      currency: req.body.currency,
      reference: req.body.reference || `#Dispute_Test_${Math.floor(Math.random() * 10000)}`,
      capture: true,
      processing_channel_id: config.processingChannelId,
    });
    res.json({ payment });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || 'Test payment for dispute simulation failed' });
  }
});

// GET /disputes — list, forwards all query params (payment_id, statuses, etc.)
router.get('/', async (req, res) => {
  try {
    const response = await axios.get(`${process.env.GW_URL}/disputes`, {
      headers: ckoHeaders(),
      params: req.query,
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// GET /disputes/:id
router.get('/:id', async (req, res) => {
  try {
    const response = await axios.get(`${process.env.GW_URL}/disputes/${req.params.id}`, {
      headers: ckoHeaders(),
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// POST /disputes/:id/accept
router.post('/:id/accept', async (req, res) => {
  try {
    const response = await axios.post(`${process.env.GW_URL}/disputes/${req.params.id}/accept`, {}, {
      headers: ckoHeaders(),
    });
    res.status(response.status).json(response.data || {});
  } catch (error) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// PUT /disputes/:id/evidence — attaches text-only evidence (no file upload
// in this first pass; CKO's *_text fields explicitly support a plain
// description or an externally-hosted link in place of a file).
router.put('/:id/evidence', async (req, res) => {
  try {
    const response = await axios.put(`${process.env.GW_URL}/disputes/${req.params.id}/evidence`, req.body, {
      headers: { ...ckoHeaders(), 'Content-Type': 'application/json' },
    });
    res.status(response.status).json(response.data || {});
  } catch (error) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// GET /disputes/:id/evidence — read back what's currently attached
router.get('/:id/evidence', async (req, res) => {
  try {
    const response = await axios.get(`${process.env.GW_URL}/disputes/${req.params.id}/evidence`, {
      headers: ckoHeaders(),
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// POST /disputes/:id/evidence/submit — final, irreversible submission.
// Named differently from CKO's own POST /disputes/{id}/evidence (which this
// calls) to avoid colliding with the PUT route above at the same path.
router.post('/:id/evidence/submit', async (req, res) => {
  try {
    const response = await axios.post(`${process.env.GW_URL}/disputes/${req.params.id}/evidence`, {}, {
      headers: ckoHeaders(),
    });
    res.status(response.status).json(response.data || {});
  } catch (error) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

module.exports = router;
