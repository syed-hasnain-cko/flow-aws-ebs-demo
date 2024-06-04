require('dotenv').config();

var config = {
      isLive: false,
      pk: "pk_sbox_7za2ppcb4pw7zzdkfzutahfjl4t", 
      sk: process.env.SECRET_KEY,
      appleMerchantId: "merchant.sandbox.syed", 
      googleMerchantId: "12345678901234567890",
  };
  
module.exports = config;