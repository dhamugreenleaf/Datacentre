import sequelize from '../config/database.js';
import { DataTypes } from 'sequelize';
import { fileURLToPath } from 'url';

export const up = async () => {
  try {
    console.log('Running KYC Document Status Migration...');

    const queryInterface = sequelize.getQueryInterface();

    const documents = [
      'aadhaar_front',
      'aadhaar_back',
      'gst_cert',
      'pan_card',
      'company_reg',
      'address_proof'
    ];

    const currentTableDef = await queryInterface.describeTable('kyc_verifications').catch(() => ({}));

    for (const doc of documents) {
      // Add status column
      if (!currentTableDef[`${doc}_status`]) {
        try {
          await queryInterface.addColumn('kyc_verifications', `${doc}_status`, {
            type: DataTypes.ENUM('pending', 'approved', 'rejected', 'replaced'),
            defaultValue: 'pending',
            allowNull: false
          });
          console.log(`Added ${doc}_status`);
        } catch (e) {
          console.log(`Column ${doc}_status might already exist:`, e.message);
        }
      }

      // Add reason column
      if (!currentTableDef[`${doc}_reason`]) {
        try {
          await queryInterface.addColumn('kyc_verifications', `${doc}_reason`, {
            type: DataTypes.TEXT,
            allowNull: true
          });
          console.log(`Added ${doc}_reason`);
        } catch (e) {
          console.log(`Column ${doc}_reason might already exist:`, e.message);
        }
      }
    }

    console.log('KYC Document Status Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  up()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

