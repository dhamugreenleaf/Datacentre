import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

export const up = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = 'customer_agreements';

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
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        quote_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: 'quotes',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        msa_accepted: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
        },
        tnc_accepted: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
        },
        aup_accepted: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
        },
        privacy_accepted: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
        },
        ip_address: {
          type: DataTypes.STRING,
          allowNull: true,
        },
        browser_info: {
          type: DataTypes.STRING,
          allowNull: true,
        },
        accepted_at: {
          type: DataTypes.DATE,
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
        },
      });
      console.log(`Table ${tableName} created successfully.`);
    } else {
      console.log(`Table ${tableName} already exists, skipping.`);
    }

    console.log('Customer agreements migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
};

export const down = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = 'customer_agreements';

  try {
    const tableExists = await queryInterface.tableExists(tableName);
    if (tableExists) {
      await queryInterface.dropTable(tableName);
      console.log(`Table ${tableName} dropped successfully.`);
    }
  } catch (error) {
    console.error('DOWN migration failed:', error);
    throw error;
  }
};

// If run directly
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--down')) {
    down().then(() => process.exit(0)).catch(() => process.exit(1));
  } else {
    up().then(() => process.exit(0)).catch(() => process.exit(1));
  }
}
