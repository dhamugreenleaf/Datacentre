export const up = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable('kyc_verifications');
  
  if (!table.replacement_count) {
    await queryInterface.addColumn('kyc_verifications', 'replacement_count', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false
    });
  }

  if (!table.replacement_uploaded_at) {
    await queryInterface.addColumn('kyc_verifications', 'replacement_uploaded_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
  }
};

export const down = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable('kyc_verifications');
  
  if (table.replacement_count) {
    await queryInterface.removeColumn('kyc_verifications', 'replacement_count');
  }

  if (table.replacement_uploaded_at) {
    await queryInterface.removeColumn('kyc_verifications', 'replacement_uploaded_at');
  }
};
