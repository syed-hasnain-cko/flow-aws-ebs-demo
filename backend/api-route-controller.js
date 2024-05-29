const axios = require('axios');
const router = require('express').Router();
const path = require('path');
require('dotenv').config()

const API_SECRET_KEY = process.env.SECRET_KEY;
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
        const response = await axios.post(`${process.env.GW_URL}/payments/${req.query.params}`, {
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

router.get("/.well-known/apple-developer-merchantid-domain-association.txt", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/apple-developer-merchantid-domain-association.txt"));
  });
  

module.exports = router;