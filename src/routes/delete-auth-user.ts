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

async function safeDeleteUser(users: any, userId: string) {
    try {
        await users.delete({ userId })
        return true
    } catch {
        await users.delete(userId)
        return true
    }
}

/**
 * POST /api/admin/delete-auth-user
 * body: { userId: string }
 *
 * ✅ Deletes Appwrite Auth user using Admin API Key
 */
router.post("/", async (req: Request, res: Response) => {
    try {
        const userId = String((req.body as any)?.userId || "").trim()

        if (!userId) {
            return res.status(400).json({ ok: false, message: "userId is required." })
        }

        const client = createAdminClient()
        const users = new sdk.Users(client)

        try {
            await safeDeleteUser(users, userId)
        } catch (e: any) {
            const msg = String(e?.message || "").toLowerCase()
            // ✅ If already deleted, treat as OK
            if (msg.includes("not found") || msg.includes("user not found")) {
                return res.status(200).json({
                    ok: true,
                    userId,
                    message: "User already deleted.",
                })
            }
            throw e
        }

        return res.status(200).json({
            ok: true,
            userId,
            message: "Auth user deleted.",
        })
    } catch (e: any) {
        return res.status(500).json({
            ok: false,
            message: e?.message || "Failed to delete auth user.",
        })
    }
})

export default router
