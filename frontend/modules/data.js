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
