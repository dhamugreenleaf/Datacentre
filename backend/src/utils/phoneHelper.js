/**
 * Normalizes phone numbers to standard format for storage and duplicate checking.
 * - Handles Indian phone numbers (10 digits, +91 prefix, 91 prefix, leading 0) -> +91XXXXXXXXXX
 * - Handles international phone numbers (+<country_code><digits>)
 * - Strips all formatting characters (spaces, dashes, parentheses, dots)
 * 
 * @param {string} phone
 * @returns {string} Normalized phone string (e.g. "+919876543210")
 */
export const normalizePhoneNumber = (phone) => {
  if (!phone || typeof phone !== 'string') {
    return '';
  }

  const trimmed = phone.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');

  if (!digitsOnly) {
    return '';
  }

  // Indian numbers standardizations:
  // 12 digits starting with 91 -> +91XXXXXXXXXX
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return `+91${digitsOnly.slice(2)}`;
  }

  // 11 digits starting with 0 -> +91XXXXXXXXXX
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    return `+91${digitsOnly.slice(1)}`;
  }

  // Standard 10-digit Indian mobile number -> +91XXXXXXXXXX
  if (digitsOnly.length === 10) {
    return `+91${digitsOnly}`;
  }

  // If originally started with + (international number like +1, +44, etc.)
  if (trimmed.startsWith('+')) {
    return `+${digitsOnly}`;
  }

  return `+${digitsOnly}`;
};

/**
 * Validates whether a phone number meets minimum requirements.
 * @param {string} phone 
 * @returns {boolean}
 */
export const isValidPhoneNumber = (phone) => {
  if (!phone || typeof phone !== 'string') return false;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (!/^(\+)?[0-9\s\-().]+$/.test(trimmed)) return false;
  if (digits.length < 10 || digits.length > 15) return false;
  if (/^(\d)\1{9,}$/.test(digits)) return false; // Reject repeated single digits like 0000000000

  return true;
};

/**
 * Searches the database for any existing user with matching phone identity,
 * handling variations in formatting, spaces, dashes, country codes, and leading zeros.
 * 
 * @param {string} phone
 * @param {number|null} excludeUserId
 * @returns {Promise<User|null>}
 */
export const findExistingUserByPhone = async (phone, excludeUserId = null) => {
  if (!phone || typeof phone !== 'string') return null;

  const { Op } = await import('sequelize');
  const sequelize = (await import('../config/database.js')).default;
  const User = (await import('../models/User.js')).default;

  const normalizedPhone = normalizePhoneNumber(phone);
  const digitsOnly = phone.replace(/\D/g, '');
  if (!digitsOnly) return null;

  const last10Digits = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;

  const whereClause = {
    [Op.or]: [
      { phone: normalizedPhone },
      { phone: phone.trim() },
      sequelize.where(
        sequelize.fn('REPLACE', sequelize.fn('REPLACE', sequelize.fn('REPLACE', sequelize.col('phone'), ' ', ''), '-', ''), '+', ''),
        { [Op.like]: `%${last10Digits}` }
      )
    ]
  };

  if (excludeUserId) {
    whereClause.id = { [Op.ne]: excludeUserId };
  }

  return await User.findOne({ where: whereClause });
};
