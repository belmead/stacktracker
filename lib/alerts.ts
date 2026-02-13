import { Resend } from "resend";

import { env } from "@/lib/env";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendAdminAlert(subject: string, html: string): Promise<void> {
  if (!resend || !env.ALERT_FROM_EMAIL || !env.ALERT_TO_EMAIL) {
    console.warn("[alerts] missing resend configuration", { subject });
    return;
  }

  await resend.emails.send({
    from: env.ALERT_FROM_EMAIL,
    to: env.ALERT_TO_EMAIL,
    subject,
    html
  });
}
