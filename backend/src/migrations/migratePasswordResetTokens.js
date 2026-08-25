import sequelize from '../config/database.js';

export const up = async () => {
  const queryInterface = sequelize.getQueryInterface();

  try {
    // Check if table already exists
    const tables = await queryInterface.showAllTables();
    if (tables.includes('PasswordResetTokens')) {
      console.log('PasswordResetTokens table already exists. Skipping creation.');
      return;
    }

    await queryInterface.createTable('PasswordResetTokens', {
      id: {
        type: sequelize.Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: sequelize.Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      email: {
        type: sequelize.Sequelize.STRING,
        allowNull: false,
      },
      otp_hash: {
        type: sequelize.Sequelize.STRING,
        allowNull: false,
      },
      expires_at: {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
      },
      attempts: {
        type: sequelize.Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      max_attempts: {
        type: sequelize.Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 5,
      },
      verified_at: {
        type: sequelize.Sequelize.DATE,
        allowNull: true,
      },
      reset_token_hash: {
        type: sequelize.Sequelize.STRING,
        allowNull: true,
      },
      reset_token_expires_at: {
        type: sequelize.Sequelize.DATE,
        allowNull: true,
      },
      used_at: {
        type: sequelize.Sequelize.DATE,
        allowNull: true,
      },
      createdAt: {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.Sequelize.fn('NOW'),
      },
      updatedAt: {
        type: sequelize.Sequelize.DATE,
        allowNull: false,
        defaultValue: sequelize.Sequelize.fn('NOW'),
      },
    });

    // Add indexes for performance
    await queryInterface.addIndex('PasswordResetTokens', ['user_id'], { name: 'idx_prt_user_id' });
    await queryInterface.addIndex('PasswordResetTokens', ['email'], { name: 'idx_prt_email' });
    await queryInterface.addIndex('PasswordResetTokens', ['reset_token_hash'], { name: 'idx_prt_reset_token_hash' });

    console.log('✅ PasswordResetTokens table created successfully with indexes.');
  } catch (error) {
    console.error('❌ Error creating PasswordResetTokens table:', error);
    throw error;
  }
};

export const down = async () => {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.dropTable('PasswordResetTokens');
  console.log('PasswordResetTokens table dropped.');
};

// Execute if run directly
const currentFile = new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const scriptArg = process.argv[1]?.replace(/\\/g, '/');
if (scriptArg && currentFile.replace(/\\/g, '/').endsWith(scriptArg.replace(/\\/g, '/'))) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
