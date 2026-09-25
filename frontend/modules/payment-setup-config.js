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
        blik: [
        { id: 'blik-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'blik-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
        { id: 'blik-partner-code', label: 'Partner Code', path: 'payment_methods.blik.partner_code', value: '999111', maxLength: 6 },
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
     alma: [
        { id: 'alma-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'alma-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
       { id: 'alma-billing-country', label: 'Billing Country', path: 'billing.address.country', value: 'FR' },
       { id: 'alma-city', label: 'Billing City', path: 'billing.address.city', value: 'Paris' },
        { id: 'alma-zip', label: 'Billing Zip', path: 'billing.address.zip', value: 'W1T 4TP' },
        { id: 'alma-addr', label: 'Address Line 1', path: 'billing.address.address_line1', value: '25 Berners St' },
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
        {
            id: 'paypal-billing-type', label: 'Billing Type', path: 'payment_methods.paypal.billing_type', type: 'select',
            options: ['merchant_initiated_billing_single_agreement', 'merchant_initiated_billing', 'channel_initiated_billing', 'channel_initiated_billing_single_agreement'],
            value: 'merchant_initiated_billing_single_agreement',
            showIf: { id: 'setup-payment-type', value: 'Recurring' },
        },
    ],
    googlepay: [
        { id: 'googlepay-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'googlepay-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
    ],
    applepay: [
        { id: 'applepay-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'applepay-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
    ],
    alipay_cn: [
        { id: 'alipaycn-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'alipaycn-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
        { id: 'alipaycn-name', label: 'Customer Name', path: 'customer.name', value: 'Jia Tsang' },
        { id: 'alipaycn-email', label: 'Customer Email', path: 'customer.email.address', value: 'jia.tsang@example.com' },
        { id: 'alipaycn-terminal-type', label: 'Terminal Type', path: 'payment_methods.alipay_cn.terminal_type', type: 'select', options: ['web', 'wap', 'app'], value: 'web' },
        { id: 'alipaycn-os-type', label: 'OS Type', path: 'payment_methods.alipay_cn.os_type', type: 'select', options: ['android', 'ios'], value: 'android', showIf: { id: 'alipaycn-terminal-type', value: 'app' } },
    ],
    benefit: [
        { id: 'benefit-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'benefit-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
    ],
    mbway: [
        { id: 'mbway-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'mbway-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
        { id: 'mbway-name', label: 'Customer Name', path: 'customer.name', value: 'Syed Hasnain' },
        { id: 'mbway-ccode', label: 'Phone Country Code', path: 'customer.phone.country_code', value: '351' },
        { id: 'mbway-phone', label: 'Phone Number', path: 'customer.phone.number', value: '912345678' },
    ],
    knet: [
        { id: 'knet-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'knet-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
        { id: 'knet-language', label: 'Language', path: 'payment_methods.knet.language', type: 'select', options: ['en', 'ar'], value: 'en' },
    ],
    tamara: [
        { id: 'tamara-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'tamara-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
        { id: 'tamara-name', label: 'Customer Name', path: 'customer.name', value: 'Ali Farid' },
        { id: 'tamara-email', label: 'Customer Email', path: 'customer.email.address', value: 'ali.farid@example.com' },
        { id: 'tamara-ccode', label: 'Phone Country Code', path: 'customer.phone.country_code', value: '966' },
        { id: 'tamara-phone', label: 'Phone Number', path: 'customer.phone.number', value: '556002013' },
        { id: 'tamara-ship-addr', label: 'Shipping Address Line 1', path: 'order.shipping.address.address_line1', value: '123 King Fahd Rd' },
        { id: 'tamara-ship-city', label: 'Shipping City', path: 'order.shipping.address.city', value: 'Riyadh' },
        { id: 'tamara-ship-zip', label: 'Shipping Zip', path: 'order.shipping.address.zip', value: '11564' },
        { id: 'tamara-ship-country', label: 'Shipping Country', path: 'order.shipping.address.country', value: 'SA' },
    ],
    tabby: [
        { id: 'tabby-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'tabby-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
        { id: 'tabby-name', label: 'Customer Name', path: 'customer.name', value: 'Hannah Bret' },
        { id: 'tabby-email', label: 'Customer Email', path: 'customer.email.address', value: 'hannah.bret@example.com' },
        { id: 'tabby-phone', label: 'Phone Number', path: 'customer.phone.number', value: '500000001' },
        { id: 'tabby-locale', label: 'Device Locale', path: 'customer.device.locale', value: 'en-AE' },
    ],
    stcpay: [
        { id: 'stcpay-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'stcpay-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
        { id: 'stcpay-email', label: 'Customer Email', path: 'customer.email.address', value: 'hannah.bret@example.com' },
        { id: 'stcpay-ccode', label: 'Phone Country Code', path: 'customer.phone.country_code', value: '966' },
        { id: 'stcpay-phone', label: 'Phone Number', path: 'customer.phone.number', value: '555123456' },
    ],
    vipps: [
        { id: 'vipps-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'vipps-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
    ],
    wechatpay: [
        { id: 'wechatpay-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'wechatpay-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
        { id: 'wechatpay-billing-country', label: 'Billing Country', path: 'billing.address.country', value: 'CN' },
    ],
    octopus: [
        { id: 'octopus-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'octopus-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
    ],
    swish: [
        { id: 'swish-success', label: 'Success URL', path: 'settings.success_url', value: window.location.origin + '/success.html' },
        { id: 'swish-failure', label: 'Failure URL', path: 'settings.failure_url', value: window.location.origin + '/failure.html' },
        { id: 'swish-name', label: 'Customer Name', path: 'customer.name', value: 'Syed Hasnain' },
        { id: 'swish-email', label: 'Customer Email', path: 'customer.email.address', value: 'smhasnain@gmail.com' },
        { id: 'swish-country', label: 'Customer Country', path: 'customer.country', value: 'SE' },
        { id: 'swish-ah-first-name', label: 'Account Holder First Name', path: 'payment_methods.swish.account_holder.first_name', value: 'Syed' },
        { id: 'swish-ah-last-name', label: 'Account Holder Last Name', path: 'payment_methods.swish.account_holder.last_name', value: 'Hasnain' },
        { id: 'swish-billing-descriptor', label: 'Billing Descriptor', path: 'payment_methods.swish.billing_descriptor', value: 'Order Payment' },
    ],
};

// Methods that require order line items in the PATCH body
const METHODS_WITH_ORDER_ITEMS = new Set(['klarna', 'paypal', 'kakaopay']);

// Informational notes shown above the fields for certain methods
const METHOD_NOTES = {
    twint: 'ℹ️ Twint requires CHF — currency will be set to CHF automatically when you patch.',
    kakaopay: 'ℹ️ KakaoPay requires KRW — currency will be set to KRW automatically when you patch.',
    sepa: 'ℹ️ SEPA requires EUR currency and a European bank account (IBAN). Mandate details are mandatory.',
    blik: 'ℹ️ BLIK requires PLN currency and a 6-digit Partner Code (the BLIK PSP ID assigned to your merchant account during onboarding) — default "999111" is this account\'s registered sandbox code. BLIK confirms directly via the customer\'s banking app; there is no redirect page.',
    card: 'ℹ️ Card uses Checkout.com Flow for tokenization. Click "Update Payment Setup" to load the card form.',
    instrument: 'ℹ️ No additional fields required. Patching will enable this instrument for the setup.',
    paypal: 'ℹ️ Billing Type only appears when the top Payment Type selector is set to "Recurring" — it establishes the PayPal billing agreement type for merchant-initiated recurring charges.',
    alipay_cn: 'ℹ️ Alipay CN requires CNY — currency will be set to CNY automatically when you patch. OS Type only appears when Terminal Type is "app".',
    benefit: 'ℹ️ Benefit Pay requires BHD (Bahraini Dinar) — currency will be set to BHD automatically when you patch.',
    mbway: 'ℹ️ MB WAY uses EUR and requires a Portuguese phone number (default country code 351).',
    knet: 'ℹ️ KNET requires KWD (Kuwaiti Dinar) — currency will be set to KWD automatically when you patch.',
    tamara: 'ℹ️ Tamara requires SAR — currency will be set to SAR automatically when you patch. Initialization triggers a live eligibility check against the customer + shipping address; an ineligible customer moves the method to "unavailable".',
    tabby: 'ℹ️ Tabby requires AED — currency will be set to AED automatically when you patch. Supported currencies: AED, SAR, KWD, BHD, QAR. Like Tamara, patching triggers a live eligibility check — sandbox test customers may come back "unavailable" with no flags.',
    stcpay: 'ℹ️ stc pay requires SAR — currency will be set to SAR automatically when you patch. After patching, stc pay sends an OTP to the phone number — enter it below to move to "ready".',
    vipps: 'ℹ️ Vipps requires NOK — currency will be set to NOK automatically when you patch.',
    wechatpay: 'ℹ️ WeChat Pay requires CNY — currency will be set to CNY automatically when you patch. In this sandbox channel it may still return "payment_methods.wechatpay.property_required" beyond the documented fields — likely needs additional account-side activation from Checkout.com.',
    octopus: 'ℹ️ Octopus requires HKD (Hong Kong Dollar) — currency will be set to HKD automatically when you patch.',
    swish: 'ℹ️ Swish requires SEK (Swedish Krona) — currency will be set to SEK automatically when you patch.',
};

// Methods that require a specific currency — set automatically on toggle + patch.
// Add new entries here; no changes needed in payment-setup.js.
const FORCED_CURRENCY = {
    kakaopay:  'KRW',
    twint:     'CHF',
    blik:      'PLN',
    alipay_cn: 'CNY',
    benefit:   'BHD',
    knet:      'KWD',
    tamara:    'SAR',
    tabby:     'AED',
    stcpay:    'SAR',
    vipps:     'NOK',
    wechatpay: 'CNY',
    octopus:   'HKD',
    swish:     'SEK',
};

// Brand colours, abbreviations, Simple Icons CDN logos, and confirm flow for each payment method.
// confirmFlow values:
//   'redirect' — confirm → follow _links.redirect.href  (most APMs)
//   'klarna'   — init Klarna Payments SDK then authorize
//   'paypal'   — init PayPal SDK with orderId
//   'card'     — Flow tokenization (handled in handleFinalState, never reaches renderConfirmButton)
// stc pay's OTP step (action_required + action.type:'otp') is dispatched directly off
// methodData.action.type in handleFinalState, independent of confirmFlow — once the OTP
// is accepted its status becomes 'ready' and it uses the normal 'redirect' confirmFlow.
// logo: null → falls back to abbr text inside the coloured badge.
// To add a new redirect APM: add entry here with confirmFlow:'redirect' + add to METHOD_REQUIREMENTS above. Done.
const METHOD_DISPLAY = {
    klarna:     { bg: '#FFB3C7', color: '#1a1a1a', abbr: 'K',    logo: 'https://cdn.simpleicons.org/klarna/000000',     confirmFlow: 'klarna'   },
    bizum:      { bg: '#004EE4', color: '#fff',    abbr: 'BZ',   logo: 'https://cdn.simpleicons.org/bizum/ffffff',      confirmFlow: 'redirect' },
    eps:        { bg: '#CC0000', color: '#fff',    abbr: 'EPS',  logo: null,                                            confirmFlow: 'redirect' },
    ideal:      { bg: '#CC0066', color: '#fff',    abbr: 'iD',   logo: 'https://cdn.simpleicons.org/ideal/ffffff',      confirmFlow: 'redirect' },
    bancontact: { bg: '#005498', color: '#fff',    abbr: 'BC',   logo: 'https://cdn.simpleicons.org/bancontact/ffffff', confirmFlow: 'redirect' },
    twint:      { bg: '#00A0E6', color: '#fff',    abbr: 'TW',   logo: 'https://cdn.simpleicons.org/twint/ffffff',      confirmFlow: 'redirect' },
    kakaopay:   { bg: '#FAE100', color: '#3C1E1E', abbr: 'KP',   logo: 'https://cdn.simpleicons.org/kakaotalk/3C1E1E', confirmFlow: 'redirect' },
    sepa:       { bg: '#003399', color: '#fff',    abbr: 'SEPA', logo: null,                                            confirmFlow: 'redirect' },
    paypal:     { bg: '#009CDE', color: '#fff',    abbr: 'PP',   logo: 'https://cdn.simpleicons.org/paypal/ffffff',     confirmFlow: 'paypal'   },
    googlepay:  { bg: '#4285F4', color: '#fff',    abbr: 'G',    logo: 'https://pay.google.com/about/static_kcs/images/logos/google-pay-logo.svg', confirmFlow: 'redirect' },
    applepay:   { bg: '#1c1c1e', color: '#fff',    abbr: '🍎',   logo: 'https://cdn.simpleicons.org/applepay/ffffff',   confirmFlow: 'redirect' },
    card:       { bg: '#17a34a', color: '#fff',    abbr: 'CKO',  logo: 'https://cdn.simpleicons.org/checkout/ffffff',  confirmFlow: 'card'     },
    instrument: { bg: '#64748b', color: '#fff',    abbr: '🔧',   logo: null,                                            confirmFlow: 'redirect' },
    p24:        { bg: '#D40E2B', color: '#fff',    abbr: 'P24',  logo: null,                                            confirmFlow: 'redirect' },
    alma:       { bg: '#FA5022', color: '#fff',    abbr: 'AL',   logo: null,                                            confirmFlow: 'redirect' },
    blik:       { bg: '#E32084', color: '#fff',    abbr: 'BL',   logo: null,                                            confirmFlow: 'redirect' },
    alipay_cn:  { bg: '#1678FF', color: '#fff',    abbr: 'AP',   logo: 'https://cdn.simpleicons.org/alipay/ffffff',     confirmFlow: 'redirect' },
    benefit:    { bg: '#8B1E3F', color: '#fff',    abbr: 'BEN',  logo: null,                                            confirmFlow: 'redirect' },
    mbway:      { bg: '#E30074', color: '#fff',    abbr: 'MBW',  logo: null,                                            confirmFlow: 'redirect' },
    knet:       { bg: '#00693E', color: '#fff',    abbr: 'KN',   logo: null,                                            confirmFlow: 'redirect' },
    tamara:     { bg: '#EB6D65', color: '#fff',    abbr: 'TM',   logo: null,                                            confirmFlow: 'redirect' },
    tabby:      { bg: '#5CE6C0', color: '#1a1a1a', abbr: 'TB',   logo: null,                                            confirmFlow: 'redirect' },
    stcpay:     { bg: '#4C15A5', color: '#fff',    abbr: 'STC',  logo: null,                                            confirmFlow: 'redirect' },
    vipps:      { bg: '#FF5B24', color: '#fff',    abbr: 'VP',   logo: 'https://cdn.simpleicons.org/vipps/ffffff',      confirmFlow: 'redirect' },
    wechatpay:  { bg: '#09B83E', color: '#fff',    abbr: 'WC',   logo: 'https://cdn.simpleicons.org/wechat/ffffff',     confirmFlow: 'redirect' },
    octopus:    { bg: '#E4002B', color: '#fff',    abbr: 'OCT',  logo: null,                                            confirmFlow: 'redirect' },
    swish:      { bg: '#EF7E00', color: '#fff',    abbr: 'SW',   logo: 'https://cdn.simpleicons.org/swish/ffffff',      confirmFlow: 'redirect' },
};
