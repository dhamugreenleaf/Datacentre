import express from 'express';
import { getUsers, getUserById, updateUserStatus, deleteUser, bulkDeleteUsers } from '../controllers/adminUserController.js';
import { isRegularAdmin } from '../middleware/isRegularAdmin.js';

const router = express.Router();

router.use(isRegularAdmin); // Protect all routes in this file

router.route('/')
  .get(getUsers);

router.route('/bulk-delete')
  .delete(bulkDeleteUsers);

router.route('/:id')
  .get(getUserById)
  .delete(deleteUser);

router.route('/:id/status')
  .put(updateUserStatus);

export default router;
