/* eslint-disable @typescript-eslint/no-explicit-any */
import "dotenv/config"
import express from "express"
import cors from "cors"

import { env } from "@/lib/env"
import forgotPasswordRoute from "@/routes/forgot-password"
import passwordResetRoute from "@/routes/password-reset"
import sendLoginCredentialsRoute from "@/routes/send-login-credentials"

import deleteAuthUserRoute from "@/routes/delete-auth-user"
import verifyUserRoute from "@/routes/verify-user"

// ✅ NEW
import setAuthStatusRoute from "@/routes/set-auth-status"

const app = express()

app.disable("x-powered-by")

app.use(
    cors({
        origin: env.SERVER_APP_ORIGIN,
        credentials: true,
    })
)

app.use(express.json({ limit: "2mb" }))

// ✅ Health check
app.get("/health", (_req, res) => {
    res.status(200).json({
        ok: true,
        service: "workloadhub-express",
    })
})

// ✅ Routes
app.use("/api/auth/forgot-password", forgotPasswordRoute)
app.use("/api/auth/password-reset", passwordResetRoute)

app.use("/api/admin/send-login-credentials", sendLoginCredentialsRoute)

// ✅ Existing added earlier
app.use("/api/admin/delete-auth-user", deleteAuthUserRoute)
app.use("/api/auth/verify-user", verifyUserRoute)

// ✅ NEW: Enable/Disable Auth login status
app.use("/api/admin/set-auth-status", setAuthStatusRoute)

app.listen(env.PORT, () => {
    console.log(`✅ Express API running on http://localhost:${env.PORT}`)
    console.log(`✅ Allowed CORS origin: ${env.SERVER_APP_ORIGIN}`)
})
