/**
 * ====================================
 * EMAIL SERVICE (PRODUCTION-READY)
 * ====================================
 * Handles all email sending with Nodemailer
 */

import nodemailer, { Transporter } from 'nodemailer';
import { LoggerUtil } from '@/shared/logger.util';
import {
  getWelcomeEmailTemplate,
  getGoalReminderTemplate,
  getDeadlineAlertTemplate,
  getStreakReminderTemplate,
  getExamReminderTemplate,
  getPasswordResetTemplate,
  getGroupInviteTemplate,
} from './email/templates';

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: Transporter | null = null;
  private isEmailEnabled: boolean = false;

  constructor() {
    this.initializeTransporter();
  }

  /**
   * Initialize email transporter
   */
  private initializeTransporter() {
    try {
      const emailEnabled = process.env.ENABLE_EMAIL === 'true';
      
      if (!emailEnabled) {
        LoggerUtil.warn('⚠️ Email service is disabled');
        return;
      }

      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = parseInt(process.env.SMTP_PORT || '587');
      const smtpUser = process.env.SMTP_USER;
      const smtpPassword = process.env.SMTP_PASSWORD;

      if (!smtpHost || !smtpUser || !smtpPassword) {
        LoggerUtil.warn('⚠️ Email configuration incomplete. Email service disabled.');
        return;
      }

      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
      });

      this.isEmailEnabled = true;
      LoggerUtil.info('✅ Email service initialized successfully');
    } catch (error: any) {
      LoggerUtil.error(`❌ Failed to initialize email service: ${error.message}`);
    }
  }

  /**
   * Send email
   */
  private async sendEmail(payload: EmailPayload): Promise<boolean> {
    if (!this.isEmailEnabled || !this.transporter) {
      LoggerUtil.warn('⚠️ Email service not available. Skipping email send.');
      return false;
    }

    try {
      const mailOptions = {
        from: `${process.env.EMAIL_FROM_NAME || 'Study Group'} <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text || '',
      };

      const info = await this.transporter.sendMail(mailOptions);

      LoggerUtil.info(`✅ Email sent successfully to ${payload.to}: ${info.messageId}`);
      return true;
    } catch (error: any) {
      LoggerUtil.error(`❌ Failed to send email to ${payload.to}: ${error.message}`);
      return false;
    }
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(to: string, name: string): Promise<boolean> {
    const subject = 'Welcome to Study Group! 🎉';
    const html = getWelcomeEmailTemplate(name);
    return await this.sendEmail({ to, subject, html });
  }

  /**
   * Send goal reminder email
   */
  async sendGoalReminderEmail(to: string, name: string, goalDetails: any): Promise<boolean> {
    const subject = '⏰ Daily Goal Reminder - Study Group';
    const html = getGoalReminderTemplate(name, goalDetails);
    return await this.sendEmail({ to, subject, html });
  }

  /**
   * Send deadline alert email
   */
  async sendDeadlineAlertEmail(to: string, name: string, taskDetails: any): Promise<boolean> {
    const subject = '⚠️ Task Deadline Approaching - Study Group';
    const html = getDeadlineAlertTemplate(name, taskDetails);
    return await this.sendEmail({ to, subject, html });
  }

  /**
   * Send streak reminder email
   */
  async sendStreakReminderEmail(to: string, name: string, streakDays: number): Promise<boolean> {
    const subject = `🔥 Your ${streakDays}-day streak is at risk!`;
    const html = getStreakReminderTemplate(name, streakDays);
    return await this.sendEmail({ to, subject, html });
  }

  /**
   * Send exam reminder email
   */
  async sendExamReminderEmail(to: string, name: string, examDetails: any): Promise<boolean> {
    const subject = '📝 Exam Reminder - Study Group';
    const html = getExamReminderTemplate(name, examDetails);
    return await this.sendEmail({ to, subject, html });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(to: string, name: string, resetToken: string): Promise<boolean> {
    const subject = '🔐 Reset Your Password - Study Group';
    const html = getPasswordResetTemplate(name, resetToken);
    return await this.sendEmail({ to, subject, html });
  }

  /**
   * Send group invite email
   */
  async sendGroupInviteEmail(to: string, name: string, groupDetails: any): Promise<boolean> {
    const subject = '👥 You have been invited to join a study group!';
    const html = getGroupInviteTemplate(name, groupDetails);
    return await this.sendEmail({ to, subject, html });
  }
}

export default new EmailService();
