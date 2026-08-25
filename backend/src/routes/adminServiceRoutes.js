import express from 'express';
import { getAllServices, updateAdminServiceStatus } from '../controllers/serviceController.js';
import { isRegularAdmin } from '../middleware/isRegularAdmin.js';

const router = express.Router();

router.use(isRegularAdmin);

router.route('/')
  .get(getAllServices);

router.route('/:id/status')
  .put(updateAdminServiceStatus);

export default router;
