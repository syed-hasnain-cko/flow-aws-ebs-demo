require('dotenv').config();

var config = {
      isLive: false,
      pk: "pk_sbox_7za2ppcb4pw7zzdkfzutahfjl4t",
      sk: process.env.SECRET_KEY,
      processingChannelId: process.env.PROCESSING_CHANNEL_ID,
      currencyAccountId: process.env.CURRENCY_ACCOUNT_ID,
      apiBaseUrl: process.env.API_BASE_URL,
      appleMerchantId: "merchant.sandbox.syed",
      googleMerchantId: "12345678901234567890",
      subdomain: "ecommerce.eu",
      ngrokToken: "2ERWGFRtyksv6MRJ1YNGPHGLIip_57MPNvnh1BghDMpD4ZyjY",
      // Forward API — separate credentials so switching accounts for Forward testing
      // never touches the SECRET_KEY/PROCESSING_CHANNEL_ID used by every other tab.
      forwardSecretKey: process.env.FORWARD_SECRET_KEY || process.env.SECRET_KEY,
      forwardPublicKey: process.env.FORWARD_PUBLIC_KEY || "pk_sbox_7za2ppcb4pw7zzdkfzutahfjl4t",
      forwardProcessingChannelId: process.env.FORWARD_PROCESSING_CHANNEL_ID || process.env.PROCESSING_CHANNEL_ID,
      forwardStripeApiKey: process.env.FORWARD_STRIPE_API_KEY || "",
      forwardAdyenApiKey: process.env.FORWARD_ADYEN_API_KEY || ""
  };
  
module.exports = config;