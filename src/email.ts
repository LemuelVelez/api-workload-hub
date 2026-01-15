/* eslint-disable @typescript-eslint/no-explicit-any */
import nodemailer from "nodemailer"
import { env } from "@/lib/env"

export type SendMailOptions = {
    to: string
    subject: string
    html?: string
    text?: string
}

/**
 * ✅ Gmail SMTP transporter
 * Uses:
 * - GMAIL_USER
 * - GMAIL_APP_PASSWORD (Google App Password)
 */
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: env.GMAIL_USER,
        pass: env.GMAIL_APP_PASSWORD,
    },
})

export async function sendMail(opts: SendMailOptions) {
    const to = (opts.to || "").trim().toLowerCase()
    const subject = (opts.subject || "").trim()

    if (!to) throw new Error("[email] Missing recipient 'to'.")
    if (!subject) throw new Error("[email] Missing 'subject'.")

    const info = await transporter.sendMail({
        from: `"WorkloadHub" <${env.GMAIL_USER}>`,
        to,
        subject,
        html: opts.html,
        text: opts.text,
    })

    return info
}
