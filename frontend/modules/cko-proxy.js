// =============================================
// Checkout.com proxy helper — window.CkoProxy.call(method, path, body)
// Sends an allowlisted Checkout.com request through POST /standalone/vault and writes only the Checkout.com
// exchange (request body, response body, status, full URL, duration, cko-request-id) to the API log.
// Returns { ok, status, data, upstream, requestId }.
// Used by newer modules (links.js); older modules keep their own copy of this logic.
// =============================================

(function () {
    const API_BASE = window.APP_CONFIG?.apiBaseUrl || '';

    async function call(method, path, body) {
        const t0 = performance.now();
        let httpStatus = 0, env;
        try {
            const res = await fetch(`${API_BASE}/standalone/vault`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ method, path, ...(body !== undefined ? { body } : {}) }),
            });
            httpStatus = res.status;
            env = await res.json().catch(() => ({ upstream_status: httpStatus, data: { error: `Non-JSON response (HTTP ${httpStatus}) — is POST /standalone/vault deployed in API Gateway?` } }));
        } catch (err) {
            env = { upstream_status: 0, data: { error: 'Network error: ' + err.message } };
        }
        if (env.upstream_status === undefined) env = { upstream_status: httpStatus, upstream: null, data: env };
        const up = String(env.upstream || '').match(/^([A-Z]+)\s+(https?:\/\/\S+)$/);
        if (up) {
            addToApiLog(method, up[2].replace(/^https?:\/\/[^/]+/, ''), env.upstream_status, body ?? {}, env.data ?? null, up[2],
                { duration_ms: Math.round(performance.now() - t0), ...(env.cko_request_id ? { request_id: env.cko_request_id } : {}) });
        }
        return { ok: env.upstream_status >= 200 && env.upstream_status < 300, status: env.upstream_status, data: env.data, upstream: env.upstream, requestId: env.cko_request_id };
    }

    const errText = (r) => r.data?.error_codes?.join(', ') || r.data?.error_type || r.data?.error || `HTTP ${r.status}`;
    window.CkoProxy = { call, errText };
})();
