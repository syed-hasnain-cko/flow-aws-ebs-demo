// =============================================
// Wallets Module (Google Pay & Apple Pay)
// =============================================

function loadGooglePayScript() {
    const script = document.createElement('script');
    script.src = "https://pay.google.com/gp/p/js/pay.js";
    script.async = true;
    document.head.appendChild(script);
    script.id = "google-pay-sdk";
}

function removeGooglePayScript() {
    const script = document.getElementById("google-pay-sdk");
    if (script) {
        script.remove();
    }
}

function triggerWalletRerender() {
    const container = document.getElementById("google-container");
    if (container && (container.style.display === 'flex' || container.style.display === 'block')) {
        if (window.activeWallet === 'google' && typeof window.onGooglePayLoaded === 'function') {
            console.log("🛠️ Central Watcher: Refreshing Google Pay...");
            window.onGooglePayLoaded();
        } else if (window.activeWallet === 'apple' && typeof window.addApplePayButton === 'function') {
            console.log("🛠️ Central Watcher: Refreshing Apple Pay...");
            window.addApplePayButton();
        }
    }
}

// Called when user clicks a wallet selector card
function selectWallet(wallet) {
    // Mark active card
    document.querySelectorAll('.wallet-option').forEach(el => el.classList.remove('active'));
    const activeEl = document.getElementById(`select-${wallet}-pay`);
    if (activeEl) activeEl.classList.add('active');

    // Show shared + wallet-specific fields, hide the other wallet's fields
    const sharedFields = document.getElementById('shared-wallet-fields');
    const appleFields  = document.getElementById('apple-pay-fields');
    const googleFields = document.getElementById('google-pay-fields');

    if (sharedFields) sharedFields.style.display = 'block';
    if (appleFields)  appleFields.style.display  = wallet === 'apple'  ? 'block' : 'none';
    if (googleFields) googleFields.style.display = wallet === 'google' ? 'block' : 'none';

    // Clear the payment container before loading the new wallet button
    const container = document.getElementById('google-container');
    if (container) {
        container.innerHTML = '';
        container.style.display = 'none';
    }

    // Auto-render the selected wallet button
    if (wallet === 'google' && typeof window.onGooglePayLoaded === 'function') {
        window.onGooglePayLoaded();
    } else if (wallet === 'apple' && typeof window.addApplePayButton === 'function') {
        window.addApplePayButton();
    }
}

document.addEventListener('DOMContentLoaded', () => {

    // Wallet selector cards
    const appleOption  = document.getElementById('select-apple-pay');
    const googleOption = document.getElementById('select-google-pay');

    if (appleOption)  appleOption.addEventListener('click',  () => selectWallet('apple'));
    if (googleOption) googleOption.addEventListener('click', () => selectWallet('google'));

    // Dropdown / toggle change listeners — re-render button when a setting changes
    const walletInputs = [
        'google-button-type', 'google-button-color', 'google-locale',
        'apple-button-type', 'apple-button-style', 'apple-active-card-toggle'
    ];

    walletInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => triggerWalletRerender());
        }
    });

    // Chip (multi-select checkbox) change listeners
    const chipContainers = ['schemes-chips', 'apple-caps-chips', 'auth-methods-chips', 'card-type-chips'];
    chipContainers.forEach(containerId => {
        const container = document.getElementById(containerId);
        if (container) {
            container.addEventListener('change', (e) => {
                if (e.target.classList.contains('chip-input')) {
                    triggerWalletRerender();
                }
            });
        }
    });

});
