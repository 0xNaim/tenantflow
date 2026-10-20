import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  constructor(private readonly configService: ConfigService) {}

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const host = this.configService.getOrThrow<string>('SMTP_HOST');
    const port = Number(this.configService.getOrThrow<string>('SMTP_PORT'));
    const user = this.configService.getOrThrow<string>('SMTP_USER');
    const pass = this.configService.getOrThrow<string>('SMTP_PASSWORD');
    const from = this.configService.getOrThrow<string>('SMTP_FROM');
    const appBaseUrl = this.configService.getOrThrow<string>('APP_BASE_URL');

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Invalid SMTP_PORT configuration');
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const verificationUrl = new URL('/verify-email', appBaseUrl);

    verificationUrl.searchParams.set('token', token);

    await transporter.sendMail({
      from,
      to: email,
      subject: 'Verify your TenantFlow account',
      text: [
        'Verify your TenantFlow email address using this link:',
        verificationUrl.toString(),
        '',
        'This link expires in 24 hours.',
        'If you did not request this, you can ignore this email.',
      ].join('\n'),
    });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const host = this.configService.getOrThrow<string>('SMTP_HOST');
    const port = Number(this.configService.getOrThrow<string>('SMTP_PORT'));
    const user = this.configService.getOrThrow<string>('SMTP_USER');
    const pass = this.configService.getOrThrow<string>('SMTP_PASSWORD');
    const from = this.configService.getOrThrow<string>('SMTP_FROM');
    const appBaseUrl = this.configService.getOrThrow<string>('APP_BASE_URL');

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const resetUrl = new URL('/reset-password', appBaseUrl);
    resetUrl.searchParams.set('token', token);

    await transporter.sendMail({
      from,
      to: email,
      subject: 'Reset your TenantFlow password',
      text: [
        'A password reset was requested for your account.',
        `Reset your password using this link: ${resetUrl.toString()}`,
        '',
        'This link expires in 15 minutes.',
        'If you did not request this, ignore this email.',
      ].join('\n'),
    });
  }
}
