import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { AppConfig } from './config';

let transporter: Transporter | null = null;

function getTransporter(config: AppConfig): Transporter | null {
  if (config.emailMode !== 'smtp' || !config.smtpHost) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      ...(config.smtpUser ? { auth: { user: config.smtpUser, pass: config.smtpPassword } } : {}),
    });
  }
  return transporter;
}

async function send(config: AppConfig, to: string, subject: string, text: string, html: string): Promise<void> {
  const mailer = getTransporter(config);
  if (!mailer) {
    if (config.nodeEnv === 'production') throw new Error('SMTP não configurado para envio de email.');
    console.info(JSON.stringify({ level: 'info', message: 'Email de desenvolvimento não enviado', subject }));
    return;
  }
  await mailer.sendMail({ from: config.emailFrom, to, subject, text, html });
}

export function verificationUrl(config: AppConfig, token: string): string {
  return `${config.appBaseUrl}/?verify=${encodeURIComponent(token)}`;
}

export function resetUrl(config: AppConfig, token: string): string {
  return `${config.appBaseUrl}/?reset=${encodeURIComponent(token)}`;
}

export async function sendVerificationEmail(config: AppConfig, to: string, token: string): Promise<void> {
  const url = verificationUrl(config, token);
  await send(
    config,
    to,
    'Confirme seu email — Clube de Ciências',
    `Confirme sua conta acessando: ${url}`,
    `<p>Confirme sua conta do Clube de Ciências:</p><p><a href="${url}">Confirmar email</a></p>`,
  );
}

export async function sendPasswordResetEmail(config: AppConfig, to: string, token: string): Promise<void> {
  const url = resetUrl(config, token);
  await send(
    config,
    to,
    'Recuperação de senha — Clube de Ciências',
    `Solicitação de recuperação. Acesse: ${url}`,
    `<p>Use o link abaixo para escolher uma nova senha:</p><p><a href="${url}">Redefinir senha</a></p>`,
  );
}
