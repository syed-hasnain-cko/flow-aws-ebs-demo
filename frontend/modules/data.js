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
