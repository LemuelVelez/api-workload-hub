/* eslint-disable @typescript-eslint/no-explicit-any */
import "dotenv/config"
import express from "express"
import cors, { type CorsOptions } from "cors"

import { env } from "@/lib/env"
import forgotPasswordRoute from "@/routes/forgot-password"
import passwordResetRoute from "@/routes/password-reset"
import sendLoginCredentialsRoute from "@/routes/send-login-credentials"

import deleteAuthUserRoute from "@/routes/delete-auth-user"
import verifyUserRoute from "@/routes/verify-user"

// ✅ NEW
import setAuthStatusRoute from "@/routes/set-auth-status"

const app = express()

/* CORS_CONFIG_START */
const allowedOrigins = (
  process.env.CORS_ALLOWED_ORIGINS ||
  process.env.SERVER_APP_ORIGIN ||
  "http://localhost:5173,https://workloadhub.jrmsu-tc.cloud"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error(`CORS blocked for origin: ${origin}`))
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization"],
  optionsSuccessStatus: 204,
}

app.use(cors(corsOptions))

// ✅ Express 5 / path-to-regexp fix:
// "*" is no longer a valid unnamed wildcard path.
// Use a named wildcard that matches all routes (including "/").
app.options("/{*any}", cors(corsOptions))
/* CORS_CONFIG_END */

app.disable("x-powered-by")

app.use(express.json({ limit: "2mb" }))

// ✅ Health check (supports both /health and /api/health)
app.get(["/health", "/api/health"], (_req, res) => {
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
