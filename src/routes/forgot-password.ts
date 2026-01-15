/* eslint-disable @typescript-eslint/no-explicit-any */
import express, { Request, Response } from "express"
import { createHash, randomBytes } from "node:crypto"
import * as sdk from "node-appwrite"

import { env } from "@/lib/env"
import { sendMail } from "@/email"

const router = express.Router()

/**
 * ✅ In-memory reset store (simple & fast)
 * NOTE: If server restarts, tokens are lost.
 * For production: store in DB (Appwrite collection).
 */
type ResetTokenRecord = {
    userId: string
    email: string
    expiresAt: number
}

const RESET_TOKENS = new Map<string, ResetTokenRecord>()

function hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex")
}

async function getUserByEmail(email: string) {
    const client = new sdk.Client()
        .setEndpoint(env.APPWRITE_ENDPOINT)
        .setProject(env.APPWRITE_PROJECT_ID)
        .setKey(env.APPWRITE_API_KEY)

    const users = new sdk.Users(client)

    // ✅ Try object-style first, fallback positional
    try {
        const res = await users.list({
            queries: [sdk.Query.equal("email", email), sdk.Query.limit(1)],
        })
        return (res as any)?.users?.[0] || null
    } catch {
        const res = await users.list([sdk.Query.equal("email", email), sdk.Query.limit(1)])
        return (res as any)?.users?.[0] || null
    }
}

/**
 * POST /api/auth/forgot-password
 * body: { email: string }
 */
router.post("/", async (req: Request, res: Response) => {
    try {
        const email = String((req.body as any)?.email || "").trim().toLowerCase()

        if (!email) {
            return res.status(400).json({ ok: false, message: "Email is required." })
        }

        const user = await getUserByEmail(email)

        // ✅ Do not reveal if email exists or not (security)
        if (!user) {
            return res.status(200).json({
                ok: true,
                message: "If the email exists, a reset link has been sent.",
            })
        }

        const userId = String((user as any)?.$id || (user as any)?.id || "").trim()
        if (!userId) {
            return res.status(500).json({ ok: false, message: "Failed to resolve userId." })
        }

        // ✅ Create token
        const rawToken = randomBytes(32).toString("hex")
        const tokenHash = hashToken(rawToken)

        const expiresAt = Date.now() + 15 * 60 * 1000 // 15 minutes

        RESET_TOKENS.set(tokenHash, {
            userId,
            email,
            expiresAt,
        })

        const resetUrl = `${env.SERVER_APP_ORIGIN}/auth/reset-password?token=${rawToken}`

        await sendMail({
            to: email,
            subject: "WorkloadHub Password Reset",
            html: `
<div style="font-family: Arial, sans-serif; line-height:1.6;">
  <h2 style="margin:0 0 10px;">Reset your password</h2>
  <p>We received a request to reset your password.</p>
  <p>
    Click the button below to reset your password (valid for <b>15 minutes</b>):
  </p>
  <p>
    <a href="${resetUrl}"
       style="display:inline-block;background:#111827;color:white;padding:10px 14px;border-radius:8px;text-decoration:none;">
      Reset Password
    </a>
  </p>
  <p style="color:#6b7280;font-size:12px;margin-top:14px;">
    If you did not request this, ignore this email.
  </p>
</div>
`,
        })

        return res.status(200).json({
            ok: true,
            message: "If the email exists, a reset link has been sent.",
        })
    } catch (e: any) {
        return res.status(500).json({
            ok: false,
            message: e?.message || "Failed to send reset email.",
        })
    }
})

/**
 * ✅ Export token store so password-reset route can verify it
 */
export function consumeResetToken(rawToken: string) {
    const tokenHash = hashToken(rawToken)
    const rec = RESET_TOKENS.get(tokenHash)
    if (!rec) return null

    if (Date.now() > rec.expiresAt) {
        RESET_TOKENS.delete(tokenHash)
        return null
    }

    // consume (one-time use)
    RESET_TOKENS.delete(tokenHash)
    return rec
}

export default router
