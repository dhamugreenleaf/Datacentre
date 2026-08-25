import { quickekycClient } from '../config/quickekycClient.js';
import { QUICKEKYC_ENDPOINTS } from '../config/quickekycEndpoints.js';
import { VERIFICATION_STATUS } from '../constants/verificationConstants.js';

/**
 * Mask sensitive string data for logging
 */
const maskSensitiveData = (str) => {
  if (!str) return 'UNKNOWN';
  if (str.length <= 4) return '****';
  return `${str.substring(0, 2)}****${str.substring(str.length - 2)}`;
};

/**
 * Clean request payloads from sensitive variables
 */
const sanitizePayload = (payload) => {
  const safePayload = { ...payload };
  if (safePayload.key) safePayload.key = '****MASKED_KEY****';
  if (safePayload.id_number) safePayload.id_number = maskSensitiveData(safePayload.id_number);
  if (safePayload.otp) safePayload.otp = '****MASKED_OTP****';
  return safePayload;
};

/**
 * Reusable Core Verification Logic (Failover Safe)
 */
export const verifyDocument = async (endpoint, payload) => {
  const safeRequestPayload = sanitizePayload(payload);

  try {
    const response = await quickekycClient.post(endpoint, payload);
    const data = response.data || {};
    
    // Check for provider explicit failures
    if (data.status === 'failed' || data.status === 'error' || data.data?.status === 'failed') {
      return {
        success: false,
        verified: false,
        status: VERIFICATION_STATUS.FAILED,
        message: data?.message || 'Invalid response received from provider',
        rawRequest: safeRequestPayload,
        rawResponse: sanitizePayload(data)
      };
    }

    return {
      success: true,
      verified: data.status === 'success' || data.data?.status === 'success',
      status: VERIFICATION_STATUS.SUCCESS,
      data: data.data || {},
      message: 'Verification completed',
      rawRequest: safeRequestPayload,
      rawResponse: sanitizePayload(data)
    };
  } catch (error) {
    let userMessage = 'Failed to verify with identity provider.';
    let status = VERIFICATION_STATUS.FAILED;

    if (error.code === 'ECONNABORTED') {
      userMessage = 'Identity provider connection timed out. Please try again later.';
    } else if (error.response) {
      if (error.response.status === 401 || error.response.status === 403) {
        userMessage = 'Service authentication failed. Please contact support.';
      }
    }

    return {
      success: false,
      verified: false,
      status: status,
      message: userMessage,
      errorDetail: error.response ? `${error.response.status} - ${error.response.data?.message || ''}` : error.message,
      rawRequest: safeRequestPayload,
      rawResponse: sanitizePayload(error.response ? error.response.data : { error: error.message })
    };
  }
};

/**
 * Generate OTP for Aadhaar ID Verification
 */
export const generateOtp = async (idNumber) => {
  try {
    const response = await quickekycClient.post(QUICKEKYC_ENDPOINTS.GENERATE_OTP, { 
      id_number: idNumber 
    });
    
    const data = response.data || {};
    if (data.status === 'failed' || data.status === 'error' || data.data?.status === 'failed') {
      throw new Error(data?.message || 'Invalid response received from provider');
    }

    const requestId = data.request_id || data.data?.request_id;
    if (!requestId) throw new Error('No Request ID returned from identity provider');

    return { success: true, requestId, message: 'OTP generated successfully' };
  } catch (error) {
    if (error.code === 'ECONNABORTED') throw new Error('Identity provider connection timed out. Please try again later.');
    throw new Error(error.response?.data?.message || error.message || 'Failed to generate OTP with identity provider.');
  }
};

/**
 * Submit OTP for Aadhaar ID Verification
 */
export const submitOtp = async (requestId, otp) => {
  try {
    const response = await quickekycClient.post(QUICKEKYC_ENDPOINTS.SUBMIT_OTP, { 
      request_id: requestId, 
      otp 
    });

    const data = response.data || {};
    if (data.status === 'error' || data.status === 'failed' || data.data?.status === 'failed') {
      throw new Error(data?.message || 'Invalid response received from provider');
    }

    return {
      success: true,
      verified: data.status === 'success' || data.data?.status === 'success',
      status: VERIFICATION_STATUS.SUCCESS,
      data: data.data || {},
      message: 'OTP verification completed'
    };
  } catch (error) {
    if (error.code === 'ECONNABORTED') throw new Error('Identity provider connection timed out. Please try again later.');
    throw new Error(error.response?.data?.message || error.message || 'Failed to verify OTP with identity provider.');
  }
};

/**
 * Wrapper for Driving Licence Verification
 */
export const verifyDrivingLicence = async (dlNumber, dob) => {
  return verifyDocument(QUICKEKYC_ENDPOINTS.DRIVING_LICENCE, {
    id_number: dlNumber,
    dob: dob
  });
};

/**
 * Wrapper for Voter ID Verification
 */
export const verifyVoterId = async (voterIdNumber) => {
  return verifyDocument(QUICKEKYC_ENDPOINTS.VOTER_ID, {
    id_number: voterIdNumber
  });
};
