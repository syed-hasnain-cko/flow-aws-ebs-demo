// =============================================
// Payment Setup Config
// Static data objects for the Payment Setup tab.
// Must be loaded before modules/payment-setup.js
// =============================================

const METHOD_REQUIREMENTS = {
    klarna: [
        { id: 'klarna-locale', label: 'Device Locale', path: 'customer.device.locale', value: 'en-GB' },
        { id: 'klarna-city', label: 'Billing City', path: 'billing.address.city', value: 'London' },
        { id: 'klarna-zip', label: 'Billing Zip', path: 'billing.address.zip', value: 'W1T 4TP' },
        { id: 'klarna-addr', label: 'Address Line 1', path: 'billing.address.address_line1', value: '25 Berners St' },
        { id: 'klarna-country', label: 'Billing Country', path: 'billing.address.country', value: 'DE' },
        { id: 'klarna-email', label: 'Customer Email', path: 'customer.email.address', value: 'smhasnain@gmail.com' },
        { id: 'klarna-name', label: 'Customer Name', path: 'customer.name', value: 'Syed Hasnain' }
    ],
    bizum: [
        { id: 'bizum-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'bizum-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
        { id: 'bizum-ccode', label: 'Phone Country Code', path: 'customer.phone.country_code', value: '34' },
        { id: 'bizum-phone', label: 'Phone Number', path: 'customer.phone.number', value: '700000000' },
    ],
    eps: [
        { id: 'eps-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'eps-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
    ],
    ideal: [
        { id: 'ideal-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'ideal-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
    ],
    bancontact: [
        { id: 'bancontact-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'bancontact-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
        { id: 'bancontact-name', label: 'Customer Name', path: 'customer.name', value: 'Syed Hasnain' },
        { id: 'bancontact-email', label: 'Customer Email', path: 'customer.email.address', value: 'smhasnain@gmail.com' },
        { id: 'bancontact-country', label: 'Customer Country', path: 'customer.billing_address.country', value: 'BE' },
    ],
    twint: [
        { id: 'twint-ref', label: 'Reference', path: 'reference', value: '#Order_TWINT_001' },
        { id: 'twint-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'twint-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
    ],
    kakaopay: [
        { id: 'kakaopay-ref', label: 'Reference', path: 'reference', value: '#Order_KAKAO_001' },
        { id: 'kakaopay-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'kakaopay-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
        { id: 'kakaopay-name', label: 'Customer Name', path: 'customer.name', value: 'Syed Hasnain' },
        { id: 'kakaopay-email', label: 'Customer Email', path: 'customer.email.address', value: 'smhasnain@gmail.com' },
    ],
    sepa: [
        { id: 'sepa-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'sepa-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
        { id: 'sepa-city', label: 'Billing City', path: 'billing.address.city', value: 'London' },
        { id: 'sepa-zip', label: 'Billing Zip', path: 'billing.address.zip', value: 'W1T 4TP' },
        { id: 'sepa-addr', label: 'Address Line 1', path: 'billing.address.address_line1', value: '25 Berners St' },
        { id: 'sepa-addr-2', label: 'Address Line 2', path: 'billing.address.address_line2', value: 'xyz' },
        { id: 'sepa-country', label: 'Billing Country', path: 'billing.address.country', value: 'GB' },
    ],
    paypal: [
        { id: 'paypal-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'paypal-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
    ],
    googlepay: [
        { id: 'googlepay-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'googlepay-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
    ],
    applepay: [
        { id: 'applepay-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'applepay-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
    ],
};

// Methods that require order line items in the PATCH body
const METHODS_WITH_ORDER_ITEMS = new Set(['klarna', 'paypal', 'kakaopay']);

// Informational notes shown above the fields for certain methods
const METHOD_NOTES = {
    twint: '⚠️ Twint requires CHF currency. Re-initialize the setup with currency set to CHF if you see a currency flag.',
    kakaopay: '⚠️ KakaoPay may require a specific currency (e.g. KRW). Re-initialize with the correct currency if you see a currency flag.',
    card: 'ℹ️ Card uses Checkout.com Flow for tokenization. Click "Update Payment Setup" to load the card form.',
    instrument: 'ℹ️ No additional fields required. Patching will enable this instrument for the setup.',
};

// Brand colours, abbreviations and Simple Icons CDN logos for each payment method card.
// logo: null → falls back to abbr text inside the coloured badge.
const METHOD_DISPLAY = {
    klarna:     { bg: '#FFB3C7', color: '#1a1a1a', abbr: 'K',    logo: 'https://cdn.simpleicons.org/klarna/000000'     },
    bizum:      { bg: '#004EE4', color: '#fff',    abbr: 'BZ',   logo: 'https://cdn.simpleicons.org/bizum/ffffff'      },
    eps:        { bg: '#CC0000', color: '#fff',    abbr: 'EPS',  logo: null                                            },
    ideal:      { bg: '#CC0066', color: '#fff',    abbr: 'iD',   logo: 'https://cdn.simpleicons.org/ideal/ffffff'      },
    bancontact: { bg: '#005498', color: '#fff',    abbr: 'BC',   logo: 'https://cdn.simpleicons.org/bancontact/ffffff' },
    twint:      { bg: '#00A0E6', color: '#fff',    abbr: 'TW',   logo: 'https://cdn.simpleicons.org/twint/ffffff'      },
    kakaopay:   { bg: '#FAE100', color: '#3C1E1E', abbr: 'KP',   logo: 'https://cdn.simpleicons.org/kakaotalk/3C1E1E' },
    sepa:       { bg: '#003399', color: '#fff',    abbr: 'SEPA', logo: null                                            },
    paypal:     { bg: '#009CDE', color: '#fff',    abbr: 'PP',   logo: 'https://cdn.simpleicons.org/paypal/ffffff'     },
    googlepay:  { bg: '#4285F4', color: '#fff',    abbr: 'G',    logo: 'https://pay.google.com/about/static_kcs/images/logos/google-pay-logo.svg'  },
    applepay:   { bg: '#1c1c1e', color: '#fff',    abbr: '🍎',   logo: 'https://cdn.simpleicons.org/applepay/ffffff'   },
    card:       { bg: '#17a34a', color: '#fff',    abbr: 'CKO',  logo: 'https://cdn.simpleicons.org/checkout/ffffff'   },
    instrument: { bg: '#64748b', color: '#fff',    abbr: '🔧',   logo: null                                            },
};
