import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PasswordResetToken = sequelize.define('PasswordResetToken', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  otp_hash: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  max_attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 5,
  },
  verified_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  reset_token_hash: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  reset_token_expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  used_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: 'PasswordResetTokens',
});

export default PasswordResetToken;
