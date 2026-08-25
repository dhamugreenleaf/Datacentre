import express from 'express';
import { getQuickEkycHealth } from '../controllers/systemController.js';

const router = express.Router();

router.get('/quickekyc/health', getQuickEkycHealth);

export default router;
