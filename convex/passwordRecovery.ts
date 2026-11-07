import { Email } from '@convex-dev/auth/providers/Email'

// Convex Auth generates and validates the token; the email service only delivers it.
export const passwordRecovery = Email({
  id: 'password-recovery',
  name: 'Password recovery',
  maxAge: 15 * 60,
  async sendVerificationRequest({ identifier, token }) {
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.AUTH_EMAIL_FROM
    if (!apiKey || !from) throw new Error('Password recovery email is not configured')
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [identifier], subject: 'Your Ledgerline password reset code', text: `Use this code to reset your Ledgerline password:\n\n${token}\n\nIt expires in 15 minutes. If you did not request it, you can ignore this message.` }),
    })
    if (!response.ok) throw new Error('Unable to send password recovery email')
  },
})
