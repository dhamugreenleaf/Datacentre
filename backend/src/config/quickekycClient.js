import axios from 'axios';
import { quickekycConfig } from './quickekycConfig.js';

class QuickEKYCClient {
  constructor() {
    this.client = axios.create({
      baseURL: quickekycConfig.baseUrl,
      timeout: quickekycConfig.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Request interceptor to automatically inject API key
    this.client.interceptors.request.use(
      (config) => {
        // Ensure data exists
        if (!config.data) {
          config.data = {};
        }
        // Inject API Key based on environment
        config.data.key = quickekycConfig.apiKey;
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Removed mock interceptor to ensure real QuickEKYC responses are used in production
  }

  getInstance() {
    return this.client;
  }
}

// Export singleton instance
export const quickekycClient = new QuickEKYCClient().getInstance();
