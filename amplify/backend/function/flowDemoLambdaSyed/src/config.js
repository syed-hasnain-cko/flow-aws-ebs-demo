require('dotenv').config();

var config = {
      isLive: false,
      pk: "pk_sbox_7za2ppcb4pw7zzdkfzutahfjl4t",
      sk: process.env.SECRET_KEY,
      processingChannelId: process.env.PROCESSING_CHANNEL_ID,
      currencyAccountId: process.env.CURRENCY_ACCOUNT_ID,
      appleMerchantId: "merchant.sandbox.syed",
      googleMerchantId: "12345678901234567890",
      subdomain: "ecommerce.eu",
      ngrokToken: "2ERWGFRtyksv6MRJ1YNGPHGLIip_57MPNvnh1BghDMpD4ZyjY",
      // Forward API — separate credentials so switching accounts for Forward testing
      // never touches the SECRET_KEY/PROCESSING_CHANNEL_ID used by every other tab.
      // Falls back to the main creds above if the FORWARD_* env vars aren't set.
      forwardSecretKey: process.env.FORWARD_SECRET_KEY || process.env.SECRET_KEY,
      forwardPublicKey: process.env.FORWARD_PUBLIC_KEY || "pk_sbox_7za2ppcb4pw7zzdkfzutahfjl4t",
      forwardProcessingChannelId: process.env.FORWARD_PROCESSING_CHANNEL_ID || process.env.PROCESSING_CHANNEL_ID,
      // Third-party destination credentials for the Forward API tab's built-in Stripe/Adyen
      // presets — never hardcoded in source. Empty string if unset; UI shows a placeholder
      // and lets you override per-destination (saved to localStorage, reset-to-default available).
      forwardStripeApiKey: process.env.FORWARD_STRIPE_API_KEY || "",
      forwardAdyenApiKey: process.env.FORWARD_ADYEN_API_KEY || "",

      stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || ""
  };
  
module.exports = config;