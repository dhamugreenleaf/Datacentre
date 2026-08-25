import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure base upload directory exists
const baseUploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(baseUploadDir)) {
  fs.mkdirSync(baseUploadDir, { recursive: true });
}

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.user ? req.user.id : 'temp';
    
    let typeDir = 'misc';
    let subDir = '';

    if (
      file.fieldname.includes('aadhaar') || 
      file.fieldname.includes('pan') || 
      file.fieldname.includes('gst') || 
      file.fieldname === 'document' ||
      file.fieldname === 'id_proof_document' ||
      (req.originalUrl && req.originalUrl.includes('/kyc'))
    ) {
      typeDir = 'kyc';
      
      // Nested folder logic based on fieldname or proof type
      if (file.fieldname.includes('aadhaar')) {
        subDir = 'aadhaar';
      } else if (file.fieldname === 'id_proof_document') {
        // Fallback or specific directory based on request body if available
        const proofType = req.body.id_proof_type ? req.body.id_proof_type.toLowerCase() : 'other';
        if (proofType.includes('dl') || proofType.includes('driving')) subDir = 'dl';
        else if (proofType.includes('voter')) subDir = 'voter';
        else subDir = 'id_proofs';
      } else {
        subDir = 'general';
      }
    } else if (file.fieldname === 'identity_document') {
      typeDir = 'identity';
      const proofType = req.body.id_proof_type ? req.body.id_proof_type.toLowerCase() : 'other';
      if (proofType.includes('dl') || proofType.includes('driving')) subDir = 'dl';
      else if (proofType.includes('voter')) subDir = 'voter';
      else if (proofType.includes('aadhaar')) subDir = 'aadhaar';
      else subDir = 'other';
    } else if (
      file.fieldname.includes('payment') || 
      file.fieldname.includes('receipt') ||
      (req.originalUrl && req.originalUrl.includes('/payment'))
    ) {
      typeDir = 'payments';
    }

    const uploadPath = path.join(baseUploadDir, typeDir, userId.toString(), subDir);

    // Create user-specific folder if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate UUID filename instead of original to prevent malicious naming
    const uniqueName = uuidv4();
    const ext = path.extname(file.originalname).toLowerCase();
    
    cb(null, `${file.fieldname}-${uniqueName}${ext}`);
  }
});

// File filter (PDF, JPG, JPEG, PNG)
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  const rejectedExtensions = ['.exe', '.php', '.js', '.zip', '.bat', '.sh'];
  
  const ext = path.extname(file.originalname).toLowerCase();

  if (rejectedExtensions.includes(ext)) {
    return cb(new Error(`Security Error: Uploading ${ext} files is strictly prohibited.`));
  }

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, JPG, JPEG, and PNG are allowed.'));
  }
};

// 5MB limit
const limits = {
  fileSize: 5 * 1024 * 1024 
};

export const uploadKYCDocs = multer({
  storage,
  fileFilter,
  limits
});

// Provide a generic upload export to not break existing code
export const upload = multer({
  storage,
  fileFilter,
  limits
});
