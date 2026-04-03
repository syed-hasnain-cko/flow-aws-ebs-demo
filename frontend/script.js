// =============================================
// Main Entry Point
// Handles: dropdown population, tab switching, app init
// =============================================

window.activeWallet = null;

// -----------------------------------------------
// Populate all dropdowns synchronously.
// Wrapped in a block so local const names don't
// collide with same-named globals in google-pay.js.
// -----------------------------------------------
{
    const _currencies = CURRENCIES.map(c => c.iso4217);

    // --- Flow Tab: Currency & Country ---
    const _flowCurrency = document.getElementById('currency-select');
    _currencies.forEach(code => {
        const option = document.createElement('option');
        if (code === 'EUR') option.selected = true;
        option.value = code;
        option.text = code;
        _flowCurrency.appendChild(option);
    });

    const _flowCountry = document.getElementById('country-select');
    COUNTRIES.forEach(country => {
        const option = document.createElement('option');
        if (country.alpha2Code === 'DE') option.selected = true;
        option.value = country.alpha2Code;
        option.text = country.name;
        _flowCountry.appendChild(option);
    });

    // --- Wallets Tab: Currency & Country ---
    const _walletCurrency = document.getElementById('currency-select-google-pay');
    _currencies.forEach(code => {
        const option = document.createElement('option');
        if (code === 'EUR') option.selected = true;
        option.value = code;
        option.text = code;
        _walletCurrency.appendChild(option);
    });

    const _walletCountry = document.getElementById('country-select-google-pay');
    COUNTRIES.forEach(country => {
        const option = document.createElement('option');
        if (country.alpha2Code === 'DE') option.selected = true;
        option.value = country.alpha2Code;
        option.text = country.name;
        _walletCountry.appendChild(option);
    });

    // --- Payment Setup Tab: Currency ---
    const _setupCurrency = document.getElementById('setup-currency');
    if (_setupCurrency) {
        CURRENCIES.forEach(currency => {
            const option = document.createElement('option');
            if (currency.iso4217 === 'EUR') option.selected = true;
            option.value = currency.iso4217;
            option.text = currency.iso4217;
            _setupCurrency.appendChild(option);
        });
    }

    // --- Payouts Tab: Currency ---
    const _payoutCurrency = document.getElementById('payout-currency');
    if (_payoutCurrency) {
        _currencies.forEach(code => {
            const option = document.createElement('option');
            if (code === 'EUR') option.selected = true;
            option.value = code;
            option.text = code;
            _payoutCurrency.appendChild(option);
        });
    }

    // --- Payouts Tab: Countries (dest addr, bank dest, bank ah, sender addr) ---
    ['payout-dest-addr-country', 'payout-bank-country', 'payout-bank-ah-country', 'payout-sender-addr-country'].forEach(selectId => {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        COUNTRIES.forEach(country => {
            const option = document.createElement('option');
            if (country.alpha2Code === 'DE') option.selected = true;
            option.value = country.alpha2Code;
            option.text = country.name;
            sel.appendChild(option);
        });
    });

    // --- Payment Setup Tab: Country ---
    const _setupCountry = document.getElementById('setup-country');
    if (_setupCountry) {
        COUNTRIES.forEach(country => {
            const option = document.createElement('option');
            if (country.alpha2Code === 'DE') option.selected = true;
            option.value = country.alpha2Code;
            option.text = country.name;
            _setupCountry.appendChild(option);
        });
    }
}

// -----------------------------------------------
// Tab switching + initial tab click
// -----------------------------------------------

window.openTab = function (evt, tabName) {
    const tabLinks = document.getElementsByClassName("tab-link");
    const tabContents = document.getElementsByClassName("tab-content");

    if (tabName !== 'setup-tab') {
        clearSetupTabState(); // defined in modules/payment-setup.js
    }

    if (tabName !== 'google-tab') {
        window.activeWallet = null;
        const container = document.getElementById("google-container");
        if (container) {
            container.innerHTML = '';
            container.style.display = 'none';
        }
        const debuggerArea = document.getElementById('apple-pay-debugger');
        if (debuggerArea) debuggerArea.style.display = 'none';
    }

    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].classList.remove("active");
    }
    for (let i = 0; i < tabLinks.length; i++) {
        tabLinks[i].classList.remove("active");
    }

    document.getElementById(tabName).classList.add("active");
    evt.currentTarget.classList.add("active");

    if (tabName === 'google-tab') {
        loadGooglePayScript();   // defined in modules/wallets.js
    } else {
        removeGooglePayScript(); // defined in modules/wallets.js
    }
};

document.addEventListener('DOMContentLoaded', function () {
    // Initialize the first tab as active
    document.querySelector(".tab-link").click();
});
