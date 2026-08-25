import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const KycVerificationLog = sequelize.define('KycVerificationLog', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  verification_type: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  api_endpoint: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  request_payload: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  provider_response: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  reference_number: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  ip_address: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  device_info: {
    type: DataTypes.STRING,
    allowNull: true,
  }
}, {
  tableName: 'kyc_verification_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

export default KycVerificationLog;
