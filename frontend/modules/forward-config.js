// =============================================
// Forward API — Config Data
// Built-in destinations + placeholder reference table.
// Adding a new built-in destination = add one object here.
// =============================================

// Built-in destinations shown in the "Choose saved" picker.
// Selecting one fills url/method/headers/body into the form.
// `key` must be stable — used to detect which preset (if any) is active.
const FORWARD_BUILTIN_DESTINATIONS = [
    {
        key: 'checkout',
        label: 'Checkout.com',
        color: '#0CD395',
        url: 'https://api.sandbox.checkout.com/payments',
        method: 'POST',
        headersType: 'raw',
        // autoAuth: this destination IS Checkout.com, so unless the user sets a manual
        // auth override, forward.js fills the Authorization header from the live
        // Forward API Config secret key (and the body's processing_channel_id from
        // the live Forward API Config channel ID) instead of a placeholder.
        autoAuth: 'forwardConfigSecretKey',
        autoChannelId: true,
        headers: [
            { key: 'Authorization', value: 'Bearer sk_sbox_xxxxxxxxxxxxxxxxxxxxxxxxxxx' },
            { key: 'Content-Type', value: 'application/json' },
        ],
        // Demo query param + variable (per the Forward API docs: a variable's value can
        // itself contain placeholders, then be referenced elsewhere via {{variable_name}}).
        // metadata.card_data below references the card_data variable defined here.
        query: [{ name: 'source', value: 'forward-api-demo' }],
        // Plain string value (not a JSON object) — Forward API does a literal text
        // substitution when resolving {{card_data}} in the body below, so if the
        // variable's own value contained embedded quotes/braces it would break the
        // surrounding JSON. Keep variable values that are referenced inside quotes
        // as plain strings.
        // No spaces/slashes — this value is used raw inside both a JSON string (Checkout/Adyen)
        // and a form-urlencoded field (Stripe), so it must be safe unescaped in either context.
        variables: [{ name: 'card_data', value: '{{card_number}}-{{card_expiry_month}}{{card_expiry_year_yy}}' }],
        body: JSON.stringify({
            source: {
                type: 'card',
                number: '{{card_number}}',
                expiry_month: '{{card_expiry_month}}',
                expiry_year: '{{card_expiry_year_yyyy}}',
            },
            amount: 200,
            currency: 'CHF',
            capture: true,
            processing_channel_id: 'pc_xxxxxxxxxxxxxxxxxxxxxxxxxx',
            metadata: { card_data: '{{card_data}}' },
        }, null, 2),
    },
    {
        key: 'stripe',
        label: 'Stripe',
        color: '#635BFF',
        url: 'https://api.stripe.com/v1/payment_methods',
        method: 'POST',
        headersType: 'raw',
        // autoAuth: Authorization is filled from FORWARD_STRIPE_API_KEY (.env), never
        // hardcoded here. Override per-destination via the 🔑 editor if needed; "Reset
        // to auto" restores this env-sourced default.
        autoAuth: 'forwardConfigStripeKey',
        headers: [
            { key: 'Authorization', value: 'Bearer sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxx' },
            { key: 'Content-Type', value: 'application/x-www-form-urlencoded' },
            { key: 'Host', value: 'api.stripe.com' },
        ],
        query: [{ name: 'source', value: 'forward-api-demo' }],
        // Plain string value (not a JSON object) — Forward API does a literal text
        // substitution when resolving {{card_data}} in the body below, so if the
        // variable's own value contained embedded quotes/braces it would break the
        // surrounding JSON. Keep variable values that are referenced inside quotes
        // as plain strings.
        // No spaces/slashes — this value is used raw inside both a JSON string (Checkout/Adyen)
        // and a form-urlencoded field (Stripe), so it must be safe unescaped in either context.
        variables: [{ name: 'card_data', value: '{{card_number}}-{{card_expiry_month}}{{card_expiry_year_yy}}' }],
        // metadata[card_data] references the card_data variable defined above.
        body: 'type=card&card[number]={{card_number}}&card[exp_month]={{card_expiry_month}}&card[exp_year]={{card_expiry_year_yyyy}}&card[cvc]={{card_cvv}}&metadata[card_data]={{card_data}}',
    },
    {
        key: 'adyen',
        label: 'Adyen',
        color: '#0ABF53',
        url: 'https://checkout-test.adyen.com/v71/payments',
        method: 'POST',
        headersType: 'raw',
        // Adyen authenticates via the X-API-KEY header, not Authorization — the
        // auth override editor (🔑) reads this so it edits the right header.
        authHeaderName: 'X-API-KEY',
        // autoAuth: X-API-KEY is filled from FORWARD_ADYEN_API_KEY (.env), never
        // hardcoded here. Override per-destination via the 🔑 editor if needed; "Reset
        // to auto" restores this env-sourced default.
        autoAuth: 'forwardConfigAdyenKey',
        headers: [
            { key: 'Content-Type', value: 'application/json' },
            { key: 'X-API-KEY', value: '<set Adyen API Key in Forward API Config>' },
        ],
        query: [{ name: 'source', value: 'forward-api-demo' }],
        // Plain string value (not a JSON object) — Forward API does a literal text
        // substitution when resolving {{card_data}} in the body below, so if the
        // variable's own value contained embedded quotes/braces it would break the
        // surrounding JSON. Keep variable values that are referenced inside quotes
        // as plain strings.
        // No spaces/slashes — this value is used raw inside both a JSON string (Checkout/Adyen)
        // and a form-urlencoded field (Stripe), so it must be safe unescaped in either context.
        variables: [{ name: 'card_data', value: '{{card_number}}-{{card_expiry_month}}{{card_expiry_year_yy}}' }],
        body: JSON.stringify({
            amount: { currency: 'EUR', value: 10 },
            paymentMethod: {
                type: 'scheme',
                encryptedCardNumber: 'test_{{card_number}}',
                encryptedExpiryMonth: 'test_{{card_expiry_month}}',
                encryptedExpiryYear: 'test_{{card_expiry_year_yyyy}}',
                encryptedSecurityCode: 'test_737',
            },
            reference: 'my_reference',
            merchantAccount: 'PrizeTechnologyECOM',
            returnUrl: 'https://httpstat.us/',
            metadata: { card_data: '{{card_data}}' },
        }, null, 2),
    },
];

// Placeholder reference table — mirrors the Checkout.com "Forward stored credentials" docs.
// Click-to-insert chips in the UI read from this.
const FORWARD_PLACEHOLDERS = {
    card: {
        label: 'Card details',
        values: [
            { tag: '{{card_cvv}}', desc: "The card verification value (security code)." },
            { tag: '{{card_expiry_month}}', desc: "Expiry month, no leading zero. Format M." },
            { tag: '{{card_expiry_month_mm}}', desc: "Expiry month, with leading zero. Format MM." },
            { tag: '{{card_expiry_year_yy}}', desc: "Expiry year. Format YY." },
            { tag: '{{card_expiry_year_yyyy}}', desc: "Expiry year. Format YYYY." },
            { tag: '{{card_number}}', desc: "The full card number." },
            { tag: '{{card_pin}}', desc: "The first two digits of the card's PIN." },
            { tag: '{{cardholder_name}}', desc: "The cardholder's name as shown on the card." },
        ],
    },
    billing: {
        label: 'Billing information',
        values: [
            { tag: '{{billing_address_city}}', desc: "The city of the billing address." },
            { tag: '{{billing_address_country}}', desc: "The country of the billing address." },
            { tag: '{{billing_address_line1}}', desc: "The first line of the billing address." },
            { tag: '{{billing_address_line2}}', desc: "The second line of the billing address." },
            { tag: '{{billing_address_state}}', desc: "The state of the billing address." },
            { tag: '{{billing_address_zip}}', desc: "The ZIP code or post code of the billing address." },
        ],
    },
    networkToken: {
        label: 'Network token details',
        values: [
            { tag: '{{network_token_number}}', desc: "The network token number from the card scheme." },
            { tag: '{{network_token_type}}', desc: "mdes (Mastercard) or vts (Visa)." },
            { tag: '{{network_token_cryptogram}}', desc: "The token authentication verification value (TAVV / one-time cryptogram)." },
            { tag: '{{network_token_eci}}', desc: "The Electronic Commerce Indicator (ECI) received from the issuer." },
            { tag: '{{network_token_expiry_year_yy}}', desc: "Network token expiry year. Format YY." },
            { tag: '{{network_token_expiry_year_yyyy}}', desc: "Network token expiry year. Format YYYY." },
            { tag: '{{network_token_expiry_month}}', desc: "Network token expiry month. Format MM." },
        ],
    },
    wallet: {
        label: 'Digital wallet details',
        values: [
            { tag: '{{is_wallet}}', desc: "Boolean — whether the card came from a digital wallet (Apple Pay/Google Pay)." },
            { tag: '{{wallet_type}}', desc: "applepay or googlepay." },
            { tag: '{{wallet_token_format}}', desc: "cryptogram_3ds or pan_only." },
            { tag: '{{wallet_cryptogram}}', desc: "The wallet cryptogram. Required for CIT transactions." },
            { tag: '{{wallet_eci}}', desc: "The electronic commerce indicator (ECI) for the transaction." },
        ],
    },
};
