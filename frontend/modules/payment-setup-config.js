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
        { id: 'ideal-description', label: 'Description', path: 'payment_methods.ideal.description', value: 'Order payment', maxLength: 35 },
    ],
    bancontact: [
        { id: 'bancontact-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'bancontact-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
        { id: 'bancontact-name', label: 'Customer Name', path: 'customer.name', value: 'Syed Hasnain' },
        { id: 'bancontact-email', label: 'Customer Email', path: 'customer.email.address', value: 'smhasnain@gmail.com' },
        { id: 'bancontact-country', label: 'Customer Country', path: 'customer.country', value: 'BE' },
        { id: 'bancontact-account-holder-name', label: 'Account Holder Name', path: 'payment_methods.bancontact.account_holder_name', value: 'Syed H' },
    ],
        p24: [
        { id: 'p24-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'p24-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
        { id: 'p24-name', label: 'Customer Name', path: 'payment_methods.p24.account_holder.name', value: 'Syed Hasnain' },
        { id: 'p24-email', label: 'Customer Email', path: 'payment_methods.p24.account_holder.email', value: 'smhasnain@gmail.com' },
        { id: 'p24-customer', label: 'Customer Country', path: 'customer.country', value: 'PL' }
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
        { id: 'kakaopay-terminal-type', label: 'Terminal type', path: 'payment_methods.kakaopay.terminal_type', value: 'web' },
        { id: 'kakaopay-os-type', label: 'OS type', path: 'payment_methods.kakaopay.os_type', value: 'android' },
    ],
    sepa: [
        { id: 'sepa-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'sepa-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
        { id: 'sepa-city', label: 'Billing City', path: 'billing.address.city', value: 'London' },
        { id: 'sepa-zip', label: 'Billing Zip', path: 'billing.address.zip', value: 'W1T 4TP' },
        { id: 'sepa-addr', label: 'Address Line 1', path: 'billing.address.address_line1', value: '25 Berners St' },
        { id: 'sepa-addr-2', label: 'Address Line 2', path: 'billing.address.address_line2', value: 'xyz' },
        { id: 'sepa-billing-country', label: 'Billing Country', path: 'billing.address.country', value: 'DE' },
        // payment_methods.sepa fields
        { id: 'sepa-ah-type', label: 'Account Holder Type', path: 'payment_methods.sepa.account_holder.type', type: 'select', options: ['individual', 'corporate'], value: 'individual' },
        { id: 'sepa-ah-first-name', label: 'First Name', path: 'payment_methods.sepa.account_holder.first_name', value: 'Syed', showIf: { id: 'sepa-ah-type', value: 'individual' } },
        { id: 'sepa-ah-last-name', label: 'Last Name', path: 'payment_methods.sepa.account_holder.last_name', value: 'Hasnain', showIf: { id: 'sepa-ah-type', value: 'individual' } },
        { id: 'sepa-ah-company', label: 'Company Name', path: 'payment_methods.sepa.account_holder.company_name', value: '', showIf: { id: 'sepa-ah-type', value: 'corporate' } },
        { id: 'sepa-account-number', label: 'Account Number (IBAN)', path: 'payment_methods.sepa.account_number', value: 'DE89370400440532013000' },
        { id: 'sepa-sepa-country', label: 'Account Country', path: 'payment_methods.sepa.country', value: 'DE' },
        { id: 'sepa-sepa-currency', label: 'Account Currency', path: 'payment_methods.sepa.currency', value: 'EUR' },
        { id: 'sepa-mandate-id', label: 'Mandate ID', path: 'payment_methods.sepa.mandate.id', value: 'mandate-001' },
        { id: 'sepa-mandate-type', label: 'Mandate Type', path: 'payment_methods.sepa.mandate.type', type: 'select', options: ['core', 'b2b'], value: 'core' },
        { id: 'sepa-mandate-date', label: 'Mandate Date Signed', path: 'payment_methods.sepa.mandate.date_of_signature', type: 'date', value: new Date().toISOString().slice(0, 10) },
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
    twint: 'ℹ️ Twint requires CHF — currency will be set to CHF automatically when you patch.',
    kakaopay: 'ℹ️ KakaoPay requires KRW — currency will be set to KRW automatically when you patch.',
    sepa: 'ℹ️ SEPA requires EUR currency and a European bank account (IBAN). Mandate details are mandatory.',
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
