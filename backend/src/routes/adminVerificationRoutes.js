import express from 'express';
import { 
  getVerifications, 
  getVerificationById, 
  getVerificationDocument, 
  updateVerificationStatus,
  bulkDeleteVerifications
} from '../controllers/adminVerificationController.js';
import { isRegularAdmin } from '../middleware/isRegularAdmin.js';

const router = express.Router();

router.use(isRegularAdmin);

router.delete('/bulk-delete', bulkDeleteVerifications);
router.get('/', getVerifications);
router.get('/:id', getVerificationById);
router.get('/document/:filename', getVerificationDocument);
router.put('/:id/status', updateVerificationStatus);

export default router;
