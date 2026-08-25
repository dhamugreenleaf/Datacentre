import { Quote, Enquiry, Admin } from '../models/index.js';
import { calculateSubscriptionPricing } from '../utils/pricingCalculator.js';
import { dispatchNotification } from '../utils/notificationDispatcher.js';

export const createQuote = async (req, res) => {
  try {
    const { 
      service_type, vcpu, ram, storage, os, bandwidth, backup, discount, monthly_price,
      duration_type, duration_value, duration_unit 
    } = req.body;
    
    if (!monthly_price) {
      return res.status(400).json({ success: false, message: 'Monthly price is required' });
    }

    // Recalculate everything on the backend to enforce the single source of truth
    const pricing = calculateSubscriptionPricing(monthly_price, duration_value, duration_unit);

    const quote = await Quote.create({
      user_id: req.user.id,
      service_type: service_type || 'Custom Server',
      vcpu,
      ram,
      storage,
      os,
      bandwidth,
      backup,
      discount,
      monthly_price: pricing.monthlySubscription,
      duration_type,
      duration_value,
      duration_unit,
      subtotal_price: pricing.contractValue,
      gst_amount: pricing.gstAmount,
      grand_total: pricing.totalPayable,
      renewal_type: req.body.renewal_type || 'manual'
    });

    // Notify all admins via centralized dispatcher
    const admins = await Admin.findAll();
    admins.forEach(admin => {
      dispatchNotification({
        userId: admin.id,
        userType: 'admin',
        category: 'Quotes',
        priority: 'high',
        title: 'New Quote Request',
        message: `${req.user.name || req.user.email} submitted a new quote request for ${quote.service_type}.`,
        relatedModule: 'Quote',
        relatedRecordId: quote.id,
        actionUrl: `/admin/quotes`,
        sendEmailFlag: true,
        actionText: 'View Quote'
      }).catch(console.error);
    });

    res.status(201).json({
      success: true,
      message: 'Quote request submitted successfully',
      data: quote
    });
  } catch (error) {
    console.error('Create quote error:', error);
    res.status(500).json({ success: false, message: 'Failed to create quote request' });
  }
};

import { getCustomerKycStatus, inheritCustomerKycForQuote } from './kycController.js';

export const getMyQuotes = async (req, res) => {
  try {
    const { isVerified } = await getCustomerKycStatus(req.user.id);

    const quotes = await Quote.findAll({
      where: { user_id: req.user.id },
      include: [
        { model: Enquiry, as: 'enquiry' }
      ],
      order: [['createdAt', 'DESC']]
    });

    // If customer is already KYC verified, ensure any pending verification quotes are marked verified
    if (isVerified) {
      for (const q of quotes) {
        if (q.status === 'verification_pending') {
          q.status = 'verified';
          await q.save();
          await inheritCustomerKycForQuote(req.user.id, q.id);
        }
      }
    }

    res.status(200).json({
      success: true,
      data: quotes,
      customerKycVerified: isVerified
    });
  } catch (error) {
    console.error('Get quotes error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch quotes' });
  }
};

// @desc    Accept quote and trigger verification or direct payment
// @route   PUT /api/quotes/:id/accept
// @access  Private
export const acceptQuote = async (req, res) => {
  try {
    const quote = await Quote.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote not found' });
    }

    if (quote.status !== 'quoted') {
      return res.status(400).json({ success: false, message: 'Only quoted status can be accepted' });
    }

    const { isVerified } = await getCustomerKycStatus(req.user.id);

    if (isVerified) {
      // Customer is already verified: move directly to payment-ready status
      quote.status = 'verified';
      await quote.save();
      await inheritCustomerKycForQuote(req.user.id, quote.id);

      // Notify admins
      const admins = await Admin.findAll();
      admins.forEach(admin => {
        dispatchNotification({
          userId: admin.id,
          userType: 'admin',
          category: 'Quotes',
          priority: 'high',
          title: 'Quote Accepted (Verified)',
          message: `${req.user.name || req.user.email} accepted Quote #${quote.id} (${quote.service_type}). Payment pending.`,
          relatedModule: 'Quote',
          relatedRecordId: quote.id,
          actionUrl: `/admin/quotes`,
          sendEmailFlag: true,
          actionText: 'View Quote'
        }).catch(console.error);
      });

      return res.json({
        success: true,
        message: 'Quote accepted. Your KYC is already verified, proceed to payment.',
        data: quote,
        kycRequired: false,
        canProceedToPayment: true
      });
    }

    // Customer is not verified: require KYC
    quote.status = 'verification_pending';
    await quote.save();

    // Notify admins
    const admins = await Admin.findAll();
    admins.forEach(admin => {
      dispatchNotification({
        userId: admin.id,
        userType: 'admin',
        category: 'Quotes',
        priority: 'high',
        title: 'Quote Accepted (KYC Pending)',
        message: `${req.user.name || req.user.email} accepted Quote #${quote.id} (${quote.service_type}). KYC verification is required.`,
        relatedModule: 'Quote',
        relatedRecordId: quote.id,
        actionUrl: `/admin/quotes`,
        sendEmailFlag: true,
        actionText: 'View Quote'
      }).catch(console.error);
    });

    res.json({
      success: true,
      message: 'Quote accepted successfully. Please complete KYC verification.',
      data: quote,
      kycRequired: true,
      canProceedToPayment: false
    });
  } catch (error) {
    console.error('Accept quote error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Reject quote
// @route   PUT /api/quotes/:id/reject
// @access  Private
export const rejectQuote = async (req, res) => {
  try {
    const { reject_reason } = req.body;
    const quote = await Quote.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote not found' });
    }

    if (quote.status !== 'quoted') {
      return res.status(400).json({ success: false, message: 'Only quoted status can be rejected' });
    }

    quote.status = 'rejected';
    quote.reject_reason = reject_reason || null;
    await quote.save();

    // Notify admins
    const admins = await Admin.findAll();
    admins.forEach(admin => {
      dispatchNotification({
        userId: admin.id,
        userType: 'admin',
        category: 'Quotes',
        priority: 'medium',
        title: 'Quote Rejected',
        message: `${req.user.name || req.user.email} rejected Quote #${quote.id} (${quote.service_type}). Reason: ${reject_reason || 'No reason provided'}`,
        relatedModule: 'Quote',
        relatedRecordId: quote.id,
        actionUrl: `/admin/quotes`,
        sendEmailFlag: true,
        actionText: 'View Quote'
      }).catch(console.error);
    });

    res.json({
      success: true,
      message: 'Quote rejected successfully',
      data: quote
    });
  } catch (error) {
    console.error('Reject quote error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
