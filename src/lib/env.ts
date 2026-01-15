/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Server-only environment helper for ExpressJS.
 *
 * ✅ SAFE:
 * - Uses process.env only
 * - Keeps secrets (GMAIL_APP_PASSWORD, APPWRITE_API_KEY) server-side
 *
 * Make sure you have a .env file in your Express root project folder.
 */

type MaybeString = string | undefined

function required(name: string, value: MaybeString): string {
    const v = value?.trim()
    if (!v) {
        throw new Error(`[env] Missing required environment variable: ${name}`)
    }
    return v
}

function optional(_name: string, value: MaybeString): string | undefined {
    const v = value?.trim()
    return v ? v : undefined
}

function normalizeUrl(name: string, value: string): string {
    try {
        const url = new URL(value)
        return url.toString().replace(/\/$/, "")
    } catch {
        throw new Error(`[env] Invalid URL for ${name}: ${value}`)
    }
}

function ensureV1(endpoint: string) {
    const ep = endpoint.replace(/\/+$/, "")
    return ep.endsWith("/v1") ? ep : `${ep}/v1`
}

export function getServerEnv() {
    const PORT = Number(process.env.PORT || 4000)

    const APPWRITE_ENDPOINT_RAW = required("APPWRITE_ENDPOINT", process.env.APPWRITE_ENDPOINT)
    const APPWRITE_ENDPOINT = ensureV1(normalizeUrl("APPWRITE_ENDPOINT", APPWRITE_ENDPOINT_RAW))

    // ✅ FRONTEND ORIGIN (CORS + Email Links)
    const SERVER_APP_ORIGIN =
        optional("SERVER_APP_ORIGIN", process.env.SERVER_APP_ORIGIN) ??
        "http://127.0.0.1:5173"

    return Object.freeze({
        PORT,

        // ✅ Appwrite Admin config (server-only)
        APPWRITE_ENDPOINT,
        APPWRITE_PROJECT_ID: required("APPWRITE_PROJECT_ID", process.env.APPWRITE_PROJECT_ID),
        APPWRITE_API_KEY: required("APPWRITE_API_KEY", process.env.APPWRITE_API_KEY),

        // ✅ Your frontend origin (used for CORS + email links)
        SERVER_APP_ORIGIN: normalizeUrl("SERVER_APP_ORIGIN", SERVER_APP_ORIGIN),

        // ✅ Gmail SMTP (ExpressJS mail sender)
        GMAIL_USER: required("GMAIL_USER", process.env.GMAIL_USER),
        GMAIL_APP_PASSWORD: required("GMAIL_APP_PASSWORD", process.env.GMAIL_APP_PASSWORD),
    })
}

export const env = getServerEnv()
export type ServerEnv = ReturnType<typeof getServerEnv>
