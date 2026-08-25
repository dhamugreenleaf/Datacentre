import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

export const up = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = 'user_identity_documents';

  try {
    console.log(`Starting UP migration for ${tableName}...`);

    const tableExists = await queryInterface.tableExists(tableName);
    if (!tableExists) {
      await queryInterface.createTable(tableName, {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
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
      console.log(`Table ${tableName} created successfully.`);
    } else {
      console.log(`Table ${tableName} already exists, skipping.`);
    }

    console.log('UP migration completed successfully!');
  } catch (error) {
    console.error('UP migration failed:', error);
    throw error;
  }
};

export const down = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = 'user_identity_documents';

  try {
    console.log(`Starting DOWN migration for ${tableName}...`);

    const tableExists = await queryInterface.tableExists(tableName);
    if (tableExists) {
      await queryInterface.dropTable(tableName);
      console.log(`Table ${tableName} dropped successfully.`);
    } else {
      console.log(`Table ${tableName} does not exist, skipping.`);
    }

    console.log('DOWN migration completed successfully!');
  } catch (error) {
    console.error('DOWN migration failed:', error);
    throw error;
  }
};

// If run directly
if (process.argv[1] && process.argv[1].endsWith('createUserIdentityDocuments.js')) {
  if (process.argv.includes('--down')) {
    down().then(() => process.exit(0)).catch(() => process.exit(1));
  } else {
    up().then(() => process.exit(0)).catch(() => process.exit(1));
  }
}
