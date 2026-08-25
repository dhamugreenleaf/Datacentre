import * as authService from '../services/authService.js';
import { CustomerTimeline, Notification } from '../models/index.js';
import User from '../models/User.js';
import { sendEmail } from '../utils/emailService.js';

export const signup = async (req, res) => {
  try {
    const result = await authService.registerUser(req.body);
    res.status(201).json(result);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const isPhoneDuplicate = error.errors?.some(e => e.path === 'phone');
      if (isPhoneDuplicate) {
        return res.status(400).json({
          success: false,
          code: 'PHONE_EXISTS',
          message: 'An account already exists with this phone number. Please log in or use Forgot Password.'
        });
      }
      const isEmailDuplicate = error.errors?.some(e => e.path === 'email');
      if (isEmailDuplicate) {
        return res.status(400).json({
          success: false,
          code: 'EMAIL_EXISTS',
          message: 'Email already in use'
        });
      }
    }

    res.status(400).json({
      success: false,
      code: error.code || 'REGISTRATION_FAILED',
      message: error.message
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authService.loginUser(email, password);
    res.status(200).json(result);
  } catch (error) {
    res.status(401).json({ success: false, message: error.message });
  }
};

export const getProfile = async (req, res) => {
  try {
    const profile = await authService.getUserProfile(req.user.id);
    res.status(200).json({ success: true, user: profile });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const result = await authService.updateUserProfile(req.user.id, req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

export const forgotPassword = async (req, res) => {
  // Generic response sent regardless of whether user exists — prevents account enumeration
  const genericResponse = {
    success: true,
    message: 'If an account exists with this email, a verification OTP has been sent.'
  };

  try {
    const { email } = req.body;

    const user = await User.scope('withPassword').findOne({ where: { email } });

    if (!user) {
      // Return same response to prevent account enumeration
      return res.status(200).json(genericResponse);
    }

    // Invalidate any previous active OTPs for this user
    const { PasswordResetToken } = await import('../models/index.js');
    await PasswordResetToken.update(
      { used_at: new Date() },
      {
        where: {
          user_id: user.id,
          used_at: null
        }
      }
    );

    // Generate cryptographically secure 6-digit OTP
    const { randomInt, randomBytes, createHash } = await import('crypto');
    const otp = randomInt(100000, 999999).toString();

    // Hash OTP before storage
    const { hashPassword } = await import('../utils/passwordHelper.js');
    const otpHash = await hashPassword(otp);

    // Store hashed OTP with expiration (10 minutes)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await PasswordResetToken.create({
      user_id: user.id,
      email: user.email,
      otp_hash: otpHash,
      expires_at: expiresAt,
      attempts: 0,
      max_attempts: 5,
    });

    // Send OTP email using existing email service
    const subject = 'Password Reset OTP - GreenLeaf Data Center';
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #334155; -webkit-font-smoothing: antialiased; }
          .wrapper { width: 100%; table-layout: fixed; background-color: #f8fafc; padding: 40px 0; }
          .main { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
          .header { background-color: #0B1220; padding: 32px 40px; text-align: left; }
          .header h1 { margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
          .header p { margin: 8px 0 0; color: #94a3b8; font-size: 15px; line-height: 1.5; }
          .content { padding: 40px; }
          .otp-box { background-color: #f0fdf4; border: 2px solid #22C55E; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; }
          .otp-code { font-size: 36px; font-weight: 700; color: #166534; letter-spacing: 8px; margin: 0; font-family: 'Courier New', monospace; }
          .otp-label { font-size: 13px; color: #64748b; margin-top: 8px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
          .warning-box { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 24px 0; }
          .warning-text { margin: 0; color: #92400e; font-size: 14px; line-height: 1.5; }
          .info-text { font-size: 15px; line-height: 1.6; color: #334155; margin: 16px 0; }
          .footer { padding: 32px 40px; background-color: #0f172a; text-align: center; }
          .footer-brand { color: #ffffff; font-size: 16px; font-weight: 700; margin-bottom: 8px; }
          .footer-tagline { color: #22C55E; font-size: 13px; font-weight: 500; margin-bottom: 24px; letter-spacing: 0.5px; }
          .footer-text { color: #64748b; font-size: 12px; line-height: 1.5; margin: 0; }
          .divider { height: 1px; background-color: #1e293b; margin: 24px 0; }
          @media only screen and (max-width: 620px) {
            .wrapper { padding: 20px 10px; }
            .header, .content, .footer { padding: 24px 20px; }
            .otp-code { font-size: 28px; letter-spacing: 6px; }
          }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="main">
            <div class="header">
              <h1>Password Reset Request</h1>
              <p>Use the OTP below to reset your GreenLeaf Data Center account password.</p>
            </div>
            <div class="content">
              <p class="info-text">Hello ${user.name},</p>
              <p class="info-text">We received a request to reset the password for your account. Use the One-Time Password (OTP) below to proceed:</p>
              <div class="otp-box">
                <p class="otp-code">${otp}</p>
                <p class="otp-label">Your Verification Code</p>
              </div>
              <p class="info-text">This OTP is valid for <strong>10 minutes</strong>. After that, you will need to request a new one.</p>
              <div class="warning-box">
                <p class="warning-text"><strong>⚠️ Security Warning:</strong> Never share this OTP with anyone. GreenLeaf Data Center staff will never ask for your OTP. If you did not request this password reset, please ignore this email and your password will remain unchanged.</p>
              </div>
            </div>
            <div class="footer">
              <div class="footer-brand">GreenLeaf Data Center</div>
              <div class="footer-tagline">Enterprise Cloud &bull; AI Servers &bull; Colocation</div>
              <div class="divider"></div>
              <p class="footer-text">This is an automated notification email generated by the GreenLeaf Data Center platform.</p>
              <p class="footer-text" style="margin-top: 8px;">Please do not reply to this email.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Fire and forget — do not let email failure reveal whether user exists
    sendEmail(user.email, subject, htmlContent).catch((err) => {
      console.error('Failed to send password reset OTP email:', err.message);
    });

    res.status(200).json(genericResponse);
  } catch (error) {
    console.error('Forgot password error:', error.message);
    // Return generic response even on internal errors to prevent information leakage
    res.status(200).json(genericResponse);
  }
};

export const verifyResetOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const { PasswordResetToken } = await import('../models/index.js');
    const { Op } = await import('sequelize');
    const { matchPassword } = await import('../utils/passwordHelper.js');

    // Find the latest active (non-expired, non-used, non-verified) reset token for this email
    const resetRecord = await PasswordResetToken.findOne({
      where: {
        email,
        used_at: null,
        verified_at: null,
        expires_at: { [Op.gt]: new Date() },
      },
      order: [['createdAt', 'DESC']],
    });

    if (!resetRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP. Please request a new one.'
      });
    }

    // Check attempt limit
    if (resetRecord.attempts >= resetRecord.max_attempts) {
      return res.status(429).json({
        success: false,
        message: 'Too many failed attempts. Please request a new OTP.'
      });
    }

    // Compare OTP (bcrypt compare is constant-time)
    const isOtpValid = await matchPassword(otp, resetRecord.otp_hash);

    if (!isOtpValid) {
      // Increment failed attempts
      resetRecord.attempts += 1;
      await resetRecord.save();

      const remaining = resetRecord.max_attempts - resetRecord.attempts;
      return res.status(400).json({
        success: false,
        message: remaining > 0
          ? `Incorrect OTP. ${remaining} attempt(s) remaining.`
          : 'Too many failed attempts. Please request a new OTP.'
      });
    }

    // OTP is valid — generate a single-use reset token
    const { randomBytes, createHash } = await import('crypto');
    const resetToken = randomBytes(32).toString('hex');
    const resetTokenHash = createHash('sha256').update(resetToken).digest('hex');

    // Mark as verified and store the hashed reset token (15-minute expiry)
    resetRecord.verified_at = new Date();
    resetRecord.reset_token_hash = resetTokenHash;
    resetRecord.reset_token_expires_at = new Date(Date.now() + 15 * 60 * 1000);
    await resetRecord.save();

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully.',
      resetToken, // Plain token sent to client; only hash is stored in DB
    });
  } catch (error) {
    console.error('Verify reset OTP error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to verify OTP. Please try again.' });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({ success: false, message: 'Reset token and new password are required.' });
    }

    const { PasswordResetToken } = await import('../models/index.js');
    const { Op } = await import('sequelize');
    const { createHash } = await import('crypto');
    const { matchPassword } = await import('../utils/passwordHelper.js');

    // Hash the provided token and look up the record
    const resetTokenHash = createHash('sha256').update(resetToken).digest('hex');

    const resetRecord = await PasswordResetToken.findOne({
      where: {
        reset_token_hash: resetTokenHash,
        used_at: null,
        verified_at: { [Op.ne]: null },
        reset_token_expires_at: { [Op.gt]: new Date() },
      },
    });

    if (!resetRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token. Please start the password reset process again.'
      });
    }

    // Fetch the user with password for comparison
    const user = await User.scope('withPassword').findByPk(resetRecord.user_id);

    if (!user) {
      return res.status(400).json({ success: false, message: 'Unable to reset password. Please contact support.' });
    }

    // Check that the new password is not the same as the current one
    const isSamePassword = await matchPassword(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: 'New password cannot be the same as your current password.'
      });
    }

    // Update password (User model hooks will hash it automatically)
    user.password = newPassword;
    await user.save();

    // Mark this reset token as used
    resetRecord.used_at = new Date();
    await resetRecord.save();

    // Invalidate all other active reset tokens for this user
    await PasswordResetToken.update(
      { used_at: new Date() },
      {
        where: {
          user_id: user.id,
          id: { [Op.ne]: resetRecord.id },
          used_at: null,
        }
      }
    );

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. Please sign in with your new password.'
    });
  } catch (error) {
    console.error('Reset password error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to reset password. Please try again.' });
  }
};

export const getTimeline = async (req, res) => {
  try {
    const timeline = await CustomerTimeline.findAll({
      where: { user_id: req.user.id },
      order: [['created_at', 'DESC']]
    });
    res.status(200).json({ success: true, data: timeline });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.findAll({
      where: { user_id: req.user.id },
      order: [['created_at', 'DESC']]
    });
    res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    notification.is_read = true;
    await notification.save();
    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const markAllNotificationsRead = async (req, res) => {
  try {
    await Notification.update(
      { is_read: true },
      { where: { user_id: req.user.id, is_read: false } }
    );
    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const clearAllNotifications = async (req, res) => {
  try {
    await Notification.destroy({
      where: { user_id: req.user.id }
    });
    res.status(200).json({ success: true, message: 'All notifications cleared' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
