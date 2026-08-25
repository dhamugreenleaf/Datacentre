import Notification from '../models/Notification.js';
import AuditLog from '../models/AuditLog.js';
import { sendEmail } from './emailService.js';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://greenleaf-datacenter.com'
  : 'http://localhost:5173';

/**
 * Helper to dispatch KYC Notification (Email + DB)
 */
const dispatchKycNotification = async (user, subject, htmlContent, textContent, type, message) => {
  try {
    // Send Email
    let emailSent = false;
    if (user && user.email_address) {
      // Non-blocking email send
      sendEmail(user.email_address, subject, htmlContent, textContent).then(sent => {
        if (!sent) console.error(`[KYC Notification] Failed to send email to ${user.email_address}`);
      }).catch(err => console.error(`[KYC Notification] Email dispatch error:`, err));
      emailSent = true; // We assume it's queued/sent for the DB record
    } else if (user && user.email) {
       sendEmail(user.email, subject, htmlContent, textContent).then(sent => {
        if (!sent) console.error(`[KYC Notification] Failed to send email to ${user.email}`);
      }).catch(err => console.error(`[KYC Notification] Email dispatch error:`, err));
      emailSent = true;
    }

    // Create DB Notification
    const dbNotif = await Notification.create({
      user_id: user.id,
      title: subject,
      message: message,
      category: 'KYC',
      type: type, // 'success', 'error', 'info', 'warning'
      channels: { dashboard: true, email: emailSent, sms: false, whatsapp: false },
      metadata: { kyc_notification: true }
    });

    return true;
  } catch (error) {
    console.error(`[KYC Notification] Error dispatching notification for user ${user?.id}:`, error);
    return false;
  }
};

export const sendKycApprovedNotification = async (user) => {
  const subject = 'KYC Approved';
  const message = 'Your KYC verification has been approved successfully.';
  
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: sans-serif; background-color: #f8fafc; color: #334155; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; border-top: 4px solid #22C55E; }
        h2 { color: #0f172a; margin-top: 0; }
        .footer { margin-top: 30px; font-size: 12px; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>${subject}</h2>
        <p>Dear ${user.full_name || user.name || 'Customer'},</p>
        <p>Your KYC verification has been approved successfully.</p>
        <p>Thank you.</p>
        <div class="footer">
          <p>Regards,<br/>Support Team<br/>GreenLeaf Data Center</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
${subject}
===================================
Dear ${user.full_name || user.name || 'Customer'},

Your KYC verification has been approved successfully.

Thank you.

Regards,
Support Team
GreenLeaf Data Center
  `;

  return dispatchKycNotification(user, subject, htmlContent, textContent, 'success', message);
};

export const sendKycRejectedNotification = async (user, reason) => {
  const subject = 'KYC Document Rejected';
  const message = `Your uploaded document has been rejected.\n\nReason:\n${reason}\n\nPlease upload the correct document to continue verification.`;
  
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: sans-serif; background-color: #f8fafc; color: #334155; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; border-top: 4px solid #EF4444; }
        h2 { color: #0f172a; margin-top: 0; }
        .reason-box { background-color: #fef2f2; border: 1px solid #fca5a5; padding: 15px; border-radius: 6px; margin: 20px 0; color: #991b1b; }
        .footer { margin-top: 30px; font-size: 12px; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>${subject}</h2>
        <p>Dear ${user.full_name || user.name || 'Customer'},</p>
        <p>Your uploaded KYC document has been reviewed.</p>
        <p>Unfortunately, it was rejected.</p>
        
        <div class="reason-box">
          <strong>Reason:</strong><br/>
          ${reason}
        </div>
        
        <p>Please log in to your account and upload the correct document to continue the verification process.</p>
        <p>Thank you.</p>
        <div class="footer">
          <p>Regards,<br/>Support Team<br/>GreenLeaf Data Center</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
${subject}
===================================
Dear ${user.full_name || user.name || 'Customer'},

Your uploaded KYC document has been reviewed.

Unfortunately, it was rejected.

Reason:
${reason}

Please log in to your account and upload the correct document to continue the verification process.

Thank you.

Regards,
Support Team
GreenLeaf Data Center
  `;

  return dispatchKycNotification(user, subject, htmlContent, textContent, 'error', message);
};

export const sendKycSubmittedNotification = async (user) => {
  const subject = 'KYC Submitted Successfully';
  const message = 'Your KYC document has been submitted and is pending admin review.';
  
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: sans-serif; background-color: #f8fafc; color: #334155; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; border-top: 4px solid #EAB308; }
        h2 { color: #0f172a; margin-top: 0; }
        .footer { margin-top: 30px; font-size: 12px; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>${subject}</h2>
        <p>Dear ${user.full_name || user.name || 'Customer'},</p>
        <p>Your KYC document has been successfully submitted and is currently <strong>Pending Admin Review</strong>.</p>
        <p>Our compliance team will review your document within 1-2 business hours. You will receive another notification once it has been approved or if any further action is required.</p>
        <p>Thank you for your patience.</p>
        <div class="footer">
          <p>Regards,<br/>Support Team<br/>GreenLeaf Data Center</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
${subject}
===================================
Dear ${user.full_name || user.name || 'Customer'},

Your KYC document has been successfully submitted and is currently Pending Admin Review.

Our compliance team will review your document within 1-2 business hours. You will receive another notification once it has been approved or if any further action is required.

Thank you for your patience.

Regards,
Support Team
GreenLeaf Data Center
  `;

  return dispatchKycNotification(user, subject, htmlContent, textContent, 'info', message);
};
