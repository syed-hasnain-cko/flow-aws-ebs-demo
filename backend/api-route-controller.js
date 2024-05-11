const axios = require('axios');
const router = require('express').Router()

const SECREY_KEY = 'Bearer ***REMOVED-SECRET-2***'
router.post('/payment-sessions', async (req, res) => {

    try {
        const response = await axios.post(`https://api.sandbox.checkout.com/payment-sessions`, req.body, {
            headers: {
                Authorization: SECREY_KEY,
            },
        });
        res.send(response.data);
    } catch (error) {
        res.status(500).send({
            error: error,
        });
    } 

})

module.exports = router;