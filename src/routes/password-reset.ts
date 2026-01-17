/* eslint-disable @typescript-eslint/no-explicit-any */
import express, { Request, Response } from "express"
import * as sdk from "node-appwrite"

import { env } from "@/lib/env"
import { consumeResetToken } from "@/routes/forgot-password"

const router = express.Router()

function createAdminClient() {
    return new sdk.Client()
        .setEndpoint(env.APPWRITE_ENDPOINT)
        .setProject(env.APPWRITE_PROJECT_ID)
        .setKey(env.APPWRITE_API_KEY)
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

/**
 * POST /api/auth/password-reset
 * body: { token, password, passwordConfirm }
 */
router.post("/", async (req: Request, res: Response) => {
    try {
        const token = String((req.body as any)?.token || "").trim()
        const password = String((req.body as any)?.password || "").trim()
        const passwordConfirm = String((req.body as any)?.passwordConfirm || "").trim()

        if (!token) return res.status(400).json({ ok: false, message: "Token is required." })
        if (!password) return res.status(400).json({ ok: false, message: "Password is required." })
        if (password.length < 8) {
            return res.status(400).json({ ok: false, message: "Password must be at least 8 characters." })
        }
        if (password !== passwordConfirm) {
            return res.status(400).json({ ok: false, message: "Passwords do not match." })
        }

        const rec = consumeResetToken(token)
        if (!rec) {
            return res.status(400).json({
                ok: false,
                message: "Invalid or expired token.",
            })
        }

        const client = createAdminClient()
        const users = new sdk.Users(client)

        await safeUpdatePassword(users, rec.userId, password)

        // ✅ IMPORTANT: ensure user can login normally after reset
        await safeUpdatePrefs(users, rec.userId, {
            mustChangePassword: false,
            isVerified: true,
            verifiedAt: new Date().toISOString(),
            verifiedBy: "password_reset_token",
            passwordResetAt: new Date().toISOString(),
        }).catch(() => null)

        return res.status(200).json({
            ok: true,
            userId: rec.userId,
            email: rec.email,
            message: "Password has been reset successfully.",
        })
    } catch (e: any) {
        return res.status(500).json({
            ok: false,
            message: e?.message || "Failed to reset password.",
        })
    }
})

export default router
