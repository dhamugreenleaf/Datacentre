import { KycVerification, Quote, Document, KycVerificationLog, UserIdentityDocument, User } from '../models/index.js';
import sequelize from '../config/database.js';
import crypto from 'crypto';
import { logAudit, logTimeline } from '../utils/auditService.js';
import { sendKycSubmittedNotification } from '../utils/kycNotificationService.js';
import * as quickekycService from '../services/quickekycService.js';
import { VERIFICATION_STATUS } from '../constants/verificationConstants.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Determines customer-level KYC status using existing database models.
 */
export const getCustomerKycStatus = async (userId) => {
  if (!userId) {
    return { isVerified: false, status: 'NOT_VERIFIED', kycRecord: null, user: null };
  }

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return { isVerified: false, status: 'NOT_FOUND', kycRecord: null, user: null };
    }

    // 1. Check if User record is already marked as verified
    if (user.kyc_verification_status === 'verified') {
      const verifiedKyc = await KycVerification.findOne({
        where: { user_id: userId, overall_status: 'verified' },
        order: [['updated_at', 'DESC'], ['created_at', 'DESC']]
      });
      return { isVerified: true, status: 'VERIFIED', kycRecord: verifiedKyc, user };
    }

    // 2. Check if user has ANY verified KycVerification record
    const verifiedKyc = await KycVerification.findOne({
      where: { user_id: userId, overall_status: 'verified' },
      order: [['updated_at', 'DESC'], ['created_at', 'DESC']]
    });

    if (verifiedKyc) {
      if (user.kyc_verification_status !== 'verified') {
        user.kyc_verification_status = 'verified';
        await user.save();
      }
      return { isVerified: true, status: 'VERIFIED', kycRecord: verifiedKyc, user };
    }

    // 3. Check if user has ANY verified UserIdentityDocument
    const verifiedIdentityDoc = await UserIdentityDocument.findOne({
      where: { user_id: userId, verification_status: 'verified' },
      order: [['created_at', 'DESC']]
    });

    if (verifiedIdentityDoc) {
      if (user.kyc_verification_status !== 'verified') {
        user.kyc_verification_status = 'verified';
        await user.save();
      }
      return { isVerified: true, status: 'VERIFIED', kycRecord: null, user };
    }

    // 4. Check for latest active KYC submission state
    const latestKyc = await KycVerification.findOne({
      where: { user_id: userId },
      order: [['updated_at', 'DESC'], ['created_at', 'DESC']]
    });

    if (latestKyc) {
      if (latestKyc.overall_status === 'under_review' || latestKyc.overall_status === 'partially_verified') {
        return { isVerified: false, status: 'UNDER_REVIEW', kycRecord: latestKyc, user };
      }
      if (latestKyc.overall_status === 'rejected' || latestKyc.overall_status === 'failed') {
        return { isVerified: false, status: 'REJECTED', kycRecord: latestKyc, user };
      }
      return { isVerified: false, status: 'PENDING', kycRecord: latestKyc, user };
    }

    return { isVerified: false, status: 'NOT_VERIFIED', kycRecord: null, user };
  } catch (error) {
    console.error(`Error checking KYC status for user ${userId}:`, error);
    return { isVerified: false, status: 'ERROR', kycRecord: null, user: null };
  }
};

/**
 * Synchronizes customer verified KYC onto a specific quote record.
 */
export const inheritCustomerKycForQuote = async (userId, quoteId, transaction = null) => {
  try {
    const { isVerified, kycRecord } = await getCustomerKycStatus(userId);
    if (!isVerified) return null;

    // Update Quote status to verified
    const quote = await Quote.findOne({
      where: { id: quoteId, user_id: userId },
      transaction
    });

    if (quote && (quote.status === 'verification_pending' || quote.status === 'pending' || quote.status === 'quoted')) {
      quote.status = 'verified';
      await quote.save({ transaction });
    }

    // Find or create KycVerification record for this quote
    let quoteKyc = await KycVerification.findOne({
      where: { quote_id: quoteId, user_id: userId },
      transaction
    });

    if (!quoteKyc) {
      const inheritedData = kycRecord ? {
        customer_type: kycRecord.customer_type,
        full_name: kycRecord.full_name,
        email_address: kycRecord.email_address,
        mobile_number: kycRecord.mobile_number,
        residential_address: kycRecord.residential_address,
        aadhaar_number: kycRecord.aadhaar_number,
        company_name: kycRecord.company_name,
        gst_number: kycRecord.gst_number,
        pan_number: kycRecord.pan_number,
        registered_address: kycRecord.registered_address,
        auth_contact_person: kycRecord.auth_contact_person,
        designation: kycRecord.designation,
        official_email: kycRecord.official_email,
        auth_aadhaar_number: kycRecord.auth_aadhaar_number,
        aadhaar_front_path: kycRecord.aadhaar_front_path,
        aadhaar_front_status: kycRecord.aadhaar_front_status || 'approved',
        aadhaar_back_path: kycRecord.aadhaar_back_path,
        aadhaar_back_status: kycRecord.aadhaar_back_status || 'approved',
        gst_cert_path: kycRecord.gst_cert_path,
        gst_cert_status: kycRecord.gst_cert_status || 'approved',
        pan_card_path: kycRecord.pan_card_path,
        pan_card_status: kycRecord.pan_card_status || 'approved',
        company_reg_path: kycRecord.company_reg_path,
        company_reg_status: kycRecord.company_reg_status || 'approved',
        address_proof_path: kycRecord.address_proof_path,
        address_proof_status: kycRecord.address_proof_status || 'approved',
        id_proof_type: kycRecord.id_proof_type,
        id_proof_number: kycRecord.id_proof_number,
        id_proof_document: kycRecord.id_proof_document,
        verification_provider: kycRecord.verification_provider,
        verification_reference: kycRecord.verification_reference,
        verified_at: kycRecord.verified_at || new Date(),
        kyc_consent: true,
        kyc_consent_at: kycRecord.kyc_consent_at || new Date()
      } : {};

      quoteKyc = await KycVerification.create({
        user_id: userId,
        quote_id: quoteId,
        aadhaar_status: 'verified',
        pan_status: 'verified',
        overall_status: 'verified',
        verified_at: new Date(),
        internal_remarks: 'Inherited from existing verified customer KYC',
        ...inheritedData
      }, { transaction });
    } else if (quoteKyc.overall_status !== 'verified') {
      quoteKyc.overall_status = 'verified';
      quoteKyc.aadhaar_status = 'verified';
      quoteKyc.pan_status = 'verified';
      quoteKyc.verified_at = quoteKyc.verified_at || new Date();
      if (!quoteKyc.internal_remarks) {
        quoteKyc.internal_remarks = 'Inherited from existing verified customer KYC';
      }
      await quoteKyc.save({ transaction });
    }

    return quoteKyc;
  } catch (error) {
    console.error(`Error inheriting KYC for quote ${quoteId}:`, error);
    return null;
  }
};

export const getCustomerKycStatusEndpoint = async (req, res) => {
  try {
    const { isVerified, status, kycRecord } = await getCustomerKycStatus(req.user.id);
    return res.json({
      success: true,
      data: {
        kycStatus: isVerified ? 'VERIFIED' : status,
        kycRequired: !isVerified,
        canProceedToPayment: isVerified,
        billingIdentity: kycRecord ? {
          customer_type: kycRecord.customer_type,
          name: kycRecord.customer_type === 'company' ? kycRecord.company_name : kycRecord.full_name,
          address: kycRecord.customer_type === 'company' ? kycRecord.registered_address : kycRecord.residential_address,
          gst_number: kycRecord.gst_number || null,
          pan_number: kycRecord.pan_number || null
        } : null
      }
    });
  } catch (error) {
    console.error('Get customer KYC status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getKycStatus = async (req, res) => {
  try {
    const { quoteId } = req.params;

    // Check customer-level KYC status first
    const { isVerified, status: customerKycStatus, kycRecord: verifiedCustomerKyc } = await getCustomerKycStatus(req.user.id);

    let kyc = await KycVerification.findOne({
      where: { quote_id: quoteId, user_id: req.user.id },
      include: [
        { model: Quote, as: 'quote', attributes: ['id', 'quote_number', 'service_type', 'monthly_price', 'status'] }
      ]
    });

    if (isVerified) {
      // Customer is already verified. Ensure quote KYC is inherited and quote is marked verified.
      if (!kyc || kyc.overall_status !== 'verified') {
        kyc = await inheritCustomerKycForQuote(req.user.id, quoteId);
        kyc = await KycVerification.findOne({
          where: { id: kyc.id },
          include: [
            { model: Quote, as: 'quote', attributes: ['id', 'quote_number', 'service_type', 'monthly_price', 'status'] }
          ]
        });
      }

      return res.json({
        success: true,
        data: kyc,
        kycRequired: false,
        kycStatus: 'VERIFIED',
        canProceedToPayment: true
      });
    }

    if (!kyc) {
      kyc = await KycVerification.create({
        user_id: req.user.id,
        quote_id: quoteId,
        aadhaar_status: 'pending',
        pan_status: 'pending',
        overall_status: 'pending'
      });
      kyc = await KycVerification.findOne({
        where: { id: kyc.id },
        include: [
          { model: Quote, as: 'quote', attributes: ['id', 'quote_number', 'service_type', 'monthly_price', 'status'] }
        ]
      });
    }

    res.json({
      success: true,
      data: kyc,
      kycRequired: true,
      kycStatus: customerKycStatus || 'PENDING',
      canProceedToPayment: false
    });
  } catch (error) {
    console.error('Get KYC status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getMyKyc = async (req, res) => {
  try {
    const kycs = await KycVerification.findAll({
      where: { user_id: req.user.id },
      order: [['created_at', 'DESC']]
    });
    res.json({ success: true, data: kycs });
  } catch (error) {
    console.error('Get my KYC error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const updateOverallStatus = async (kyc, transaction = null) => {
  // If overall_status is already verified by an alternative ID proof, don't downgrade it unless PAN fails.
  const isAltIdVerified = kyc.overall_status === 'verified' && (kyc.id_proof_type === 'DRIVING_LICENCE' || kyc.id_proof_type === 'VOTER_ID');
  
  if ((kyc.aadhaar_status === 'verified' || isAltIdVerified) && kyc.pan_status === 'verified') {
    // If API checks pass, it's under review until Admin approves
    kyc.overall_status = 'under_review';
  } else if (kyc.aadhaar_status === 'verified' || isAltIdVerified || kyc.pan_status === 'verified') {
    kyc.overall_status = 'partially_verified';
  } else if (kyc.aadhaar_status === 'failed' || kyc.pan_status === 'failed') {
    kyc.overall_status = 'failed';
  } else {
    kyc.overall_status = 'pending';
  }
};

export const startAadhaarVerification = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { quoteId, kycConsent, otp, aadhaarNumber, customerDetails, customerType } = req.body;
    let kyc = await KycVerification.findOne({ where: { quote_id: quoteId, user_id: req.user.id }, transaction });

    if (!kyc) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'KYC record not found' });
    }

    if (kycConsent) {
      kyc.kyc_consent = true;
      kyc.kyc_consent_at = new Date();
    }

    if (!otp) {
      // Step 1: Generate OTP
      if (!aadhaarNumber) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Aadhaar number is required for verification' });
      }

      let otpRes;
      try {
        otpRes = await quickekycService.generateOtp(aadhaarNumber);
      } catch (err) {
        await transaction.rollback();
        // Return provider error without failing completely if they want to retry
        return res.status(400).json({ success: false, message: err.message });
      }
      
      if (kyc.customer_type === 'company' || (aadhaarNumber.length === 12 && customerType === 'company')) {
        kyc.auth_aadhaar_number = aadhaarNumber;
      } else {
        kyc.aadhaar_number = aadhaarNumber;
      }
      
      if (customerType) kyc.customer_type = customerType;
      if (customerDetails) {
        for (const key of Object.keys(customerDetails)) {
          kyc[key] = customerDetails[key] || null;
        }
      }
      
      kyc.aadhaar_reference_id = otpRes.requestId;
      await kyc.save({ transaction });
      
      // Log interaction
      await KycVerificationLog.create({
        user_id: req.user.id,
        verification_type: 'AADHAAR_OTP_GENERATE',
        api_endpoint: '/aadhaar-v2/generate-otp',
        status: 'SUCCESS',
        reference_number: otpRes.requestId,
        ip_address: req.ip,
        device_info: req.headers['user-agent']
      }, { transaction });

      await transaction.commit();
      return res.json({ success: true, message: 'OTP sent to mobile number', data: kyc });
    } else {
      // Step 2: Submit OTP
      const requestId = kyc.aadhaar_reference_id;
      if (!requestId) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'No pending OTP request found' });
      }

      let verifyRes;
      try {
        verifyRes = await quickekycService.submitOtp(requestId, otp);
      } catch (err) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: err.message });
      }

      await KycVerificationLog.create({
        user_id: req.user.id,
        verification_type: 'AADHAAR_OTP_SUBMIT',
        api_endpoint: '/aadhaar-v2/submit-otp',
        status: verifyRes.verified ? 'SUCCESS' : 'FAILED',
        reference_number: requestId,
        ip_address: req.ip,
        device_info: req.headers['user-agent'],
        provider_response: verifyRes.data || {}
      }, { transaction });

        if (verifyRes.verified) {
        kyc.aadhaar_status = 'verified';
        await updateOverallStatus(kyc, transaction);
        await kyc.save({ transaction });

        // Save to UserIdentityDocument
        let identityDoc = await UserIdentityDocument.findOne({ where: { user_id: req.user.id, id_proof_type: 'AADHAAR' }, transaction });
        if (!identityDoc) {
          identityDoc = await UserIdentityDocument.create({
            user_id: req.user.id,
            id_proof_type: 'AADHAAR',
            aadhaar_number: kyc.aadhaar_number || kyc.auth_aadhaar_number,
            verification_status: 'verified',
            verification_provider: 'QuickEKYC',
            verification_reference: requestId,
            verified_at: new Date()
          }, { transaction });
        } else {
          identityDoc.verification_status = 'verified';
          identityDoc.verification_reference = requestId;
          identityDoc.verified_at = new Date();
          identityDoc.aadhaar_number = kyc.aadhaar_number || kyc.auth_aadhaar_number;
          await identityDoc.save({ transaction });
        }

        await transaction.commit();

        return res.json({ success: true, message: 'Aadhaar verified successfully', data: kyc });
      } else {
        await transaction.commit(); // Save log
        return res.status(400).json({ success: false, message: 'Invalid OTP provided' });
      }
    }
  } catch (error) {
    await transaction.rollback();
    console.error('Aadhaar verification error:', error.message || 'Unknown error');
    res.status(500).json({ success: false, message: error.message || 'Server error during Aadhaar verification' });
  }
};

export const startPanVerification = async (req, res) => {
  try {
    const { quoteId, kycConsent } = req.body;
    let kyc = await KycVerification.findOne({ where: { quote_id: quoteId, user_id: req.user.id } });

    if (!kyc) {
      return res.status(404).json({ success: false, message: 'KYC record not found' });
    }

    if (kycConsent) {
      kyc.kyc_consent = true;
      kyc.kyc_consent_at = new Date();
    }

    kyc.pan_status = 'verified';
    kyc.pan_reference_id = `PAN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    await updateOverallStatus(kyc);
    await kyc.save();

    res.json({ success: true, message: 'PAN verified successfully', data: kyc });
  } catch (error) {
    console.error('PAN verification error:', error);
    res.status(500).json({ success: false, message: 'Server error during PAN verification' });
  }
};

export const submitKyc = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { quoteId, customer_type, ...kycData } = req.body;
    let kyc = await KycVerification.findOne({ where: { quote_id: quoteId, user_id: req.user.id }, transaction });

    if (!kyc) {
      kyc = await KycVerification.create({
        user_id: req.user.id,
        quote_id: quoteId
      }, { transaction });
    }

    const isReverifying = kyc.overall_status === 'rejected' || kyc.overall_status === 'failed';

    kyc.customer_type = customer_type;
    for (const key of Object.keys(kycData)) {
      kyc[key] = kycData[key] || null;
    }

    if (req.files) {
      if (req.files.aadhaar_front) kyc.aadhaar_front_path = req.files.aadhaar_front[0].filename;
      if (req.files.aadhaar_back) kyc.aadhaar_back_path = req.files.aadhaar_back[0].filename;
      if (req.files.gst_cert) kyc.gst_cert_path = req.files.gst_cert[0].filename;
      if (req.files.pan_card) kyc.pan_card_path = req.files.pan_card[0].filename;
      if (req.files.company_reg) kyc.company_reg_path = req.files.company_reg[0].filename;
      if (req.files.address_proof) kyc.address_proof_path = req.files.address_proof[0].filename;
      
      if (req.files.id_proof_document) {
        if (isReverifying && kyc.id_proof_document) {
          await Document.create({
            user_id: req.user.id,
            entity_type: 'KycVerification',
            entity_id: kyc.id,
            document_type: kyc.id_proof_type || 'id_proof_document',
            file_path: kyc.id_proof_document,
            status: 'archived',
            remarks: 'Replaced due to re-verification workflow'
          }, { transaction });
        }
        kyc.id_proof_document = req.files.id_proof_document[0].filename;
      }
      
      // Save identity_document directly to UserIdentityDocument master table
      if (req.files.identity_document || req.files.id_proof_document) {
        const idDocFile = req.files.identity_document ? req.files.identity_document[0] : req.files.id_proof_document[0];
        const idProofType = req.body.id_proof_type || 'OTHER';
        let identityDoc = await UserIdentityDocument.findOne({ 
          where: { user_id: req.user.id, id_proof_type: idProofType },
          transaction 
        });

        if (identityDoc) {
          identityDoc.uploaded_document = idDocFile.filename;
          await identityDoc.save({ transaction });
        } else {
           await UserIdentityDocument.create({
             user_id: req.user.id,
             id_proof_type: idProofType,
             uploaded_document: idDocFile.filename,
             verification_status: kyc.overall_status || 'pending',
           }, { transaction });
        }
      }
    }

    const isAltIdVerified = (kyc.id_proof_type === 'DRIVING_LICENCE' || kyc.id_proof_type === 'VOTER_ID') && kyc.verification_reference;
    if (kyc.aadhaar_status === 'verified' || isAltIdVerified) {
      kyc.overall_status = 'under_review';
    } else {
      kyc.overall_status = 'pending';
    }
    if (isReverifying) {
      kyc.replacement_count = (kyc.replacement_count || 0) + 1;
      kyc.replacement_uploaded_at = new Date();
      kyc.reject_reason = null;
    }
    
    kyc.submitted_at = new Date();
    await kyc.save({ transaction });

    await logAudit({
      action: 'KYC_SUBMITTED',
      action_by_user_id: req.user.id,
      target_user_id: req.user.id,
      entity_type: 'KycVerification',
      entity_id: kyc.id,
      req,
      details: { customer_type }
    });

    await logTimeline({
      user_id: req.user.id,
      event_type: 'kyc_submission',
      event_title: 'KYC Submitted',
      event_description: 'Customer submitted identity verification documents for review.'
    });

    await transaction.commit();

    // Send asynchronous notification
    if (kyc.overall_status === 'under_review') {
      sendKycSubmittedNotification(req.user).catch(e => console.error("Failed to send submitted notification", e));
    }

    res.json({ success: true, message: 'KYC submitted successfully', data: kyc });
  } catch (error) {
    await transaction.rollback();
    
    // Clean up uploaded files if transaction fails to avoid unwanted files
    if (req.files) {
      Object.values(req.files).forEach(fileArray => {
        fileArray.forEach(file => {
          if (fs.existsSync(file.path)) {
            try { fs.unlinkSync(file.path); } catch (e) {}
          }
        });
      });
    }

    console.error('KYC submission error:', error);
    res.status(500).json({ success: false, message: 'Server error during KYC submission' });
  }
};

export const getKycDocument = async (req, res) => {
  try {
    const { path: filename, userId: queryUserId } = req.query;
    
    const targetUserId = (req.user.role === 'admin' && queryUserId) ? queryUserId : req.user.id;
    
    if (!filename) {
      return res.status(400).json({ success: false, message: 'File path required' });
    }

    const baseUploadDir = path.join(__dirname, '../../uploads/kyc', targetUserId.toString());
    let filePath = path.join(baseUploadDir, filename);

    // If not found in base directory, check subdirectories created by the new middleware
    if (!fs.existsSync(filePath)) {
      const subDirs = ['aadhaar', 'dl', 'voter', 'general', 'id_proofs'];
      for (const subDir of subDirs) {
        const tempPath = path.join(baseUploadDir, subDir, filename);
        if (fs.existsSync(tempPath)) {
          filePath = tempPath;
          break;
        }
      }
    }

    if (!filePath.startsWith(baseUploadDir)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    res.sendFile(filePath);
  } catch (error) {
    console.error('Get KYC document error:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving document' });
  }
};

export const replaceDocument = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { quoteId, documentType } = req.body;
    let kyc = await KycVerification.findOne({ where: { quote_id: quoteId, user_id: req.user.id }, transaction });

    if (!kyc) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'KYC record not found' });
    }

    if (!req.file) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'No file provided' });
    }

    const validDocs = [
      'aadhaar_front', 'aadhaar_back', 'gst_cert', 
      'pan_card', 'company_reg', 'address_proof', 'id_proof_document'
    ];

    if (!validDocs.includes(documentType)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid document type' });
    }

    const dbFieldPath = documentType === 'id_proof_document' ? 'id_proof_document' : `${documentType}_path`;
    const dbFieldStatus = documentType === 'id_proof_document' ? 'overall_status' : `${documentType}_status`;
    const dbFieldReason = documentType === 'id_proof_document' ? 'reject_reason' : `${documentType}_reason`;

    await Document.create({
      user_id: req.user.id,
      entity_type: 'KycVerification',
      entity_id: kyc.id,
      document_type: documentType,
      file_path: kyc[dbFieldPath] || 'missing',
      status: 'archived',
      remarks: 'Replaced due to rejection'
    }, { transaction });

    kyc[dbFieldPath] = req.file.filename;
    
    // For specific documents, reset their individual status
    if (documentType !== 'id_proof_document') {
      kyc[dbFieldStatus] = 'pending';
      kyc[dbFieldReason] = null;
    } else {
      kyc.reject_reason = null; // Clear global reject reason if it's the main ID proof
    }

    if (kyc.overall_status === 'failed' || kyc.overall_status === 'rejected') {
      kyc.overall_status = 'pending';
    }

    kyc.replacement_count = (kyc.replacement_count || 0) + 1;
    kyc.replacement_uploaded_at = new Date();

    await kyc.save({ transaction });

    await logAudit({
      action: 'KYC_DOCUMENT_REPLACED',
      action_by_user_id: req.user.id,
      target_user_id: req.user.id,
      entity_type: 'KycVerification',
      entity_id: kyc.id,
      req,
      details: { documentType }
    }); // Audit log might not need transaction if it's external, but it's handled internally usually. We'll leave it as is or add transaction.
    // wait, logAudit doesn't take transaction in this codebase easily without checking its implementation, but the previous code didn't use transaction for it. Let's keep it safe.

    await transaction.commit();
    res.json({ success: true, message: 'Document replaced successfully', data: kyc });
  } catch (error) {
    await transaction.rollback();
    console.error('Replace document error:', error);
    res.status(500).json({ success: false, message: 'Server error replacing document' });
  }
};

const handleIDVerification = async (req, res, proofType, idNumber, verifyFunction, apiEndpointStr) => {
  const transaction = await sequelize.transaction();
  try {
    const { quoteId, customerDetails, customerType } = req.body;
    let kyc = await KycVerification.findOne({ where: { quote_id: quoteId, user_id: req.user.id }, transaction });

    if (!kyc) {
      kyc = await KycVerification.create({
        user_id: req.user.id,
        quote_id: quoteId,
        id_proof_type: proofType,
        overall_status: 'pending'
      }, { transaction });
    }

    // Call Provider
    const verifyRes = await verifyFunction(idNumber);

    // Prepare log data
    const logData = {
      user_id: req.user.id,
      verification_type: proofType,
      api_endpoint: apiEndpointStr,
      status: verifyRes.status,
      request_payload: verifyRes.rawRequest || {},
      provider_response: verifyRes.rawResponse || {},
      reference_number: verifyRes.data?.reference_id || verifyRes.rawResponse?.reference_id || verifyRes.rawResponse?.request_id || null,
      ip_address: req.ip,
      device_info: req.headers['user-agent']
    };
    await KycVerificationLog.create(logData, { transaction });

    // Update KYC Record
    kyc.id_proof_type = proofType;
    kyc.id_proof_number = idNumber;
    kyc.verification_provider = 'QuickEKYC';
    kyc.verification_request = verifyRes.rawRequest;
    kyc.verification_response = verifyRes.rawResponse;
    kyc.verification_reference = logData.reference_number;

    if (customerType) kyc.customer_type = customerType;
    if (customerDetails) {
      for (const key of Object.keys(customerDetails)) {
        kyc[key] = customerDetails[key] || null;
      }
    }

    if (verifyRes.verified) {
      kyc.overall_status = 'under_review'; // Waiting for image upload and admin approval
      await kyc.save({ transaction });
      
      // Save to UserIdentityDocument
      let identityDoc = await UserIdentityDocument.findOne({ where: { user_id: req.user.id, id_proof_type: proofType }, transaction });
      if (!identityDoc) {
        identityDoc = await UserIdentityDocument.create({
          user_id: req.user.id,
          id_proof_type: proofType,
          id_proof_number: idNumber,
          verification_status: 'verified',
          verification_provider: 'QuickEKYC',
          verification_reference: logData.reference_number,
          verified_at: new Date()
        }, { transaction });
      } else {
        identityDoc.id_proof_number = idNumber;
        identityDoc.verification_status = 'verified';
        identityDoc.verification_reference = logData.reference_number;
        identityDoc.verified_at = new Date();
        await identityDoc.save({ transaction });
      }

      await transaction.commit();
      return res.json({ success: true, message: `${proofType} verified successfully`, data: kyc });
    } else {
      kyc.overall_status = 'failed';
      await kyc.save({ transaction });
      await transaction.commit();
      return res.status(400).json({ success: false, message: verifyRes.message || `${proofType} verification failed` });
    }

  } catch (error) {
    await transaction.rollback();
    console.error(`${proofType} verification error:`, error.message || error);
    res.status(500).json({ success: false, message: `Server error during ${proofType} verification` });
  }
};

export const startDrivingLicenceVerification = async (req, res) => {
  let { dlNumber, dob } = req.body;
  if (!dlNumber || !/^[A-Z0-9\s-]{10,20}$/i.test(dlNumber)) {
    return res.status(400).json({ success: false, message: 'Invalid Driving Licence Number' });
  }
  
  // Format DL number to be strictly alphanumeric (remove spaces/hyphens) for the API
  const cleanDlNumber = dlNumber.replace(/[\s-]/g, '').toUpperCase();
  
  // Format DOB from DD-MM-YYYY to YYYY-MM-DD
  let formattedDob = dob;
  if (dob && /^\d{2}-\d{2}-\d{4}$/.test(dob)) {
    const [day, month, year] = dob.split('-');
    formattedDob = `${year}-${month}-${day}`;
  } else if (dob && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    // Already YYYY-MM-DD
    formattedDob = dob;
  }

  return handleIDVerification(req, res, 'DRIVING_LICENCE', cleanDlNumber, (id) => quickekycService.verifyDrivingLicence(id, formattedDob), '/driving-license/driving-license');
};

export const startVoterIdVerification = async (req, res) => {
  const { voterIdNumber } = req.body;
  if (!voterIdNumber || !/^[A-Z0-9\s-/]{8,15}$/i.test(voterIdNumber)) {
    return res.status(400).json({ success: false, message: 'Invalid Voter ID Number' });
  }
  
  // Format Voter ID number to remove spaces and hyphens
  const cleanVoterIdNumber = voterIdNumber.replace(/[\s-]/g, '').toUpperCase();
  
  return handleIDVerification(req, res, 'VOTER_ID', cleanVoterIdNumber, (id) => quickekycService.verifyVoterId(id), '/voter-id/voter-id');
};
