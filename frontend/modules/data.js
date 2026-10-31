// =============================================
// Shared Data: Currencies & Countries
// =============================================

const CURRENCIES = [
  { iso4217: 'AED', base: 100 },
  { iso4217: 'ARS', base: 100 },
  { iso4217: 'AUD', base: 100 },
  { iso4217: 'BHD', base: 1000 },
  { iso4217: 'BRL', base: 100 },
  { iso4217: 'CHF', base: 100 },
  { iso4217: 'CNY', base: 100 },
  { iso4217: 'COP', base: 100 },
  { iso4217: 'EGP', base: 100 },
  { iso4217: 'EUR', base: 100 },
  { iso4217: 'GBP', base: 100 },
  { iso4217: 'HKD', base: 100 },
  { iso4217: 'KWD', base: 1000 },
  { iso4217: 'MXN', base: 100 },
  { iso4217: 'NOK', base: 100 },
  { iso4217: 'NZD', base: 100 },
  { iso4217: 'PLN', base: 100 },
  { iso4217: 'QAR', base: 100 },
  { iso4217: 'SEK', base: 100 },
  { iso4217: 'SGD', base: 100 },
  { iso4217: 'SAR', base: 100 },
  { iso4217: 'USD', base: 100 },
  {iso4217: 'KRW', base: 100 },
];

// Payout funds transfer types — scheme-specific codes assigned by Checkout.com.
// These are PLACEHOLDER values. Replace with your actual assigned FTT codes
// for Visa and Mastercard in your sandbox/production account.
const PAYOUT_FUNDS_TRANSFER_TYPES = {
    visa: [
        { value: 'AA',  label: 'AA — Account-to-Account' },
        { value: 'PP',  label: 'PP — Person-to-Person (Visa Direct)' },
        { value: 'FT',  label: 'FT — Funds Transfer' },
        { value: 'WT',  label: 'WT - Staged Digital Wallet (SDW) transfer' },
        { value: 'TU',  label: 'TU - Prepaid Card Load / Top Up' },
        { value: 'FD',  label: 'FD — Fund disbursement' },
        { value: 'PD',  label: 'PD — Payroll disbursement' },
    ],
    mastercard: [
        { value: 'C55',  label: 'C55 — Business Disbursement' },
        { value: 'C07', label: 'C07 — Person-to-Person' },
        { value: 'C52', label: 'C52 — AA — Account-to-Account' },
        { value: 'C65',  label: 'C65 - B2B Transfers' },
    ]
};

const COUNTRIES = [
  { name: 'Germany', alpha2Code: 'DE' },
  { name: 'United Kingdom', alpha2Code: 'GB' },
  { name: 'United States', alpha2Code: 'US' },
  { name: 'France', alpha2Code: 'FR' },
  { name: 'Italy', alpha2Code: 'IT' },
  { name: 'Spain', alpha2Code: 'ES' },
  { name: 'Netherlands', alpha2Code: 'NL' },
  { name: 'Belgium', alpha2Code: 'BE' },
  { name: 'Switzerland', alpha2Code: 'CH' },
  { name: 'Austria', alpha2Code: 'AT' },
  { name: 'Finland', alpha2Code: 'FI' },
  { name: 'Czech Republic', alpha2Code: 'CZ' },
  { name: 'Estonia', alpha2Code: 'EE' },
  { name: 'Denmark', alpha2Code: 'DK' },
  { name: 'Poland', alpha2Code: 'PL' },
  { name: 'Portugal', alpha2Code: 'PT' },
  { name: 'Sweden', alpha2Code: 'SE' },
  { name: 'Norway', alpha2Code: 'NO' },
  { name: 'Hungary', alpha2Code: 'HU' },
  { name: 'Kuwait', alpha2Code: 'KW' },
  { name: 'Qatar', alpha2Code: 'QA' },
  { name: 'Bahrain', alpha2Code: 'BH' },
  { name: 'New Zealand', alpha2Code: 'NZ' },
  { name: 'Egypt', alpha2Code: 'EG' },
  { name: 'Brazil', alpha2Code: 'BR' },
  { name: 'Hong Kong', alpha2Code: 'HK' },
  { name: 'Australia', alpha2Code: 'AU' },
  { name: 'United Arab Emirates', alpha2Code: 'AE' },
  { name: 'Greece', alpha2Code: 'GR' },
];

// Payout test cards — grouped by response code, per scheme.
// CVV: 100 for all. Expiry: any future date (use 12/28).
const PAYOUT_TEST_CARDS = {
    visa: [
        { responseCode: '10000', label: 'Approved — Happy Flow', cards: [
            { number: '4921817844445119', country: 'GB' },
            { number: '4978313915783283', country: 'FR' },
            { number: '4076613139850359', country: 'SG' },
            { number: '4024764449971519', country: 'US' },
        ]},
        { responseCode: '20005', label: 'Declined — Do Not Honour', cards: [
            { number: '4818192525595285', country: 'GB' },
            { number: '4558473893020179', country: 'FR' },
            { number: '4811553373235190', country: 'SG' },
            { number: '4610179846730147', country: 'US' },
        ]},
        { responseCode: '20057', label: 'Declined — Transaction Not Permitted', cards: [
            { number: '4818192160565981', country: 'GB' },
            { number: '4975992266555193', country: 'FR' },
            { number: '4815649658513826', country: 'SG' },
            { number: '4610174464118832', country: 'US' },
        ]},
    ],
    mastercard: [
        { responseCode: '10000', label: 'Approved — Happy Flow', cards: [
            { number: '5355224968521878', country: 'GB' },
            { number: '5132728491870081', country: 'FR' },
            { number: '5526303170157160', country: 'SG' },
            { number: '5318773012490080', country: 'US' },
        ]},
        { responseCode: '20005', label: 'Declined — Do Not Honour', cards: [
            { number: '5574357535453624', country: 'GB' },
            { number: '5132724072801678', country: 'FR' },
            { number: '5274926611111018', country: 'SG' },
            { number: '5109110000000030', country: 'US' },
        ]},
        { responseCode: '20057', label: 'Declined — Transaction Not Permitted', cards: [
            { number: '5355224739676852', country: 'GB' },
            { number: '5136406072992030', country: 'FR' },
            { number: '5274926611111026', country: 'SG' },
            { number: '5109119931560251', country: 'US' },
        ]},
    ],
};

// Bank payout test accounts — success and declined scenarios.
const BANK_PAYOUT_TEST_ACCOUNTS = {
    success: {
        responseCode: '10000',
        label: 'Approved — Happy Flow',
        fields: [
            { label: 'destination.country',       value: 'DE'                    },
            { label: 'destination.account_number',value: 'DE89370400440532013000' },
            { label: 'destination.swift_bic',     value: 'COBADEFFXXX'           },
            { label: 'account_holder.first_name', value: 'John'                  },
            { label: 'account_holder.last_name',  value: 'Smith'                 },
            { label: 'billing_address.country',   value: 'DE'                    },
        ],
    },
    declined: [
        {
            reason: 'Compliance error',
            code: '50001',
            ibans: [
                'GB85HLFX11111100050001',
                'ES1121000418910000050001',
                'FR9220041010050000005000106',
            ],
            accountNumberSuffix: '50001',
        },
        {
            reason: 'Invalid recipient error',
            code: '50021',
            ibans: [
                'GB30HLFX11111100050021',
                'ES5321000418910000050021',
                'FR2420041010050000005002106',
            ],
            accountNumberSuffix: '50021',
        },
        {
            reason: 'Processing error',
            code: '50150',
            ibans: [
                'GB90HLFX11111100050105',
                'ES1621000418910000050105',
                'FR5120041010050000005015006',
            ],
            accountNumberSuffix: '50150',
        },
    ],
    euCountries: [
        { country: 'Estonia', code: 'EE', ibanExample: 'EE382200221020145685',        bicExample: 'HABAEE2X',    ibanLength: 20 },
        { country: 'Finland', code: 'FI', ibanExample: 'FI2112345600000785',          bicExample: 'NDEAFIHH',    ibanLength: 18 },
        { country: 'France',  code: 'FR', ibanExample: 'FR7630006000011234567890189', bicExample: 'BNPAFRPP',    ibanLength: 27 },
        { country: 'Germany', code: 'DE', ibanExample: 'DE89370400440532013000',      bicExample: 'COBADEFFXXX', ibanLength: 22 },
        { country: 'Greece',  code: 'GR', ibanExample: 'GR1601101250000000012300695', bicExample: 'ETHNGRAA',   ibanLength: 27 },
    ],
};

// =============================================
// Apple/Google Pay Express Checkout — simulated shipping rate table.
// Not tied to any real product catalog — purely demonstrates the
// address-dependent recompute behaviour both wallets' Express/shipping
// callbacks are built for (Apple: onshippingcontactselected /
// onshippingmethodselected. Google: onPaymentDataChanged with
// callbackTrigger SHIPPING_ADDRESS / SHIPPING_OPTION).
// All rate `amount` values are in MAJOR units (e.g. 5.00), matching the
// string format both wallet SDKs expect for totals/shipping amounts.
// =============================================
const EXPRESS_SHIPPING_CONFIG = {
    // Selecting one of these as the shipping country simulates an
    // "we don't ship here" rejection from the merchant, inside the wallet
    // sheet, before the customer can authorize payment.
    unserviceableCountries: ['IR', 'KP', 'CU'],
    ratesByCountry: {
        US: [
            { id: 'standard', label: 'Standard Shipping', detail: '5-7 business days', amount: 5.00 },
            { id: 'express',  label: 'Express Shipping',  detail: '1-2 business days', amount: 15.00 },
            { id: 'free',     label: 'Free Shipping',     detail: '7-10 business days', amount: 0.00 },
        ],
        GB: [
            { id: 'standard', label: 'Standard Shipping', detail: '3-5 business days', amount: 4.00 },
            { id: 'express',  label: 'Next Day',          detail: 'Next business day', amount: 12.00 },
        ],
        DE: [
            { id: 'standard', label: 'DHL Standard', detail: '3-4 business days', amount: 4.50 },
            { id: 'express',  label: 'DHL Express',   detail: '1 business day',   amount: 14.00 },
        ],
        // Fallback for any serviceable country not listed above.
        INTL: [
            { id: 'standard', label: 'International Standard', detail: '10-15 business days', amount: 20.00 },
            { id: 'express',  label: 'International Express',  detail: '3-5 business days',   amount: 45.00 },
        ],
    },
};

function getExpressShippingRates(countryCode) {
    const code = (countryCode || '').toUpperCase();
    return EXPRESS_SHIPPING_CONFIG.ratesByCountry[code] || EXPRESS_SHIPPING_CONFIG.ratesByCountry.INTL;
}

function isExpressShippingCountryServiceable(countryCode) {
    return !EXPRESS_SHIPPING_CONFIG.unserviceableCountries.includes((countryCode || '').toUpperCase());
}

// =============================================
// Disputes testing — sandbox "magic amount" scenarios.
// Checkout.com's sandbox doesn't let you create a dispute directly; instead,
// paying with one of these amount + expiry combinations makes CKO generate
// a test dispute within ~5 minutes (see /developer-resources/testing/disputes-testing).
// All amounts are in GBP minor units (pence). All cards use expiry 01/2099.
// =============================================
const DISPUTE_TEST_CARDS = {
    visa:       { scheme: 'Visa',             number: '4242424242424242', cvv: '100'  },
    mastercard: { scheme: 'Mastercard',       number: '5436031030606378', cvv: '100'  },
    amex:       { scheme: 'American Express', number: '345678901234564',  cvv: '1234' },
};

const DISPUTE_EXPIRY = { month: 1, year: 2099 };

const DISPUTE_TEST_SCENARIOS = {
    core: [
        {
            key: 'evidence_required', label: 'Evidence Required', status: 'evidence_required', chargebackCode: 'ADJM',
            description: 'You must submit evidence to defend against this dispute.',
            rows: [
                { card: 'visa',       amount: 1040, reasonCode: '10.4', reasonCategory: 'Fraudulent' },
                { card: 'visa',       amount: 1310, reasonCode: '13.1', reasonCategory: 'Product/service not received' },
                { card: 'mastercard', amount: 4855, reasonCode: '4855', reasonCategory: 'Product/service not received' },
                { card: 'mastercard', amount: 4860, reasonCode: '4860', reasonCategory: 'Credit not issued' },
                { card: 'amex',       amount: 4516, reasonCode: '4516', reasonCategory: 'Unrecognized' },
                { card: 'amex',       amount: 4540, reasonCode: '4540', reasonCategory: 'Fraudulent' },
            ],
        },
        {
            key: 'won', label: 'Won', status: 'won', chargebackCode: 'RPDW',
            description: 'The issuer accepted your evidence and you won the dispute.',
            rows: [
                { card: 'visa',       amount: 1045, reasonCode: '10.4', reasonCategory: 'Fraudulent' },
                { card: 'visa',       amount: 1315, reasonCode: '13.1', reasonCategory: 'Product/service not received' },
                { card: 'mastercard', amount: 4850, reasonCode: '4855', reasonCategory: 'Product/service not received' },
                { card: 'mastercard', amount: 4864, reasonCode: '4860', reasonCategory: 'Credit not issued' },
                { card: 'amex',       amount: 4511, reasonCode: '4517', reasonCategory: 'Unrecognized' },
                { card: 'amex',       amount: 4545, reasonCode: '4540', reasonCategory: 'Fraudulent' },
            ],
        },
        {
            key: 'lost', label: 'Lost', status: 'lost', chargebackCode: 'RPDL',
            description: 'The issuer was not satisfied with your evidence and you lost the dispute.',
            rows: [
                { card: 'visa',       amount: 1046, reasonCode: '10.4', reasonCategory: 'Fraudulent' },
                { card: 'visa',       amount: 1316, reasonCode: '13.1', reasonCategory: 'Product/service not received' },
                { card: 'mastercard', amount: 4851, reasonCode: '4855', reasonCategory: 'Product/service not received' },
                { card: 'mastercard', amount: 4865, reasonCode: '4860', reasonCategory: 'Credit not issued' },
                { card: 'amex',       amount: 4512, reasonCode: '4517', reasonCategory: 'Unrecognized' },
                { card: 'amex',       amount: 4546, reasonCode: '4540', reasonCategory: 'Fraudulent' },
            ],
        },
        {
            key: 'canceled', label: 'Canceled', status: 'canceled', chargebackCode: 'CBRV',
            description: 'The issuer canceled the dispute.',
            rows: [
                { card: 'visa',       amount: 1043, reasonCode: '10.4', reasonCategory: 'Fraudulent' },
                { card: 'visa',       amount: 1313, reasonCode: '13.1', reasonCategory: 'Product/service not received' },
                { card: 'mastercard', amount: 4858, reasonCode: '4855', reasonCategory: 'Product/service not received' },
                { card: 'mastercard', amount: 4862, reasonCode: '4860', reasonCategory: 'Credit not issued' },
                { card: 'amex',       amount: 4519, reasonCode: '4517', reasonCategory: 'Unrecognized' },
                { card: 'amex',       amount: 4543, reasonCode: '4540', reasonCategory: 'Fraudulent' },
            ],
        },
    ],
    extended: [
        {
            key: 'resolved_refund_processed', label: 'Resolved — Refund Already Processed', status: 'resolved', chargebackCode: 'AUTO',
            description: 'You already refunded the customer — CKO auto-submits evidence on your behalf.',
            rows: [
                { card: 'visa',       amount: 1042, reasonCode: '10.4', reasonCategory: 'Fraudulent' },
                { card: 'visa',       amount: 1312, reasonCode: '13.1', reasonCategory: 'Product/service not received' },
                { card: 'mastercard', amount: 4857, reasonCode: '4855', reasonCategory: 'Product/service not received' },
                { card: 'mastercard', amount: 4861, reasonCode: '4860', reasonCategory: 'Credit not issued' },
                { card: 'amex',       amount: 4518, reasonCode: '4517', reasonCategory: 'Unrecognized' },
                { card: 'amex',       amount: 4542, reasonCode: '4540', reasonCategory: 'Fraudulent' },
            ],
        },
        {
            key: 'resolved_outside_process', label: 'Resolved — Outside Dispute Process', status: 'resolved', chargebackCode: 'ARWS',
            description: 'Resolved by the merchant or scheme outside the formal dispute process.',
            rows: [
                { card: 'visa',       amount: 1050, reasonCode: '10.5', reasonCategory: 'Fraudulent' },
                { card: 'visa',       amount: 1311, reasonCode: '13.1', reasonCategory: 'Product/service not received' },
                { card: 'mastercard', amount: 4837, reasonCode: '4835', reasonCategory: 'Fraudulent' },
                { card: 'mastercard', amount: 4856, reasonCode: '4855', reasonCategory: 'Product/service not received' },
                { card: 'amex',       amount: 4517, reasonCode: '4517', reasonCategory: 'Unrecognized' },
                { card: 'amex',       amount: 4541, reasonCode: '4540', reasonCategory: 'Fraudulent' },
            ],
        },
        {
            key: 'evidence_under_review', label: 'Evidence Under Review', status: 'evidence_under_review', chargebackCode: 'RPDR',
            description: 'You submitted evidence and the issuer is reviewing it.',
            rows: [
                { card: 'visa',       amount: 1044, reasonCode: '10.4', reasonCategory: 'Fraudulent' },
                { card: 'visa',       amount: 1314, reasonCode: '13.1', reasonCategory: 'Product/service not received' },
                { card: 'mastercard', amount: 4859, reasonCode: '4855', reasonCategory: 'Product/service not received' },
                { card: 'mastercard', amount: 4863, reasonCode: '4860', reasonCategory: 'Credit not issued' },
                { card: 'amex',       amount: 4510, reasonCode: '4517', reasonCategory: 'Unrecognized' },
                { card: 'amex',       amount: 4544, reasonCode: '4540', reasonCategory: 'Fraudulent' },
            ],
        },
        {
            key: 'arbitration_under_review', label: 'Arbitration Under Review', status: 'arbitration_under_review', chargebackCode: 'ARBR',
            description: 'You escalated the dispute to arbitration.',
            rows: [
                { card: 'visa',       amount: 1047, reasonCode: '10.4', reasonCategory: 'Fraudulent' },
                { card: 'visa',       amount: 1317, reasonCode: '13.1', reasonCategory: 'Product/service not received' },
                { card: 'mastercard', amount: 4852, reasonCode: '4855', reasonCategory: 'Product/service not received' },
                { card: 'mastercard', amount: 4866, reasonCode: '4860', reasonCategory: 'Credit not issued' },
                { card: 'amex',       amount: 4513, reasonCode: '4517', reasonCategory: 'Unrecognized' },
                { card: 'amex',       amount: 4547, reasonCode: '4540', reasonCategory: 'Fraudulent' },
            ],
        },
        {
            key: 'arbitration_won', label: 'Arbitration Won', status: 'arbitration_won', chargebackCode: 'ARBW',
            description: 'You won the arbitration case.',
            rows: [
                { card: 'visa',       amount: 1049, reasonCode: '10.4', reasonCategory: 'Fraudulent' },
                { card: 'visa',       amount: 1319, reasonCode: '13.1', reasonCategory: 'Product/service not received' },
                { card: 'mastercard', amount: 4854, reasonCode: '4855', reasonCategory: 'Product/service not received' },
                { card: 'mastercard', amount: 4868, reasonCode: '4860', reasonCategory: 'Credit not issued' },
                { card: 'amex',       amount: 4515, reasonCode: '4517', reasonCategory: 'Unrecognized' },
                { card: 'amex',       amount: 4549, reasonCode: '4540', reasonCategory: 'Fraudulent' },
            ],
        },
        {
            key: 'arbitration_lost', label: 'Arbitration Lost', status: 'arbitration_lost', chargebackCode: 'ARBL',
            description: 'You lost the arbitration case.',
            rows: [
                { card: 'visa',       amount: 1048, reasonCode: '10.4', reasonCategory: 'Fraudulent' },
                { card: 'visa',       amount: 1318, reasonCode: '13.1', reasonCategory: 'Product/service not received' },
                { card: 'mastercard', amount: 4853, reasonCode: '4855', reasonCategory: 'Product/service not received' },
                { card: 'mastercard', amount: 4867, reasonCode: '4860', reasonCategory: 'Credit not issued' },
                { card: 'amex',       amount: 4514, reasonCode: '4517', reasonCategory: 'Unrecognized' },
                { card: 'amex',       amount: 4548, reasonCode: '4540', reasonCategory: 'Fraudulent' },
            ],
        },
    ],
};

// =============================================
// Authorization Types testing — test cards + reference data.
// See /payments/manage-payments/authorize-a-payment and its Partial /
// American Express Enhanced Authorization / Discover Enhanced Decisioning
// sub-pages. All card numbers and amounts are copied verbatim from those docs.
// =============================================

// Generic cards usable for Estimated/Final auth and as the base source for
// Amex Enhanced Auth / Discover Enhanced Decisioning (any card works — those
// two are about which *extra fields* you send, not the card itself).
const AUTH_TYPE_STANDARD_CARDS = [
    { scheme: 'Visa',             number: '4242424242424242', cvv: '100'  },
    { scheme: 'Mastercard',       number: '5436031030606378', cvv: '100'  },
    { scheme: 'American Express', number: '345678901234564',  cvv: '1234' },
    { scheme: 'Discover',         number: '6011111111111117', cvv: '100'  },
];

// Partial authorization requires BOTH partial_authorization.enabled: true AND
// the account being enabled for it by Checkout.com's account team — these
// specific card+amount combinations are what the sandbox matches against.
const AUTH_TYPE_PARTIAL_CARDS = [
    { scheme: 'Visa',                      number: '4757337282365488', cvv: '100'  },
    { scheme: 'Mastercard',                number: '5518207720770101', cvv: '100'  },
    { scheme: 'American Express (US only)', number: '345678901234456', cvv: '1234' },
];
const AUTH_TYPE_PARTIAL_AMOUNTS = [10000, 1000];

// Which schemes support incrementing an Estimated authorization's amount vs.
// extending its validity period, per the authorization-validity-period table.
const AUTH_TYPE_INCREMENTAL_SUPPORT = {
    Visa:             { increaseAmount: true,  extendValidity: false },
    Mastercard:       { increaseAmount: true,  extendValidity: true  },
    'American Express': { increaseAmount: true, extendValidity: false }, // US only
    Mada:             { increaseAmount: false, extendValidity: true  },
};

// ─── Adyen test cards (Competitor Testing → Adyen) ─────────────────────
// Public sandbox cards from Adyen's docs ("Test card numbers"); they only work on
// Adyen's TEST platform. Deliberately NOT included (extend from Adyen's docs when
// needed): 3D Secure 2 challenge/frictionless cards and the refusal / outcome-trigger
// rules — those live on Adyen pages that were not available when this was built.
// `tests` states only what the card is documented as (scheme, issuing country, card
// type); never add an expected-outcome claim here that Adyen's docs don't make.
const ADYEN_TEST_CARDS = [
    { id: 'visa-nl-consumer', scheme: 'Visa', type: 'Consumer', country: 'NL', number: '4111111111111111', expiry: '03/2030', cvc: '737',
      tests: 'Standard Visa test card issued in the Netherlands — the baseline card for a normal authorisation.' },
    { id: 'mc-gb-credit', scheme: 'Mastercard', type: 'Credit', country: 'GB', number: '5555555555554444', expiry: '03/2030', cvc: '737',
      tests: 'Standard Mastercard credit test card issued in the UK — checks a second scheme and issuer country.' },
    { id: 'mc-gb-consumer', scheme: 'Mastercard', type: 'Consumer', country: 'GB', number: '5555444433331111', expiry: '03/2030', cvc: '737',
      tests: 'Standard Mastercard consumer test card issued in the UK — same scheme as above, different card type.' },
];

// What each Adyen testing section is exercising, shown above the cards in that section.
const ADYEN_TEST_CARD_CONTEXT = {
    dropin: {
        entry: 'Type into Drop-in\'s card form. Adyen\'s fields are secure iframes and can\'t be auto-filled, so click a value below to copy it.',
        tests: 'The full Sessions flow: /sessions → card authorisation → onPaymentCompleted → success page → AUTHORISATION webhook. BobsBurgersECOM captures manually, so expect an authorisation only; capture it from the Capture / Cancel / Refund panel.',
    },
    component: {
        entry: 'Type into the Card component below (Adyen\'s secure iframes — click a value to copy it).',
        tests: 'The standalone Card component: your own layout around Adyen-secured fields, with the same Sessions flow and webhook outcome as Drop-in. Compare field validation and error UX against Drop-in.',
    },
    hosted: {
        entry: 'You enter the card on Adyen\'s hosted page after the redirect — copy these values first, then click Create Session & Redirect.',
        tests: 'The hosted round trip: redirect out, theme rendering, return to success.html with sessionResult, and GET /sessions/{id} reporting "completed".',
    },
    advanced: {
        entry: 'Type into the Drop-in mounted below (click a value to copy it).',
        tests: 'Your own /paymentMethods → /payments → /payments/details orchestration and the onSubmit / onAdditionalDetails → actions.resolve wiring. 3D Secure test cards are not listed here — use Adyen\'s 3D Secure 2 testing docs to exercise the additional-details step.',
    },
    links: {
        entry: 'You enter the card on Adyen\'s payment page after opening the link — copy these values first.',
        tests: 'Pay by Link creation, link status moving from active to completed (Check status button), and webhook correlation by reference. The shopper is not redirected back to this app.',
    },
    actions: {
        entry: 'Pay with any card here in one of the sections above first, then use that payment\'s pspReference.',
        tests: 'Post-authorisation modifications: Capture (required on this manual-capture merchant), Cancel (before capture) and Refund (after capture). Each is asynchronous — the outcome arrives as a CAPTURE / CANCELLATION / REFUND webhook.',
    },
};


// =============================================
// Standalone Checkout Suite — test data
// Source: /developer-resources/testing/test-cards (3DS section) and
// /payments/manage-payments/retrieve-card-metadata (Testing section).
// Cards are written as [scheme label, PAN, issuer country] to keep this compact;
// SUITE_3DS_GROUPS is expanded into objects just below.
// Any future expiry date and any CVV (3 digits; 4 for Amex) work with all of them.
// Challenge password on the 3DS simulator page: Checkout1!
// =============================================

const SUITE_3DS_PASSWORD = 'Checkout1!';

// likelyStatus is inferred from the Sessions status definitions (approved /
// attempted / declined / rejected / unavailable); CKO's test-card table only
// states the human-readable result.
const SUITE_3DS_GROUPS = [
    // ── Frictionless (no challenge screen) ──────────────────────────────
    { id: 'f-ok', flow: 'frictionless', title: 'Authenticated', result: 'Authentication successful', likelyStatus: 'approved',
      summary: 'Silent approval — no challenge page. Session goes straight to approved; payment gets ECI 05/02 and a cryptogram.',
      cards: [['Visa', '4485040371536584', 'US'], ['Mastercard', '5588686116426417', 'CN'], ['Amex', '345678901234564', 'ES'],
              ['CB / Visa', '4010056200000018', 'FR'], ['CB / Mastercard', '5137210000000018', 'FR'], ['UnionPay', '6224120000000094', 'CN']] },
    { id: 'f-n', flow: 'frictionless', title: 'Not authenticated', result: 'Not authenticated', likelyStatus: 'declined',
      summary: 'Issuer denies authentication without a challenge. Session declined → failure_url; do not authorize.',
      cards: [['Visa', '4539628347117863', 'AD'], ['Mastercard', '5309961755464047', 'BR'], ['Amex', '371064645462927', 'US'],
              ['CB / Visa', '4022050100000000', 'FR'], ['CB / Mastercard', '5132562600000029', 'FR'], ['UnionPay', '6224120000000086', 'CN']] },
    { id: 'f-u', flow: 'frictionless', title: 'Could not be performed', result: 'Authentication could not be performed', likelyStatus: 'unavailable',
      summary: 'Technical problem at the DS/ACS. Session unavailable — a good test for your fallback (retry or non-3DS) logic.',
      cards: [['Visa', '4024007186645015', 'US'], ['Mastercard', '5234106378657904', 'KR'], ['Amex', '344282679519362', 'US'],
              ['CB / Visa', '4022050100000018', 'FR'], ['CB / Mastercard', '5132562600000011', 'FR'], ['UnionPay', '6224120000000078', 'CN']] },
    { id: 'f-a', flow: 'frictionless', title: 'Attempted', result: 'Attempted authentication', likelyStatus: 'attempted',
      summary: 'Stand-in authentication. Treated as success — proceed to authorization (liability rules differ from fully authenticated).',
      cards: [['Visa', '4556574722325580', 'PT'], ['Mastercard (debit)', '5558468902774508', 'KE'], ['CB / Visa', '4022050100000026', 'FR'],
              ['UnionPay', '6224120000000029', 'CN']] },
    { id: 'f-r', flow: 'frictionless', title: 'Rejected', result: 'Authentication rejected', likelyStatus: 'rejected',
      summary: 'Issuer rejects and asks you NOT to attempt authorization. Session rejected → failure_url.',
      cards: [['Visa', '4275765574319271', 'JP'], ['Mastercard (debit)', '5596061690670931', 'IN'], ['Amex', '343397288296672', 'US'],
              ['UnionPay', '6224120000000011', 'CN']] },
    { id: 'f-ne', flow: 'frictionless', title: 'Card not enrolled', result: 'Card not enrolled', likelyStatus: '422 card_not_enrolled',
      summary: 'POST /sessions returns 422 card_not_enrolled. Fall back to a non-3DS payment (3ds.enabled=false) if you accept the liability.',
      cards: [['Visa', '4484070000035519', 'GB'], ['Mastercard (debit)', '5352151570003404', 'FR'], ['Amex', '378282246310005', 'US'],
              ['CB / Visa', '4022050100000182', 'FR'], ['CB / Mastercard', '5132562600000045', 'FR']] },
    { id: 'f-err', flow: 'frictionless', title: 'Scheme communication error', result: 'Error message during scheme communication', likelyStatus: 'error / unavailable',
      summary: 'Simulates the scheme returning an error message (ERro). Check the status_reason on GET /sessions/{id}.',
      cards: [['Visa', '4452927588210665', 'US'], ['Mastercard', '5291144083573579', 'US'], ['Amex', '378702153281139', 'US'],
              ['CB / Visa', '4022050100000133', 'FR'], ['CB / Mastercard', '5132562600000060', 'FR']] },
    { id: 'f-nomu', flow: 'frictionless', title: 'No 3DS method URL', result: 'No associated 3DS method URL', likelyStatus: 'approved',
      summary: 'Issuer has no 3DS Method URL, so there is no device fingerprint step — tests that flow still completes without it.',
      cards: [['Visa', '4556085951507152', 'ES'], ['Mastercard', '5121073611487018', 'US'], ['Amex', '340282533032846', 'US'],
              ['Diners (DCI)', '36747880216043', 'US'], ['JCB', '3528982710432481', 'JP'], ['UnionPay', '6224120000000110', 'CN']] },

    // ── Challenge (3DS simulator page, password Checkout1!) ─────────────
    { id: 'c-ok', flow: 'challenge', title: 'Authenticated after challenge', result: 'Authentication successful', likelyStatus: 'approved (challenged)',
      summary: 'Redirects to the 3DS simulator — enter the password to approve. Session approved with challenged = true.',
      cards: [['Mastercard', '5385308360135181', 'US'], ['Amex', '372688581899681', 'US'], ['CB / Visa (debit)', '4010061700000021', 'FR'],
              ['CB / Mastercard', '5137210000000158', 'FR'], ['UnionPay', '6224120000000003', 'CN']] },
    { id: 'c-a', flow: 'challenge', title: 'Attempted after challenge', result: 'Authentication attempted', likelyStatus: 'attempted',
      summary: 'Challenge flow ending in a stand-in result.',
      cards: [['Visa', '4152868552773614', 'BH'], ['Mastercard (debit)', '5518832400606463', 'US'], ['Amex', '346126139326850', 'US'],
              ['CB / Visa', '4150561000000001', 'FR'], ['CB / Mastercard', '5341034800000008', 'FR'], ['UnionPay', '6224120000000060', 'CN']] },
    { id: 'c-r', flow: 'challenge', title: 'Rejected after challenge', result: 'Authentication rejected', likelyStatus: 'rejected',
      summary: 'Challenge presented, then the issuer rejects.',
      cards: [['Amex', '375982239796002', 'US'], ['CB / Visa', '4150561000000019', 'FR'], ['CB / Mastercard', '5341034800000016', 'FR'],
              ['UnionPay', '6224120000000052', 'CN']] },
    { id: 'c-n', flow: 'challenge', title: 'Not authenticated after challenge', result: 'Not authenticated', likelyStatus: 'declined',
      summary: 'Challenge presented, authentication fails. Also test abandoning the challenge page → challenge_abandoned.',
      cards: [['Visa', '4243754271700719', 'US'], ['Mastercard', '5258901507741160', 'CA'], ['Amex', '347411540178242', 'US'],
              ['CB / Visa', '4150561000000027', 'FR'], ['CB / Mastercard', '5341034800000024', 'FR'], ['UnionPay', '6224120000000045', 'CN']] },
    { id: 'c-u', flow: 'challenge', title: 'Could not be performed (challenge)', result: 'Authentication could not be performed', likelyStatus: 'unavailable',
      summary: 'Challenge path where authentication cannot be completed.',
      cards: [['Visa (debit)', '4447336775378848', 'US'], ['Mastercard', '5569757734785691', 'US'], ['Amex', '377990956548835', 'US'],
              ['CB / Visa', '4150561000000035', 'FR'], ['CB / Mastercard', '5341034800000032', 'FR'], ['UnionPay', '6224120000000037', 'CN']] },
    { id: 'c-err', flow: 'challenge', title: 'Scheme communication error (challenge)', result: 'Error message during scheme communication', likelyStatus: 'error / unavailable',
      summary: 'Scheme returns an error message on the challenge path.',
      cards: [['Visa', '4539929207120660', 'IN'], ['Mastercard (prepaid)', '5572408422189334', 'IE'], ['CB / Visa', '4150561000000043', 'FR'],
              ['CB / Mastercard', '5341034800000040', 'FR']] },
    { id: 'c-nomu', flow: 'challenge', title: 'No 3DS method URL (challenge)', result: 'No associated 3DS method URL', likelyStatus: 'approved (challenged)',
      summary: 'Challenge path where the issuer has no 3DS Method URL.',
      cards: [['Visa', '4485597929486000', 'US'], ['Mastercard', '5259410220714099', 'US'], ['Amex', '372310461284948', 'US'],
              ['Diners (DCI)', '36138956596288', 'AT'], ['JCB', '3528682570029332', 'JP'], ['UnionPay', '6224120000000128', 'CN']] },
];
SUITE_3DS_GROUPS.forEach(g => {
    g.cards = g.cards.map(([scheme, number, country]) => ({ scheme, number, country }));
});

// Not enrolled for 3DS at all — a payment with 3ds.enabled=true returns 20150 "Card not 3D-Secure enabled".
const SUITE_NON_3DS_CARDS = {
    title: 'Not 3DS-enabled',
    summary: 'Payment with 3ds.enabled=true returns response_code 20150 "Card not 3D-Secure enabled". Use attempt_n3d to see the downgrade path.',
    cards: [
        { scheme: 'Visa', number: '4532432452900131', country: 'DE', cvv: '257' },
        { scheme: 'Mastercard (debit)', number: '5352151570003404', country: 'FR', cvv: '100' },
        { scheme: 'JCB (UK only)', number: '3530111333300000', country: 'JP', cvv: '100' },
    ],
};

// Card Metadata — expected card_payouts values per documented test card.
// Order of each triple: [domestic, cross-border] for NMT, MT, Gambling.
const SUITE_METADATA_CARDS = [
    { number: '4273149019799094', scheme: 'Visa',       nmt: ['fast_funds', 'fast_funds'],       mt: ['fast_funds', 'fast_funds'],       gam: ['not_supported', 'not_supported'] },
    { number: '4024007181869214', scheme: 'Visa',       nmt: ['not_supported', 'not_supported'], mt: ['not_supported', 'not_supported'], gam: ['not_supported', 'not_supported'] },
    { number: '4916301720257093', scheme: 'Visa',       nmt: ['unknown', 'unknown'],             mt: ['unknown', 'unknown'],             gam: ['unknown', 'unknown'] },
    { number: '4095254802642505', scheme: 'Visa',       nmt: ['fast_funds', 'not_supported'],    mt: ['fast_funds', 'not_supported'],    gam: ['fast_funds', 'not_supported'] },
    { number: '4140253846048187', scheme: 'Visa',       nmt: ['standard', 'standard'],           mt: ['standard', 'standard'],           gam: ['not_supported', 'not_supported'] },
    { number: '4659105569051157', scheme: 'Visa',       nmt: ['fast_funds', 'fast_funds'],       mt: ['fast_funds', 'fast_funds'],       gam: ['fast_funds', 'fast_funds'] },
    { number: '4484070000035519', scheme: 'Visa',       nmt: ['standard', 'standard'],           mt: ['standard', 'standard'],           gam: ['standard', 'standard'] },
    { number: '4820285375797526', scheme: 'Visa',       nmt: ['standard', 'not_supported'],      mt: ['standard', 'not_supported'],      gam: ['not_supported', 'not_supported'] },
    { number: '5352151570003404', scheme: 'Mastercard', nmt: ['fast_funds', 'fast_funds'],       mt: ['fast_funds', 'fast_funds'],       gam: ['not_supported', 'not_supported'] },
    { number: '5558468902774508', scheme: 'Mastercard', nmt: ['fast_funds', 'fast_funds'],       mt: ['fast_funds', 'fast_funds'],       gam: ['not_supported', 'not_supported'] },
    { number: '5356860600000133', scheme: 'Mastercard', nmt: ['standard', 'standard'],           mt: ['standard', 'standard'],           gam: ['fast_funds', 'fast_funds'] },
];

// Network token test cards. Verified against the sandbox on 2026-10-30. The sandbox maps every Visa test card to one DPAN
// (4895379992221661, type vts) and every Mastercard test card to another (5165037735018279, type mdes, exp 09/2050).
const SUITE_NT_CARDS = [
    { scheme: 'Visa',       number: '4242424242424242', note: 'Provisions a VTS token (DPAN 4895379992221661). Visa NT payments need merchant_initiated = true on this account.' },
    { scheme: 'Mastercard', number: '5436031030606378', note: 'Provisions an MDES token (DPAN 5165037735018279, exp 09/2050). Its cryptograms carry NO eci.' },
    { scheme: 'Mastercard', number: '5588686116426417', note: 'A 3DS frictionless card — also a valid NT source (same MDES token).' },
    { scheme: 'Visa',       number: '4485040371536584', note: 'A 3DS frictionless card — also a valid NT source (same VTS token).' },
    { scheme: 'Amex',       number: '345678901234564', note: 'Not supported: 422 scheme_not_supported.' },
    { scheme: 'Discover',   number: '6011111111111117', note: 'Not supported: 422 scheme_not_supported.' },
    { scheme: 'Diners',     number: '36160940933914',  note: 'Not supported: 422 scheme_not_supported.' },
    { scheme: 'JCB',        number: '3530111333300000', note: 'Odd sandbox behaviour: an empty 404 instead of scheme_not_supported.' },
    { scheme: 'Visa',       number: '4242424242424241', note: 'Fails the Luhn check: 422 card_number_invalid.' },
];

// What each product's test cards will do, shown above the cards.
const SUITE_PRODUCT_NOTES = {
    '3ds': 'Hosted Standalone 3DS: the session decides the result, so the card you pick sets the authentication outcome (frictionless vs challenge, approved vs declined…). Any future expiry and any CVV.',
    nt: 'Provisioning has no documented failure-trigger cards, so the list below comes from running each card against the sandbox: Visa → VTS token, Mastercard → MDES token, Amex / Discover / Diners → scheme_not_supported. Section D runs every verified scenario for you.',
    au: 'Public docs list no Account Updater test cards. The simulator cases from CKO\'s internal "Account Updater Sandbox Simulator Test Cases" document are built in (section C): one Visa RTAU card (amount selects the outcome), two Mastercard Update & Retry cards (…73 / …65) and ten Mastercard Store & Update numbers (trailing digits select the outcome). Both updaters need to be enabled on the account.',
    meta: 'Each card returns a fixed eligibility result per payout type (non-money-transfer, money-transfer, gambling), domestic and cross-border. Use format = card_payouts to see them.',
};


// =============================================
// RTAU / Account Updater test cases
// Source: "CKO Account Updater Sandbox Simulator Test Cases" (Google Doc, incl. its comment threads).
// `sandbox` is what was OBSERVED running each case against the sandbox on 2026-10-30 — the doc colour-codes
// working / not-working cases but that key does not survive in text form, so these badges come from live runs:
//   works    — behaves as the doc says
//   flaky    — result changes between runs
//   deviates — runs, but the outcome differs from the doc's table
//   broken   — documented as unsupported (doc comment: declines 20059)
// `expect` is the document's expectation; the runner scores the actual response against it.
//   update   — source.account_update_status ('none' = field absent)
//   webhook  — 'card_updated' (async, sandbox may be slow), 'delayed' (deliberately delayed), 'none' (documented: no webhook)
// =============================================

const RTAU_NT_NOTE = 'For merchants with network tokens, set processing.pan_preference = fpan, otherwise a DPAN (network token) is used and RTAU is skipped.';

const RTAU_GROUPS = [
    // ─────────────────────────── Visa RTAU ───────────────────────────
    {
        id: 'visa', title: 'Visa RTAU', cardLabel: 'Visa',
        blurb: 'One dedicated test card, used via a Source ID (src_…) with merchant_initiated = true. The amount (and, for two cases, the expiry) selects the outcome — any deviation from the listed amount/expiry declines with 20059 Suspected Fraud. ' + RTAU_NT_NOTE
            + ' Card updates (bin, last4, expiry) are returned in the synchronous response, in payment_approved / payment_declined and in the card_updated webhook.',
        cards: [{ scheme: 'Visa', number: '4539361261984692', note: 'The dedicated Visa RTAU simulator card. Create an instrument from it, then pay with the Source ID.' }],
        cases: [
            { id: 'v100', n: '100', title: 'No card update', doc: 'amount:100 — No card update', card: '4539361261984692', exp: ['12', '2030'], amount: 100, mit: true, via: 'id',
              expect: { approved: true, codes: ['10000'], update: 'none', webhook: 'none' },
              sandbox: { s: 'works', note: 'Approved, no account_update_status. No card_updated webhook is sent when nothing changed (confirmed in the doc comments).' } },
            { id: 'v200', n: '200', title: 'No update — account status (VAU014)', doc: 'amount:200 — No update due to account status (VAU014)', card: '4539361261984692', exp: ['12', '2030'], amount: 200, mit: true, via: 'id',
              expect: { approved: true, codes: ['10000'], update: 'contact_cardholder', failure: 'VAU014', webhook: 'none' },
              sandbox: { s: 'works', note: 'Approved with account_update_status = contact_cardholder and account_update_failure_code = VAU014. No webhook (no card update).' } },
            { id: 'v300', n: '300', title: 'PAN update', doc: 'amount:300 — PAN update (webhook)', card: '4539361261984692', exp: ['12', '2030'], amount: 300, mit: true, via: 'id',
              expect: { approved: true, codes: ['10000'], update: 'card_updated', newBin: '424242', newLast4: '4242', webhook: 'card_updated' },
              sandbox: { s: 'works', note: 'Sync response returns the new PAN (424242 ••4242). The card_updated webhook is delivered, but the sandbox can delay it by hours/days or drop it (doc comments).' } },
            { id: 'v400', n: '400', title: 'Expiry update (expiry 12/2025)', doc: 'amount:400 & expiry:12/2025 — Expiry update, returns 12/2026 (webhook)', card: '4539361261984692', exp: ['12', '2025'], amount: 400, mit: true, via: 'id',
              expect: { approved: true, codes: ['10000'], update: 'card_expiry_updated', newExp: '12/2026', webhook: 'card_updated' },
              sandbox: { s: 'flaky', note: 'Observed: the first run was Authorized with NO update (processed with a network token), later runs Declined 20059. 12/2025 is now in the past. A doc comment also reports 12/2023 being returned instead of 12/2026.' } },
            { id: 'v500', n: '500', title: 'PAN + expiry update (expiry 12/2022)', doc: 'amount:500 & expiry:12/2022 — PAN + expiry update, returns 12/2026 (webhook)', card: '4539361261984692', exp: ['12', '2022'], amount: 500, mit: true, via: 'id',
              expect: { approved: true, codes: ['10000'], update: 'card_updated', newBin: '424242', newLast4: '4242', newExp: '12/2026', webhook: 'card_updated' },
              sandbox: { s: 'works', note: 'Sync response: 424242 ••4242, expiry 12/2026. Webhook can be delayed or dropped.' } },
            { id: 'v600', n: '600', title: 'PAN stop advice (VAU016)', doc: 'amount:600 — PAN stop advice setup (VAU016)', card: '4539361261984692', exp: ['12', '2030'], amount: 600, mit: true, via: 'id',
              expect: { approved: true, failure: 'VAU016', webhook: 'none' },
              sandbox: { s: 'broken', note: 'Known issue (still OPEN in the doc comments): declined 20059 Suspected Fraud — the case is not supported in sandbox.' } },
            { id: 'v700', n: '700', title: 'Not configured for VAU (VAU008)', doc: 'amount:700 — Not configured for VAU (VAU008)', card: '4539361261984692', exp: ['12', '2030'], amount: 700, mit: true, via: 'id',
              expect: { approved: true, failure: 'VAU008', webhook: 'none' },
              sandbox: { s: 'broken', note: 'Known issue (OPEN in the doc comments): declined 20059 Suspected Fraud — not supported in sandbox.' } },
            // The document states this rule explicitly; two cases make it testable.
            { id: 'vdev-amount', n: 'dev-1', title: 'Deviation: amount not in the list', doc: 'any deviation from the amount declines the payment with 20059', card: '4539361261984692', exp: ['12', '2030'], amount: 150, mit: true, via: 'id',
              expect: { approved: false, codes: ['20059'], webhook: 'none' }, sandbox: { s: 'works', note: 'Declined 20059 Suspected Fraud, exactly as documented.' } },
            { id: 'vdev-expiry', n: 'dev-2', title: 'Deviation: wrong expiry for amount 400', doc: 'any deviation from the expiration date declines the payment with 20059', card: '4539361261984692', exp: ['12', '2030'], amount: 400, mit: true, via: 'id',
              expect: { approved: false, codes: ['20059'], webhook: 'none' }, sandbox: { s: 'works', note: 'Declined 20059 Suspected Fraud, as documented.' } },
            // Not in the document — observed while verifying it. Kept separate so the doc cases stay clean.
            { id: 'vx-nomit', n: 'extra', title: 'merchant_initiated = false', doc: 'Not in the document — what happens if the MIT flag is left out', card: '4539361261984692', exp: ['12', '2030'], amount: 300, mit: false, via: 'id', extra: true,
              expect: { approved: false, codes: ['43102'], webhook: 'none' }, sandbox: { s: 'works', note: 'Observed: Declined 43102 (Risk decline — Visa AFT mandate compliance). merchant_initiated = true is required.' } },
            { id: 'vx-card', n: 'extra', title: 'Raw card instead of a Source ID', doc: 'Not in the document body (a doc comment sends a raw card) — Source ID is required', card: '4539361261984692', exp: ['12', '2022'], amount: 500, mit: true, via: 'card', extra: true,
              expect: { approved: true, update: 'card_updated', webhook: 'card_updated' }, sandbox: { s: 'deviates', note: 'Observed: Declined 20059 with no update — only a Source ID triggers the Visa RTAU simulator.' } },
        ],
    },

    // ─────────────────────────── Mastercard Update & Retry ───────────────────────────
    {
        id: 'mc-ur', title: 'Mastercard Update & Retry', cardLabel: 'Mastercard',
        blurb: 'Update & Retry fires when a stored card is declined with a lifecycle reason: it fetches the updated card details and retries the authorization once. Use two Mastercard test cards — ending …73 (card number updates) and …65 (expiry updates). The amount picks the decline; merchant_initiated and the source type change the path. ' + RTAU_NT_NOTE
            + ' The “IA merchant” column of the doc is an account property (Intelligent Acceptance), not a request field.',
        cards: [
            { scheme: 'Mastercard', number: '5100000000000073', note: 'Ends …3 → “card number updated” (replacement PAN, BIN 531789).' },
            { scheme: 'Mastercard', number: '5100000000000065', note: 'Ends …5 → “expiry update”.' },
        ],
        cases: [
            { id: 'u1', n: '1', title: 'Authorized, no retry', doc: '…73 · id · any amount · MIT → authorized, no retry', card: '5100000000000073', exp: ['12', '2030'], amount: 1000, mit: true, via: 'id',
              expect: { approved: true, codes: ['10000'], update: 'none', webhook: 'none' }, sandbox: { s: 'works', note: 'Approved first time, no account update.' } },
            { id: 'u2', n: '2', title: 'Declined 79, no retry', doc: '…65 · id · 9779 · MIT → declined 79 MAC 01, no retry', card: '5100000000000065', exp: ['12', '2030'], amount: 9779, mit: true, via: 'id',
              expect: { approved: false, codes: ['20179'], webhook: 'none' }, sandbox: { s: 'works', note: 'Declined 20179 (Lifecycle). The response still carries a card_expiry_updated status, but no retry happens.' } },
            { id: 'u3', n: '3', title: 'Declined 82, no retry', doc: '…65 · id · 9782 · MIT → declined 82 MAC 01, no retry', card: '5100000000000065', exp: ['12', '2030'], amount: 9782, mit: true, via: 'id',
              expect: { approved: false, codes: ['20182'], webhook: 'none' }, sandbox: { s: 'works', note: 'Declined 20182 (Policy), no retry.' } },
            { id: 'u4', n: '4', title: 'Declined 79 → retry succeeds', doc: '…73 · id · 7779 · MIT → declined 79 MAC 01, retry success with updated details (sync response + card_updated webhook)', card: '5100000000000073', exp: ['12', '2030'], amount: 7779, mit: true, via: 'id',
              expect: { approved: true, codes: ['10000'], update: 'card_updated', changed: true, webhook: 'card_updated' }, sandbox: { s: 'works', note: 'Final response: Authorized with new card details (BIN 531789, new last4/expiry). Needs pan_preference = fpan on this account.' } },
            { id: 'u5', n: '5', title: 'Declined 82 → retry succeeds', doc: '…65 · id · 7782 · MIT → declined 82 MAC 01, retry success with updated details', card: '5100000000000065', exp: ['12', '2030'], amount: 7782, mit: true, via: 'id',
              expect: { approved: true, codes: ['10000'], update: 'card_expiry_updated', changed: true, webhook: 'card_updated' }, sandbox: { s: 'deviates', note: 'Observed: Declined 20182 (Policy) with card_expiry_updated — the retry did not succeed, unlike the doc table.' } },
            { id: 'u6', n: '6', title: 'Declined 200179 (CIT) → retry succeeds', doc: '…73 · id · 7779 · MIT = false → declined 200179 MAC 01, retry success with updated details', card: '5100000000000073', exp: ['12', '2030'], amount: 7779, mit: false, via: 'id',
              expect: { approved: true, codes: ['10000'], update: 'card_updated', changed: true, webhook: 'card_updated' }, sandbox: { s: 'works', note: 'Only the final (retried) response is visible: Authorized with updated card details.' } },
            { id: 'u7', n: '7', title: 'Raw card · declined 79 → retry succeeds', doc: '…73 · card · 7779 · MIT → declined 79 MAC 01, retry success with updated details', card: '5100000000000073', exp: ['12', '2030'], amount: 7779, mit: true, via: 'card',
              expect: { approved: true, codes: ['10000'], update: 'card_updated', changed: true, webhook: 'card_updated' }, sandbox: { s: 'deviates', note: 'Observed: Declined 20179 with no update — a raw card is not retried; use a Source ID. (The doc lists this row twice; it is shown once.)' } },
            { id: 'u9', n: '9', title: 'IA merchant · raw card · retry succeeds', doc: '…73 · card · 7779 · MIT · IA merchant = yes → declined 79 MAC 01, retry success with updated details', card: '5100000000000073', exp: ['12', '2030'], amount: 7779, mit: true, via: 'card', needsIA: true,
              expect: { approved: true, codes: ['10000'], update: 'card_updated', changed: true, webhook: 'card_updated' }, sandbox: { s: 'deviates', note: 'Needs a processing channel whose merchant is Intelligent-Acceptance enabled; the request is identical to case 7. On a non-IA account it behaves like case 7.' } },
            { id: 'ux-dpan', n: 'extra', title: 'Why fpan matters (pan_preference omitted)', doc: 'Not in the document — same as case 4 but without processing.pan_preference', card: '5100000000000073', exp: ['12', '2030'], amount: 7779, mit: true, via: 'id', pan: 'omit', extra: true,
              expect: { approved: true, codes: ['10000'], update: 'none', webhook: 'none' }, sandbox: { s: 'works', note: 'Observed on a network-token merchant: Authorized via DPAN and RTAU never runs. This is the doc comment’s “NT-enabled merchant” caveat.' } },
        ],
    },

    // ─────────────────────────── Mastercard Store & Update ───────────────────────────
    {
        id: 'mc-su', title: 'Mastercard Store & Update', cardLabel: 'Mastercard',
        blurb: 'Create a Source ID from any Mastercard number whose trailing digit(s) pick the case. Updates are communicated asynchronously via the card_updated webhook. The tester also runs the Standalone Account Updater against the new instrument, which returns the same outcome synchronously — useful when the webhook is slow.',
        cards: [],  // filled below from `cases`
        cases: [
            { id: 's1', n: '1', title: 'Non-participating BIN / issuer', doc: 'xxxxxxxxxxxxxxx1 — non-participating BIN/issuer', card: '5100000000000081', exp: ['12', '2030'], store: true,
              expect: { webhook: 'none', sync: { http: 200, status: 'UPDATE_FAILED', failure: 'NON_PARTICIPATING_BIN' } }, sandbox: { s: 'works', note: 'Standalone check → UPDATE_FAILED / NON_PARTICIPATING_BIN. No card_updated webhook (nothing changed).' } },
            { id: 's2', n: '2', title: 'Valid, no change', doc: 'xxxxxxxxxxxxxxx2 — valid no change response', card: '5100000000000172', exp: ['12', '2030'], store: true,
              expect: { webhook: 'none', sync: { http: 200, status: 'UPDATE_FAILED', failure: 'UP_TO_DATE' } }, sandbox: { s: 'works', note: 'Standalone check → UPDATE_FAILED / UP_TO_DATE. (…172 is used instead of …32/…22/…12 because those two-digit suffixes are other cases.)' } },
            { id: 's3', n: '3', title: 'Card number updated', doc: 'xxxxxxxxxxxxxxx3 — card number updated', card: '5100000000000073', exp: ['12', '2030'], store: true,
              expect: { webhook: 'card_updated', reason: 'card_updated', sync: { http: 200, status: 'CARD_UPDATED', changed: true } }, sandbox: { s: 'works', note: 'Standalone check → CARD_UPDATED with a new PAN (BIN 531789).' } },
            { id: 's4', n: '4', title: 'Card closed', doc: 'xxxxxxxxxxxxxxx4 — card closed', card: '5100000000000024', exp: ['12', '2030'], store: true,
              expect: { webhook: 'card_updated', reason: 'card_closed', sync: { http: 200, status: 'CARD_CLOSED' } }, sandbox: { s: 'works', note: 'Standalone check → CARD_CLOSED.' } },
            { id: 's5', n: '5', title: 'Expiry update', doc: 'xxxxxxxxxxxxxxx5 — expiry update', card: '5100000000000065', exp: ['12', '2030'], store: true,
              expect: { webhook: 'card_updated', reason: 'card_expiry_updated', sync: { http: 200, status: 'CARD_EXPIRY_UPDATED', changed: true } }, sandbox: { s: 'works', note: 'Standalone check → CARD_EXPIRY_UPDATED with a new expiry.' } },
            { id: 's6', n: '6', title: 'Error response', doc: 'xxxxxxxxxxxxxxx6 — error response', card: '5100000000000016', exp: ['12', '2030'], store: true,
              expect: { webhook: 'none', sync: { http: 502 } }, sandbox: { s: 'works', note: 'Standalone check → HTTP 502 with an empty body (the simulated scheme error).' } },
            { id: 's7', n: '7', title: 'Unknown', doc: 'xxxxxxxxxxxxxxx7 — unknown', card: '5100000000000057', exp: ['12', '2030'], store: true,
              expect: { webhook: 'none', sync: { http: 200, status: 'UPDATE_FAILED', failure: 'UNKNOWN' } }, sandbox: { s: 'works', note: 'Standalone check → UPDATE_FAILED / UNKNOWN.' } },
            { id: 's12', n: '12', title: 'Delayed expiry update', doc: 'xxxxxxxxxxxxxx12 — delayed expiry update', card: '5100000000000412', exp: ['12', '2030'], store: true,
              expect: { webhook: 'delayed', reason: 'card_expiry_updated', sync: { http: 200, status: 'UPDATE_FAILED', failure: 'UP_TO_DATE' } }, sandbox: { s: 'works', note: 'Deliberately delayed: the standalone check still reports UP_TO_DATE; the update arrives later through the card_updated webhook (minutes or more).' } },
            { id: 's22', n: '22', title: 'Delayed card number update', doc: 'xxxxxxxxxxxxxx22 — delayed card number update', card: '5100000000000222', exp: ['12', '2030'], store: true,
              expect: { webhook: 'delayed', reason: 'card_updated', sync: { http: 200, status: 'UPDATE_FAILED', failure: 'UP_TO_DATE' } }, sandbox: { s: 'works', note: 'Deliberately delayed — watch for the card_updated webhook.' } },
            { id: 's32', n: '32', title: 'Delayed card closed update', doc: 'xxxxxxxxxxxxxx32 — delayed card closed update', card: '5100000000000032', exp: ['12', '2030'], store: true,
              expect: { webhook: 'delayed', reason: 'card_closed', sync: { http: 200, status: 'UPDATE_FAILED', failure: 'UP_TO_DATE' } }, sandbox: { s: 'works', note: 'Deliberately delayed — watch for the card_updated webhook.' } },
        ],
    },
];
RTAU_GROUPS.find(g => g.id === 'mc-su').cards = RTAU_GROUPS.find(g => g.id === 'mc-su').cases
    .map(c => ({ scheme: 'Mastercard', number: c.card, note: `Rule …${c.n}: ${c.title}.` }));


// =============================================
// Network token test scenarios (Network Tokens tab, section D)
// There is no CKO test-case document for network tokens, so every expectation here was observed by running the step
// against the sandbox on 2026-10-30 (and cross-checked with the public docs: provisioning 200 = existing token,
// 201 = new token; cryptogram transaction types; delete reasons; payment-time provisioning; pan_preference).
// Steps run in order and share a context (the Source ID, the token, the last cryptogram).
//   op: instrument | provision | get | cryptogram | delete | pay
//   expect keys: http, error, type, state, hasCryptogram, hasEci, sameNt, approved, code, pan, ntAvail, ntId, respEci
// =============================================
const NT_CARD = { visa: '4242424242424242', mc: '5436031030606378', amex: '345678901234564', discover: '6011111111111117', diners: '36160940933914', jcb: '3530111333300000', badLuhn: '4242424242424241' };

const NT_GROUPS = [
    {
        id: 'prov', title: 'Provisioning',
        blurb: 'POST /network-tokens with full card details or a Source ID. 201 = a new token was provisioned, 200 = Checkout.com already had one and returned it. Only Visa (VTS) and Mastercard (MDES) are supported.',
        cases: [
            { id: 'p-mc', n: '1', title: 'Provision a Mastercard (MDES)', doc: 'Full card details → network token', sandbox: { s: 'works', note: 'Token type mdes, state active, DPAN 5165037735018279, expiry 09/2050.' },
              steps: [{ op: 'provision', card: NT_CARD.mc, expect: { http: [200, 201], type: 'mdes', state: 'active' } }] },
            { id: 'p-visa', n: '2', title: 'Provision a Visa (VTS)', doc: 'Full card details → network token', sandbox: { s: 'works', note: 'Token type vts, state active, DPAN 4895379992221661.' },
              steps: [{ op: 'provision', card: NT_CARD.visa, expect: { http: [200, 201], type: 'vts', state: 'active' } }] },
            { id: 'p-twice', n: '3', title: 'Provisioning the same card twice returns the same token', doc: '200 — Responding with existing network token', sandbox: { s: 'works', note: 'The second call returns 200 with the same nt_ id.' },
              steps: [{ op: 'provision', card: NT_CARD.mc, expect: { http: [200, 201] } }, { op: 'provision', card: NT_CARD.mc, expect: { http: 200, sameNt: true } }] },
            { id: 'p-instrument', n: '4', title: 'Provision from a stored Source ID', doc: 'If the card is stored with Checkout.com, a source ID can be used', sandbox: { s: 'works', note: 'Same token as the card; repeating the call returns the same nt_ id.' },
              steps: [{ op: 'instrument', card: NT_CARD.mc, expect: { http: 201 } }, { op: 'provision', via: 'id', expect: { http: [200, 201], type: 'mdes' } }, { op: 'provision', via: 'id', expect: { http: 200, sameNt: true } }] },
            { id: 'p-amex', n: '5', title: 'American Express is not supported', doc: 'Visa and Mastercard only', sandbox: { s: 'works', note: '422 scheme_not_supported.' },
              steps: [{ op: 'provision', card: NT_CARD.amex, expect: { http: 422, error: 'scheme_not_supported' } }] },
            { id: 'p-discover', n: '6', title: 'Discover is not supported', doc: 'Visa and Mastercard only', sandbox: { s: 'works', note: '422 scheme_not_supported.' },
              steps: [{ op: 'provision', card: NT_CARD.discover, expect: { http: 422, error: 'scheme_not_supported' } }] },
            { id: 'p-diners', n: '7', title: 'Diners is not supported', doc: 'Visa and Mastercard only', sandbox: { s: 'works', note: '422 scheme_not_supported.' },
              steps: [{ op: 'provision', card: NT_CARD.diners, expect: { http: 422, error: 'scheme_not_supported' } }] },
            { id: 'p-jcb', n: '8', title: 'JCB', doc: 'Unsupported schemes should be rejected with scheme_not_supported', sandbox: { s: 'deviates', note: 'Observed: an empty 404 response instead of a 422 scheme_not_supported like the other unsupported schemes.' },
              steps: [{ op: 'provision', card: NT_CARD.jcb, expect: { http: 422, error: 'scheme_not_supported' } }] },
            { id: 'p-luhn', n: '9', title: 'Invalid card number (Luhn)', doc: 'Request validation', sandbox: { s: 'works', note: '422 card_number_invalid.' },
              steps: [{ op: 'provision', card: NT_CARD.badLuhn, expect: { http: 422, error: 'card_number_invalid' } }] },
            { id: 'p-expired', n: '10', title: 'Expired card (12/2020)', doc: 'Not validated by the sandbox', extra: true, sandbox: { s: 'works', note: 'Observed: provisioning succeeds for an expired card — the sandbox does not validate the expiry.' },
              steps: [{ op: 'provision', card: NT_CARD.visa, exp: '2020', expect: { http: [200, 201] } }] },
        ],
    },
    {
        id: 'life', title: 'Cryptograms & lifecycle',
        blurb: 'GET the token, request a cryptogram per transaction type (ecom, recurring, pos, aft) and delete it. Lifecycle changes are sent as network_token_update webhooks.',
        cases: [
            { id: 'l-get', n: '1', title: 'Get a token', doc: 'Get network token — DPAN, expiry, state, card details', sandbox: { s: 'works', note: 'state active, with the DPAN and the underlying card’s last4 / expiry.' },
              steps: [{ op: 'provision', card: NT_CARD.mc, expect: { http: [200, 201] } }, { op: 'get', expect: { http: 200, state: 'active' } }] },
            { id: 'l-types', n: '2', title: 'A cryptogram for every transaction type', doc: 'Request a cryptogram — ecom, recurring, pos, aft', sandbox: { s: 'works', note: 'All four types return a cryptogram. Visa responses include an eci (07).' },
              steps: [{ op: 'provision', card: NT_CARD.visa, expect: { http: [200, 201] } },
                  ...['ecom', 'recurring', 'pos', 'aft'].map(t => ({ op: 'cryptogram', type: t, expect: { http: 201, hasCryptogram: true, hasEci: true } }))] },
            { id: 'l-mc-eci', n: '3', title: 'Mastercard cryptograms carry no eci', doc: 'eci is required to pay with a token unless previous_payment_id is given', sandbox: { s: 'works', note: 'MDES cryptogram responses contain only the cryptogram — omit eci (or send 02) when paying. Sending 05 is rejected (20012).' },
              steps: [{ op: 'provision', card: NT_CARD.mc, expect: { http: [200, 201] } }, { op: 'cryptogram', type: 'ecom', expect: { http: 201, hasCryptogram: true, hasEci: false } }] },
            { id: 'l-badtype', n: '4', title: 'Invalid transaction_type', doc: 'Request validation', sandbox: { s: 'works', note: '422 transaction_type_invalid.' },
              steps: [{ op: 'provision', card: NT_CARD.mc, expect: { http: [200, 201] } }, { op: 'cryptogram', type: 'nope', expect: { http: 422, error: 'transaction_type_invalid' } }] },
            { id: 'l-badid', n: '5', title: 'Malformed token id', doc: 'Request validation', sandbox: { s: 'works', note: '422 — the id must match ^nt_[a-z2-7]{26}$ (a src_ id is rejected).' },
              steps: [{ op: 'get', id: 'src_notatoken', expect: { http: 422, error: 'must match' } }] },
            { id: 'l-delete', n: '6', title: 'Delete a token, then try to use it', doc: 'Permanently deletes a network token (initiated_by, reason)', webhook: 'network_token_update',
              sandbox: { s: 'works', note: 'Delete → 204; GET shows state inactive; a cryptogram is refused (token_not_active); deleting again → 404; provisioning the card again revives the same nt_ id (201).' },
              steps: [{ op: 'provision', card: NT_CARD.mc, expect: { http: [200, 201] } },
                  { op: 'delete', by: 'cardholder', reason: 'fraud', expect: { http: 204 } },
                  { op: 'get', expect: { http: 200, state: 'inactive' } },
                  { op: 'cryptogram', type: 'ecom', expect: { http: 422, error: 'token_not_active' } },
                  { op: 'delete', by: 'token_requestor', reason: 'other', expect: { http: 404 } },
                  { op: 'provision', card: NT_CARD.mc, expect: { http: 201, state: 'active', sameNt: true } }] },
        ],
    },
    {
        id: 'pay', title: 'Paying & PAN type',
        blurb: 'POST /payments with source.type = network_token (token + cryptogram + eci), and the automatic use of a stored token. processing.pan_type_processed tells you whether the DPAN or the full PAN went to the scheme. On this account Visa payments that are not merchant-initiated decline 43102 (Visa AFT mandate compliance) — that is an account rule, not a token problem.',
        cases: [
            { id: 'y-mc-omit', n: '1', title: 'Mastercard token, eci omitted', doc: 'source.type = network_token, no eci', sandbox: { s: 'works', note: 'Authorized; processed with the DPAN.' },
              steps: [{ op: 'provision', card: NT_CARD.mc, expect: { http: [200, 201] } }, { op: 'cryptogram', type: 'ecom', expect: { http: 201 } },
                  { op: 'pay', mode: 'nt', eci: 'omit', expect: { approved: true, code: '10000', pan: 'dpan' } }] },
            { id: 'y-mc-02', n: '2', title: 'Mastercard token, eci 02', doc: 'source.type = network_token with eci', sandbox: { s: 'works', note: 'Authorized.' },
              steps: [{ op: 'provision', card: NT_CARD.mc, expect: { http: [200, 201] } }, { op: 'cryptogram', type: 'ecom', expect: { http: 201 } },
                  { op: 'pay', mode: 'nt', eci: '02', expect: { approved: true, code: '10000', pan: 'dpan' } }] },
            { id: 'y-mc-05', n: '3', title: 'Mastercard token, eci 05 (a Visa value)', doc: 'eci must match the scheme', sandbox: { s: 'works', note: 'Declined 20012 Invalid Transaction.' },
              steps: [{ op: 'provision', card: NT_CARD.mc, expect: { http: [200, 201] } }, { op: 'cryptogram', type: 'ecom', expect: { http: 201 } },
                  { op: 'pay', mode: 'nt', eci: '05', expect: { approved: false, code: '20012' } }] },
            { id: 'y-mc-badcrypto', n: '4', title: 'Mastercard token, wrong cryptogram', doc: 'The scheme validates the cryptogram', sandbox: { s: 'works', note: 'Observed: the sandbox does NOT validate the cryptogram — still Authorized.' },
              steps: [{ op: 'provision', card: NT_CARD.mc, expect: { http: [200, 201] } }, { op: 'cryptogram', type: 'ecom', expect: { http: 201 } },
                  { op: 'pay', mode: 'nt', eci: 'omit', badCrypto: true, expect: { approved: true, code: '10000' } }] },
            { id: 'y-visa-cit', n: '5', title: 'Visa token, customer-initiated', doc: 'source.type = network_token (Visa)', sandbox: { s: 'works', note: 'Declined 43102 (Risk decline — Visa AFT mandate compliance): an account rule that applies to every Visa CIT payment here.' },
              steps: [{ op: 'provision', card: NT_CARD.visa, expect: { http: [200, 201] } }, { op: 'cryptogram', type: 'ecom', expect: { http: 201 } },
                  { op: 'pay', mode: 'nt', eci: 'cryptogram', mit: false, expect: { approved: false, code: '43102' } }] },
            { id: 'y-visa-mit', n: '6', title: 'Visa token, merchant-initiated', doc: 'source.type = network_token (Visa) with merchant_initiated', sandbox: { s: 'works', note: 'Authorized, eci 07, processed with the DPAN.' },
              steps: [{ op: 'provision', card: NT_CARD.visa, expect: { http: [200, 201] } }, { op: 'cryptogram', type: 'ecom', expect: { http: 201, hasEci: true } },
                  { op: 'pay', mode: 'nt', eci: 'cryptogram', mit: true, expect: { approved: true, code: '10000', pan: 'dpan', respEci: '07' } }] },
            { id: 'y-card-prov', n: '7', title: 'Payment-time provisioning (full card)', doc: 'processing.provision_network_token = true', sandbox: { s: 'works', note: 'Authorized; cko_network_token_available = true. (The sandbox already holds a token for this card, so the DPAN is used straight away.)' },
              steps: [{ op: 'pay', mode: 'card', card: NT_CARD.mc, provision: true, expect: { approved: true, code: '10000', ntAvail: true } }] },
            { id: 'y-instr', n: '8', title: 'Stored card uses its token automatically', doc: 'If a token is available it is sent instead of the card details', sandbox: { s: 'works', note: 'processing.pan_type_processed = dpan with no token details in the request.' },
              steps: [{ op: 'instrument', card: NT_CARD.mc, expect: { http: 201 } }, { op: 'pay', mode: 'instrument', expect: { approved: true, code: '10000', pan: 'dpan', ntAvail: true } }] },
            { id: 'y-fpan', n: '9', title: 'Opt out with pan_preference = fpan', doc: 'processing.pan_preference', sandbox: { s: 'works', note: 'pan_type_processed = fpan (and eci 00) — the full PAN was sent even though a token exists. This is also how RTAU is kept working for token merchants.' },
              steps: [{ op: 'instrument', card: NT_CARD.mc, expect: { http: 201 } }, { op: 'pay', mode: 'instrument', pan: 'fpan', expect: { approved: true, code: '10000', pan: 'fpan' } }] },
            { id: 'y-instr-prov', n: '10', title: 'Provision while creating the instrument', doc: 'POST /instruments with network_token.provision = true', sandbox: { s: 'works', note: 'The instrument response includes network_token { id, state: active }.' },
              steps: [{ op: 'instrument', card: NT_CARD.mc, provision: true, expect: { http: 201, ntId: true, state: 'active' } }] },
        ],
    },
];

// ── Hosted Payments Page / Payment Links: payment-method catalogue ─────────────────────────────────────────
// `allow_payment_methods` / `disabled_payment_methods` accept exactly these ids (PaymentInterfacesPaymentMethodEnum).
// countries / currencies = what the method needs from billing.address.country and currency (docs: "Payment method
// field requirements"); null = no restriction. `needs` = extra request fields the method requires.
const SEPA_COUNTRIES = ['AD','AT','BE','BG','CH','CY','CZ','DE','DK','EE','ES','FI','FR','GB','GR','HR','HU','IE','IS','IT','LI','LT','LU','LV','MC','MT','NL','NO','PL','PT','RO','SE','SI','SK','SM','VA'];
const KLARNA_COUNTRIES = ['AT','AU','BE','CH','CZ','DE','DK','ES','FR','FI','GB','GR','IE','IT','NL','NO','PL','PT','SE','US'];
const LINK_PAYMENT_METHODS = [
    // Cards & wallets
    { id: 'card',        label: 'Cards',         group: 'Cards & wallets', countries: null, currencies: null, needs: [] },
    { id: 'applepay',    label: 'Apple Pay',     group: 'Cards & wallets', countries: null, currencies: null, needs: [], note: 'currency + country must be supported by Apple Pay' },
    { id: 'googlepay',   label: 'Google Pay',    group: 'Cards & wallets', countries: null, currencies: null, needs: [], note: 'currency + country must be supported by Google Pay' },
    { id: 'paypal',      label: 'PayPal',        group: 'Cards & wallets', countries: null, currencies: null, needs: ['products'] },
    { id: 'stored_card', label: 'Stored cards',  group: 'Cards & wallets', countries: null, currencies: null, needs: ['stored customer id'], hppOnly: true },
    // Bank & local
    { id: 'ideal',       label: 'iDEAL',         group: 'Bank & local', countries: ['NL'], currencies: ['EUR'], needs: [] },
    { id: 'bancontact',  label: 'Bancontact',    group: 'Bank & local', countries: ['BE'], currencies: ['EUR'], needs: ['customer name'] },
    { id: 'eps',         label: 'EPS',           group: 'Bank & local', countries: ['AT'], currencies: ['EUR'], needs: [] },
    { id: 'p24',         label: 'Przelewy24',    group: 'Bank & local', countries: ['PL'], currencies: ['EUR', 'PLN'], needs: ['customer name', 'customer email'] },
    { id: 'sepa',        label: 'SEPA Direct Debit', group: 'Bank & local', countries: SEPA_COUNTRIES, currencies: ['EUR'], needs: ['billing address line 1', 'city', 'zip'] },
    { id: 'bizum',       label: 'Bizum',         group: 'Bank & local', countries: ['ES'], currencies: ['EUR'], needs: [] },
    { id: 'mbway',       label: 'MB WAY',        group: 'Bank & local', countries: ['PT'], currencies: ['EUR'], needs: ['reference'] },
    { id: 'multibanco',  label: 'Multibanco',    group: 'Bank & local', countries: ['PT'], currencies: ['EUR'], needs: ['customer name'] },
    { id: 'twint',       label: 'TWINT',         group: 'Bank & local', countries: ['CH'], currencies: ['CHF'], needs: ['reference', 'payment_type Regular'] },
    { id: 'vipps',       label: 'Vipps',         group: 'Bank & local', countries: ['NO', 'SE'], currencies: ['NOK', 'SEK'], needs: [] },
    { id: 'mobilepay',   label: 'MobilePay',     group: 'Bank & local', countries: ['DK', 'FI'], currencies: ['EUR', 'DKK'], needs: [] },
    { id: 'paynow',      label: 'PayNow',        group: 'Bank & local', countries: ['SG'], currencies: ['SGD'], needs: ['payment_type Regular'] },
    { id: 'octopus',     label: 'Octopus',       group: 'Bank & local', countries: ['HK'], currencies: ['HKD'], needs: ['payment_type Regular'] },
    { id: 'knet',        label: 'KNET',          group: 'Bank & local', countries: ['KW'], currencies: ['KWD'], needs: ['locale ar'] },
    { id: 'benefit',     label: 'Benefit',       group: 'Bank & local', countries: ['BH'], currencies: ['BHD'], needs: ['reference'] },
    { id: 'qpay',        label: 'QPay',          group: 'Bank & local', countries: ['QA'], currencies: ['QAR'], needs: ['description'] },
    { id: 'stcpay',      label: 'stc pay',       group: 'Bank & local', countries: ['SA'], currencies: ['SAR'], needs: ['reference'] },
    { id: 'plaid',       label: 'Plaid',         group: 'Bank & local', countries: null, currencies: null, needs: [] },
    // Pay later
    { id: 'klarna',      label: 'Klarna',        group: 'Pay later', countries: KLARNA_COUNTRIES, currencies: ['AUD', 'CHF', 'CZK', 'DKK', 'EUR', 'GBP', 'NOK', 'PLN', 'SEK', 'USD'], needs: ['products', 'customer name'] },
    { id: 'alma',        label: 'Alma',          group: 'Pay later', countries: ['FR'], currencies: ['EUR'], needs: [] },
    { id: 'tabby',       label: 'Tabby',         group: 'Pay later', countries: ['AE', 'SA', 'KW'], currencies: ['AED', 'SAR', 'KWD'], needs: ['reference', 'products', 'shipping'] },
    { id: 'tamara',      label: 'Tamara',        group: 'Pay later', countries: ['SA', 'AE'], currencies: ['SAR', 'AED'], needs: ['reference', 'products', 'customer email', 'shipping'] },
    // Asia wallets
    { id: 'alipay_cn',   label: 'Alipay CN',     group: 'Asia wallets', countries: ['CN'], currencies: ['CNY', 'HKD', 'SGD'], needs: ['products', 'customer email'] },
    { id: 'alipay_hk',   label: 'Alipay HK',     group: 'Asia wallets', countries: ['HK'], currencies: ['HKD', 'SGD'], needs: ['products', 'customer email'] },
    { id: 'wechatpay',   label: 'WeChat Pay',    group: 'Asia wallets', countries: null, currencies: null, needs: ['amount', 'payment_type Regular'] },
    { id: 'gcash',       label: 'GCash',         group: 'Asia wallets', countries: ['PH'], currencies: ['PHP', 'HKD', 'SGD'], needs: ['products', 'customer email'] },
    { id: 'dana',        label: 'DANA',          group: 'Asia wallets', countries: ['ID'], currencies: ['IDR', 'HKD', 'SGD'], needs: ['products', 'customer email'] },
    { id: 'kakaopay',    label: 'KakaoPay',      group: 'Asia wallets', countries: ['KR'], currencies: ['KRW', 'HKD', 'SGD'], needs: ['products', 'customer email'] },
    { id: 'tng',         label: "Touch 'n Go",   group: 'Asia wallets', countries: ['MY'], currencies: ['MYR', 'HKD', 'SGD'], needs: ['products', 'customer email'] },
    { id: 'truemoney',   label: 'TrueMoney',     group: 'Asia wallets', countries: ['TH'], currencies: ['THB', 'HKD', 'SGD'], needs: ['products', 'customer email'] },
];
const LINK_LOCALES = ['en-GB', 'ar', 'da-DK', 'de-DE', 'el', 'es-ES', 'fi-FI', 'fil-PH', 'fr-FR', 'hi-IN', 'id-ID', 'it-IT', 'ja-JP', 'ms-MY', 'nb-NO', 'nl-NL', 'pt-PT', 'sv-SE', 'th-TH', 'vi-VN', 'zh-CN', 'zh-HK', 'zh-TW'];

// ── Account Funding Transactions (Authorization Types → AFT) ────────────────────────────────────────────────
// Test cards by ISSUER COUNTRY (Checkout.com "Test cards" page). The issuer country matters for AFTs: it decides
// domestic vs cross-border and whether `instruction.purpose` is required (Visa: AR BD CL CO EG IN MX SA).
// `expect` is what the docs / a real sandbox run showed — never an assumption.
const AFT_TEST_CARDS = [
    { scheme: 'Visa', number: '4242424242424242', country: 'GB', type: 'Credit', expect: 'Default Visa — approved with a valid AFT request' },
    { scheme: 'Visa', number: '4921817844445119', country: 'GB', type: 'Debit',  expect: 'UK debit — approved' },
    { scheme: 'Visa', number: '4978313915783283', country: 'FR', type: 'Debit',  expect: 'French issuer — approved (Europe cross-border)' },
    { scheme: 'Visa', number: '4556574722325580', country: 'PT', type: 'Credit', expect: 'Portuguese issuer' },
    { scheme: 'Visa', number: '4076613139850359', country: 'SG', type: 'Debit',  expect: 'Singapore issuer (APAC)' },
    { scheme: 'Visa', number: '4275765574319271', country: 'JP', type: 'Credit', expect: 'Japanese issuer (APAC)' },
    { scheme: 'Visa', number: '4539929207120660', country: 'IN', type: 'Credit', expect: 'Indian issuer — instruction.purpose is required for Visa AFTs' },
    { scheme: 'Visa', number: '4000020000000000', country: 'US', type: 'Credit', expect: 'US issuer (USA)' },
    { scheme: 'Visa', number: '4024764449971519', country: 'US', type: 'Debit',  expect: 'US debit (USA)' },
    { scheme: 'Visa', number: '4500622868341387', country: 'CA', type: 'Credit', expect: 'Canadian issuer — also the "3DS authentication required" (20154) test card' },
    { scheme: 'Visa', number: '4659465888705671', country: 'GB', type: 'Credit', expect: 'AFT decline card — response 20057 (Transaction not permitted to cardholder) for AFTs' },
    { scheme: 'Mastercard', number: '5436031030606378', country: 'MU', type: 'Credit', expect: 'Default Mastercard' },
    { scheme: 'Mastercard', number: '5305484748800098', country: 'DE', type: 'Debit',  expect: 'German issuer (Europe)' },
    { scheme: 'Mastercard', number: '5355224968521878', country: 'GB', type: 'Debit',  expect: 'UK issuer' },
    { scheme: 'Mastercard', number: '5132728491870081', country: 'FR', type: 'Debit',  expect: 'French issuer' },
    { scheme: 'Mastercard', number: '5526303170157160', country: 'SG', type: 'Debit',  expect: 'Singapore issuer (APAC)' },
    { scheme: 'Mastercard', number: '5318773012490080', country: 'US', type: 'Debit',  expect: 'US issuer (USA)' },
    { scheme: 'Mastercard', number: '5258901507741160', country: 'CA', type: 'Credit', expect: 'Canadian issuer — a 3DS challenge test card' },
    { scheme: 'Mastercard', number: '5355224542121849', country: 'GB', type: 'Credit', expect: 'AFT decline card — response 20057 for AFTs' },
];
const AFT_PURPOSES = ['donations', 'education', 'emergency_need', 'expatriation', 'family_support', 'financial_services', 'gifts', 'income', 'insurance', 'investment', 'it_services', 'leisure', 'loan_payment', 'medical_treatment', 'other', 'pension', 'royalties', 'savings', 'travel_and_tourism'];
