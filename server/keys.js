// In-memory store
// For production use a real database like MongoDB or Redis
const sessions = new Map();
const validKeys = new Map();

function createSession(ip) {
    const crypto = require("crypto");
    const sessionId = crypto.randomBytes(32).toString("hex");

    sessions.set(sessionId, {
        ip: ip,
        cp1: false,
        cp2: false,
        cp1Time: null,
        cp2Time: null,
        created: Date.now(),
    });

    return sessionId;
}

function getSession(sessionId) {
    return sessions.get(sessionId) || null;
}

function updateSession(sessionId, data) {
    const existing = sessions.get(sessionId);
    if (!existing) return false;
    sessions.set(sessionId, { ...existing, ...data });
    return true;
}

function generateKey(sessionId) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const segments = [4, 4, 4, 4];
    const parts = segments.map(len =>
        Array.from({ length: len }, () =>
            chars[Math.floor(Math.random() * chars.length)]
        ).join("")
    );
    const key = `GH-${parts.join("-")}`;
    const expiry = Date.now() + 24 * 60 * 60 * 1000;

    validKeys.set(key, {
        sessionId,
        expiry,
        created: Date.now(),
    });

    return { key, expiry };
}

function validateKey(key) {
    const data = validKeys.get(key);
    if (!data) return { valid: false, reason: "Key does not exist" };
    if (Date.now() > data.expiry) {
        validKeys.delete(key);
        return { valid: false, reason: "Key has expired" };
    }
    return { valid: true };
}

// Clean up old sessions every hour
setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions.entries()) {
        if (now - session.created > 2 * 60 * 60 * 1000) {
            sessions.delete(id);
        }
    }
    for (const [key, data] of validKeys.entries()) {
        if (now > data.expiry) {
            validKeys.delete(key);
        }
    }
}, 60 * 60 * 1000);

module.exports = { createSession, getSession, updateSession, generateKey, validateKey };