// ============================================
// GRAVITY HUB - Frontend Script
// All verification happens SERVER SIDE
// ============================================

function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}

// ============================================
// INDEX PAGE - Checkpoint 1
// ============================================

async function startCheckpoint1() {
    const btn = document.getElementById("cp1-btn");
    const loading = document.getElementById("loading-section");

    btn.disabled = true;
    btn.style.opacity = "0.5";
    loading.style.display = "flex";

    try {
        // Step 1: Create a session on the server
        const sessionRes = await fetch("/api/session/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
        });

        const sessionData = await sessionRes.json();

        if (!sessionData.sessionId) {
            showPageError("Failed to create session. Try again.");
            resetBtn(btn, loading);
            return;
        }

        const sessionId = sessionData.sessionId;
        sessionStorage.setItem("gravity_session", sessionId);

        // Step 2: Get the Work.ink URL from server
        const linkRes = await fetch("/api/checkpoint/1/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
        });

        const linkData = await linkRes.json();

        if (!linkData.url) {
            showPageError("Could not load checkpoint link. Try again.");
            resetBtn(btn, loading);
            return;
        }

        // Step 3: Redirect user to Work.ink
        // Work.ink will redirect BACK to our server callback when done
        window.location.href = linkData.url;

    } catch (err) {
        showPageError("Network error. Check your connection.");
        resetBtn(btn, loading);
    }
}

// ============================================
// CHECKPOINT 2 PAGE
// ============================================

async function startCheckpoint2() {
    const sessionId = getParam("session") || sessionStorage.getItem("gravity_session");
    const btn = document.getElementById("cp2-btn");
    const loading = document.getElementById("loading-section");

    if (!sessionId) {
        window.location.href = "/index.html";
        return;
    }

    btn.disabled = true;
    btn.style.opacity = "0.5";
    loading.style.display = "flex";

    try {
        const linkRes = await fetch("/api/checkpoint/2/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
        });

        const linkData = await linkRes.json();

        if (linkRes.status === 403) {
            window.location.href = "/index.html";
            return;
        }

        if (!linkData.url) {
            showPageError("Could not load checkpoint link. Try again.");
            resetBtn(btn, loading);
            return;
        }

        window.location.href = linkData.url;

    } catch (err) {
        showPageError("Network error. Check your connection.");
        resetBtn(btn, loading);
    }
}

// ============================================
// KEY PAGE
// ============================================

async function loadKeyPage() {
    const sessionId = getParam("session") || sessionStorage.getItem("gravity_session");

    if (!sessionId) {
        window.location.href = "/index.html";
        return;
    }

    try {
        const res = await fetch(`/api/key/get?sessionId=${sessionId}`);
        const data = await res.json();

        if (!res.ok || !data.key) {
            document.getElementById("loading-section").style.display = "none";
            showPageError(data.error || "Could not retrieve key. Please redo the checkpoints.");
            return;
        }

        document.getElementById("loading-section").style.display = "none";
        document.getElementById("key-container").style.display = "flex";
        document.getElementById("script-box").style.display = "flex";
        document.getElementById("key-text").textContent = data.key;

        updateExpiry(data.expiry);
        setInterval(() => updateExpiry(data.expiry), 30000);

    } catch (err) {
        showPageError("Network error loading your key.");
    }
}

function updateExpiry(expiry) {
    const remaining = expiry - Date.now();
    const el = document.getElementById("key-expiry");

    if (remaining <= 0) {
        el.textContent = "⚠️ Key expired. Please get a new one.";
        document.getElementById("key-text").textContent = "EXPIRED";
        return;
    }

    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    el.textContent = `⏰ Expires in: ${h}h ${m}m`;
}

function copyKey() {
    const key = document.getElementById("key-text").textContent;
    navigator.clipboard.writeText(key).then(() => {
        const btn = document.getElementById("copy-btn");
        btn.textContent = "Copied!";
        btn.style.color = "#86efac";
        setTimeout(() => {
            btn.textContent = "Copy";
            btn.style.color = "";
        }, 2000);
    });
}

function copyScript() {
    const code = document.getElementById("script-code").textContent;
    navigator.clipboard.writeText(code);
}

// ============================================
// HELPERS
// ============================================

function showPageError(message) {
    const box = document.getElementById("error-box");
    const text = document.getElementById("error-text");
    if (box && text) {
        text.textContent = message;
        box.style.display = "flex";
    }
}

function resetBtn(btn, loading) {
    btn.disabled = false;
    btn.style.opacity = "1";
    loading.style.display = "none";
}

// ============================================
// PAGE ROUTER
// ============================================

window.addEventListener("DOMContentLoaded", () => {
    const page = window.location.pathname;
    const error = getParam("error");

    if (error) {
        const messages = {
            missing_token: "Checkpoint token missing. Please complete the link properly.",
            invalid_session: "Session expired. Please start over.",
            verification_failed: "Work.ink could not verify your completion. Try again.",
            server_error: "Server error during verification. Try again.",
            skip_detected: "Do not skip checkpoints.",
        };
        showPageError(messages[error] || "An error occurred.");
    }

    if (page.includes("checkpoint2")) {
        const sessionId = getParam("session");
        if (sessionId) sessionStorage.setItem("gravity_session", sessionId);
        if (!sessionId && !sessionStorage.getItem("gravity_session")) {
            window.location.href = "/index.html";
        }
    }

    if (page.includes("getkey")) {
        loadKeyPage();
    }
});