/* eslint-disable @typescript-eslint/no-explicit-any */
import express, { Request, Response } from "express"
import * as sdk from "node-appwrite"

import { env } from "@/lib/env"

const router = express.Router()

function createAdminClient() {
    return new sdk.Client()
        .setEndpoint(env.APPWRITE_ENDPOINT)
        .setProject(env.APPWRITE_PROJECT_ID)
        .setKey(env.APPWRITE_API_KEY)
}

async function safeUpdatePrefs(users: any, userId: string, prefs: Record<string, any>) {
    const fn = (users as any)["updatePrefs"]?.bind(users)
    if (!fn) return false

    try {
        // ✅ most common: updatePrefs(userId, prefs)
        await fn(userId, prefs)
        return true
    } catch {
        try {
            // ✅ some SDK versions: updatePrefs({ userId, prefs })
            await fn({ userId, prefs })
            return true
        } catch {
            return false
        }
    }
}

async function safeUpdateEmailVerification(users: any, userId: string, emailVerification: boolean) {
    const fn =
        (users as any)["updateEmailVerification"]?.bind(users) ??
        (users as any)["updateVerification"]?.bind(users)

    if (!fn) return false

    try {
        // ✅ most common: updateEmailVerification(userId, true)
        await fn(userId, emailVerification)
        return true
    } catch {
        try {
            // ✅ some SDK versions: updateEmailVerification({ userId, emailVerification })
            await fn({ userId, emailVerification })
            return true
        } catch {
            return false
        }
    }
}

/**
 * POST /api/auth/verify-user
 * body: { userId: string }
 *
 * ✅ Marks Appwrite Auth user as VERIFIED automatically:
 * - emailVerification = true
 * - prefs: isVerified=true, mustChangePassword=false
 */
router.post("/", async (req: Request, res: Response) => {
    try {
        const userId = String((req.body as any)?.userId || "").trim()

        if (!userId) {
            return res.status(400).json({ ok: false, message: "userId is required." })
        }

        const client = createAdminClient()
        const users = new sdk.Users(client)

        // ✅ Ensure user exists (throws if not)
        await users.get(userId)

        // ✅ Mark email verified (REAL Appwrite auth verification)
        const okEmail = await safeUpdateEmailVerification(users, userId, true)
        if (!okEmail) {
            return res.status(500).json({
                ok: false,
                message: "Failed to update Appwrite email verification (SDK method not available).",
            })
        }

        // ✅ Keep prefs consistent too
        const okPrefs = await safeUpdatePrefs(users, userId, {
            mustChangePassword: false,
            isVerified: true,
            verifiedAt: new Date().toISOString(),
            verifiedBy: "password_change",
        })

        if (!okPrefs) {
            return res.status(500).json({
                ok: false,
                message: "Failed to update Appwrite user prefs (SDK method not available).",
            })
        }

        return res.status(200).json({
            ok: true,
            userId,
            message: "User verified successfully.",
        })
    } catch (e: any) {
        return res.status(500).json({
            ok: false,
            message: e?.message || "Failed to verify user.",
        })
    }
})

export default router
