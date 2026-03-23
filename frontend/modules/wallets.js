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

document.addEventListener('DOMContentLoaded', () => {

    // Render Google Pay button
    const renderGoogleButton = document.getElementById("google-button");
    if (renderGoogleButton) {
        renderGoogleButton.addEventListener("click", async () => {
            window.onGooglePayLoaded();
        });
    }

    // Dropdown / toggle change listeners that trigger a wallet re-render
    const walletInputs = [
        'google-button-type', 'google-button-color', 'google-locale',
        'google-allow-credit', 'google-allow-debit',
        'apple-button-type', 'apple-button-style', 'apple-active-card-toggle'
    ];

    walletInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                triggerWalletRerender();
            });
        }
    });

    // Chip (multi-select checkbox) change listeners
    const chipContainers = ['schemes-chips', 'apple-caps-chips', 'auth-methods-chips'];
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
