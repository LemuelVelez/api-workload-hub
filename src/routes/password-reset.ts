/* eslint-disable @typescript-eslint/no-explicit-any */
import express, { Request, Response } from "express"
import * as sdk from "node-appwrite"

import { env } from "@/lib/env"
import { consumeResetToken } from "@/routes/forgot-password"

const router = express.Router()

async function updateUserPassword(userId: string, password: string) {
    const client = new sdk.Client()
        .setEndpoint(env.APPWRITE_ENDPOINT)
        .setProject(env.APPWRITE_PROJECT_ID)
        .setKey(env.APPWRITE_API_KEY)

    const users = new sdk.Users(client)

    // ✅ Object-style then fallback positional
    try {
        await users.updatePassword({ userId, password })
        return true
    } catch {
        await users.updatePassword(userId, password)
        return true
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

        await updateUserPassword(rec.userId, password)

        return res.status(200).json({
            ok: true,
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
