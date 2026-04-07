import "server-only";

import nodemailer from "nodemailer";

import { getServerEnv } from "@/lib/utils/env";

export function sendLeadAutomationEmail(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const env = getServerEnv();

  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_FROM) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, and SMTP_FROM before enabling email delivery.");
  }

  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    auth: env.SMTP_USER
      ? {
          user: env.SMTP_USER,
          pass: env.SMTP_PASSWORD
        }
      : undefined
  });

  return transport.sendMail({
    from: env.SMTP_FROM,
    replyTo: env.SMTP_REPLY_TO,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html
  });
}
