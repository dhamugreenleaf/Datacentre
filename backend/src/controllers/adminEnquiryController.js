import Enquiry from '../models/Enquiry.js';
import EnquiryResponse from '../models/EnquiryResponse.js';
import EnquiryNote from '../models/EnquiryNote.js';
import EnquiryLog from '../models/EnquiryLog.js';
import Quote from '../models/Quote.js';
import Admin from '../models/Admin.js';
import User from '../models/User.js';
import sequelize from '../config/database.js';
import { dispatchNotification } from '../utils/notificationDispatcher.js';

// @desc    Get all enquiries
// @route   GET /api/admin/enquiries
// @access  Private (Admin)
export const getEnquiries = async (req, res) => {
  try {
    const enquiries = await Enquiry.findAll({
      order: [['created_at', 'DESC']]
    });
    res.json({ success: true, data: enquiries });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Get enquiry by ID including responses, notes, logs, quotes, and user stats
// @route   GET /api/admin/enquiries/:id
// @access  Private (Admin)
export const getEnquiryById = async (req, res) => {
  try {
    const enquiry = await Enquiry.findByPk(req.params.id, {
      include: [
        {
          model: EnquiryResponse,
          as: 'responses',
          include: [{ model: Admin, as: 'admin', attributes: ['id', 'name'] }]
        },
        {
          model: EnquiryNote,
          as: 'notes',
          include: [{ model: Admin, as: 'admin', attributes: ['id', 'name'] }]
        },
        {
          model: EnquiryLog,
          as: 'logs'
        },
        {
          model: Quote,
          as: 'quotes'
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'phone', 'company', 'createdAt']
        }
      ],
      order: [
        [{ model: EnquiryLog, as: 'logs' }, 'created_at', 'DESC'],
        [{ model: EnquiryNote, as: 'notes' }, 'created_at', 'DESC'],
        [{ model: EnquiryResponse, as: 'responses' }, 'created_at', 'ASC']
      ]
    });
    
    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' });
    }

    let userStats = null;
    if (enquiry.user_id) {
      const totalEnquiries = await Enquiry.count({ where: { user_id: enquiry.user_id } });
      const totalQuotes = await Quote.count({ where: { user_id: enquiry.user_id } });
      userStats = { totalEnquiries, totalQuotes };
    }
    
    // To prevent the access log from continuously mutating state and triggering refetches infinitely if poorly handled on frontend,
    // we only create the log but don't strictly need to append it to the returned object if it's just 'viewed'.

    res.json({ success: true, data: { ...enquiry.toJSON(), userStats } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Update enquiry status
// @route   PUT /api/admin/enquiries/:id/status
// @access  Private (Admin)
export const updateEnquiryStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const enquiry = await Enquiry.findByPk(req.params.id);
    
    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' });
    }
    
    const oldStatus = enquiry.status;
    enquiry.status = status;
    await enquiry.save();

    await EnquiryLog.create({
      enquiry_id: enquiry.id,
      user_id: req.admin.id,
      action: 'Status Changed',
      details: `Status changed from ${oldStatus} to ${status}`
    });

    // Notify customer about status change if relevant
    let targetUserId = enquiry.user_id;
    if (!targetUserId && enquiry.email) {
      const user = await User.findOne({ where: { email: enquiry.email } });
      if (user) {
        targetUserId = user.id;
        enquiry.user_id = user.id;
        await enquiry.save();
      }
    }

    if (targetUserId && oldStatus !== status) {
      dispatchNotification({
        userId: targetUserId,
        userType: 'customer',
        category: 'Sales Requests',
        priority: 'medium',
        title: `Enquiry Status: ${status}`,
        message: `Your enquiry (SR-${enquiry.id.toString().padStart(4, '0')}) status has been updated to ${status}.`,
        relatedModule: 'Enquiry',
        relatedRecordId: enquiry.id,
        actionUrl: '/dashboard/enquiries',
        sendEmailFlag: false
      }).catch(console.error);
    }
    
    res.json({ success: true, data: enquiry });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Add response to enquiry
// @route   POST /api/admin/enquiries/:id/responses
// @access  Private (Admin)
export const addEnquiryResponse = async (req, res) => {
  try {
    const { subject, response, markAsClosed } = req.body;
    const enquiryId = req.params.id;
    
    const enquiry = await Enquiry.findByPk(enquiryId);
    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' });
    }
    
    const newResponse = await EnquiryResponse.create({
      enquiry_id: enquiryId,
      admin_id: req.admin.id,
      subject,
      response,
    });

    await EnquiryLog.create({
      enquiry_id: enquiry.id,
      user_id: req.admin.id,
      action: 'Admin Responded',
      details: `Response added: ${subject || 'Support Message'}`
    });
    
    // Auto update status
    const oldStatus = enquiry.status;
    const newStatus = markAsClosed ? 'Closed' : 'Responded';
    if (oldStatus !== newStatus) {
      enquiry.status = newStatus;
      await enquiry.save();
      await EnquiryLog.create({
        enquiry_id: enquiry.id,
        user_id: req.admin.id,
        action: 'Status Changed',
        details: `Status changed from ${oldStatus} to ${newStatus}`
      });
    }

    // Resolve user ID for customer notification
    let targetUserId = enquiry.user_id;
    if (!targetUserId && enquiry.email) {
      const user = await User.findOne({ where: { email: enquiry.email } });
      if (user) {
        targetUserId = user.id;
        enquiry.user_id = user.id;
        await enquiry.save();
      }
    }

    // Notify customer in DB notification center & via Email
    if (targetUserId) {
      dispatchNotification({
        userId: targetUserId,
        userType: 'customer',
        category: 'Sales Requests',
        priority: 'high',
        title: subject || `Response to your ${enquiry.type ? enquiry.type.replace('_', ' ').toUpperCase() : 'Support'} request`,
        message: response,
        relatedModule: 'Enquiry',
        relatedRecordId: enquiry.id,
        actionUrl: '/dashboard/enquiries',
        sendEmailFlag: true,
        actionText: 'View Message'
      }).catch(console.error);
    } else if (enquiry.email) {
      // Direct email fallback for guest users who haven't registered
      const { sendEmail } = await import('../utils/emailService.js');
      const formattedResponse = response.replace(/\n/g, '<br/>');
      const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #1f2937; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #10b981; margin-top: 0;">GreenLeaf Support Response</h2>
          <p><strong>Subject:</strong> ${subject || 'Response to your request'}</p>
          <div style="background-color: #f9fafb; border-left: 4px solid #10b981; padding: 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; line-height: 1.6; color: #374151;">${formattedResponse}</p>
          </div>
          <p style="color: #6b7280; font-size: 13px;">You can view and reply to this message anytime in your GreenLeaf account.</p>
        </div>
      `;
      sendEmail(enquiry.email, `[GreenLeaf] ${subject || 'Response to your request'}`, htmlContent).catch(console.error);
    }
    
    res.status(201).json({ success: true, data: newResponse });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Add internal note to enquiry
// @route   POST /api/admin/enquiries/:id/notes
// @access  Private (Admin)
export const addEnquiryNote = async (req, res) => {
  try {
    const { note_text } = req.body;
    const enquiryId = req.params.id;
    
    const note = await EnquiryNote.create({
      enquiry_id: enquiryId,
      admin_id: req.admin.id,
      note_text
    });

    await EnquiryLog.create({
      enquiry_id: enquiryId,
      user_id: req.admin.id,
      action: 'Note Added',
      details: `Internal note added by ${req.admin.name}`
    });
    
    res.status(201).json({ success: true, data: note });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Delete internal note
// @route   DELETE /api/admin/enquiries/:id/notes/:noteId
// @access  Private (Admin)
export const deleteEnquiryNote = async (req, res) => {
  try {
    const { id, noteId } = req.params;
    
    const note = await EnquiryNote.findOne({ where: { id: noteId, enquiry_id: id } });
    if (!note) {
      return res.status(404).json({ success: false, message: 'Note not found' });
    }
    
    await note.destroy();

    await EnquiryLog.create({
      enquiry_id: id,
      user_id: req.admin.id,
      action: 'Note Deleted',
      details: `Internal note deleted by ${req.admin.name}`
    });
    
    res.json({ success: true, message: 'Note deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Generate a Quote from an Enquiry
// @route   POST /api/admin/enquiries/:id/quote
// @access  Private (Admin)
export const generateQuoteFromEnquiry = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { unitPrice, quantity, discountAmount, validityDays, adminNotes } = req.body;
    const enquiryId = req.params.id;

    const enquiry = await Enquiry.findByPk(enquiryId, { transaction });
    if (!enquiry) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Enquiry not found' });
    }
    
    // Attempt to resolve user_id by email if the enquiry was submitted by a guest
    let resolvedUserId = enquiry.user_id;
    if (!resolvedUserId) {
      const user = await User.findOne({ where: { email: enquiry.email }, transaction });
      if (user) {
        resolvedUserId = user.id;
        // Optionally update the enquiry to link it to the user now that they exist
        enquiry.user_id = user.id;
      }
    }

    const { calculateQuotePricing } = await import('../utils/quotePricing.js');
    const pricing = calculateQuotePricing(unitPrice, quantity, discountAmount, 18);

    const newQuote = await Quote.create({
      user_id: resolvedUserId || null,
      enquiry_id: enquiry.id,
      service_type: enquiry.type.replace('_', ' ').toUpperCase(),
      monthly_price: pricing.unitPrice,
      unit_price: pricing.unitPrice,
      quantity: pricing.quantity,
      subtotal: pricing.subtotal,
      discount_amount: pricing.discountAmount,
      taxable_amount: pricing.taxableAmount,
      gst_percentage: pricing.gstPercentage,
      gst_amount: pricing.gstAmount,
      grand_total: pricing.grandTotal,
      duration_value: 1,
      duration_unit: 'Months',
      notes: adminNotes,
      status: 'quoted'
    }, { transaction });

    enquiry.status = 'Quoted';
    await enquiry.save({ transaction });

    await EnquiryLog.create({
      enquiry_id: enquiry.id,
      user_id: req.admin.id,
      action: 'Quote Generated',
      details: `Quote created for ₹${pricing.grandTotal}. Validity: ${validityDays} days.`
    }, { transaction });

    await transaction.commit();

    // Dispatch notification to user about the generated quote
    if (resolvedUserId) {
      dispatchNotification({
        userId: resolvedUserId,
        userType: 'customer',
        category: 'Quotes',
        priority: 'high',
        title: 'New Quote Generated',
        message: `A new quote has been generated for your ${enquiry.type.replace('_', ' ').toUpperCase()} request. Grand Total: ₹${pricing.grandTotal.toLocaleString()}.`,
        relatedModule: 'Quote',
        relatedRecordId: newQuote.id,
        actionUrl: '/dashboard/quotes',
        sendEmailFlag: true,
        actionText: 'View Quote'
      }).catch(console.error);
    } else if (enquiry.email) {
      // Send email to guest user with quote details
      const { sendEmail } = await import('../utils/emailService.js');
      const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #1f2937; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #10b981; margin-top: 0;">GreenLeaf Quote Ready</h2>
          <p>A new quote has been generated for your <strong>${enquiry.type.replace('_', ' ').toUpperCase()}</strong> request.</p>
          <div style="background-color: #f9fafb; border-left: 4px solid #10b981; padding: 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0 0 8px 0;"><strong>Monthly Price:</strong> ₹${pricing.unitPrice.toLocaleString()}</p>
            <p style="margin: 0 0 8px 0;"><strong>Quantity:</strong> ${pricing.quantity}</p>
            <p style="margin: 0 0 8px 0;"><strong>Grand Total:</strong> ₹${pricing.grandTotal.toLocaleString()}</p>
            <p style="margin: 0;"><strong>Validity:</strong> ${validityDays || 30} days</p>
          </div>
          <p style="color: #6b7280; font-size: 13px;">Please log in or register with this email (${enquiry.email}) on our portal to accept your quote and proceed.</p>
        </div>
      `;
      sendEmail(enquiry.email, `[GreenLeaf] Quote Ready for your ${enquiry.type.replace('_', ' ').toUpperCase()} request`, htmlContent).catch(console.error);
    }

    res.status(201).json({ success: true, data: newQuote });
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Bulk delete enquiries
// @route   DELETE /api/admin/enquiries/bulk-delete
// @access  Private (Admin)
export const bulkDeleteEnquiries = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'No enquiry IDs provided' });
    }

    const { Op } = await import('sequelize');
    const deletedCount = await Enquiry.destroy({
      where: {
        id: {
          [Op.in]: ids
        }
      }
    });

    res.json({ success: true, message: `Successfully deleted ${deletedCount} enquiries`, deletedCount });
  } catch (error) {
    console.error('Bulk delete enquiries error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
