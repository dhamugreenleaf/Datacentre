import { Payment, Quote, Service, User, KycVerification, CustomerAgreement } from '../models/index.js';
import { logAudit, logTimeline, sendNotification } from '../utils/auditService.js';
import { dispatchLifecycleNotification } from '../utils/notificationEngine.js';
import { generateInvoicePDF } from '../utils/invoiceGenerator.js';
import RazorpayService from '../services/RazorpayService.js';
import { getCustomerKycStatus, inheritCustomerKycForQuote } from './kycController.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const provisionServiceForPayment = async (payment, quote, req) => {
  // Service Provisioning (Dedicated Server, AI Server, Colocation, etc.)
  let service = await Service.findOne({ where: { quote_id: quote.id } });
  if (!service) {
    const serviceName = `${quote.service_type.replace(/\s+/g, '')}-${Math.floor(Math.random() * 10000)}`;
    const currentDate = new Date();
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 30);

    service = await Service.create({
      user_id: payment.user_id,
      quote_id: quote.id,
      service_name: serviceName,
      service_type: quote.service_type,
      monthly_amount: quote.monthly_price,
      status: 'Active',
      purchase_date: currentDate,
      start_date: currentDate,
      next_due_date: nextDueDate
    });
  }

  // Link service to payment
  payment.service_id = service.id;
  await payment.save();

  const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';

  await logAudit({
    action: 'PAYMENT_VERIFIED',
    action_by_user_id: req.user.id,
    target_user_id: payment.user_id,
    entity_type: 'Payment',
    entity_id: payment.id,
    req,
    details: { status: 'Verified', method: payment.payment_method }
  });

  await logTimeline({
    user_id: payment.user_id,
    admin_id: isAdmin ? req.user.id : null,
    event_type: 'payment_verified',
    event_title: 'Payment Verified',
    event_description: `Payment for Quote ${quote.quote_number} has been verified and service is activated.`
  });

  await sendNotification({
    user_id: payment.user_id,
    title: 'Payment Verified & Service Activated',
    message: `Your payment for Quote ${quote.quote_number} has been verified. Your service "${service.service_name}" is now active.`,
    type: 'success',
    channels: { dashboard: true, email: true }
  });
};

export const getPaymentDetails = async (req, res) => {
  try {
    const quote = await Quote.findOne({
      where: { id: req.params.quoteId, user_id: req.user.id }
    });

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote not found' });
    }

    // Check Customer-level KYC status
    const { isVerified, kycRecord } = await getCustomerKycStatus(req.user.id);
    if (!isVerified) {
      return res.status(400).json({ success: false, message: 'Identity verification (KYC) is required before proceeding to payment.' });
    }

    // If quote was pending verification, auto-synchronize to verified
    if (quote.status === 'verification_pending' || quote.status === 'pending' || quote.status === 'quoted') {
      quote.status = 'verified';
      await quote.save();
      await inheritCustomerKycForQuote(req.user.id, quote.id);
    }

    let kyc = await KycVerification.findOne({
      where: { quote_id: quote.id, overall_status: 'verified' }
    });

    if (!kyc && kycRecord) {
      kyc = kycRecord;
    }

    res.json({
      success: true,
      data: {
        quote_number: quote.quote_number,
        service_type: quote.service_type,
        amount: quote.grand_total,
        status: quote.status,
        billing_identity: kyc ? {
          customer_type: kyc.customer_type,
          name: kyc.customer_type === 'company' ? kyc.company_name : kyc.full_name,
          address: kyc.customer_type === 'company' ? kyc.registered_address : kyc.residential_address,
          gst_number: kyc.gst_number || null,
          pan_number: kyc.pan_number || null
        } : null
      }
    });
  } catch (error) {
    console.error('Get payment details error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const submitPaymentProof = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { 
      termsAccepted, 
      payment_method, 
      bank_name, 
      transaction_reference, 
      payment_date, 
      invoice_reference,
      msaAccepted,
      tncAccepted,
      aupAccepted,
      privacyAccepted
    } = req.body;

    if (!termsAccepted || !msaAccepted || !tncAccepted || !aupAccepted || !privacyAccepted) {
      return res.status(400).json({ success: false, message: 'You must accept all required agreements and policies before payment.' });
    }

    const quote = await Quote.findOne({
      where: { id: quoteId, user_id: req.user.id }
    });

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Quote not found' });
    }

    // Check Customer-level KYC status
    const { isVerified } = await getCustomerKycStatus(req.user.id);
    if (!isVerified) {
      return res.status(400).json({ success: false, message: 'Identity verification (KYC) is required before payment.' });
    }

    if (quote.status === 'verification_pending' || quote.status === 'pending' || quote.status === 'quoted') {
      quote.status = 'verified';
      await quote.save();
      await inheritCustomerKycForQuote(req.user.id, quote.id);
    }

    if (quote.status !== 'verified' && quote.status !== 'processing') {
      return res.status(400).json({ success: false, message: 'Quote must be verified before payment.' });
    }

    // Check if there is already a payment pending
    const existingPayment = await Payment.findOne({
      where: { quote_id: quote.id, status: 'Pending Verification' }
    });
    if (existingPayment) {
      return res.status(400).json({ success: false, message: 'A payment is already pending verification for this quote.' });
    }

    let paymentScreenshotPath = null;
    if (req.file) {
      paymentScreenshotPath = `/uploads/payments/${req.user.id}/${req.file.filename}`;
    } else if (payment_method === 'manual') {
      return res.status(400).json({ success: false, message: 'Payment screenshot is required for manual bank transfers.' });
    }

    // 1. Create Payment Record (Pending Verification)
    const transactionRef = transaction_reference || `TXN-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    const payment = await Payment.create({
      user_id: req.user.id,
      quote_id: quote.id,
      // We will set service_id to 0 for now or make it nullable in migration, but wait, `service_id` was `allowNull: false` in Payment.js.
      // Wait, is service created before payment or after? The prompt says "Only then allow Service Activation".
      // I need to update Payment model to allow `service_id` to be null. I'll do that shortly.
      service_id: null, // Temporary, will be handled via migration
      amount: quote.grand_total,
      payment_date: payment_date || new Date(),
      transaction_reference: transactionRef,
      invoice_reference: invoice_reference || `INV-${quote.quote_number}`,
      payment_method: payment_method,
      bank_name: bank_name,
      payment_screenshot: paymentScreenshotPath,
      status: 'Pending Verification',
      payment_terms_accepted: true,
      payment_terms_accepted_at: new Date()
    });

    // 2. Save Customer Agreements
    const userIp = req.ip || req.headers['x-forwarded-for'];
    const userBrowser = req.headers['user-agent'];
    
    await CustomerAgreement.create({
      user_id: req.user.id,
      quote_id: quote.id,
      msa_accepted: msaAccepted,
      tnc_accepted: tncAccepted,
      aup_accepted: aupAccepted,
      privacy_accepted: privacyAccepted,
      ip_address: userIp,
      browser_info: userBrowser,
      accepted_at: new Date()
    });

    // 3. Update Quote Status
    quote.status = 'processing';
    await quote.save();

    await logAudit({
      action: 'PAYMENT_SUBMITTED',
      action_by_user_id: req.user.id,
      target_user_id: req.user.id,
      entity_type: 'Payment',
      entity_id: payment.id,
      req,
      details: { quote_id: quote.id, amount: quote.grand_total }
    });

    await logTimeline({
      user_id: req.user.id,
      event_type: 'payment_submission',
      event_title: 'Payment Submitted',
      event_description: `Payment proof uploaded for Quote ${quote.quote_number}.`
    });

    res.status(200).json({
      success: true,
      message: 'Payment proof submitted successfully. Awaiting verification.',
      data: {
        payment
      }
    });
  } catch (error) {
    console.error('Submit payment proof error:', error);
    res.status(500).json({ success: false, message: 'Server error during payment submission' });
  }
};

export const getMyPayments = async (req, res) => {
  try {
    const payments = await Payment.findAll({
      where: { user_id: req.user.id },
      include: [
        { model: Service, as: 'service', attributes: ['service_name'] }
      ],
      order: [['payment_date', 'DESC']]
    });
    res.json({ success: true, data: payments });
  } catch (error) {
    console.error('Get my payments error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await Payment.findOne({
      where: { id, user_id: req.user.id },
      include: [
        { model: Service, as: 'service' },
        { model: Quote, as: 'quote' }
      ]
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    if (payment.status !== 'Verified') {
      return res.status(400).json({ success: false, message: 'Invoice not available for unverified payments' });
    }

    // If it already has an invoice (a pdf screenshot), check if it physically exists
    // TEMPORARILY DISABLED to force all invoices to regenerate with the new design
    /*
    if (payment.payment_screenshot && payment.payment_screenshot.endsWith('.pdf')) {
      const fileName = path.basename(payment.payment_screenshot);
      const filePath = path.join(__dirname, '../../uploads/invoices', fileName);
      if (fs.existsSync(filePath)) {
        return res.json({ success: true, url: payment.payment_screenshot });
      }
    }
    */

    const dateObj = payment.payment_date ? new Date(payment.payment_date) : new Date();
    const year = dateObj.getFullYear();
    const paddedId = String(payment.id || 1).padStart(4, '0');
    if (!payment.invoice_reference || payment.invoice_reference.startsWith('order_') || payment.invoice_reference.length > 20) {
      payment.invoice_reference = `GLA-INV-${year}-${paddedId}`;
    }

    const user = await User.findByPk(req.user.id);
    const invoiceUrl = await generateInvoicePDF(payment, user, payment.service, payment.quote);

    if (invoiceUrl) {
      payment.payment_screenshot = invoiceUrl;
      await payment.save();
      return res.json({ success: true, url: invoiceUrl });
    } else {
      return res.status(500).json({ success: false, message: 'Failed to generate invoice' });
    }
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getAdminPayments = async (req, res) => {
  try {
    const payments = await Payment.findAll({
      include: [
        { model: Service, as: 'service', attributes: ['service_name'] },
        { model: Quote, as: 'quote', attributes: ['quote_number', 'service_type'] },
        { model: User, as: 'user', attributes: ['name', 'email'] }
      ],
      order: [['payment_date', 'DESC']]
    });
    res.json({ success: true, data: payments });
  } catch (error) {
    console.error('Get admin payments error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body; // 'Verified' or 'Rejected'

    const payment = await Payment.findByPk(id, {
      include: [{ model: Quote, as: 'quote' }]
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    payment.status = status;
    payment.remarks = remarks;
    await payment.save();

    if (status === 'Verified') {
      const quote = payment.quote;
      // Enforce Customer-level KYC Service Activation Rule
      const { isVerified } = await getCustomerKycStatus(payment.user_id);
      
      if (!isVerified) {
        return res.status(403).json({ 
          success: false, 
          message: 'Service Activation Blocked: Customer KYC Status must be Verified before Service Activation is allowed.' 
        });
      }

      const agreements = await CustomerAgreement.findOne({ where: { quote_id: quote.id } });
      if (!agreements || !agreements.msa_accepted) {
        return res.status(403).json({ 
          success: false, 
          message: 'Service Activation Blocked: Customer Agreements must be accepted.' 
        });
      }

      // Also update Quote
      quote.status = 'paid';
      await quote.save();

      // Provision Service using helper
      await provisionServiceForPayment(payment, quote, req);

    } else if (status === 'Rejected') {
      const quote = payment.quote;
      // Change quote status back to verified or payment_rejected
      quote.status = 'payment_rejected';
      await quote.save();
    }

    res.json({ success: true, message: `Payment marked as ${status}`, data: payment });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Razorpay: Create Order
export const createRazorpayOrder = async (req, res) => {
  try {
    const { quoteId } = req.params;
    
    // First, save Customer Agreements
    const { msaAccepted, tncAccepted, aupAccepted, privacyAccepted } = req.body;
    if (!msaAccepted || !tncAccepted || !aupAccepted || !privacyAccepted) {
      return res.status(400).json({ success: false, message: 'Agreements required' });
    }

    const quote = await Quote.findOne({ where: { id: quoteId, user_id: req.user.id } });
    if (!quote) return res.status(404).json({ success: false, message: 'Quote not found' });

    // Enforce Customer-level KYC check
    const { isVerified } = await getCustomerKycStatus(req.user.id);
    if (!isVerified) {
      return res.status(400).json({ success: false, message: 'Identity verification (KYC) is required before payment.' });
    }

    if (quote.status === 'verification_pending' || quote.status === 'pending' || quote.status === 'quoted') {
      quote.status = 'verified';
      await quote.save();
      await inheritCustomerKycForQuote(req.user.id, quote.id);
    }

    if (quote.status !== 'verified') {
      return res.status(400).json({ success: false, message: 'Quote must be verified before payment.' });
    }

    // Save agreements
    await CustomerAgreement.create({
      user_id: req.user.id,
      quote_id: quote.id,
      msa_accepted: msaAccepted,
      tnc_accepted: tncAccepted,
      aup_accepted: aupAccepted,
      privacy_accepted: privacyAccepted,
      ip_address: req.ip || req.headers['x-forwarded-for'],
      browser_info: req.headers['user-agent'],
      accepted_at: new Date()
    });

    const isDummy = RazorpayService.isDummyMode();
    
    const options = {
      amount: quote.grand_total, // amount will be parsed in service
      currency: 'INR',
      receipt: `receipt_quote_${quote.id}`
    };

    const order = await RazorpayService.createOrder(options);
    res.json({ success: true, data: order, isDummy, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (error) {
    console.error('Create Razorpay order error:', error);
    res.status(500).json({ success: false, message: 'Failed to create payment order. Please try again.' });
  }
};

// Razorpay: Verify Signature and Provision
export const verifyRazorpayPayment = async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const quote = await Quote.findOne({ where: { id: quoteId, user_id: req.user.id } });
    if (!quote) return res.status(404).json({ success: false, message: 'Quote not found' });

    // Enforce server-side signature verification if real keys are configured
    if (!RazorpayService.isDummyMode()) {
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ success: false, message: 'Missing required payment verification details.' });
      }
      const isValid = RazorpayService.verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
      if (!isValid) {
        return res.status(400).json({ success: false, message: 'Payment verification failed. Invalid signature.' });
      }
    }

    // Idempotency check
    const txnRef = razorpay_payment_id || `DUMMY_TXN_${razorpay_order_id}`;
    const existingPayment = await Payment.findOne({ where: { transaction_reference: txnRef } });
    if (existingPayment) {
      return res.json({ success: true, message: 'Payment already verified.', data: existingPayment });
    }

    // Check Pre-requisites (Customer KYC)
    const { isVerified } = await getCustomerKycStatus(req.user.id);
    if (!isVerified) {
      return res.status(403).json({ success: false, message: 'KYC must be verified before service activation.' });
    }

    await inheritCustomerKycForQuote(req.user.id, quote.id);

    // 1. Create Verified Payment record
    const payment = await Payment.create({
      user_id: req.user.id,
      quote_id: quote.id,
      service_id: null,
      amount: quote.grand_total,
      payment_date: new Date(),
      transaction_reference: txnRef,
      invoice_reference: razorpay_order_id,
      payment_method: 'Razorpay',
      status: 'Verified',
      payment_terms_accepted: true,
      payment_terms_accepted_at: new Date()
    });

    // 2. Update Quote Status
    quote.status = 'paid';
    await quote.save();

    // 3. Provision Service
    await provisionServiceForPayment(payment, quote, req);

    // 4. Generate PDF Invoice
    const serviceForInvoice = await Service.findByPk(payment.service_id);
    const userForInvoice = await User.findByPk(req.user.id);
    const invoiceUrl = await generateInvoicePDF(payment, userForInvoice, serviceForInvoice, quote);
    if (invoiceUrl) {
      payment.payment_screenshot = invoiceUrl;
      await payment.save();
    }

    res.json({ success: true, message: 'Payment successful and service activated!', data: payment });
  } catch (error) {
    console.error('Verify Razorpay payment error:', error);
    res.status(500).json({ success: false, message: 'Payment verification could not be completed. Please contact support.' });
  }
};

// ==========================================
// RENEWAL & REACTIVATION FLOW
// ==========================================

export const createServiceRenewalOrder = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const service = await Service.findOne({ where: { id: serviceId, user_id: req.user.id } });
    
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
    
    const isDummy = RazorpayService.isDummyMode();

    const options = {
      amount: service.monthly_amount,
      currency: 'INR',
      receipt: `receipt_renew_${service.id}`
    };

    const order = await RazorpayService.createOrder(options);
    res.json({ success: true, data: order, isDummy, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (error) {
    console.error('Create renewal order error:', error);
    res.status(500).json({ success: false, message: 'Failed to create renewal order. Please try again.' });
  }
};

export const verifyServiceRenewalPayment = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const service = await Service.findOne({ 
      where: { id: serviceId, user_id: req.user.id },
      include: [{ model: User, as: 'user' }]
    });
    
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });

    // Enforce server-side signature verification if real keys are configured
    if (!RazorpayService.isDummyMode()) {
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ success: false, message: 'Missing required payment verification details.' });
      }
      const isValid = RazorpayService.verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
      if (!isValid) return res.status(400).json({ success: false, message: 'Payment verification failed. Invalid signature.' });
    }

    // Idempotency check
    const txnRef = razorpay_payment_id || `DUMMY_RENEW_TXN_${razorpay_order_id}`;
    const existingPayment = await Payment.findOne({ where: { transaction_reference: txnRef } });
    if (existingPayment) {
      return res.json({ success: true, message: 'Payment already verified.', data: existingPayment });
    }

    // 1. Create Verified Payment record
    const payment = await Payment.create({
      user_id: req.user.id,
      quote_id: service.quote_id, // Link to original quote if needed
      service_id: service.id,
      amount: service.monthly_amount,
      payment_date: new Date(),
      transaction_reference: txnRef,
      invoice_reference: razorpay_order_id || `INV-RNW-${Date.now()}`,
      payment_method: 'Razorpay',
      status: 'Verified',
      payment_terms_accepted: true,
      payment_terms_accepted_at: new Date()
    });

    // 2. Generate PDF Invoice
    const quoteForInvoice = await Quote.findByPk(service.quote_id);
    const invoiceUrl = await generateInvoicePDF(payment, service.user, service, quoteForInvoice);
    if (invoiceUrl) {
      payment.payment_screenshot = invoiceUrl; // Storing invoice URL in this field for easy download
      await payment.save();
    }

    // 3. Extend Next Due Date
    const currentDueDate = new Date(service.next_due_date);
    const today = new Date();
    // If it's already expired/suspended, renew from TODAY. Otherwise, add 1 month to the existing due date.
    if (currentDueDate < today) {
      currentDueDate.setTime(today.getTime());
    }
    currentDueDate.setMonth(currentDueDate.getMonth() + 1);
    service.next_due_date = currentDueDate;
    
    // 4. Automatic Reactivation Logic
    const oldStatus = service.status;
    let wasSuspended = false;
    if (service.status === 'Suspended' || service.status === 'Expired') {
      service.status = 'Active';
      wasSuspended = (oldStatus === 'Suspended');
    }
    
    await service.save();

    // 5. Notify & Log
    if (wasSuspended) {
      await dispatchLifecycleNotification(service.user, service, 'reactivated', 0);
      await logAudit({
        action: 'Automated Server Reactivation',
        action_by_user_id: req.user.id,
        target_user_id: req.user.id,
        entity_type: 'Service',
        entity_id: service.id,
        req,
        details: { old_status: oldStatus, new_due_date: currentDueDate }
      });
    }

    await logTimeline({
      user_id: req.user.id,
      event_type: 'subscription_renewed',
      event_title: 'Subscription Renewed',
      event_description: `Successfully renewed service "${service.service_name}" until ${currentDueDate.toLocaleDateString()}`
    });

    res.json({ 
      success: true, 
      message: wasSuspended ? 'Payment successful! Server has been reactivated.' : 'Subscription renewed successfully!', 
      data: { payment, service } 
    });
  } catch (error) {
    console.error('Verify renewal payment error:', error);
    res.status(500).json({ success: false, message: 'Renewal payment verification could not be completed. Please contact support.' });
  }
};

// ==========================================
// FAILURE & WEBHOOK HANDLING
// ==========================================

export const handlePaymentFailure = async (req, res) => {
  try {
    const { quoteId, reason, gateway_response, transaction_reference } = req.body;
    
    const quote = await Quote.findOne({ where: { id: quoteId, user_id: req.user.id } });
    if (!quote) return res.status(404).json({ success: false, message: 'Quote not found' });

    // Store a rejected payment record using the existing ENUM
    const payment = await Payment.create({
      user_id: req.user.id,
      quote_id: quote.id,
      amount: quote.grand_total,
      payment_date: new Date(),
      transaction_reference: transaction_reference || `FAILED_${Math.floor(Math.random() * 100000)}`,
      payment_method: 'Razorpay',
      status: 'Rejected', // Existing ENUM
      failure_reason: reason,
      gateway_response: typeof gateway_response === 'string' ? gateway_response : JSON.stringify(gateway_response),
      payment_terms_accepted: true,
      payment_terms_accepted_at: new Date()
    });

    res.json({ success: true, message: 'Payment failure logged.', data: payment });
  } catch (error) {
    console.error('Handle payment failure error:', error);
    res.status(500).json({ success: false, message: 'Error logging payment failure.' });
  }
};

export const razorpayWebhookHandler = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

    if (!RazorpayService.verifyWebhookSignature(rawBody, signature)) {
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    const body = typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : JSON.parse(rawBody.toString());
    const event = body.event;
    
    // Process webhook asynchronously, respond 200 OK immediately
    if (event === 'payment.captured') {
      const paymentEntity = body.payload?.payment?.entity;
      if (paymentEntity) {
        console.log(`[Razorpay Webhook] Payment captured: ${paymentEntity.id}, Order: ${paymentEntity.order_id}`);
      }
    } else if (event === 'payment.failed') {
      const paymentEntity = body.payload?.payment?.entity;
      if (paymentEntity) {
        console.log(`[Razorpay Webhook] Payment failed: ${paymentEntity.id}, Reason: ${paymentEntity.error_description}`);
      }
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).send('Server Error');
  }
};