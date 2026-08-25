import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const UserIdentityDocument = sequelize.define('UserIdentityDocument', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  id_proof_type: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  id_proof_number: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  aadhaar_number: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  uploaded_document: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  verification_status: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'pending'
  },
  verification_provider: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  verification_reference: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  verified_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  remarks: {
    type: DataTypes.TEXT,
    allowNull: true,
  }
}, {
  tableName: 'user_identity_documents',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

export default UserIdentityDocument;
