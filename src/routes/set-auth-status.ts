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

async function safeUpdateStatus(users: any, userId: string, status: boolean) {
    try {
        await users.updateStatus({ userId, status })
        return true
    } catch {
        await users.updateStatus(userId, status)
        return true
    }
}

async function safeDeleteSessions(users: any, userId: string) {
    // ✅ Optional: revoke sessions immediately when deactivated
    const fn = (users as any)["deleteSessions"]?.bind(users)
    if (!fn) return false

    try {
        await fn({ userId })
        return true
    } catch {
        try {
            await fn(userId)
            return true
        } catch {
            return false
        }
    }
}

/**
 * POST /api/admin/set-auth-status
 * body: { userId: string, isActive: boolean }
 *
 * ✅ When isActive=false:
 * - Appwrite Auth status=false (login blocked)
 * - sessions revoked (best-effort)
 *
 * ✅ When isActive=true:
 * - Appwrite Auth status=true (login enabled)
 */
router.post("/", async (req: Request, res: Response) => {
    try {
        const userId = String((req.body as any)?.userId || "").trim()
        const isActive = Boolean((req.body as any)?.isActive)

        if (!userId) {
            return res.status(400).json({ ok: false, message: "userId is required." })
        }

        const client = createAdminClient()
        const users = new sdk.Users(client)

        // ✅ If user not found, we treat as OK (prevents UI freezing if already deleted)
        try {
            await users.get(userId)
        } catch (e: any) {
            const msg = String(e?.message || "").toLowerCase()
            if (msg.includes("not found") || msg.includes("user not found")) {
                return res.status(200).json({
                    ok: true,
                    userId,
                    status: isActive,
                    message: "User not found in Auth (already removed).",
                })
            }
            throw e
        }

        // ✅ Appwrite Auth: update status
        await safeUpdateStatus(users, userId, isActive)

        // ✅ revoke sessions immediately when deactivated
        if (!isActive) {
            await safeDeleteSessions(users, userId)
        }

        return res.status(200).json({
            ok: true,
            userId,
            status: isActive,
            message: isActive ? "Auth user enabled." : "Auth user disabled (login blocked).",
        })
    } catch (e: any) {
        return res.status(500).json({
            ok: false,
            message: e?.message || "Failed to update auth status.",
        })
    }
})

export default router
