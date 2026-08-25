import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

export const up = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const kycTable = 'kyc_verifications';

  try {
    console.log('Starting UP migration for multiple ID proofs...');

    // 1. Add columns to kyc_verifications
    const columnsToAdd = {
      id_proof_type: { type: DataTypes.STRING(30), defaultValue: 'AADHAAR' },
      id_proof_number: { type: DataTypes.STRING, allowNull: true },
      id_proof_document: { type: DataTypes.STRING, allowNull: true },
      verification_provider: { type: DataTypes.STRING, allowNull: true },
      verification_request: { type: DataTypes.JSON, allowNull: true },
      verification_response: { type: DataTypes.JSON, allowNull: true },
      verification_reference: { type: DataTypes.STRING, allowNull: true },
      verified_at: { type: DataTypes.DATE, allowNull: true }
    };

    const currentKycDef = await queryInterface.describeTable(kycTable);

    for (const [columnName, columnDef] of Object.entries(columnsToAdd)) {
      if (!currentKycDef[columnName]) {
        console.log(`Adding column ${columnName} to ${kycTable}...`);
        await queryInterface.addColumn(kycTable, columnName, columnDef);
      } else {
        console.log(`Column ${columnName} already exists in ${kycTable}, skipping.`);
      }
    }

    // Existing old records must be updated to AADHAAR
    console.log('Updating existing records to default id_proof_type = AADHAAR...');
    // We update only if it's currently null or something, but with defaultValue it handles newly created ones.
    // To be safe, just update all nulls:
    const [results, metadata] = await sequelize.query(`UPDATE ${kycTable} SET id_proof_type = 'AADHAAR' WHERE id_proof_type IS NULL`);

    // 2. Create kyc_verification_logs table
    const logsTable = 'kyc_verification_logs';
    const logsTableExists = await queryInterface.tableExists(logsTable);

    if (!logsTableExists) {
      console.log(`Creating table ${logsTable}...`);
      await queryInterface.createTable(logsTable, {
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
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        }
      });
    } else {
      console.log(`Table ${logsTable} already exists, skipping.`);
    }

    console.log('UP migration completed successfully!');
  } catch (error) {
    console.error('UP migration failed:', error);
    throw error;
  }
};

export const down = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const kycTable = 'kyc_verifications';
  const logsTable = 'kyc_verification_logs';

  try {
    console.log('Starting DOWN migration for multiple ID proofs...');

    const columnsToRemove = [
      'id_proof_type',
      'id_proof_number',
      'id_proof_document',
      'verification_provider',
      'verification_request',
      'verification_response',
      'verification_reference',
      'verified_at'
    ];

    const currentKycDef = await queryInterface.describeTable(kycTable).catch(() => ({}));

    for (const columnName of columnsToRemove) {
      if (currentKycDef[columnName]) {
        console.log(`Removing column ${columnName} from ${kycTable}...`);
        await queryInterface.removeColumn(kycTable, columnName);
      }
    }

    const logsTableExists = await queryInterface.tableExists(logsTable);
    if (logsTableExists) {
      console.log(`Dropping table ${logsTable}...`);
      await queryInterface.dropTable(logsTable);
    }

    console.log('DOWN migration completed successfully!');
  } catch (error) {
    console.error('DOWN migration failed:', error);
    throw error;
  }
};

// If run directly
if (process.argv[1] && process.argv[1].endsWith('migrateMultipleIdProof.js')) {
  if (process.argv.includes('--down')) {
    down().then(() => process.exit(0)).catch(() => process.exit(1));
  } else {
    up().then(() => process.exit(0)).catch(() => process.exit(1));
  }
}
