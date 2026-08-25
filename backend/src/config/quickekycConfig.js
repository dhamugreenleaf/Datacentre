import dotenv from 'dotenv';
dotenv.config();

const mode = (process.env.QUICKEKYC_MODE || 'SANDBOX').toUpperCase();
const apiVersion = process.env.QUICKEKYC_API_VERSION;

let activeApiKey = '';
let activeBaseUrl = '';
let missingVars = [];

if (!process.env.QUICKEKYC_MODE) {
  missingVars.push('QUICKEKYC_MODE');
}
if (!apiVersion) {
  missingVars.push('QUICKEKYC_API_VERSION');
}

if (mode === 'LIVE') {
  activeApiKey = process.env.QUICKEKYC_API_KEY;
  activeBaseUrl = process.env.QUICKEKYC_BASE_URL;
  
  if (!activeApiKey) missingVars.push('QUICKEKYC_API_KEY');
  if (!activeBaseUrl) missingVars.push('QUICKEKYC_BASE_URL');
} else {
  // Sandbox mode
  activeApiKey = process.env.QUICKEKYC_SANDBOX_API_KEY;
  activeBaseUrl = process.env.QUICKEKYC_SANDBOX_BASE_URL;

  if (!activeApiKey) missingVars.push('QUICKEKYC_SANDBOX_API_KEY');
  if (!activeBaseUrl) missingVars.push('QUICKEKYC_SANDBOX_BASE_URL');
}

const timeoutRaw = process.env.QUICKEKYC_TIMEOUT;
if (!timeoutRaw) {
  missingVars.push('QUICKEKYC_TIMEOUT');
}

if (missingVars.length > 0) {
  throw new Error(`QuickEKYC Configuration Error. Missing required environment variables: ${missingVars.join(', ')}`);
}

export const quickekycConfig = {
  mode,
  apiVersion,
  apiKey: activeApiKey,
  baseUrl: activeBaseUrl,
  timeout: parseInt(timeoutRaw, 10) || 30000
};
