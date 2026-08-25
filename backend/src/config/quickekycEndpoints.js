import { quickekycConfig } from './quickekycConfig.js';

/**
 * Helper to build the endpoint dynamically.
 * Prevents duplicating the API version.
 * If the API version is already in the endpoint, it does not add it again.
 */
const buildEndpoint = (path) => {
  const versionStr = `/${quickekycConfig.apiVersion}/`;
  // Check if baseUrl already includes the version (e.g. https://api.quickekyc.com/v1)
  if (quickekycConfig.baseUrl.includes(`/${quickekycConfig.apiVersion}`)) {
    return path; 
  }
  return `${versionStr}${path}`.replace(/\/\//g, '/'); // Clean double slashes
};

export const QUICKEKYC_ENDPOINTS = {
  GENERATE_OTP: buildEndpoint('aadhaar-v2/generate-otp'),
  SUBMIT_OTP: buildEndpoint('aadhaar-v2/submit-otp'),
  DRIVING_LICENCE: buildEndpoint('driving-license/driving-license'),
  VOTER_ID: buildEndpoint('voter-id/voter-id')
};
