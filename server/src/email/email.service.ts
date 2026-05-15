import { Injectable, Logger } from '@nestjs/common';

/**
 * Provider-agnostic transactional email service.
 *
 * Provider chosen by `EMAIL_PROVIDER` env var:
 *   - unset / "noop" → log-only (dev default; no emails leave the box)
 *   - "resend"        → Resend HTTP API (recommended, free tier, clean API)
 *   - "msg91"         → MSG91 transactional email (INR billing, India-domiciled)
 *
 * Common config:
 *   EMAIL_FROM        — From: address (e.g. "Vaani <hello@vaaani.in>")
 *   EMAIL_REPLY_TO    — optional Reply-To override
 *
 * Resend config:
 *   RESEND_API_KEY    — Resend dashboard → API Keys
 *
 * MSG91 config:
 *   MSG91_AUTH_KEY    — MSG91 dashboard → Auth Key
 *   MSG91_DOMAIN      — your verified sending domain in MSG91
 *
 * The interface is tight on purpose. Templates live in this file as small
 * private builders so the call sites stay 1-line. Add HTML/MJML later if
 * the noop logs surface real volume.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly provider: string;
  private readonly from: string;
  private readonly replyTo: string | undefined;

  constructor() {
    this.provider = (process.env.EMAIL_PROVIDER || 'noop').toLowerCase();
    this.from = process.env.EMAIL_FROM || 'Vaani <hello@vaaani.in>';
    this.replyTo = process.env.EMAIL_REPLY_TO;

    if (this.provider === 'resend' && !process.env.RESEND_API_KEY) {
      this.logger.warn('EMAIL_PROVIDER=resend but RESEND_API_KEY is not set — falling back to noop');
      this.provider = 'noop';
    }
    if (this.provider === 'msg91' && !process.env.MSG91_AUTH_KEY) {
      this.logger.warn('EMAIL_PROVIDER=msg91 but MSG91_AUTH_KEY is not set — falling back to noop');
      this.provider = 'noop';
    }
    this.logger.log(`Email transport: ${this.provider} (from=${this.from})`);
  }

  // ── Transactional flows ────────────────────────────────────────────────

  async sendWelcome(to: string, name: string): Promise<void> {
    await this.send({
      to,
      subject: 'Welcome to Vaani',
      text:
        `Hi ${name},\n\n` +
        `You're signed in. Vaani is your IELTS / TOEFL Speaking diagnostic — record a mock, get a band ` +
        `with examiner-style feedback in under two minutes.\n\n` +
        `One thing before you start: a single English consent acceptance unlocks the analyzer. ` +
        `It's a DPDP Act 2023 requirement and a 30-second click in the app.\n\n` +
        `Questions or feedback: just reply to this email.\n\n` +
        `— Neil\n` +
        `Vaani — vaaani.in`,
    });
  }

  async sendConsentReceipt(to: string, name: string, consentVersion: string, grantedAt: Date): Promise<void> {
    const ts = grantedAt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    await this.send({
      to,
      subject: 'Your Vaani consent — recorded',
      text:
        `Hi ${name},\n\n` +
        `We've recorded your consent for Vaani to analyze your voice recordings under DPDP Act 2023.\n\n` +
        `  Version  : ${consentVersion}\n` +
        `  Granted  : ${ts}\n\n` +
        `You can revoke this at any time from your account settings, or by emailing us. Revocation ` +
        `stops new analyses immediately and triggers deletion of any consent record we hold for you.\n\n` +
        `— Vaani\n` +
        `vaaani.in`,
    });
  }

  async sendDeletionConfirmation(to: string, name: string, counts: { consents: number; audioFiles: number }): Promise<void> {
    await this.send({
      to,
      subject: 'Vaani — your data has been deleted',
      text:
        `Hi ${name},\n\n` +
        `Per your request under DPDP Act 2023, we've deleted the data we held for your account.\n\n` +
        `  Consent records removed : ${counts.consents}\n` +
        `  Audio files removed     : ${counts.audioFiles}\n\n` +
        `Audit logs are retained for two years for compliance, with personal identifiers stripped.\n\n` +
        `If you want to re-use Vaani in future, you'll need to sign in again and re-grant consent.\n\n` +
        `— Vaani\n` +
        `vaaani.in`,
    });
  }

  async sendVerificationEmail(to: string, name: string, link: string): Promise<void> {
    await this.send({
      to,
      subject: 'Verify your Vaani email',
      text:
        `Hi ${name || 'there'},\n\n` +
        `Welcome to Vaani! Please confirm this is your email so we can save your IELTS / TOEFL practice history.\n\n` +
        `Verify your email: ${link}\n\n` +
        `This link expires in 24 hours. If you didn't create a Vaani account, ignore this email.\n\n` +
        `— Vaani\n` +
        `vaaani.in`,
    });
  }

  async sendPasswordReset(to: string, name: string, link: string): Promise<void> {
    await this.send({
      to,
      subject: 'Reset your Vaani password',
      text:
        `Hi ${name || 'there'},\n\n` +
        `We got a request to reset your Vaani password. Click the link below to choose a new one:\n\n` +
        `Reset password: ${link}\n\n` +
        `This link expires in 1 hour. If you didn't request a reset, ignore this email — your account stays as it was.\n\n` +
        `— Vaani\n` +
        `vaaani.in`,
    });
  }

  async sendGoogleLinkConfirmation(to: string, name: string, link: string): Promise<void> {
    await this.send({
      to,
      subject: 'Link Google sign-in to your Vaani account',
      text:
        `Hi ${name || 'there'},\n\n` +
        `Someone tried to sign in to Vaani using Google with this email address. Your account ` +
        `was originally created with a password — to allow Google sign-in for the same account, ` +
        `confirm by clicking below.\n\n` +
        `Link Google: ${link}\n\n` +
        `This link expires in 1 hour. If this wasn't you, ignore this email — your account is unchanged.\n\n` +
        `— Vaani\n` +
        `vaaani.in`,
    });
  }

  async sendReportReady(to: string, name: string, overallBand: number, downloadUrl: string): Promise<void> {
    await this.send({
      to,
      subject: `Your Vaani band: ${overallBand.toFixed(1)}`,
      text:
        `Hi ${name},\n\n` +
        `Your IELTS Speaking diagnostic is ready.\n\n` +
        `  Overall band: ${overallBand.toFixed(1)} (Vaani estimate)\n\n` +
        `Download your report: ${downloadUrl}\n\n` +
        `Reminder: this is a diagnostic estimate, not an official IELTS score. Use it for prep, not for ` +
        `decisions about test readiness.\n\n` +
        `— Vaani\n` +
        `vaaani.in`,
    });
  }

  // ── Transport ──────────────────────────────────────────────────────────

  private async send(input: SendEmailInput): Promise<void> {
    if (this.provider === 'noop') {
      this.logger.log(
        `[noop] would send to=${input.to} subject="${input.subject}" body=${input.text.length}ch`,
      );
      return;
    }
    try {
      if (this.provider === 'resend') {
        await this.sendViaResend(input);
      } else if (this.provider === 'msg91') {
        await this.sendViaMsg91(input);
      } else {
        this.logger.warn(`unknown EMAIL_PROVIDER=${this.provider}; dropping email to ${input.to}`);
      }
    } catch (err: any) {
      // Email failures must never break the request that triggered them.
      // We log + swallow; downstream retry / dead-letter is a v2 concern.
      this.logger.error(`email send to ${input.to} failed: ${err?.message || err}`);
    }
  }

  private async sendViaResend(input: SendEmailInput): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
        reply_to: input.replyTo || this.replyTo,
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
  }

  private async sendViaMsg91(input: SendEmailInput): Promise<void> {
    const domain = process.env.MSG91_DOMAIN;
    if (!domain) throw new Error('MSG91_DOMAIN not set');
    const fromEmail = this.from.match(/<([^>]+)>/)?.[1] || this.from;
    const res = await fetch(`https://control.msg91.com/api/v5/email/send`, {
      method: 'POST',
      headers: {
        authkey: process.env.MSG91_AUTH_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipients: [{ to: [{ email: input.to }] }],
        from: { email: fromEmail },
        domain,
        subject: input.subject,
        body: input.text,
      }),
    });
    if (!res.ok) {
      throw new Error(`MSG91 ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
  }
}
