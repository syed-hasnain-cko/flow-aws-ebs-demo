// =============================================
// Account Funding Transactions (AFT) — Authorization Types → "Account Funding Transaction"
// Docs: https://www.checkout.com/docs/payments/manage-payments/perform-an-account-funding-transaction
//   - Visa and Mastercard AFTs are POST /payments with processing.aft = true plus `sender` / `recipient`.
//   - What sender / recipient must contain depends on the scheme, the operating region and whether the
//     transaction is domestic or cross-border. Checkout.com also validates field formats (names, addresses,
//     prohibited countries) and answers 422 when they fail.
// This module: scenario picker → default request per scenario (editable) → live qualification checklist
// built from the docs → request builder + result diagnosis. Backend: the existing /payments route
// (now forwarding sender / recipient / instruction) and /card-metadata for the issuer-country check.
// Depends on: auth-types.js (calls window.AftTest.*), data.js (AFT_TEST_CARDS, AFT_PURPOSES, COUNTRIES, CURRENCIES).
// =============================================

(function () {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const apiBase = () => window.APP_CONFIG.apiBaseUrl;

    // ─── Reference data ──────────────────────────────────────────────────────────
    const SCHEMES = { visa: 'Visa', mastercard: 'Mastercard' };
    const REGIONS = { europe: 'Europe', apac: 'APAC', canada: 'Canada', uae: 'UAE', usa: 'USA' };
    const REGION_CURRENCY = { europe: 'GBP', apac: 'SGD', canada: 'CAD', uae: 'AED', usa: 'USD' };
    const EUROPE = ['AD', 'AL', 'AT', 'BA', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD', 'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'SE', 'SI', 'SK', 'SM', 'UA', 'VA'];
    const SOUTH_PACIFIC = ['AU', 'NZ', 'FJ', 'PG', 'WS', 'TO', 'VU', 'SB', 'KI', 'TV', 'NR', 'PW', 'FM', 'MH', 'CK', 'NU', 'TK', 'PF', 'NC'];
    const APAC = [...SOUTH_PACIFIC, 'SG', 'JP', 'KR', 'CN', 'HK', 'TW', 'IN', 'ID', 'MY', 'PH', 'TH', 'VN', 'BD', 'LK', 'PK', 'MO', 'BN', 'KH', 'NP'];
    const REGION_COUNTRIES = { europe: EUROPE, apac: APAC, canada: ['CA'], uae: ['AE'], usa: ['US'] };
    const PROHIBITED = { AF: 'Afghanistan', BY: 'Belarus', CU: 'Cuba', IQ: 'Iraq', IR: 'Iran', KP: 'North Korea', LY: 'Libya', RU: 'Russia', SD: 'Sudan', SY: 'Syria', VE: 'Venezuela' };
    const PURPOSE_REQUIRED_ISSUERS = ['AR', 'BD', 'CL', 'CO', 'EG', 'IN', 'MX', 'SA'];   // Visa only
    const TITLES_HARD = ['MR', 'MRS', 'MISS'];                                              // named in the docs
    const TITLES_SOFT = ['MS', 'MX', 'DR', 'SIR', 'MADAM', 'MASTER'];                       // honorifics in the same spirit
    const DISALLOWED_NAMES = ['CARD', 'TECHNOBANK', 'INSTANT', 'VIRTUAL', 'MY', 'KDV', 'GOLD', 'VISA', 'MONO', 'VIZA', 'PRIVATE', 'TESTER', 'UNKNOWN', 'NA', 'TEST'];

    // Per-country sample address data for the defaults (editable afterwards).
    const SAMPLE = {
        GB: { city: 'London', line1: '123 High St', zip: 'SW1A 1AA' }, FR: { city: 'Paris', line1: '12 Rue de Rivoli', zip: '75001' },
        DE: { city: 'Berlin', line1: 'Lauterbergerstr 23', zip: '12347' }, SG: { city: 'Singapore', line1: '10 Anson Road', zip: '079903' },
        JP: { city: 'Tokyo', line1: '1-1 Chiyoda', zip: '100-0001' }, CA: { city: 'Toronto', line1: '100 King St W', zip: 'M5X 1A9', state: 'ON' },
        AE: { city: 'Dubai', line1: 'Sheikh Zayed Road', zip: '00000' }, US: { city: 'Austin', line1: '1 Main St', zip: '78701', state: 'TX' },
        AU: { city: 'Sydney', line1: '1 George St', zip: '2000', state: 'NSW' },
    };
    const sample = (c) => SAMPLE[c] || { city: 'Capital City', line1: '1 Main St', zip: '10000' };
    // Default sender/recipient countries per scenario.
    const DEFAULT_COUNTRIES = {
        'europe:domestic': ['GB', 'GB'], 'europe:cross': ['GB', 'FR'], 'apac:domestic': ['SG', 'SG'], 'apac:cross': ['SG', 'JP'],
        'canada:domestic': ['CA', 'CA'], 'canada:cross': ['CA', 'US'], 'uae:domestic': ['AE', 'AE'], 'uae:cross': ['GB', 'AE'],
        'usa:domestic': ['US', 'US'], 'usa:cross': ['US', 'GB'],
    };

    // ─── Requirement matrix (docs: "Perform a Visa AFT" / "Perform a Mastercard AFT") ───────────────────────
    // S / R = sender / recipient fields that are REQUIRED. Absent scenario = not supported.
    const S_FULL = ['type', 'first_name', 'last_name', 'date_of_birth', 'address_line1', 'city', 'country'];     // + state if sender in US/CA
    const S_US = ['type', 'first_name', 'last_name', 'address_line1', 'city', 'state', 'zip', 'country'];
    const R_BASE = ['first_name', 'last_name', 'account_number'];
    const R_US_VISA = ['first_name', 'last_name', 'address_line1', 'city', 'state', 'zip', 'country'];
    const RULES = {
        visa: {
            'europe:domestic': { S: [], R: R_BASE },
            'europe:cross': { S: S_FULL, R: R_BASE, visaCross: true },
            'apac:domestic': { S: [], R: [] },
            'apac:cross': { S: S_FULL, R: R_BASE, visaCross: true },
            'canada:domestic': { S: [], R: [] },
            'uae:domestic': { S: [], R: [] },
            'uae:cross': { S: S_FULL, R: R_BASE, visaCross: true },
            'usa:domestic': { S: S_US, R: R_US_VISA },
        },
        mastercard: {
            'europe:domestic': { S: [], R: R_BASE, rCard: ['country'] },
            'europe:cross': { S: [], R: R_BASE, rCard: ['country'] },
            'apac:domestic': { S: [], R: R_BASE, rCard: ['country'] },
            'apac:cross': { S: [], R: R_BASE, rCard: ['country'] },
            'canada:domestic': { S: [], R: [...R_BASE, 'country'] },
            'uae:domestic': { S: [], R: R_BASE, rCard: ['country'] },
            'uae:cross': { S: [], R: R_BASE, rCard: ['country'], conflict: 'The docs list UAE cross-border requirements for Mastercard but also state UAE cross-border is not supported for Mastercard.' },
            'usa:domestic': { S: S_US, R: R_BASE, rCard: ['address_line1', 'city', 'state', 'zip', 'country'] },
        },
    };
    const UNSUPPORTED_NOTE = {
        'visa:usa:cross': 'USA cross-border Visa AFTs are not supported (docs).',
        'mastercard:usa:cross': 'USA cross-border Mastercard AFTs are not supported (docs).',
    };

    const TX_MODES = {
        oneoff: { label: 'One-off payment', desc: 'A single customer-initiated AFT.' },
        rec_init: { label: 'Recurring — initial', desc: 'Stores the card (payment_type Recurring) with a mandated 3DS challenge.', type: 'Recurring', initial: true },
        unsch_init: { label: 'Unscheduled — initial', desc: 'Stores the card (payment_type Unscheduled) with a mandated 3DS challenge.', type: 'Unscheduled', initial: true },
        rec_mit: { label: 'Recurring — subsequent (MIT)', desc: 'Merchant-initiated; needs the initial payment id.', type: 'Recurring', mit: true },
        unsch_mit: { label: 'Unscheduled — subsequent (MIT)', desc: 'Merchant-initiated; needs the initial payment id and a reason.', type: 'Unscheduled', mit: true },
    };

    // ─── State ───────────────────────────────────────────────────────────────────
    const state = {
        built: false, scheme: 'visa', region: 'europe', category: 'cross', target: 'account', tx: 'oneoff',
        includeSender: true, includeRecipient: true, validate: true, purpose: '', prevPayment: '', mitReason: 'delayed_charge', lastPaymentId: null,
        issuer: null,          // { country, scheme, type, source: 'table' | 'metadata', number }
        currencyAuto: null,
    };

    // field definitions (flat names; address.* fields are sent under `address`)
    const FIELDS = {
        s: [['type', 'type'], ['first_name', 'first_name'], ['last_name', 'last_name'], ['date_of_birth', 'date_of_birth'], ['address_line1', 'address.address_line1'], ['address_line2', 'address.address_line2'], ['city', 'address.city'], ['state', 'address.state'], ['zip', 'address.zip'], ['country', 'address.country']],
        r: [['first_name', 'first_name'], ['last_name', 'last_name'], ['account_number', 'account_number'], ['address_line1', 'address.address_line1'], ['address_line2', 'address.address_line2'], ['city', 'address.city'], ['state', 'address.state'], ['zip', 'address.zip'], ['country', 'address.country']],
    };
    const PARTY_LABEL = { s: 'sender', r: 'recipient' };
    const fid = (p, k) => `aft-${p}-${k}`;
    const getv = (p, k) => ($(fid(p, k))?.value ?? '').toString();
    const key = () => `${state.region}:${state.category}`;

    // ─── Requirements for the current scenario ───────────────────────────────────
    function scenarioRule() { return RULES[state.scheme][key()] || null; }

    // → { supported, note, sender: {field: 'req'|'cond:why'}, recipient: {...}, optionalSender, optionalRecipient }
    function requirements() {
        const rule = scenarioRule();
        const out = { rule, supported: !!rule, note: UNSUPPORTED_NOTE[`${state.scheme}:${state.region}:${state.category}`] || (!rule ? `${SCHEMES[state.scheme]} AFTs do not list a ${REGIONS[state.region]} ${state.category === 'cross' ? 'cross-border' : 'domestic'} scenario in the docs.` : ''), sender: {}, recipient: {} };
        if (!rule) return out;
        rule.S.forEach(f => { out.sender[f] = 'req'; });
        rule.R.forEach(f => { out.recipient[f] = 'req'; });
        const isCard = state.target === 'card';
        (rule.rCard || []).forEach(f => { if (isCard) out.recipient[f] = 'req'; else if (!out.recipient[f]) out.recipient[f] = 'cond:only when funding a card'; });
        // Conditional rules
        const sCountry = getv('s', 'country').toUpperCase(), rCountry = getv('r', 'country').toUpperCase(), issuer = state.issuer?.country;
        if (rule.S.length && ['US', 'CA'].includes(sCountry)) out.sender.state = 'req';
        else if (rule.S.length && !out.sender.state) out.sender.state = 'cond:required if the sender is in the US or Canada';
        if (rule.visaCross) {
            const isPacific = SOUTH_PACIFIC.includes(rCountry) || SOUTH_PACIFIC.includes(issuer);
            if (isPacific && isCard) out.recipient.address_line1 = 'req';
            else if (!out.recipient.address_line1) out.recipient.address_line1 = 'cond:required for cards issued in AU / NZ / South Pacific';
            if (rCountry === 'CA' || issuer === 'CA') ['address_line1', 'city', 'state', 'zip', 'country'].forEach(f => { out.recipient[f] = 'req'; });
            else ['city', 'state', 'zip', 'country'].forEach(f => { if (!out.recipient[f]) out.recipient[f] = 'cond:required for recipients in Canada / cards issued in Canada'; });
        }
        return out;
    }

    // ─── Validators (docs: "Field validation requirements") ──────────────────────
    function checkName(v) {
        const e = [];
        if (/\t|\n|\r/.test(v) || /\s{2,}/.test(v)) e.push('contains double spaces, tabs or other whitespace');
        if (/[0-9٠-٩۰-۹]/.test(v)) e.push('contains numeric characters');
        if (/\p{Extended_Pictographic}/u.test(v)) e.push('contains an emoji');
        const stripped = v.replace(/[0-9٠-٩۰-۹]/g, '').replace(/\p{Extended_Pictographic}/gu, '').replace(/[\s]/g, ' ');
        const bad = [...stripped].find(c => !/[A-Za-zÀ-ɏḀ-ỿ '’\-.]/.test(c));
        if (bad) e.push(`contains a non-Latin or special character (“${bad}”)`);
        const tokens = v.toUpperCase().split(/\s+/).filter(Boolean);
        const tHard = tokens.find(t => TITLES_HARD.includes(t.replace('.', '')));
        if (tHard) e.push(`contains the honorific “${tHard}” (titles are not allowed)`);
        const dis = tokens.find(t => DISALLOWED_NAMES.includes(t));
        if (dis) e.push(`contains the disallowed value “${dis}”`);
        const w = [];
        if (/['’\-.]/.test(v) && !e.length) w.push('apostrophes, hyphens and dots count as special characters in the docs — they may be rejected');
        const tSoft = tokens.find(t => TITLES_SOFT.includes(t.replace('.', '')));
        if (tSoft) w.push(`“${tSoft}” looks like an honorific title`);
        return { e, w };
    }
    function checkAddressLine(v) {
        const e = [];
        if (/\t|\n|\r/.test(v) || /\s{2,}/.test(v)) e.push('contains double spaces, tabs or other whitespace');
        const bad = [...v].find(c => !/[A-Za-z0-9À-ɏḀ-ỿ .,'’\-/#]/.test(c));
        if (bad) e.push(`contains a special or non-Latin character (“${bad}”)`);
        return { e, w: [] };
    }
    function checkCityState(v) {
        const e = [];
        if (/\t|\n|\r/.test(v) || /\s{2,}/.test(v)) e.push('contains double spaces, tabs or other whitespace');
        if (/[0-9٠-٩۰-۹]/.test(v)) e.push('contains numeric characters');
        const bad = [...v.replace(/[0-9]/g, '')].find(c => !/[A-Za-zÀ-ɏḀ-ỿ '’\-.]/.test(c));
        if (bad) e.push(`contains a special or non-Latin character (“${bad}”)`);
        return { e, w: [] };
    }
    const luhn = (n) => { let s = 0, d = false; for (let i = n.length - 1; i >= 0; i--) { let x = +n[i]; if (d) { x *= 2; if (x > 9) x -= 9; } s += x; d = !d; } return s % 10 === 0; };
    function checkAccountNumber(v) {
        const clean = v.replace(/\s+/g, '');
        if (state.target === 'card') {
            if (!/^\d{13,19}$/.test(clean)) return { e: ['a card target needs the full PAN (13–19 digits)'], w: [] };
            return luhn(clean) ? { e: [], w: [] } : { e: [], w: ['the PAN fails the Luhn check'] };
        }
        const ok = /^[A-Za-z]{2}\d{2}[A-Za-z0-9]{11,30}$/.test(clean) || /^\+?\d{7,15}$/.test(clean) || /^\d{10}$/.test(clean);
        return ok ? { e: [], w: [] } : { e: [], w: ['expected an IBAN, a phone number, or the first 6 + last 4 digits of the PAN'] };
    }
    function checkDob(v) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { e: ['use the format YYYY-MM-DD'], w: [] };
        const d = new Date(v + 'T00:00:00Z');
        if (isNaN(d) || d.toISOString().slice(0, 10) !== v) return { e: ['not a valid date'], w: [] };
        if (d > new Date()) return { e: ['date of birth is in the future'], w: [] };
        return { e: [], w: [] };
    }

    // Evaluate everything → { checks, fieldErrors, fieldWarns, errors, warnings, blocking }
    function evaluate() {
        const req = requirements();
        const checks = [], fe = {}, fw = {};
        const add = (level, area, text, field) => checks.push({ level, area, text, field });
        const sName = SCHEMES[state.scheme], scen = `${sName} · ${REGIONS[state.region]} · ${state.category === 'cross' ? 'cross-border' : 'domestic'}`;

        // 1. scenario support
        if (!req.supported) add('error', 'Scenario', `${scen}: ${req.note}`);
        else {
            add('ok', 'Scenario', `${scen} is a supported AFT scenario.`);
            if (req.rule.conflict) add('warn', 'Scenario', req.rule.conflict + ' Treat the result as exploratory.');
        }

        // 2. card scheme vs selected scheme
        const pan = ($('at-card-number')?.value || '').replace(/\s+/g, '');
        const detected = /^4/.test(pan) ? 'visa' : (/^(5[1-5]|2(2[2-9][1-9]|[3-6]\d\d|7[01]\d|720))/.test(pan) ? 'mastercard' : null);
        if (!pan) add('error', 'Card', 'Enter a card number (or pick a test card).');
        else if (detected && detected !== state.scheme) add('error', 'Card', `This looks like a ${SCHEMES[detected]} card but ${sName} is selected.`);
        else if (state.issuer?.scheme && state.issuer.scheme.toLowerCase() !== state.scheme && state.issuer.source === 'metadata') add('error', 'Card', `Card metadata says ${state.issuer.scheme}, not ${sName}.`);
        else add('ok', 'Card', `Card matches ${sName}${state.issuer ? ` · issued in ${state.issuer.country}` : ' (issuer country not checked yet — use “Check card”)'}.`);

        // 3. domestic / cross-border consistency from the countries that are known
        const sC = state.includeSender ? getv('s', 'country').toUpperCase() : '';
        const rC = state.includeRecipient ? getv('r', 'country').toUpperCase() : '';
        const known = [['issuer', state.issuer?.country], ['sender', sC], ['recipient', rC]].filter(([, c]) => c);
        const uniq = [...new Set(known.map(([, c]) => c))];
        if (req.supported) {
            if (state.category === 'domestic') {
                if (uniq.length > 1) add('warn', 'Region', `Marked domestic, but the countries differ (${known.map(([w, c]) => `${w} ${c}`).join(', ')}). The scheme will treat this as cross-border, where different data is required.`);
                else if (uniq.length === 1 && !REGION_COUNTRIES[state.region].includes(uniq[0])) add('warn', 'Region', `${uniq[0]} is outside ${REGIONS[state.region]}.`);
                else if (uniq.length === 1) add('ok', 'Region', `Issuer, sender and recipient are all in ${uniq[0]} — domestic.`);
            } else {
                if (known.length >= 2 && uniq.length === 1) add('warn', 'Region', `Marked cross-border, but every known country is ${uniq[0]} — this is domestic in practice.`);
                else if (uniq.length > 1) add('ok', 'Region', `Countries differ (${known.map(([w, c]) => `${w} ${c}`).join(', ')}) — cross-border.`);
            }
        }

        // 4. required fields
        const present = (p, f) => getv(p, f).trim() !== '';
        const missing = { s: [], r: [] };
        [['s', req.sender], ['r', req.recipient]].forEach(([p, map]) => {
            const included = p === 's' ? state.includeSender : state.includeRecipient;
            Object.entries(map).forEach(([f, how]) => {
                if (how === 'req' && included && !present(p, f)) { missing[p].push(f); fe[`${p}.${f}`] = 'required for this scenario'; }
            });
        });
        if (req.supported) {
            const senderReq = Object.values(req.sender).includes('req'), recReq = Object.values(req.recipient).includes('req');
            if (!state.includeSender) { if (senderReq) add('error', 'Sender', 'The sender is excluded from the request but is required in this scenario — the AFT will be declined / rejected.'); else add('info', 'Sender', 'Sender excluded — optional in this scenario.'); }
            else if (!senderReq) add('info', 'Sender', 'Sender data is optional in this scenario.');
            else if (missing.s.length) add('error', 'Sender', `Missing required sender field${missing.s.length > 1 ? 's' : ''}: ${missing.s.join(', ')}.`);
            else add('ok', 'Sender', 'All required sender fields are present.');
            if (!state.includeRecipient) { if (recReq) add('error', 'Recipient', 'The recipient is excluded from the request but is required in this scenario — the AFT will be declined / rejected.'); else add('info', 'Recipient', 'Recipient excluded — optional in this scenario.'); }
            else if (!recReq) add('info', 'Recipient', 'Recipient data is optional in this scenario.');
            else if (missing.r.length) add('error', 'Recipient', `Missing required recipient field${missing.r.length > 1 ? 's' : ''}: ${missing.r.join(', ')}.`);
            else add('ok', 'Recipient', 'All required recipient fields are present.');
        }

        // 5. field formats for everything that is filled in
        const fmt = (p, f, v, fn) => { const r = fn(v); if (r.e.length) fe[`${p}.${f}`] = r.e[0]; else if (r.w.length) fw[`${p}.${f}`] = r.w[0]; return r; };
        const formatIssues = [];
        ['s', 'r'].forEach(p => {
            if ((p === 's' && !state.includeSender) || (p === 'r' && !state.includeRecipient)) return;
            ['first_name', 'last_name'].forEach(f => { const v = getv(p, f); if (v.trim()) { const r = fmt(p, f, v, checkName); r.e.forEach(m => formatIssues.push(['error', `${PARTY_LABEL[p]}.${f} ${m}`])); r.w.forEach(m => formatIssues.push(['warn', `${PARTY_LABEL[p]}.${f}: ${m}`])); } });
            ['address_line1', 'address_line2'].forEach(f => { const v = getv(p, f); if (v.trim()) { const r = fmt(p, f, v, checkAddressLine); r.e.forEach(m => formatIssues.push(['error', `${PARTY_LABEL[p]}.address.${f} ${m}`])); } });
            ['city', 'state'].forEach(f => { const v = getv(p, f); if (v.trim()) { const r = fmt(p, f, v, checkCityState); r.e.forEach(m => formatIssues.push(['error', `${PARTY_LABEL[p]}.address.${f} ${m}`])); } });
            const st = getv(p, 'state').trim(); if (st && st.length > 3) { fe[`${p}.state`] = 'max 3 characters (ISO 3166-2 code, e.g. TX)'; formatIssues.push(['error', `${PARTY_LABEL[p]}.address.state is longer than 3 characters`]); }
            const c = getv(p, 'country').trim().toUpperCase();
            if (c && PROHIBITED[c]) { fe[`${p}.country`] = `${PROHIBITED[c]} is a prohibited country`; formatIssues.push(['error', `${PARTY_LABEL[p]}.address.country ${c} (${PROHIBITED[c]}) is prohibited — the payment is declined`]); }
        });
        const dob = getv('s', 'date_of_birth').trim(); if (state.includeSender && dob) { const r = fmt('s', 'date_of_birth', dob, checkDob); r.e.forEach(m => formatIssues.push(['error', `sender.date_of_birth ${m}`])); }
        const acc = getv('r', 'account_number').trim(); if (state.includeRecipient && acc) { const r = fmt('r', 'account_number', acc, checkAccountNumber); r.e.forEach(m => formatIssues.push(['error', `recipient.account_number: ${m}`])); r.w.forEach(m => formatIssues.push(['warn', `recipient.account_number: ${m}`])); }
        if (formatIssues.length) formatIssues.forEach(([lvl, t]) => add(lvl, 'Formats', t));
        else add('ok', 'Formats', 'Names, addresses and countries pass the documented format rules.');

        // 6. purpose (Visa)
        if (state.scheme === 'visa') {
            if (state.issuer?.country && PURPOSE_REQUIRED_ISSUERS.includes(state.issuer.country)) {
                if (!state.purpose) { add('error', 'Purpose', `instruction.purpose is required: the card is issued in ${state.issuer.country}.`); fe.purpose = 'required for this issuer country'; }
                else add('ok', 'Purpose', `instruction.purpose set (${state.purpose}) — required for ${state.issuer.country}-issued cards.`);
            } else if (!state.issuer) add('info', 'Purpose', `instruction.purpose is required for Visa cards issued in ${PURPOSE_REQUIRED_ISSUERS.join(', ')}. Use “Check card” to see the issuer country.`);
            else add('ok', 'Purpose', `Not required for a ${state.issuer.country}-issued card.`);
        }

        // 7. transaction type
        const tx = TX_MODES[state.tx];
        if (tx.mit) {
            if (!state.prevPayment.trim()) add('error', 'Transaction', 'A subsequent (MIT) payment needs previous_payment_id — the initial payment.');
            else add('ok', 'Transaction', `${tx.label} linked to ${state.prevPayment.trim()}.`);
            if (state.scheme !== 'visa') add('warn', 'Transaction', 'The docs describe merchant-initiated AFTs for Visa only.');
        } else if (tx.initial) {
            add('info', 'Transaction', `${tx.label}: sends 3ds.enabled with challenge_requested_mandate — the card may need a 3DS challenge (202) which this tester does not complete.`);
        }
        const amt = parseInt($('at-amount')?.value, 10);
        if (!(amt >= 0)) add('error', 'Payment', 'Enter an amount.');

        const errors = checks.filter(c => c.level === 'error').length, warnings = checks.filter(c => c.level === 'warn').length;
        return { checks, fe, fw, errors, warnings, req };
    }

    // ─── Rendering ───────────────────────────────────────────────────────────────
    function pills(id, items, current) {
        return `<div class="aft-pills" id="${id}">${items.map(([k, l, extra]) => `<div class="aft-pill ${current === k ? 'active' : ''}" data-v="${esc(k)}">${esc(l)}${extra || ''}</div>`).join('')}</div>`;
    }
    // The app-wide country list is short (and leaves out every country AFTs prohibit), so the AFT form builds its own:
    // the shared list + every country in the AFT regions / purpose rule + the prohibited ones (labelled, so that rule can be tested).
    const COUNTRY_NAMES = { AD: 'Andorra', AL: 'Albania', AT: 'Austria', BA: 'Bosnia and Herzegovina', BE: 'Belgium', BG: 'Bulgaria', CH: 'Switzerland', CY: 'Cyprus', CZ: 'Czechia', DE: 'Germany', DK: 'Denmark', EE: 'Estonia', ES: 'Spain', FI: 'Finland', FR: 'France', GB: 'United Kingdom', GR: 'Greece', HR: 'Croatia', HU: 'Hungary', IE: 'Ireland', IS: 'Iceland', IT: 'Italy', LI: 'Liechtenstein', LT: 'Lithuania', LU: 'Luxembourg', LV: 'Latvia', MC: 'Monaco', MD: 'Moldova', ME: 'Montenegro', MK: 'North Macedonia', MT: 'Malta', NL: 'Netherlands', NO: 'Norway', PL: 'Poland', PT: 'Portugal', RO: 'Romania', RS: 'Serbia', SE: 'Sweden', SI: 'Slovenia', SK: 'Slovakia', SM: 'San Marino', UA: 'Ukraine', VA: 'Vatican City',
        AU: 'Australia', NZ: 'New Zealand', FJ: 'Fiji', PG: 'Papua New Guinea', WS: 'Samoa', TO: 'Tonga', VU: 'Vanuatu', SB: 'Solomon Islands', KI: 'Kiribati', TV: 'Tuvalu', NR: 'Nauru', PW: 'Palau', FM: 'Micronesia', MH: 'Marshall Islands', CK: 'Cook Islands', NU: 'Niue', TK: 'Tokelau', PF: 'French Polynesia', NC: 'New Caledonia',
        SG: 'Singapore', JP: 'Japan', KR: 'South Korea', CN: 'China', HK: 'Hong Kong', TW: 'Taiwan', IN: 'India', ID: 'Indonesia', MY: 'Malaysia', PH: 'Philippines', TH: 'Thailand', VN: 'Vietnam', BD: 'Bangladesh', LK: 'Sri Lanka', PK: 'Pakistan', MO: 'Macao', BN: 'Brunei', KH: 'Cambodia', NP: 'Nepal',
        CA: 'Canada', AE: 'United Arab Emirates', US: 'United States', AR: 'Argentina', CL: 'Chile', CO: 'Colombia', EG: 'Egypt', MX: 'Mexico', SA: 'Saudi Arabia', BR: 'Brazil', ZA: 'South Africa' };
    let _countryOpts = null;
    const countryOpts = () => {
        if (_countryOpts) return _countryOpts;
        const all = {};
        (typeof COUNTRIES !== 'undefined' ? COUNTRIES : []).forEach(c => { all[c.alpha2Code] = c.name; });
        Object.entries(COUNTRY_NAMES).forEach(([c, n]) => { if (!all[c]) all[c] = n; });
        const ok = Object.entries(all).filter(([c]) => !PROHIBITED[c]).sort((a, b) => a[1].localeCompare(b[1]));
        _countryOpts = ok.map(([c, n]) => `<option value="${esc(c)}">${esc(n)} (${esc(c)})</option>`).join('')
            + Object.entries(PROHIBITED).map(([c, n]) => `<option value="${c}">${esc(n)} (${c}) — prohibited for AFT</option>`).join('');
        return _countryOpts;
    };
    // The shared currency dropdown lacks some regional currencies (CAD, JPY…) — add what the AFT scenarios need.
    function ensureCurrencies() {
        const cur = $('at-currency'); if (!cur) return;
        ['GBP', 'EUR', 'USD', 'SGD', 'CAD', 'AED', 'JPY', 'AUD', 'HKD', 'INR'].forEach(c => { if (![...cur.options].some(o => o.value === c)) { const o = document.createElement('option'); o.value = c; o.textContent = c; cur.appendChild(o); } });
    }

    function partyHtml(p) {
        const rows = FIELDS[p].map(([flat, label]) => {
            const id = fid(p, flat);
            let input;
            if (flat === 'country') input = `<select id="${id}" class="select-input aft-in"><option value="">—</option>${countryOpts()}</select>`;
            else if (flat === 'type') input = `<select id="${id}" class="select-input aft-in"><option value="individual">individual</option><option value="corporate">corporate</option></select>`;
            else if (flat === 'date_of_birth') input = `<input type="date" id="${id}" class="text-input aft-in">`;
            else input = `<input type="text" id="${id}" class="text-input aft-in" autocomplete="off">`;
            return `<div class="form-group aft-f" data-f="${p}.${flat}"><label for="${id}" class="text-label">${esc(PARTY_LABEL[p])}.${esc(label)} <span class="aft-badge"></span></label>${input}<div class="aft-msg"></div></div>`;
        }).join('');
        return `<div class="aft-party" id="aft-party-${p}">
            <div class="aft-party-h"><b>${p === 's' ? 'Sender' : 'Recipient'}</b><label class="aft-inc"><input type="checkbox" id="aft-include-${p === 's' ? 'sender' : 'recipient'}" checked> include in request</label><span class="aft-party-note" id="aft-note-${p}"></span></div>
            <div class="aft-grid">${rows}</div></div>`;
    }

    function build() {
        const sc = $('at-aft-scenario'), pa = $('at-aft-parties');
        sc.innerHTML = `
            <div class="aft-card">
                <div class="aft-row"><span class="aft-lbl">Scheme</span>${pills('aft-scheme', Object.entries(SCHEMES).map(([k, l]) => [k, l]), state.scheme)}</div>
                <div class="aft-row"><span class="aft-lbl">Operating region</span>${pills('aft-region', Object.entries(REGIONS).map(([k, l]) => [k, l]), state.region)}</div>
                <div class="aft-row"><span class="aft-lbl">Category</span>${pills('aft-category', [['domestic', 'Domestic'], ['cross', 'Cross-border']], state.category)}
                    <span id="aft-support" class="aft-support"></span></div>
                <div class="aft-row"><span class="aft-lbl">Recipient is</span>${pills('aft-target', [['account', 'An account (IBAN / phone / PAN 6+4)'], ['card', 'A card (full PAN)']], state.target)}</div>
                <div class="aft-row"><span class="aft-lbl">Transaction</span>
                    <select id="aft-tx" class="select-input" style="max-width:290px;">${Object.entries(TX_MODES).map(([k, m]) => `<option value="${k}">${esc(m.label)}</option>`).join('')}</select>
                    <span id="aft-tx-desc" class="aft-hint"></span></div>
                <div class="aft-row" id="aft-mit-row" style="display:none;">
                    <span class="aft-lbl">previous_payment_id</span><input type="text" id="aft-prev" class="text-input" style="max-width:300px;" placeholder="pay_… (the initial payment)">
                    <button class="aft-btn" id="aft-prev-last" type="button">Use last AFT</button>
                    <select id="aft-mit-reason" class="select-input" style="max-width:190px;"><option value="delayed_charge">delayed_charge</option><option value="resubmission">resubmission</option><option value="no_show">no_show</option><option value="reauthorization">reauthorization</option></select>
                </div>
            </div>
            <div class="aft-card">
                <div class="aft-lbl" style="margin-bottom:6px;">Test cards — by issuer country <span class="aft-hint">the issuer country decides domestic vs cross-border and whether <code>instruction.purpose</code> is required</span></div>
                <div id="aft-cards" class="aft-cards"></div>
                <div class="aft-row" style="margin-top:10px;"><button class="aft-btn" id="aft-check" type="button">Check card (metadata)</button><span id="aft-issuer" class="aft-issuer"></span></div>
            </div>`;
        pa.innerHTML = `
            <div class="aft-grid2">${partyHtml('s')}${partyHtml('r')}</div>
            <div class="aft-card" style="margin-top:12px;">
                <div class="aft-grid" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr));">
                    <div class="form-group aft-f" data-f="purpose"><label for="aft-purpose" class="text-label">instruction.purpose <span class="aft-badge"></span></label>
                        <select id="aft-purpose" class="select-input"><option value="">— none —</option>${AFT_PURPOSES.map(p => `<option>${p}</option>`).join('')}</select><div class="aft-msg"></div></div>
                </div>
            </div>
            <div class="aft-card aft-check" style="margin-top:12px;">
                <div class="aft-check-h"><b>Qualification check</b><span id="aft-summary" class="aft-summary"></span>
                    <label class="aft-inc" style="margin-left:auto;"><input type="checkbox" id="aft-validate" checked> block sending while there are errors</label>
                    <button class="aft-btn" id="aft-reset" type="button" title="Reload the default sender / recipient for this scenario">Reset to scenario defaults</button></div>
                <div id="aft-checks"></div>
            </div>
            <details class="aft-card" style="margin-top:12px;"><summary class="aft-lbl" style="cursor:pointer;">Request preview <span class="aft-hint">(what will be sent to POST /payments)</span></summary>
                <pre id="aft-preview" class="aft-pre"></pre></details>
            <div id="aft-diagnosis" class="aft-card" style="display:none; margin-top:12px;"></div>`;
        state.built = true;
        wire();
        renderCards();
        loadScenario();
    }

    function renderCards() {
        const sName = SCHEMES[state.scheme];
        $('aft-cards').innerHTML = AFT_TEST_CARDS.filter(c => c.scheme === sName).map(c =>
            `<span class="aft-tc" data-n="${esc(c.number)}" title="${esc(c.expect)}"><b>${esc(c.country)}</b> ${esc(c.number)} <small>${esc(c.type)}</small></span>`).join('');
    }

    // ─── Happy-flow card per scenario ────────────────────────────────────────────
    // The test card whose ISSUER COUNTRY fits the scenario (domestic = issuer in the same country as sender / recipient;
    // cross-border = issuer in a different country than the recipient). `verified` = an approval was actually seen on the
    // demo sandbox (2026-11); the rest follow the docs / test-card table and need the scheme + region enabled on your account.
    const HAPPY_CARD = {
        'visa:europe:domestic': '4242424242424242', 'visa:europe:cross': '4242424242424242',
        'visa:apac:domestic': '4076613139850359', 'visa:apac:cross': '4076613139850359',
        'visa:canada:domestic': '4500622868341387', 'visa:canada:cross': '4500622868341387',
        'visa:uae:domestic': '4242424242424242', 'visa:uae:cross': '4242424242424242',
        'visa:usa:domestic': '4000020000000000', 'visa:usa:cross': '4000020000000000',
        'mastercard:europe:domestic': '5355224968521878', 'mastercard:europe:cross': '5355224968521878',
        'mastercard:apac:domestic': '5526303170157160', 'mastercard:apac:cross': '5526303170157160',
        'mastercard:canada:domestic': '5258901507741160', 'mastercard:canada:cross': '5258901507741160',
        'mastercard:uae:domestic': '5355224968521878', 'mastercard:uae:cross': '5355224968521878',
        'mastercard:usa:domestic': '5318773012490080', 'mastercard:usa:cross': '5318773012490080',
    };
    const VERIFIED = ['visa:europe:domestic', 'visa:europe:cross'];
    function loadHappyCard() {
        const k = `${state.scheme}:${key()}`, num = HAPPY_CARD[k];
        const c = AFT_TEST_CARDS.find(x => x.number === num);
        if (!c) return;
        $('at-card-number').value = c.number; $('at-card-cvv').value = '100';
        state.issuer = { country: c.country, scheme: c.scheme, type: c.type, source: 'table', number: c.number };
        renderIssuer();
        const notes = [];
        if (VERIFIED.includes(k)) notes.push('approved on the demo sandbox');
        else if (state.scheme === 'mastercard') notes.push('Mastercard AFT returned aft_processor_not_matched on the demo sandbox — needs enabling on your account');
        else notes.push('from the docs / test-card table — not approved on the demo sandbox (the region may not be enabled for AFT on your account)');
        if (state.region === 'uae') notes.push('no UAE-issued test card is published, so the scheme will see this as cross-border');
        if (c.country === 'CA') notes.push('this is Checkout.com\'s 3DS test card');
        $('aft-issuer').insertAdjacentHTML('beforeend', `<span class="aft-hint" style="margin-left:6px;">· happy-flow card: ${esc(notes.join(' · '))}</span>`);
    }
    // Everything a scenario needs for a happy flow: sender + recipient data, a matching card, region currency.
    function loadScenario() {
        state.includeSender = true; state.includeRecipient = true;
        applyDefaults(true);
        loadHappyCard();
        update();
    }

    // ─── Defaults ────────────────────────────────────────────────────────────────
    function setField(p, f, v, force) {
        const el = $(fid(p, f)); if (!el) return;
        if (!force && el.dataset.dirty === '1') return;
        el.value = v; if (force) delete el.dataset.dirty;
    }
    function applyDefaults(force) {
        const [sc, rc] = DEFAULT_COUNTRIES[key()] || ['GB', 'GB'];
        const s = sample(sc), r = sample(rc === sc && state.region === 'usa' ? 'US' : rc);
        const sBoston = state.region === 'usa' ? { city: 'Boston', line1: '2 Elm St', zip: '02108', state: 'MA' } : s;
        const S = state.region === 'usa' ? sBoston : s;
        setField('s', 'type', 'individual', force); setField('s', 'first_name', 'Jia', force); setField('s', 'last_name', 'Tsang', force);
        setField('s', 'date_of_birth', '1990-01-01', force); setField('s', 'address_line1', S.line1, force); setField('s', 'address_line2', '', force);
        setField('s', 'city', S.city, force); setField('s', 'state', S.state || '', force); setField('s', 'zip', S.zip, force); setField('s', 'country', sc, force);
        setField('r', 'first_name', 'Ali', force); setField('r', 'last_name', 'Farid', force);
        setField('r', 'account_number', state.target === 'card' ? '5555555555554444' : '5555554444', force);
        setField('r', 'address_line1', r.line1, force); setField('r', 'address_line2', '', force); setField('r', 'city', r.city, force);
        setField('r', 'state', r.state || '', force); setField('r', 'zip', r.zip, force); setField('r', 'country', rc, force);
        // currency + amount that fit the region (only if the user has not chosen their own)
        const cur = $('at-currency');
        if (cur && (force || cur.value === state.currencyAuto || state.currencyAuto === null)) { const want = REGION_CURRENCY[state.region]; if ([...cur.options].some(o => o.value === want)) { cur.value = want; state.currencyAuto = want; } }
        update();
    }

    // ─── Update (badges, errors, checklist, preview) ─────────────────────────────
    function update() {
        if (!state.built) return;
        const ev = evaluate(), req = ev.req;
        $('aft-support').innerHTML = req.supported
            ? `<span class="aft-ok">✓ supported</span>${req.rule.conflict ? '<span class="aft-warn" title="' + esc(req.rule.conflict) + '">⚠ docs conflict</span>' : ''}`
            : `<span class="aft-bad" title="${esc(req.note)}">✕ not supported</span>`;
        const tx = TX_MODES[state.tx];
        $('aft-tx-desc').textContent = tx.desc;
        $('aft-mit-row').style.display = tx.mit ? '' : 'none';
        $('aft-mit-reason').style.display = state.tx === 'unsch_mit' ? '' : 'none';

        const senderRequired = Object.values(req.sender).includes('req');
        $('aft-include-sender').checked = state.includeSender; $('aft-include-recipient').checked = state.includeRecipient;
        $('aft-note-s').textContent = !req.supported ? '' : senderRequired ? 'required in this scenario' : 'optional in this scenario';
        $('aft-note-r').textContent = !req.supported ? '' : Object.values(req.recipient).includes('req') ? 'required in this scenario' : 'optional in this scenario';
        $('aft-party-s').classList.toggle('aft-off', !state.includeSender);
        $('aft-party-r').classList.toggle('aft-off', !state.includeRecipient);

        document.querySelectorAll('.aft-f').forEach(el => {
            const f = el.dataset.f, [p, name] = f.includes('.') ? f.split('.') : ['', f];
            const badge = el.querySelector('.aft-badge'), msg = el.querySelector('.aft-msg');
            let how = f === 'purpose' ? (state.scheme === 'visa' && state.issuer && PURPOSE_REQUIRED_ISSUERS.includes(state.issuer.country) ? 'req' : 'opt')
                : (p === 's' ? req.sender : req.recipient)[name];
            const cls = how === 'req' ? 'req' : how?.startsWith('cond') ? 'cond' : 'opt';
            badge.className = `aft-badge ${cls}`; badge.textContent = cls === 'req' ? 'required' : cls === 'cond' ? 'conditional' : 'optional';
            badge.title = how?.startsWith('cond:') ? how.slice(5) : '';
            const err = ev.fe[f], warn = ev.fw[f];
            el.classList.toggle('aft-err', !!err); el.classList.toggle('aft-warnf', !err && !!warn);
            msg.textContent = err || warn || '';
        });

        const icon = { ok: '✓', error: '✕', warn: '⚠', info: 'ℹ' };
        $('aft-checks').innerHTML = ev.checks.map(c => `<div class="aft-chk ${c.level}"><span class="i">${icon[c.level]}</span><span class="a">${esc(c.area)}</span><span class="t">${esc(c.text)}</span></div>`).join('');
        $('aft-summary').innerHTML = `${ev.errors ? `<span class="aft-bad">${ev.errors} error${ev.errors > 1 ? 's' : ''}</span>` : '<span class="aft-ok">no errors</span>'}${ev.warnings ? `<span class="aft-warn">${ev.warnings} warning${ev.warnings > 1 ? 's' : ''}</span>` : ''}`;
        const btn = $('at-pay-btn');
        if (btn && window.__atSelectedType === 'aft' && btn.textContent !== 'Processing…') btn.textContent = ev.errors && state.validate ? `Create AFT payment (${ev.errors} error${ev.errors > 1 ? 's' : ''} to fix)` : 'Create AFT payment';
        const body = window.AftTest?._previewBody?.();
        if (body) $('aft-preview').textContent = JSON.stringify(body, null, 2);
    }

    // ─── Request body ────────────────────────────────────────────────────────────
    function partyObject(p) {
        const o = {}, addr = {};
        FIELDS[p].forEach(([flat, label]) => {
            const v = getv(p, flat).trim(); if (!v) return;
            if (label.startsWith('address.')) addr[flat] = flat === 'country' || flat === 'state' ? v.toUpperCase() : v;
            else o[flat] = v;
        });
        if (Object.keys(addr).length) o.address = addr;
        return o;
    }
    function extendBody(body) {
        const tx = TX_MODES[state.tx];
        body.processing = { ...(body.processing || {}), aft: true };
        if (state.includeRecipient) { const r = partyObject('r'); if (Object.keys(r).length) body.recipient = r; }
        if (state.includeSender) { const s = partyObject('s'); if (Object.keys(s).length) body.sender = s; }
        if (state.purpose) body.instruction = { purpose: state.purpose };
        if (tx.type) body.payment_type = tx.type;
        if (tx.initial) { body.merchant_initiated = false; body['3ds'] = { enabled: true, challenge_indicator: 'challenge_requested_mandate' }; }
        if (tx.mit) {
            body.merchant_initiated = true; body.previous_payment_id = state.prevPayment.trim();
            body.source.stored = true;
            if (state.tx === 'unsch_mit') body.processing.merchant_initiated_reason = state.mitReason;
        }
        return body;
    }

    // ─── Card metadata ───────────────────────────────────────────────────────────
    async function checkCard() {
        const number = ($('at-card-number').value || '').replace(/\s+/g, '');
        if (number.length < 6) return showToast('Enter a card number first.', 'error');
        const btn = $('aft-check'); btn.disabled = true; const o = btn.textContent; btn.textContent = 'Checking…';
        const body = { source: { type: 'card', number }, format: 'basic' };
        try {
            const res = await fetch(`${apiBase()}/card-metadata`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = await res.json();
            await addToApiLog('POST', '/metadata/card', res.status, body, data, 'https://api.sandbox.checkout.com/metadata/card');
            if (!res.ok) { showToast('Card check failed: ' + (data.error_codes?.join(', ') || res.status), 'error'); return; }
            state.issuer = { country: data.issuer_country, scheme: data.scheme, type: [data.card_type, data.card_category].filter(Boolean).join(' · '), source: 'metadata', number };
            renderIssuer(); update();
        } catch (e) { showToast('Card check failed.', 'error'); }
        finally { btn.disabled = false; btn.textContent = o; }
    }
    function renderIssuer() {
        const i = state.issuer;
        $('aft-issuer').innerHTML = !i ? '' : `<span class="aft-tag">${esc(i.scheme || '')}</span><span class="aft-tag">issuer ${esc(i.country || '?')}</span>${i.type ? `<span class="aft-tag">${esc(i.type)}</span>` : ''}<span class="aft-hint">${i.source === 'metadata' ? 'from card metadata' : 'from the test-card table'}</span>`;
    }

    // ─── Result diagnosis ────────────────────────────────────────────────────────
    const CODE_HELP = {
        '20012': 'Invalid transaction. For AFTs the sandbox answers this when required sender / recipient data is missing or the scheme region / issuer-country combination is not supported on your account. Compare with the qualification check above.',
        '43102': 'Risk decline — Visa AFT mandate compliance. Visa requires AFT-type payments to be flagged: make sure processing.aft is true (and, for some issuer countries, that instruction.purpose is supplied).',
        '20057': 'Transaction not permitted to cardholder. This is what the AFT decline test cards (Visa 4659…5671 / Mastercard 5355…1849) return for AFTs.',
        '10000': 'Approved.',
    };
    function diagnose(httpStatus, data) {
        const box = [$('aft-diagnosis'), $('at-aft-diagnosis-result')].filter(Boolean);
        const pay = data?.payment || data;
        const items = [];
        const codes = pay?.error_codes || [];
        if (httpStatus === 422 || codes.length) {
            codes.forEach(c => {
                if (c === 'aft_processor_not_matched') items.push(['bad', '<code>aft_processor_not_matched</code> — AFT is not enabled for this scheme on your processing channel. Ask your account manager to enable Account Funding Transactions (the docs: “To enable AFTs, contact your account manager”).']);
                else if (/^(sender|recipient)_.+_invalid$/.test(c)) { const m = c.match(/^(sender|recipient)_(.+)_invalid$/); items.push(['bad', `<code>${esc(c)}</code> — <b>${esc(m[1])}.${esc(m[2].startsWith('address_') ? 'address.' + m[2].slice(8) : m[2])}</b> failed Checkout.com's AFT format validation. See the “Formats” rules in the checklist (names: Latin letters only, no digits / titles / double spaces; address lines; city and state without digits; prohibited countries).`]);
                } else items.push(['bad', `<code>${esc(c)}</code> — rejected by validation. See the API log for the full response.`]);
            });
        }
        if (pay?.response_code) {
            const help = CODE_HELP[pay.response_code];
            items.push([pay.approved ? 'good' : 'bad', `<b>${esc(pay.response_code)} ${esc(pay.response_summary || '')}</b>${help ? ' — ' + esc(help) : ''}`]);
            if (pay.processing && pay.processing.aft !== undefined) items.push([pay.processing.aft ? 'good' : 'warn', `Response <code>processing.aft</code> = <b>${esc(pay.processing.aft)}</b>${pay.processing.aft ? ' — the payment was processed as an AFT.' : ' — it was NOT processed as an AFT.'}`]);
            if (pay.source?.issuer_country) items.push(['info', `Issuer country on the payment: <b>${esc(pay.source.issuer_country)}</b>${state.issuer?.country && state.issuer.country !== pay.source.issuer_country ? ` (you had assumed ${esc(state.issuer.country)})` : ''}.`]);
            if (pay.id && pay.approved) state.lastPaymentId = pay.id;
        }
        if (!items.length) { box.forEach(b => { b.style.display = 'none'; }); return; }
        const html = `<div class="aft-lbl" style="margin-bottom:8px;">AFT result diagnosis</div>${items.map(([k, t]) => `<div class="aft-chk ${k === 'good' ? 'ok' : k === 'bad' ? 'error' : k === 'warn' ? 'warn' : 'info'}"><span class="i">${k === 'good' ? '✓' : k === 'bad' ? '✕' : k === 'warn' ? '⚠' : 'ℹ'}</span><span class="t">${t}</span></div>`).join('')}`;
        box.forEach(b => { b.innerHTML = html; b.style.display = 'block'; });
    }

    // ─── Events ──────────────────────────────────────────────────────────────────
    function setPill(groupId, value) {
        document.querySelectorAll(`#${groupId} .aft-pill`).forEach(p => p.classList.toggle('active', p.dataset.v === value));
    }
    function wire() {
        const root = $('at-form-section');
        $('at-aft-scenario').addEventListener('click', (e) => {
            const pill = e.target.closest('.aft-pill');
            if (pill) {
                const g = pill.parentElement.id, v = pill.dataset.v;
                if (g === 'aft-scheme') { state.scheme = v; state.issuer = null; renderIssuer(); renderCards(); }
                if (g === 'aft-region') state.region = v;
                if (g === 'aft-category') state.category = v;
                if (g === 'aft-target') state.target = v;
                setPill(g, v);
                if (g === 'aft-target') { setField('r', 'account_number', state.target === 'card' ? '5555555555554444' : '5555554444', true); update(); return; }
                loadScenario();   // scheme / region / category → full happy-flow setup (data + card + currency)
                showToast(`Loaded a happy-flow setup for ${summaryLabel().replace('Account Funding Transaction — ', '')}.`);
                return;
            }
            const tc = e.target.closest('.aft-tc');
            if (tc) {
                const c = AFT_TEST_CARDS.find(x => x.number === tc.dataset.n);
                $('at-card-number').value = c.number; $('at-card-cvv').value = '100';
                state.issuer = { country: c.country, scheme: c.scheme, type: c.type, source: 'table', number: c.number };
                renderIssuer(); update(); showToast(`${c.scheme} ${c.country} test card filled in.`);
                return;
            }
            if (e.target.id === 'aft-check') return checkCard();
            if (e.target.id === 'aft-prev-last') { if (state.lastPaymentId) { $('aft-prev').value = state.lastPaymentId; state.prevPayment = state.lastPaymentId; update(); } else showToast('No approved AFT in this session yet — paste the initial payment id.', 'error'); }
        });
        $('aft-tx').addEventListener('change', (e) => { state.tx = e.target.value; update(); });
        $('aft-prev').addEventListener('input', (e) => { state.prevPayment = e.target.value; update(); });
        $('aft-mit-reason').addEventListener('change', (e) => { state.mitReason = e.target.value; update(); });
        $('at-aft-parties').addEventListener('input', (e) => { if (e.target.type === 'checkbox') return;   // checkboxes are handled on 'change' (update() would reset them from stale state first)
            if (e.target.classList.contains('aft-in')) e.target.dataset.dirty = '1'; update(); });
        $('at-aft-parties').addEventListener('change', (e) => {
            if (e.target.classList.contains('aft-in')) e.target.dataset.dirty = '1';
            if (e.target.id === 'aft-include-sender') state.includeSender = e.target.checked;
            if (e.target.id === 'aft-include-recipient') state.includeRecipient = e.target.checked;
            if (e.target.id === 'aft-purpose') state.purpose = e.target.value;
            if (e.target.id === 'aft-validate') state.validate = e.target.checked;
            update();
        });
        $('at-aft-parties').addEventListener('click', (e) => { if (e.target.id === 'aft-reset') applyDefaults(true); });
        ['at-card-number', 'at-amount', 'at-currency'].forEach(id => $(id)?.addEventListener('input', () => {
            if (window.__atSelectedType !== 'aft') return;
            if (id === 'at-card-number') { const n = $('at-card-number').value.replace(/\s+/g, ''); if (state.issuer && state.issuer.number !== n) { state.issuer = null; renderIssuer(); } }
            if (id === 'at-currency') state.currencyAuto = null;
            update();
        }));
        void root;
    }

    // ─── Public API (used by auth-types.js) ──────────────────────────────────────
    function onSelect() {
        window.__atSelectedType = 'aft';
        ensureCurrencies();
        $('at-aft-scenario').style.display = 'block'; $('at-aft-parties').style.display = 'block';
        if (!state.built) build(); else update();
        const cur = $('at-currency'); if (cur && state.currencyAuto === null) { const want = REGION_CURRENCY[state.region]; if ([...cur.options].some(o => o.value === want)) { cur.value = want; state.currencyAuto = want; } }
        update();
    }
    function onDeselect() {
        if (window.__atSelectedType === 'aft') window.__atSelectedType = null;
        $('at-aft-scenario').style.display = 'none'; $('at-aft-parties').style.display = 'none';
        const btn = $('at-pay-btn'); if (btn && btn.textContent !== 'Processing…') btn.textContent = 'Create Payment';
    }
    function summaryLabel() { return `Account Funding Transaction — ${SCHEMES[state.scheme]} · ${REGIONS[state.region]} · ${state.category === 'cross' ? 'cross-border' : 'domestic'}`; }
    function blocking() { const ev = evaluate(); return state.validate && ev.errors ? ev : null; }
    function scrollToChecks() { $('aft-checks')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

    window.AftTest = {
        onSelect, onDeselect, extendBody, diagnose, summaryLabel, blocking, scrollToChecks,
        _previewBody: () => {
            const b = { source: { number: ($('at-card-number')?.value || '').trim(), expiry_month: +$('at-card-expiry-month')?.value, expiry_year: +$('at-card-expiry-year')?.value, cvv: ($('at-card-cvv')?.value || '').trim() }, amount: parseInt($('at-amount')?.value, 10), currency: $('at-currency')?.value, capture: !!$('at-capture-toggle')?.checked };
            return extendBody(b);
        },
        reset: () => { const d = $('aft-diagnosis'); if (d) d.style.display = 'none'; const r = $('at-aft-diagnosis-result'); if (r) r.style.display = 'none'; },
        get lastPaymentId() { return state.lastPaymentId; },
    };
})();
