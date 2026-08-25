import 'dotenv/config';
import Razorpay from 'razorpay';
import crypto from 'crypto';

class RazorpayService {
  constructor() {
    this.key_id = process.env.RAZORPAY_KEY_ID || 'dummy_key';
    this.key_secret = process.env.RAZORPAY_KEY_SECRET || 'dummy_secret';
    this.webhook_secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'dummy_webhook_secret';
    
    this.isDummy = !this.key_id || this.key_id === 'dummy_key';

    if (!this.isDummy) {
      this.instance = new Razorpay({
        key_id: this.key_id,
        key_secret: this.key_secret,
      });
      const mode = this.isLiveMode() ? 'LIVE' : 'TEST';
      console.log(`[Razorpay] Initialized in ${mode} mode.`);
    } else {
      console.log('[Razorpay] Running in DUMMY mode (no API keys configured).');
    }
  }

  /**
   * Check if running in LIVE mode
   * @returns {boolean}
   */
  isLiveMode() {
    return typeof this.key_id === 'string' && this.key_id.startsWith('rzp_live_');
  }

  /**
   * Check if running in TEST mode (Razorpay Test Keys)
   * @returns {boolean}
   */
  isTestMode() {
    return typeof this.key_id === 'string' && this.key_id.startsWith('rzp_test_');
  }

  /**
   * Check if running in Dummy / unconfigured mode
   * @returns {boolean}
   */
  isDummyMode() {
    return this.isDummy;
  }

  /**
   * Creates a Razorpay Order
   * @param {Object} params - { amount, currency, receipt }
   * @returns {Promise<Object>} The Razorpay order object
   */
  async createOrder({ amount, currency = 'INR', receipt }) {
    if (this.isDummy) {
      return {
        id: `dummy_order_${Math.floor(Math.random() * 1000000)}`,
        amount: Math.round(amount * 100),
        currency,
        receipt,
        status: 'created',
      };
    }

    const options = {
      amount: Math.round(amount * 100), // amount in paise
      currency,
      receipt,
    };

    return await this.instance.orders.create(options);
  }

  /**
   * Verifies the Razorpay payment signature
   * @param {string} orderId 
   * @param {string} paymentId 
   * @param {string} signature 
   * @returns {boolean} True if signature is valid
   */
  verifySignature(orderId, paymentId, signature) {
    if (this.isDummy) {
      return true; // Auto-verify in dummy mode only
    }

    if (!orderId || !paymentId || !signature) {
      return false;
    }

    try {
      const shasum = crypto.createHmac('sha256', this.key_secret);
      shasum.update(`${orderId}|${paymentId}`);
      const digest = shasum.digest('hex');

      const digestBuffer = Buffer.from(digest, 'utf8');
      const signatureBuffer = Buffer.from(signature, 'utf8');

      if (digestBuffer.length !== signatureBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(digestBuffer, signatureBuffer);
    } catch (err) {
      console.error('[Razorpay] Signature verification error');
      return false;
    }
  }

  /**
   * Verifies the Razorpay webhook signature against the raw request body
   * @param {string|Buffer} rawBody The raw request body
   * @param {string} signature The x-razorpay-signature header
   * @returns {boolean} True if webhook signature is valid
   */
  verifyWebhookSignature(rawBody, signature) {
    if (this.isDummy) {
      return true;
    }

    if (!rawBody || !signature || !this.webhook_secret || this.webhook_secret === 'dummy_webhook_secret') {
      return false;
    }

    try {
      const shasum = crypto.createHmac('sha256', this.webhook_secret);
      shasum.update(rawBody);
      const digest = shasum.digest('hex');

      const digestBuffer = Buffer.from(digest, 'utf8');
      const signatureBuffer = Buffer.from(signature, 'utf8');

      if (digestBuffer.length !== signatureBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(digestBuffer, signatureBuffer);
    } catch (err) {
      console.error('[Razorpay] Webhook signature verification error');
      return false;
    }
  }
}

export default new RazorpayService();

