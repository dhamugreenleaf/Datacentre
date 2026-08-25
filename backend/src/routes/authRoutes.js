import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  signup,
  login,
  getProfile,
  updateProfile,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  getTimeline,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  clearAllNotifications
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import {
  validateSignup,
  validateLogin,
  validateUpdateProfile,
  validateForgotPassword,
  validateVerifyResetOtp,
  validateResetPassword,
} from '../validators/authValidator.js';

const router = express.Router();

// --- Rate Limiters for password-reset endpoints (IP-based) ---

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password reset requests. Please try again after 15 minutes.',
  },
});

const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 OTP verification attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many OTP verification attempts. Please try again after 15 minutes.',
  },
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 reset attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password reset attempts. Please try again after 15 minutes.',
  },
});

// --- Public routes ---

router.post('/signup', validateSignup, signup);
router.post('/login', validateLogin, login);
router.post('/forgot-password', forgotPasswordLimiter, validateForgotPassword, forgotPassword);
router.post('/verify-reset-otp', verifyOtpLimiter, validateVerifyResetOtp, verifyResetOtp);
router.post('/reset-password', resetPasswordLimiter, validateResetPassword, resetPassword);

// --- Protected routes ---

router.get('/profile', protect, getProfile);
router.put('/profile', protect, validateUpdateProfile, updateProfile);
router.get('/timeline', protect, getTimeline);
router.get('/notifications', protect, getNotifications);
router.put('/notifications/read-all', protect, markAllNotificationsRead);
router.put('/notifications/:id/read', protect, markNotificationRead);
router.delete('/notifications/clear-all', protect, clearAllNotifications);

export default router;
