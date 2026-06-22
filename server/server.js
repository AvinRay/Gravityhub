require("dotenv").config();
const express = require("express");
const axios = require("axios");
const path = require("path");
const cors = require("cors");
const { createSession, getSession, updateSession, generateKey, validateKey } = require("./keys");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// ============================================
// Rate limiting (simple in-memory)
// ============================================
const rateLimitMap = new Map();

function rateLimit(ip, maxRequests = 10, windowMs = 60000) {
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, []);
    }

    const requests = rateLimitMap.get(ip).filter(time => time > windowStart);
    requests.push(now);
    rateLimitMap.set(ip, requests);

    return requests.length > maxRequests;
}

// ============================================
// ROUTE: Start a session
// ============================================
app.post("/api/session/create", (req, res) => {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    if (rateLimit(ip, 5, 60000)) {
        return res.status(429).json({ error: "Too many requests. Slow down." });
    }

    const sessionId = createSession(ip);
    res.json({ sessionId });
});

// ============================================
// ROUTE: Get Work.ink link 1
// Called when user wants to start CP1
// ============================================
app.post("/api/checkpoint/1/start", (req, res) => {
    const { sessionId } = req.body;
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    if (rateLimit(ip)) {
        return res.status(429).json({ error: "Too many requests." });
    }

    const session = getSession(sessionId);
    if (!session) {
        return res.status(400).json({ error: "Invalid session." });
    }

    // Build the Work.ink URL
    // Work.ink redirect URL format:
    // https://work.ink/YOUR_LINK_ID?r=YOUR_CALLBACK_URL
    const callbackUrl = encodeURIComponent(
        `${req.protocol}://${req.get("host")}/api/checkpoint/1/callback?session=${sessionId}`
    );

    const workinkUrl = `https://work.ink/${process.env.WORKINK_LINK_ID_1}?r=${callbackUrl}`;

    res.json({ url: workinkUrl });
});

// ============================================
// ROUTE: Work.ink Callback for CP1
// Work.ink redirects here after completion
// ============================================
app.get("/api/checkpoint/1/callback", async (req, res) => {
    const { session: sessionId, token } = req.query;

    if (!sessionId || !token) {
        return res.redirect("/index.html?error=missing_token");
    }

    const session = getSession(sessionId);
    if (!session) {
        return res.redirect("/index.html?error=invalid_session");
    }

    // Verify the token with Work.ink API
    try {
        const response = await axios.get("https://work.ink/api/verifyToken", {
            params: {
                token: token,
                linkId: process.env.WORKINK_LINK_ID_1,
            },
            headers: {
                Authorization: `Bearer ${process.env.WORKINK_API_KEY_1}`,
            },
        });

        if (response.data && response.data.success === true) {
            // Token is valid - mark CP1 as complete
            updateSession(sessionId, {
                cp1: true,
                cp1Time: Date.now(),
                cp1Token: token,
            });

            // Redirect to checkpoint 2
            res.redirect(`/checkpoint2.html?session=${sessionId}`);
        } else {
            res.redirect(`/index.html?error=verification_failed`);
        }
    } catch (err) {
        console.error("Work.ink CP1 verification error:", err.message);
        res.redirect(`/index.html?error=server_error`);
    }
});

// ============================================
// ROUTE: Get Work.ink link 2
// ============================================
app.post("/api/checkpoint/2/start", (req, res) => {
    const { sessionId } = req.body;
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    if (rateLimit(ip)) {
        return res.status(429).json({ error: "Too many requests." });
    }

    const session = getSession(sessionId);
    if (!session) {
        return res.status(400).json({ error: "Invalid session." });
    }

    // Must have completed CP1
    if (!session.cp1) {
        return res.status(403).json({ error: "Complete checkpoint 1 first." });
    }

    const callbackUrl = encodeURIComponent(
        `${req.protocol}://${req.get("host")}/api/checkpoint/2/callback?session=${sessionId}`
    );

    const workinkUrl = `https://work.ink/${process.env.WORKINK_LINK_ID_2}?r=${callbackUrl}`;

    res.json({ url: workinkUrl });
});

// ============================================
// ROUTE: Work.ink Callback for CP2
// ============================================
app.get("/api/checkpoint/2/callback", async (req, res) => {
    const { session: sessionId, token } = req.query;

    if (!sessionId || !token) {
        return res.redirect("/checkpoint2.html?error=missing_token");
    }

    const session = getSession(sessionId);
    if (!session) {
        return res.redirect("/index.html?error=invalid_session");
    }

    if (!session.cp1) {
        return res.redirect("/index.html?error=skip_detected");
    }

    // Verify with Work.ink API
    try {
        const response = await axios.get("https://work.ink/api/verifyToken", {
            params: {
                token: token,
                linkId: process.env.WORKINK_LINK_ID_2,
            },
            headers: {
                Authorization: `Bearer ${process.env.WORKINK_API_KEY_2}`,
            },
        });

        if (response.data && response.data.success === true) {
            updateSession(sessionId, {
                cp2: true,
                cp2Time: Date.now(),
                cp2Token: token,
            });

            // Generate the key now
            const { key, expiry } = generateKey(sessionId);

            updateSession(sessionId, { key, keyExpiry: expiry });

            res.redirect(`/getkey.html?session=${sessionId}`);
        } else {
            res.redirect(`/checkpoint2.html?error=verification_failed`);
        }
    } catch (err) {
        console.error("Work.ink CP2 verification error:", err.message);
        res.redirect(`/checkpoint2.html?error=server_error`);
    }
});

// ============================================
// ROUTE: Get the key (called by getkey.html)
// ============================================
app.get("/api/key/get", (req, res) => {
    const { sessionId } = req.query;

    if (!sessionId) {
        return res.status(400).json({ error: "No session provided." });
    }

    const session = getSession(sessionId);

    if (!session) {
        return res.status(400).json({ error: "Invalid session." });
    }

    if (!session.cp1 || !session.cp2) {
        return res.status(403).json({ error: "Checkpoints not completed." });
    }

    if (!session.key) {
        return res.status(400).json({ error: "No key generated." });
    }

    res.json({
        key: session.key,
        expiry: session.keyExpiry,
    });
});

// ============================================
// ROUTE: Validate a key (for your Lua script)
// ============================================
app.get("/api/key/validate", (req, res) => {
    const { key } = req.query;

    if (!key) {
        return res.status(400).json({ valid: false, reason: "No key provided." });
    }

    const result = validateKey(key);
    res.json(result);
});

app.listen(PORT, () => {
    console.log(`Gravity Hub server running on port ${PORT}`);
});