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

        let action: "created" | "resent" = "created"
        let resolvedUserId = ""
        const tempPassword = generateTempPassword(14)

        if (existingUser) {
            // ✅ If user exists: resend (reset password)
            action = "resent"
            resolvedUserId = String((existingUser as any)?.$id || (existingUser as any)?.id || "").trim()

            if (!resolvedUserId) {
                return res.status(500).json({ ok: false, message: "Failed to resolve userId." })
            }

            await safeUpdatePassword(users, resolvedUserId, tempPassword)

            // ✅ Force flags (best effort)
            await safeUpdatePrefs(users, resolvedUserId, {
                mustChangePassword: true,
                isVerified: false,
                credentialsResentAt: new Date().toISOString(),
            })
        } else {
            if (resend) {
                return res.status(404).json({
                    ok: false,
                    message: "User not found. Cannot resend credentials.",
                })
            }

            // ✅ Create new Appwrite auth user
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

        await sendMail({
            to: email,
            subject:
                action === "resent"
                    ? "Your WorkloadHub Credentials (Updated)"
                    : "Your WorkloadHub Account Credentials",
            html: `
<div style="font-family: Arial, sans-serif; line-height:1.6;">
  <h2 style="margin:0 0 10px;">WorkloadHub Login Credentials</h2>
  <p>Hello${name ? ` ${escapeHtml(name)}` : ""},</p>

  <p>${
      action === "resent"
          ? "Your credentials have been updated and a new temporary password was generated."
          : "Your account has been created by the administrator."
  }</p>

  <div style="background:#f7f7f7;border:1px solid #e5e5e5;padding:12px;border-radius:10px;">
    <p style="margin:0 0 6px;"><b>Login URL:</b> <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></p>
    <p style="margin:0 0 6px;"><b>Email:</b> ${escapeHtml(email)}</p>
    <p style="margin:0;"><b>Temporary Password:</b> <code>${escapeHtml(tempPassword)}</code></p>
  </div>

  <p style="margin-top:12px;">
    ✅ On your first login, you must change your password.<br/>
    ✅ After changing your password, your account will be verified automatically.
  </p>

  <p style="color:#6b7280;font-size:12px;margin-top:12px;">
    If you did not expect this email, you may ignore it.
  </p>
</div>
`,
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
