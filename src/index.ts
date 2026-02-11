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
function normalizeOrigin(value: string): string {
  const v = String(value || "").trim()
  if (!v) return ""
  try {
    return new URL(v).origin
  } catch {
    return v.replace(/\/+$/, "")
  }
}

const rawAllowedOrigins = (
  process.env.CORS_ALLOWED_ORIGINS ||
  process.env.SERVER_APP_ORIGIN ||
  "http://localhost:5173,http://127.0.0.1:5173,https://workloadhub.jrmsu-tc.cloud"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

const allowedOrigins = Array.from(new Set(rawAllowedOrigins.map(normalizeOrigin).filter(Boolean)))

function isLocalDevOrigin(origin: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
}

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // allow server-to-server or same-origin requests without Origin header
    if (!origin) return callback(null, true)

    const requestOrigin = normalizeOrigin(origin)

    // exact allowlist
    if (allowedOrigins.includes(requestOrigin)) return callback(null, true)

    // local dev convenience (localhost / 127.0.0.1 with any port)
    if (isLocalDevOrigin(requestOrigin)) return callback(null, true)

    return callback(new Error(`CORS blocked for origin: ${origin}`))
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization"],
  optionsSuccessStatus: 204,
}

app.use(cors(corsOptions))

// ✅ IMPORTANT (Express 5):
// Do NOT use app.options("*", ...). It crashes with path-to-regexp v8.
// Global app.use(cors(...)) already handles OPTIONS preflight.
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err?.message?.startsWith("CORS blocked for origin:")) {
    return res.status(403).json({ ok: false, message: err.message })
  }
  return next(err)
})
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
  console.log(`✅ Allowed CORS origins: ${allowedOrigins.join(", ")}`)
})
