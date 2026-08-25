import { Op } from 'sequelize';
import User from '../models/User.js';
import { matchPassword } from '../utils/passwordHelper.js';
import { generateToken } from '../utils/generateToken.js';
import { dispatchNotification } from '../utils/notificationDispatcher.js';
import { normalizePhoneNumber, isValidPhoneNumber, findExistingUserByPhone } from '../utils/phoneHelper.js';
import Admin from '../models/Admin.js';

export const registerUser = async (userData) => {
  const { name, email, phone, password, terms } = userData;

  if (!terms) {
    throw new Error('You must accept the Terms and Conditions');
  }

  if (!phone || typeof phone !== 'string' || phone.trim() === '') {
    throw new Error('Mobile number is required');
  }

  if (!isValidPhoneNumber(phone)) {
    throw new Error('Please enter a valid mobile number');
  }

  const normalizedPhone = normalizePhoneNumber(phone);
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Check if email already exists
  const userExistsByEmail = await User.findOne({ where: { email: normalizedEmail } });
  if (userExistsByEmail) {
    const error = new Error('Email already in use');
    error.code = 'EMAIL_EXISTS';
    throw error;
  }

  // 2. Check if phone number already exists across any formatting
  const userExistsByPhone = await findExistingUserByPhone(phone);
  if (userExistsByPhone) {
    const error = new Error('An account already exists with this phone number. Please log in or use Forgot Password.');
    error.code = 'PHONE_EXISTS';
    throw error;
  }

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    phone: normalizedPhone,
    password,
    terms_accepted: true,
    terms_accepted_at: new Date(),
  });

  // 1. Notify Customer (Welcome) - Fire and forget to prevent delay
  dispatchNotification({
    userId: user.id,
    userType: 'customer',
    category: 'Account',
    priority: 'low',
    title: 'Welcome to GreenLeaf Data Center!',
    message: 'Thank you for creating an account with us. You can now request quotes and manage your services.',
    relatedModule: 'User',
    relatedRecordId: user.id,
    actionUrl: '/dashboard/profile',
    sendEmailFlag: true,
    actionText: 'Complete Your Profile'
  }).catch(console.error);

  // 2. Notify all Admins - Fire and forget to prevent delay
  const admins = await Admin.findAll();
  admins.forEach(admin => {
    dispatchNotification({
      userId: admin.id,
      userType: 'admin',
      category: 'Account',
      priority: 'medium',
      title: 'New Customer Registration',
      message: `${name} (${email}) has just registered a new account.`,
      relatedModule: 'User',
      relatedRecordId: user.id,
      actionUrl: `/admin/users/${user.id}`,
      sendEmailFlag: true,
      actionText: 'View Customer Profile'
    }).catch(console.error);
  });

  return {
    success: true,
    message: 'Account created successfully',
  };
};

export const loginUser = async (email, password) => {
  // Using the scope to include password for verification
  const user = await User.scope('withPassword').findOne({ where: { email } });

  if (user && (await matchPassword(password, user.password))) {
    // update last_login
    user.last_login = new Date();
    await user.save();

    // Link any guest enquiries/quotes to this user based on their email
    try {
      const { Enquiry, Quote } = await import('../models/index.js');
      await Enquiry.update({ user_id: user.id }, { where: { email: user.email, user_id: null } });
      
      // Also update quotes that belong to this user's enquiries but have null user_id
      const userEnquiries = await Enquiry.findAll({ where: { user_id: user.id }, attributes: ['id'] });
      const enquiryIds = userEnquiries.map(e => e.id);
      if (enquiryIds.length > 0) {
        await Quote.update({ user_id: user.id }, { where: { enquiry_id: enquiryIds, user_id: null } });
      }
    } catch (e) {
      console.error('Failed to sync guest data on login', e);
    }

    const userObj = user.toJSON();
    delete userObj.password;

    // Notify all Admins that user logged in - Fire and forget
    const admins = await Admin.findAll();
    admins.forEach(admin => {
      dispatchNotification({
        userId: admin.id,
        userType: 'admin',
        category: 'System',
        priority: 'low',
        title: 'Customer Logged In',
        message: `${user.name} (${user.email}) has just logged into the portal.`,
        relatedModule: 'User',
        relatedRecordId: user.id,
        actionUrl: `/admin/users/${user.id}`,
        sendEmailFlag: false
      }).catch(console.error);
    });

    return {
      success: true,
      token: generateToken(user.id),
      user: userObj,
    };
  } else {
    throw new Error('Invalid email or password');
  }
};

export const getUserProfile = async (userId) => {
  const user = await User.findByPk(userId, {
    attributes: [
      'name', 'email', 'phone', 'role', 'status', 'createdAt',
      'alternate_mobile', 'designation',
      'company', 'business_type', 'gst_number', 'website', 'industry',
      'address_line1', 'address_line2', 'city', 'state', 'country', 'pin_code',
      'service_requirement_type', 'expected_deployment_date', 'monthly_budget_range',
      'kyc_document_type', 'kyc_document_number', 'kyc_front_upload', 'kyc_back_upload', 'kyc_verification_status'
    ],
  });

  if (user) {
    return user;
  } else {
    throw new Error('User not found');
  }
};

export const updateUserProfile = async (userId, updateData) => {
  const user = await User.findByPk(userId);

  if (user) {
    if (updateData.phone !== undefined && updateData.phone !== null && updateData.phone !== '') {
      if (!isValidPhoneNumber(updateData.phone)) {
        throw new Error('Please enter a valid mobile number');
      }
      const normalizedPhone = normalizePhoneNumber(updateData.phone);
      const existingUser = await findExistingUserByPhone(updateData.phone, userId);

      if (existingUser) {
        const error = new Error('An account already exists with this phone number.');
        error.code = 'PHONE_EXISTS';
        throw error;
      }
      updateData.phone = normalizedPhone;
    }

    const fieldsToUpdate = [
      'name', 'phone', 'alternate_mobile', 'designation',
      'company', 'business_type', 'gst_number', 'website', 'industry',
      'address_line1', 'address_line2', 'city', 'state', 'country', 'pin_code',
      'service_requirement_type', 'expected_deployment_date', 'monthly_budget_range',
      'kyc_document_type', 'kyc_document_number', 'kyc_front_upload', 'kyc_back_upload'
    ];

    fieldsToUpdate.forEach(field => {
      if (updateData[field] !== undefined) {
        user[field] = updateData[field];
      }
    });

    const updatedUser = await user.save();
    
    // Refresh without password
    const userObj = updatedUser.toJSON();
    delete userObj.password;

    return {
      success: true,
      message: 'Profile updated successfully',
      user: userObj
    };
  } else {
    throw new Error('User not found');
  }
};
