import { check, validationResult } from 'express-validator';

const validatePhoneFormat = (value) => {
  if (!value || typeof value !== 'string') {
    throw new Error('Mobile number is required');
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Mobile number is required');
  }
  const isValidFormat = /^(\+)?[0-9\s\-()]+$/.test(trimmed);
  if (!isValidFormat) {
    throw new Error('Mobile number can only contain digits, spaces, -, () and optional + prefix');
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10) {
    throw new Error('Mobile number must contain at least 10 digits');
  }
  if (digits.length > 15) {
    throw new Error('Mobile number cannot exceed 15 digits');
  }
  if (/^(\d)\1{9,}$/.test(digits)) {
    throw new Error('Please enter a valid mobile number');
  }
  return true;
};

export const validateSignup = [
  check('name', 'Name is required').trim().notEmpty(),
  check('email', 'Please include a valid email').isEmail().normalizeEmail(),
  check('phone', 'Mobile number is required')
    .notEmpty()
    .bail()
    .custom(validatePhoneFormat),
  check('password', 'Please enter a password with 8 or more characters').isLength({ min: 8 }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        message: errors.array()[0].msg,
        errors: errors.array() 
      });
    }
    next();
  },
];

export const validateLogin = [
  check('email', 'Please include a valid email').isEmail().normalizeEmail(),
  check('password', 'Password is required').exists(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        message: errors.array()[0].msg,
        errors: errors.array() 
      });
    }
    next();
  },
];

export const validateUpdateProfile = [
  check('name', 'Name cannot be empty').optional().trim().notEmpty(),
  check('phone')
    .optional({ checkFalsy: true })
    .custom(validatePhoneFormat),
  check('alternate_mobile')
    .optional({ checkFalsy: true })
    .custom(validatePhoneFormat),
  check('company', 'Invalid company format').optional().isString(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        message: errors.array()[0].msg,
        errors: errors.array() 
      });
    }
    next();
  },
];

export const validateForgotPassword = [
  check('email', 'Please include a valid email').isEmail().normalizeEmail(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array()
      });
    }
    next();
  },
];

export const validateVerifyResetOtp = [
  check('email', 'Please include a valid email').isEmail().normalizeEmail(),
  check('otp', 'OTP must be exactly 6 digits')
    .isString()
    .trim()
    .matches(/^\d{6}$/),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array()
      });
    }
    next();
  },
];

export const validateResetPassword = [
  check('resetToken', 'Reset token is required').notEmpty().isString(),
  check('newPassword', 'Password must be at least 8 characters').isLength({ min: 8 }),
  check('newPassword', 'Password must contain at least one uppercase letter').matches(/[A-Z]/),
  check('newPassword', 'Password must contain at least one lowercase letter').matches(/[a-z]/),
  check('newPassword', 'Password must contain at least one number').matches(/\d/),
  check('newPassword', 'Password must contain at least one special character').matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/),
  check('confirmPassword', 'Confirm password is required').notEmpty(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array()
      });
    }
    if (req.body.newPassword !== req.body.confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }
    next();
  },
];

