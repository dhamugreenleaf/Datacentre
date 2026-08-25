import express from 'express';
import { getQuotes, getQuoteById, updateQuoteStatus, bulkDeleteQuotes } from '../controllers/adminQuoteController.js';
import { isRegularAdmin } from '../middleware/isRegularAdmin.js';

const router = express.Router();

router.use(isRegularAdmin);

router.route('/')
  .get(getQuotes);

router.route('/bulk-delete')
  .delete(bulkDeleteQuotes);

router.route('/:id')
  .get(getQuoteById);

router.route('/:id/status')
  .put(updateQuoteStatus);

export default router;
