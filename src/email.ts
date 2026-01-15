/* eslint-disable @typescript-eslint/no-explicit-any */
import nodemailer from "nodemailer"
import { env } from "@/lib/env"

type SendMailArgs = {
    to: string
    subject: string
    html: string
}

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: env.GMAIL_USER,
        pass: env.GMAIL_APP_PASSWORD,
    },
})

export async function sendMail({ to, subject, html }: SendMailArgs) {
    await transporter.sendMail({
        from: `"WorkloadHub" <${env.GMAIL_USER}>`,
        to,
        subject,
        html,
    })
}
