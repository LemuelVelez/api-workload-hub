/* eslint-disable @typescript-eslint/no-explicit-any */
import express, { Request, Response } from "express"
import * as sdk from "node-appwrite"

import { env } from "@/lib/env"
import { sendMail } from "@/email"

const router = express.Router()

function escapeHtml(s: string) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;")
}

function generateTempPassword(length = 14) {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    const lower = "abcdefghijkmnopqrstuvwxyz"
    const nums = "23456789"
    const sym = "!@#$%^&*_-+=?"

    const all = upper + lower + nums + sym
    const pick = (set: string) => set[Math.floor(Math.random() * set.length)]

    const base = [
        pick(upper),
        pick(lower),
        pick(nums),
        pick(sym),
        ...Array.from({ length: Math.max(8, length) - 4 }, () => pick(all)),
    ]

    for (let i = base.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
            ;[base[i], base[j]] = [base[j], base[i]]
    }

    return base.join("")
}

function createAdminClient() {
    return new sdk.Client()
        .setEndpoint(env.APPWRITE_ENDPOINT)
        .setProject(env.APPWRITE_PROJECT_ID)
        .setKey(env.APPWRITE_API_KEY)
}

async function safeFindUserByEmail(users: any, email: string) {
    try {
        const r = await users.list({
            queries: [sdk.Query.equal("email", email), sdk.Query.limit(1)],
        })
        return r?.users?.[0] || null
    } catch {
        const r = await users.list([sdk.Query.equal("email", email), sdk.Query.limit(1)])
        return r?.users?.[0] || null
    }
}

async function safeUpdatePassword(users: any, userId: string, password: string) {
    try {
        await users.updatePassword({ userId, password })
        return true
    } catch {
        await users.updatePassword(userId, password)
        return true
    }
}

async function safeUpdatePrefs(users: any, userId: string, prefs: Record<string, any>) {
    try {
        await users.updatePrefs({ userId, prefs })
        return true
    } catch {
        try {
            await users.updatePrefs(userId, prefs)
            return true
        } catch {
            return false
        }
    }
}

async function safeCreateUser(users: any, userId: string, email: string, password: string, name?: string) {
    try {
        return await users.create({
            userId,
            email,
            password,
            name,
        })
    } catch {
        // older positional: (userId, email, phone, password, name)
        return await users.create(userId, email, undefined, password, name)
    }
}

/**
 * ✅ Styled WorkloadHub Email Template
 * NOTE: Emails cannot use Tailwind or your index.css directly.
 * We mimic your midnight theme using inline styles (email-safe).
 */
function buildCredentialsEmailHtml(opts: {
    name?: string
    email: string
    loginUrl: string
    tempPassword: string
    action: "created" | "resent"
}) {
    const safeName = opts.name ? escapeHtml(opts.name) : ""
    const safeEmail = escapeHtml(opts.email)
    const safeLoginUrl = escapeHtml(opts.loginUrl)
    const safeTempPassword = escapeHtml(opts.tempPassword)

    const heading = opts.action === "resent" ? "Credentials Updated" : "Welcome to WorkloadHub"

    const introText =
        opts.action === "resent"
            ? "Your login credentials have been updated. A new temporary password was generated for your account."
            : "Your WorkloadHub account has been created by the administrator. Please use the credentials below to sign in."

    // Email-safe theme colors (approx from your index.css midnight theme)
    const c = {
        bg1: "#0B1020",
        bg2: "#101A34",
        card: "#121C36",
        border: "rgba(255,255,255,0.12)",
        text: "#F2F6FF",
        muted: "#B9C3D6",
        primary: "#5AA6FF",
        primaryText: "#071024",
        codeBg: "rgba(255,255,255,0.06)",
        soft: "rgba(255,255,255,0.07)",
    }

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="dark light" />
  <meta name="supported-color-schemes" content="dark light" />
  <title>WorkloadHub Credentials</title>
</head>
<body style="margin:0;padding:0;background:${c.bg1};font-family:Arial,Helvetica,sans-serif;color:${c.text};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${c.bg1};">
    <tr>
      <td align="center" style="padding:28px 12px;background:${c.bg1};">
        
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
          style="width:100%;max-width:600px;border-collapse:collapse;border-radius:18px;overflow:hidden;border:1px solid ${c.border};background:${c.bg2};">
          
          <!-- Header (NO logo, NO tagline) -->
          <tr>
            <td style="padding:18px 20px;background:linear-gradient(135deg, ${c.bg1}, ${c.bg2});border-bottom:1px solid ${c.border};">
              <div style="font-size:16px;font-weight:800;letter-spacing:0.3px;margin:0;color:${c.text};">
                WorkloadHub
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:22px 20px;background:${c.bg2};">
              <div style="font-size:18px;font-weight:800;margin:0 0 10px;color:${c.text};">
                ${heading}
              </div>

              <div style="font-size:14px;line-height:1.6;color:${c.muted};margin:0 0 14px;">
                Hello${safeName ? ` <span style="color:${c.text};font-weight:700;">${safeName}</span>` : ""},<br/>
                ${introText}
              </div>

              <!-- Credentials Card -->
              <div style="background:${c.card};border:1px solid ${c.border};border-radius:16px;padding:14px 14px;margin:14px 0;">
                <div style="font-size:13px;color:${c.muted};margin-bottom:10px;">
                  Use the following credentials to sign in:
                </div>

                <div style="margin-bottom:10px;">
                  <div style="font-size:12px;color:${c.muted};margin-bottom:6px;">Login URL</div>
                  <a href="${safeLoginUrl}" 
                     style="display:inline-block;color:${c.primary};text-decoration:none;font-weight:700;word-break:break-word;">
                    ${safeLoginUrl}
                  </a>
                </div>

                <div style="margin-bottom:10px;">
                  <div style="font-size:12px;color:${c.muted};margin-bottom:6px;">Email</div>
                  <div style="font-size:14px;color:${c.text};font-weight:700;word-break:break-word;">
                    ${safeEmail}
                  </div>
                </div>

                <div style="margin-bottom:0;">
                  <div style="font-size:12px;color:${c.muted};margin-bottom:6px;">Temporary Password</div>
                  <div style="background:${c.codeBg};border:1px solid ${c.border};border-radius:12px;padding:10px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:14px;color:${c.text};">
                    ${safeTempPassword}
                  </div>
                </div>
              </div>

              <!-- CTA Button -->
              <div style="margin:14px 0 8px;">
                <a href="${safeLoginUrl}"
                   style="display:inline-block;background:${c.primary};color:${c.primaryText};text-decoration:none;font-weight:900;padding:11px 16px;border-radius:14px;">
                  Sign in to WorkloadHub →
                </a>
              </div>

              <!-- Notes -->
              <div style="background:${c.soft};border:1px solid ${c.border};border-radius:16px;padding:12px 14px;margin-top:14px;">
                <div style="font-size:13px;color:${c.text};font-weight:800;margin-bottom:6px;">
                  Important
                </div>
                <div style="font-size:13px;line-height:1.6;color:${c.muted};">
                  ✅ On your first login, you must change your password.<br/>
                  ✅ After changing your password, your account will be verified automatically.
                </div>
              </div>

              <!-- Footer -->
              <div style="margin-top:16px;font-size:12px;line-height:1.6;color:${c.muted};">
                If you did not expect this email, you can safely ignore it.<br/>
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
 * POST /api/admin/send-login-credentials
 *
 * body:
 * {
 *   email: string,
 *   name?: string,
 *   userId?: string,
 *   resend?: boolean
 * }
 */
router.post("/", async (req: Request, res: Response) => {
    try {
        const email = String((req.body as any)?.email || "").trim().toLowerCase()
        const name = typeof (req.body as any)?.name === "string" ? String((req.body as any).name).trim() : ""
        const resend = Boolean((req.body as any)?.resend)
        const inputUserId = String((req.body as any)?.userId || "").trim()

        if (!email) {
            return res.status(400).json({ ok: false, message: "Email is required." })
        }

        const client = createAdminClient()
        const users = new sdk.Users(client)

        let existingUser = null

        // ✅ Prefer userId lookup if given
        if (inputUserId) {
            try {
                existingUser = await users.get(inputUserId)
            } catch {
                existingUser = null
            }
        }

        // ✅ Otherwise by email
        if (!existingUser) {
            existingUser = await safeFindUserByEmail(users, email)
        }

        // ✅ NEW SAFETY RULE:
        // - If user EXISTS and resend=false => DO NOT reset password, return conflict
        // - Only reset password when resend=true
        if (existingUser && !resend) {
            return res.status(409).json({
                ok: false,
                message: "User already exists. Use 'Resend Credentials' if you want to reset the password.",
            })
        }

        // ✅ If resend=true but user NOT FOUND
        if (!existingUser && resend) {
            return res.status(404).json({
                ok: false,
                message: "User not found. Cannot resend credentials.",
            })
        }

        let action: "created" | "resent" = "created"
        let resolvedUserId = ""
        const tempPassword = generateTempPassword(14)

        if (existingUser) {
            // ✅ RESEND credentials (reset password)
            action = "resent"
            resolvedUserId = String((existingUser as any)?.$id || (existingUser as any)?.id || "").trim()

            if (!resolvedUserId) {
                return res.status(500).json({ ok: false, message: "Failed to resolve userId." })
            }

            await safeUpdatePassword(users, resolvedUserId, tempPassword)

            // ✅ Force first-login change password again
            await safeUpdatePrefs(users, resolvedUserId, {
                mustChangePassword: true,
                isVerified: false,
                credentialsResentAt: new Date().toISOString(),
            })
        } else {
            // ✅ CREATE new user
            action = "created"

            const newUserId = sdk.ID.unique()
            const created = await safeCreateUser(users, newUserId, email, tempPassword, name || undefined)

            resolvedUserId = String((created as any)?.$id || (created as any)?.id || newUserId).trim()

            await safeUpdatePrefs(users, resolvedUserId, {
                mustChangePassword: true,
                isVerified: false,
                createdByAdmin: true,
                createdAt: new Date().toISOString(),
            })
        }

        const loginUrl = `${env.SERVER_APP_ORIGIN.replace(/\/$/, "")}/auth/login`

        const html = buildCredentialsEmailHtml({
            name: name || undefined,
            email,
            loginUrl,
            tempPassword,
            action,
        })

        await sendMail({
            to: email,
            subject:
                action === "resent"
                    ? "Your WorkloadHub Credentials (Updated)"
                    : "Your WorkloadHub Account Credentials",
            html,
        })

        return res.status(200).json({
            ok: true,
            action,
            userId: resolvedUserId,
            email,
            message: action === "resent" ? "Credentials resent." : "User created and emailed.",
        })
    } catch (e: any) {
        return res.status(500).json({
            ok: false,
            message: e?.message || "Failed to send login credentials.",
        })
    }
})

export default router
