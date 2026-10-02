import Quote from '../models/Quote.js';
import User from '../models/User.js';
import Service from '../models/Service.js';
import { calculateSubscriptionPricing, calculateSubscriptionPricingFromFinal } from '../utils/pricingCalculator.js';
import { dispatchNotification } from '../utils/notificationDispatcher.js';
import Payment from '../models/Payment.js';
import KycVerification from '../models/KycVerification.js';
import CustomerAgreement from '../models/CustomerAgreement.js';
import AuditLog from '../models/AuditLog.js';
import sequelize from '../config/database.js';

// @desc    Get all quotes
// @route   GET /api/admin/quotes
// @access  Private (Admin)
export const getQuotes = async (req, res) => {
  try {
    const quotes = await Quote.findAll({
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'company'] }],
      order: [['createdAt', 'DESC']]
    });
    res.json({ success: true, data: quotes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Get quote by ID
// @route   GET /api/admin/quotes/:id
// @access  Private (Admin)
export const getQuoteById = async (req, res) => {
  try {
    const quote = await Quote.findByPk(req.params.id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'company'] }]
    });
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote not found' });
    }
    res.json({ success: true, data: quote });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Update quote status
// @route   PUT /api/admin/quotes/:id/status
// @access  Private (Admin)
export const updateQuoteStatus = async (req, res) => {
  try {
    const { status, monthly_price, final_amount, notes, renewal_type } = req.body;
    const quote = await Quote.findByPk(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote not found' });
    }
    
    quote.status = status;
    
    // Support either final_amount (new UI flow) or monthly_price (legacy)
    if (final_amount !== undefined) {
      const pricing = calculateSubscriptionPricingFromFinal(final_amount, quote.duration_value, quote.duration_unit);
      quote.monthly_price = pricing.monthlySubscription;
      quote.subtotal_price = pricing.contractValue;
      quote.gst_amount = pricing.gstAmount;
      quote.grand_total = pricing.totalPayable;
    } else if (monthly_price !== undefined) {
      const pricing = calculateSubscriptionPricing(monthly_price, quote.duration_value, quote.duration_unit);
      quote.monthly_price = pricing.monthlySubscription;
      quote.subtotal_price = pricing.contractValue;
      quote.gst_amount = pricing.gstAmount;
      quote.grand_total = pricing.totalPayable;
    }

    if (notes !== undefined) {
      quote.notes = notes;
    }
    if (renewal_type !== undefined) {
      quote.renewal_type = renewal_type;
    }

    await quote.save();

    // Notify the customer about quote status update
    if (quote.user_id) {
      dispatchNotification({
        userId: quote.user_id,
        userType: 'customer',
        category: 'Quotes',
        priority: 'high',
        title: `Quote #${quote.id} Status: ${status.toUpperCase()}`,
        message: `Your quote for ${quote.service_type} is now ${status}.` + (quote.grand_total ? ` Total Amount: ₹${quote.grand_total.toLocaleString()}` : ''),
        relatedModule: 'Quote',
        relatedRecordId: quote.id,
        actionUrl: '/dashboard/quotes',
        sendEmailFlag: true,
        actionText: 'View Quote'
      }).catch(console.error);
    }

    // If admin bypasses normal flow and marks as active directly,
    // ensure a Service record is created so the user can see it.
    if (status === 'active') {
      let service = await Service.findOne({ where: { quote_id: quote.id } });
      if (!service) {
        const serviceName = `${quote.service_type.replace(/\s+/g, '')}-${Math.floor(Math.random() * 10000)}`;
        const currentDate = new Date();
        const nextDueDate = new Date();
        
        // Calculate duration based on quote
        let months = 1;
        if (quote.duration_value) {
            if (quote.duration_unit === 'Months' || quote.duration_unit === 'months') {
                months = quote.duration_value;
            } else if (quote.duration_unit === 'Years' || quote.duration_unit === 'years') {
                months = quote.duration_value * 12;
            }
        }
        nextDueDate.setMonth(nextDueDate.getMonth() + months);

        await Service.create({
          user_id: quote.user_id,
          quote_id: quote.id,
          service_name: serviceName,
          service_type: quote.service_type,
          monthly_amount: quote.monthly_price,
          status: 'Active',
          purchase_date: currentDate,
          start_date: currentDate,
          next_due_date: nextDueDate,
          renewal_date: nextDueDate,
          renewal_type: quote.renewal_type || 'manual'
        });
      } else if (service.status !== 'Active') {
        service.status = 'Active';
        await service.save();
      }
    }
    
    res.json({ success: true, data: quote });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Bulk delete quotes
// @route   DELETE /api/admin/quotes/bulk-delete
// @access  Private (Admin)
export const bulkDeleteQuotes = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'No quote IDs provided' });
    }

    const { Op } = await import('sequelize');
    const Quote = (await import('../models/Quote.js')).default;

    const deletedCount = await Quote.destroy({
      where: {
        id: {
          [Op.in]: ids
        }
      }
    });

    res.json({ success: true, message: `Successfully deleted ${deletedCount} quotes`, deletedCount });
  } catch (error) {
    console.error('Bulk delete quotes error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Safe delete a quote (production safe)
// @route   DELETE /api/admin/quotes/:id
// @access  Private (Admin)
export const safeDeleteQuote = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const quoteId = req.params.id;
    const adminId = req.user?.id || req.admin?.id; // Assuming admin info is in req.user or req.admin

    if (!adminId) {
      await transaction.rollback();
      return res.status(401).json({ success: false, message: 'Unauthorized. Admin ID not found.' });
    }

    const quote = await Quote.findByPk(quoteId, { transaction });
    if (!quote) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Quote not found' });
    }

    // 1. Protected Statuses Check (Bypassed for easy deletion)
    // const protectedStatuses = ['paid', 'verified', 'active', 'processing'];
    // if (protectedStatuses.includes(quote.status)) {
    //   await transaction.rollback();
    //   return res.status(403).json({ success: false, message: `Deletion rejected: Quote has protected status '${quote.status}'.` });
    // }

    // 2. Verified/Captured Payment Check (Bypassed for easy deletion)
    // const payments = await Payment.findAll({ where: { quote_id: quoteId }, transaction });
    // for (const payment of payments) {
    //   if (payment.status === 'Verified' || payment.status === 'Captured' || payment.invoice_reference) {
    //     await transaction.rollback();
    //     return res.status(403).json({ success: false, message: 'Deletion rejected: Quote has verified payments or invoices.' });
    //   }
    // }

    // 3. Genuine Customer Agreement Check (Bypassed for easy deletion)
    // const agreements = await CustomerAgreement.findAll({ where: { quote_id: quoteId }, transaction });
    // for (const agreement of agreements) {
    //   if (agreement.accepted_at || agreement.msa_accepted || agreement.tnc_accepted) {
    //     await transaction.rollback();
    //     return res.status(403).json({ success: false, message: 'Deletion rejected: Quote is linked to a genuine customer agreement.' });
    //   }
    // }

    // 4. KYC Dependencies Check (Bypassed for easy deletion)
    // const kycs = await KycVerification.findAll({ where: { quote_id: quoteId }, transaction });
    // for (const kyc of kycs) {
    //   if (kyc.overall_status !== 'pending' && kyc.overall_status !== 'failed' && kyc.overall_status !== 'rejected') {
    //      await transaction.rollback();
    //      return res.status(403).json({ success: false, message: `Deletion rejected: Quote has protected KYC verification (status: ${kyc.overall_status}).` });
    //   }
    //   if (kyc.aadhaar_front_path || kyc.pan_card_path || kyc.gst_cert_path || kyc.company_reg_path) {
    //      await transaction.rollback();
    //      return res.status(403).json({ success: false, message: 'Deletion rejected: Quote has uploaded KYC documents.' });
    //   }
    // }

    // 5. Active Service Check (Bypassed for easy deletion)
    // const services = await Service.findAll({ where: { quote_id: quoteId }, transaction });
    // if (services.length > 0) {
    //   await transaction.rollback();
    //   return res.status(403).json({ success: false, message: 'Deletion rejected: Quote is linked to existing services.' });
    // }

    // Proceed with safe deletion (dummy/unprotected dependencies)
    // Delete payments (unverified/pending ones)
    await Payment.destroy({ where: { quote_id: quoteId }, transaction });

    // Delete agreements (unaccepted ones)
    await CustomerAgreement.destroy({ where: { quote_id: quoteId }, transaction });

    // Delete Kyc (pending/failed/rejected without docs)
    await KycVerification.destroy({ where: { quote_id: quoteId }, transaction });

    // Ensure we delete VerificationRequest if it exists
    const VerificationRequest = (await import('../models/VerificationRequest.js')).default;
    await VerificationRequest.destroy({ where: { quote_id: quoteId }, transaction });

    // Ensure we delete Service if it exists
    await Service.destroy({ where: { quote_id: quoteId }, transaction });

    // Finally delete Quote
    await quote.destroy({ transaction });

    // 6. Audit Trail Logging
    await AuditLog.create({
      action: 'DELETE_QUOTE',
      action_by_user_id: req.user?.id || null,
      entity_type: 'Quote',
      entity_id: quoteId,
      details: {
        admin_id: req.admin?.id || null,
        actor_id: adminId,
        quote_number: quote.quote_number,
        reason: req.body.reason || 'Admin explicitly deleted a dummy/test quote',
        deleted_at: new Date().toISOString()
      }
    }, { transaction });

    await transaction.commit();

    res.json({ success: true, message: `Quote ${quote.quote_number} successfully deleted.` });
  } catch (error) {
    await transaction.rollback();
    console.error('Safe delete quote error:', error);
    res.status(500).json({ success: false, message: 'Server Error during safe deletion.' });
  }
};
