import { quickekycConfig } from '../config/quickekycConfig.js';
import { ENVIRONMENT } from '../constants/verificationConstants.js';

// @desc    QuickEKYC Health Check
// @route   GET /api/system/quickekyc/health
// @access  Public or Admin (Depending on routing)
export const getQuickEkycHealth = (req, res) => {
  try {
    // Check if configuration exists
    const configured = !!(quickekycConfig.apiKey && quickekycConfig.baseUrl);

    return res.status(200).json({
      provider: 'QuickEKYC',
      environment: quickekycConfig.mode || ENVIRONMENT.SANDBOX,
      configured,
      status: configured ? 'READY' : 'UNCONFIGURED'
    });
  } catch (error) {
    return res.status(500).json({
      provider: 'QuickEKYC',
      status: 'ERROR',
      message: 'Failed to retrieve system health.'
    });
  }
};
