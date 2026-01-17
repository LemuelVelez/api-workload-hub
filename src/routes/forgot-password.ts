/* eslint-disable @typescript-eslint/no-explicit-any */
import express, { Request, Response } from "express"
import { createHash, randomBytes } from "node:crypto"
import * as sdk from "node-appwrite"

import { env } from "@/lib/env"
import { sendMail } from "@/email"

const router = express.Router()

type ResetTokenRecord = {
    userId: string
    email: string
    expiresAt: number
}

const RESET_TOKENS = new Map<string, ResetTokenRecord>()

function hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex")
}

function cleanupExpiredTokens() {
    const now = Date.now()
    for (const [k, v] of RESET_TOKENS.entries()) {
        if (now > v.expiresAt) RESET_TOKENS.delete(k)
    }
}

async function getUserByEmail(email: string) {
    const client = new sdk.Client()
        .setEndpoint(env.APPWRITE_ENDPOINT)
        .setProject(env.APPWRITE_PROJECT_ID)
        .setKey(env.APPWRITE_API_KEY)

    const users = new sdk.Users(client)

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

function escapeHtml(s: string) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;")
}

function buildResetEmailHtml(opts: { email: string; resetUrl: string; minutes: number }) {
    const safeEmail = escapeHtml(opts.email)
    const safeUrl = escapeHtml(opts.resetUrl)

    const c = {
        bg1: "#0B1020",
        bg2: "#101A34",
        card: "#121C36",
        border: "rgba(255,255,255,0.12)",
        text: "#F2F6FF",
        muted: "#B9C3D6",
        primary: "#5AA6FF",
        primaryText: "#071024",
        soft: "rgba(255,255,255,0.07)",
    }

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="dark light" />
  <meta name="supported-color-schemes" content="dark light" />
  <title>WorkloadHub Password Reset</title>
</head>
<body style="margin:0;padding:0;background:${c.bg1};font-family:Arial,Helvetica,sans-serif;color:${c.text};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${c.bg1};">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
          style="width:100%;max-width:600px;border-collapse:collapse;border-radius:18px;overflow:hidden;border:1px solid ${c.border};background:${c.bg2};">
          
          <tr>
            <td style="padding:18px 20px;background:linear-gradient(135deg, ${c.bg1}, ${c.bg2});border-bottom:1px solid ${c.border};">
              <div style="font-size:16px;font-weight:800;letter-spacing:0.3px;color:${c.text};">
                WorkloadHub
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:22px 20px;">
              <div style="font-size:18px;font-weight:800;margin:0 0 10px;color:${c.text};">
                Reset your password
              </div>

              <div style="font-size:14px;line-height:1.6;color:${c.muted};margin:0 0 14px;">
                We received a request to reset the password for <b style="color:${c.text};">${safeEmail}</b>.
                <br/>
                This link will expire in <b style="color:${c.text};">${opts.minutes} minutes</b>.
              </div>

              <div style="margin:14px 0 8px;">
                <a href="${safeUrl}"
                   style="display:inline-block;background:${c.primary};color:${c.primaryText};text-decoration:none;font-weight:900;padding:11px 16px;border-radius:14px;">
                  Reset Password →
                </a>
              </div>

              <div style="background:${c.soft};border:1px solid ${c.border};border-radius:16px;padding:12px 14px;margin-top:14px;">
                <div style="font-size:13px;color:${c.text};font-weight:800;margin-bottom:6px;">
                  If you didn’t request this
                </div>
                <div style="font-size:13px;line-height:1.6;color:${c.muted};">
                  You can safely ignore this email. Your password will not change unless you open the link and set a new one.
                </div>
              </div>

              <div style="margin-top:16px;font-size:12px;line-height:1.6;color:${c.muted};">
                If the button doesn’t work, copy and paste this link:<br/>
                <a href="${safeUrl}" style="color:${c.primary};text-decoration:none;word-break:break-word;font-weight:700;">
                  ${safeUrl}
                </a>
                <br/><br/>
                <span style="opacity:0.9;">© ${new Date().getFullYear()} WorkloadHub</span>
              </div>
            </td>
          </tr>
        </table>

        <div style="height:18px;"></div>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * POST /api/auth/forgot-password
 * body: { email: string }
 */
router.post("/", async (req: Request, res: Response) => {
    try {
        cleanupExpiredTokens()

        const email = String((req.body as any)?.email || "").trim().toLowerCase()
        if (!email) return res.status(400).json({ ok: false, message: "Email is required." })

        const user = await getUserByEmail(email)

        // ✅ Always return success (do not leak user existence)
        if (!user) {
            return res.status(200).json({
                ok: true,
                message: "If the email exists, a reset link has been sent.",
            })
        }

        const userId = String((user as any)?.$id || (user as any)?.id || "").trim()
        if (!userId) {
            return res.status(200).json({
                ok: true,
                message: "If the email exists, a reset link has been sent.",
            })
        }

        const rawToken = randomBytes(32).toString("hex")
        const tokenHash = hashToken(rawToken)

        const expiresAt = Date.now() + 15 * 60 * 1000 // 15 mins
        RESET_TOKENS.set(tokenHash, {
            userId,
            email,
            expiresAt,
        })

        const resetUrl =
            `${env.SERVER_APP_ORIGIN.replace(/\/$/, "")}` +
            `/auth/reset-password?token=${encodeURIComponent(rawToken)}&userId=${encodeURIComponent(userId)}`

        const html = buildResetEmailHtml({
            email,
            resetUrl,
            minutes: 15,
        })

        await sendMail({
            to: email,
            subject: "WorkloadHub Password Reset",
            html,
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
    cleanupExpiredTokens()

    const tokenHash = hashToken(rawToken)
    const rec = RESET_TOKENS.get(tokenHash)
    if (!rec) return null

    if (Date.now() > rec.expiresAt) {
        RESET_TOKENS.delete(tokenHash)
        return null
    }

    RESET_TOKENS.delete(tokenHash)
    return rec
}

export default router
