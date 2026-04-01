

/**
 * Reads the active theme's CSS custom properties from the document root.
 * Returns a plain object with all colour/shadow tokens so JS modules
 * can use them for inline styles or third-party SDK appearance objects.
 */
function getThemeTokens() {
    const s = getComputedStyle(document.documentElement);
    const get = (prop) => s.getPropertyValue(prop).trim();
    return {
        primary:       get('--primary'),
        primaryGlow:   get('--primary-glow'),
        bgPage:        get('--bg-page'),
        bgCard:        get('--bg-card'),
        bgInput:       get('--bg-input'),
        bgSubtle:      get('--bg-subtle'),
        textPrimary:   get('--text-primary'),
        textSecondary: get('--text-secondary'),
        textMuted:     get('--text-muted'),
        border:        get('--border'),
        borderStrong:  get('--border-strong'),
        success:       get('--success'),
        error:         get('--error'),
        shadowMd:      get('--shadow-md'),
    };
}

/**
 * Builds the appearance object for Checkout.com Flow / card components
 * using the currently active CSS theme tokens.
 */
function getFlowAppearance() {
    const t = getThemeTokens();
    const font = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const outline = t.primary.startsWith('#') ? t.primary + '33' : t.primaryGlow;
    return {
        colorAction:         t.primary,
        colorBackground:     t.bgPage,
        colorBorder:         t.border,
        colorDisabled:       t.borderStrong,
        colorError:          t.error,
        colorFormBackground: t.bgInput,
        colorFormBorder:     t.border,
        colorInverse:        t.bgCard,
        colorOutline:        outline,
        colorPrimary:        t.textPrimary,
        colorSecondary:      t.textSecondary,
        colorSuccess:        t.success,
        borderRadius:        ["8px", "50px"],
        subheading: { fontFamily: font, fontSize: "16px", lineHeight: "24px", fontWeight: 400, letterSpacing: 0 },
        label:      { fontFamily: font, fontSize: "14px", lineHeight: "20px", fontWeight: 400, letterSpacing: 0 },
        input:      { fontFamily: font, fontSize: "16px", lineHeight: "20px", fontWeight: 400, letterSpacing: 0 },
        button:     { fontFamily: font, fontSize: "16px", lineHeight: "24px", fontWeight: 700, letterSpacing: 0 },
        footnote:   { fontFamily: font, fontSize: "14px", lineHeight: "20px", fontWeight: 400, letterSpacing: 0 },
    };
}

/**
 * Initialises a Checkout.com card component in tokenize-only mode and mounts
 * it to the supplied DOM element.  Returns the cardComponent so the caller
 * can invoke cardComponent.tokenize() on demand.
 *
 * @param {HTMLElement} containerEl  - The element the card fields are mounted into.
 * @param {Object}      paymentSession - A payment-session object from /payment-sessions.
 * @returns {Promise<Object>}          - The mounted CheckoutWebComponents card component.
 */
async function mountCardTokenizer(containerEl, paymentSession) {
    const checkout = await CheckoutWebComponents({
        publicKey:      window.APP_CONFIG.publicKey,
        environment:    "sandbox",
        locale:         "en-GB",
        paymentSession,
        componentOptions: {
                card: {
                    data: {
                        cardholderName: 'Syed Hasnain'
                    },
                    displayCardholderName: "bottom"
                }
            },
        appearance:     getFlowAppearance(),
        onReady:        () => {},
        onChange:       () => {},
        onError:        (component, error) => { console.error("Card tokenizer error:", error); },
    });
    const cardComponent = checkout.create("card", { showPayButton: false });
    if (await cardComponent.isAvailable()) {
        cardComponent.mount(containerEl);
    }
    return cardComponent;
}

const formatJSON = (data) => {
    const stringify = (obj, indent = 0) => {
        let html = '';
        const spacing = '&nbsp;'.repeat(indent * 4);

        for (const key in obj) {
            let value = obj[key];

            // LOGIC FIX: Check if string is actually stringified JSON (like Google's signedMessage)
            if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
                try {
                    value = JSON.parse(value);
                } catch (e) { /* Not JSON, keep as string */ }
            }

            const isObject = typeof value === 'object' && value !== null;

            html += `<div style="line-height: 1.6; font-size: 13px;">`;
            html += `<span style="color: var(--text-secondary); font-weight: 600;">${spacing}${key}:</span> `;

            if (isObject) {
                html += `<span style="color: var(--text-muted); font-size: 11px;">{</span>`;
                html += stringify(value, indent + 1);
                html += `<div style="color: var(--text-muted); font-size: 11px;">${spacing}}</div>`;
            } else {
                const color = typeof value === 'string' ? 'var(--success)' : 'var(--primary)';
                // Wrap long strings (like base64 tags) so they don't break the layout
                const displayValue = typeof value === 'string' && value.length > 50
                    ? value.substring(0, 47) + '...'
                    : value;
                html += `<span style="color: ${color}; font-family: 'JetBrains Mono', monospace; font-weight: 500;">${displayValue}</span>`;
            }
            html += `</div>`;
        }
        return html;
    };

    return `<div style="background: var(--bg-subtle); padding: 20px; border-radius: 8px; border: 1px solid var(--border); text-align: left;">${stringify(data)}</div>`;
};

async function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const btn = element.previousElementSibling.querySelector('.copy-btn');

    // Get the text, removing HTML tags if you're using the "Simple & Pretty" formatter
    const textToCopy = element.innerText;

    try {
        await navigator.clipboard.writeText(textToCopy);

        // Visual Feedback
        const originalText = btn.innerText;
        btn.innerText = 'Copied!';
        btn.classList.add('copied');

        // Show a toast as well (using the function we built earlier)
        if (typeof showToast === 'function') {
            showToast('Json copied to clipboard');
        }

        setTimeout(() => {
            btn.innerText = originalText;
            btn.classList.remove('copied');
        }, 1000);

    } catch (err) {
        console.error('Failed to copy: ', err);
    }
}


function showToast(message, type = 'success') {
    const toast = document.getElementById('toast-container');
    toast.textContent = message;
    toast.className = `toast-container toast-${type}`;
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.display = 'none';
    }, 4000);
}

function showKlarnaToast(message, type = 'success') {
    const toast = document.getElementById('toast-container-klarna');
    toast.textContent = message;
    toast.className = `toast-container toast-${type}`;
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.display = 'none';
    }, 4000);
}

// fetchPaymentDetails, voidPayment, capturePayment, refundPayment,
// getPaymentSetup, confirmPaymentSetup, updatePaymentDetailsData,
// updateWalletDetailsData, disableActionButtons
// → moved to modules/payment-actions.js

function getMultiSelectSelectedValues(id) {
    return Array.prototype.slice
      .call(document.querySelectorAll(id + " option:checked"), 0)
      .map(function (v, i, a) {
        return v.value;
      });
  }

function modifyCardNetworks(cardNetworks) {
    return cardNetworks.map(network => {
        let lowerCaseNetwork = network.toLowerCase();
        if (lowerCaseNetwork === 'mastercard') {
            return 'masterCard';
        }
        return lowerCaseNetwork;
    });
}

  function getConfig(callback) {
    fetch(`${window.APP_CONFIG.apiBaseUrl}/config`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => response.json())
      .then((data) => {
        let env;
        if (data.isLive) env = "Production";
        callback(data);
      })
      .catch((error) => {
        console.error("Error:", error);
      });
  }

/**
 * Gets values from modern chip-based multi-selects
 * @param {string} containerId - The ID of the div containing the checkboxes
 */
window.getChipSelectedValues = function(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    const checked = container.querySelectorAll('input.chip-input:checked');
    return Array.from(checked).map(el => el.value);
};

/**
 * Truncates long strings within an object for UI display purposes
 * while keeping the console log full for technical debugging.
 */
function truncateResponse(obj, maxLength = 100) {
    // Create a deep copy so we don't accidentally corrupt the actual data
    const cleanObj = JSON.parse(JSON.stringify(obj));

    const recurse = (current) => {
        for (let key in current) {
            if (typeof current[key] === 'string' && current[key].length > maxLength) {
                current[key] = current[key].substring(0, maxLength) + "... [TRUNCATED]";
            } else if (typeof current[key] === 'object' && current[key] !== null) {
                recurse(current[key]);
            }
        }
    };

    recurse(cleanObj);
    return cleanObj;
}

function syncOrderItemsTotal() {
    const rows = document.querySelectorAll('.order-item-row');
    if (rows.length === 0) return;
    let sum = 0;
    rows.forEach(row => {
        sum += parseInt(row.querySelector('.k-total').value) || 0;
    });
    const amountInput = document.getElementById('setup-amount');
    if (amountInput) {
        amountInput.value = sum;
        amountInput.dispatchEvent(new Event('input'));
    }
}

function addKlarnaItemRow(container) {
    // First row seeds its total from the live setup-amount so there's never a mismatch on first render.
    // Additional rows default to 0 so the running sum stays correct after syncOrderItemsTotal.
    const isFirstRow = container.querySelectorAll('.order-item-row').length === 0;
    const setupAmountEl = document.getElementById('setup-amount');
    const initialAmount = isFirstRow && setupAmountEl ? (parseInt(setupAmountEl.value) || 0) : 0;

    const row = document.createElement('div');
    row.className = 'inline-form order-item-row';
    row.style.borderBottom = "1px solid #e2e8f0";
    row.style.paddingBottom = "10px";
    row.style.marginBottom = "10px";
    row.innerHTML = `
        <div class="form-group"><label class="text-label">Name</label><input type="text" class="text-input k-name" value="Digital Item"></div>
        <div class="form-group"><label class="text-label">Qty</label><input type="number" class="text-input k-qty" value="1"></div>
        <div class="form-group"><label class="text-label">Unit Price</label><input type="number" class="text-input k-price" value="${initialAmount}"></div>
        <div class="form-group"><label class="text-label">Total</label><input type="number" class="text-input k-total" value="${initialAmount}"></div>
        <div class="form-group"><label class="text-label">Ref</label><input type="text" class="text-input k-ref" value="SKU-001"></div>
    `;
    container.appendChild(row);

    const qtyInput = row.querySelector('.k-qty');
    const priceInput = row.querySelector('.k-price');
    const totalInput = row.querySelector('.k-total');

    function updateRowTotal() {
        const qty = parseInt(qtyInput.value) || 0;
        const price = parseInt(priceInput.value) || 0;
        totalInput.value = qty * price;
        syncOrderItemsTotal();
    }

    qtyInput.addEventListener('input', updateRowTotal);
    priceInput.addEventListener('input', updateRowTotal);
    totalInput.addEventListener('input', syncOrderItemsTotal);
}



// ── Theme change broadcaster ──────────────────────────────────────
// Watches the data-theme attribute on <html> and fires a custom
// 'themechange' event so any module can react (e.g. re-mount SDK widgets).
(function () {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((m) => {
            if (m.type === 'attributes' && m.attributeName === 'data-theme') {
                document.dispatchEvent(new CustomEvent('themechange', {
                    detail: { theme: document.documentElement.getAttribute('data-theme') }
                }));
            }
        });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
