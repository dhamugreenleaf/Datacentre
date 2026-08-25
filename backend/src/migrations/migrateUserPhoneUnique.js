import sequelize from '../config/database.js';
import { normalizePhoneNumber } from '../utils/phoneHelper.js';

export const up = async () => {
  const queryInterface = sequelize.getQueryInterface();

  console.log('--- Inspecting User Phone Numbers for Migration ---');
  const [users] = await sequelize.query('SELECT id, name, email, phone, createdAt FROM Users ORDER BY id ASC');

  const phoneMap = new Map();
  for (const u of users) {
    const norm = normalizePhoneNumber(u.phone);
    if (!phoneMap.has(norm)) {
      phoneMap.set(norm, []);
    }
    phoneMap.get(norm).push(u);
  }

  const duplicates = [];
  for (const [normPhone, list] of phoneMap.entries()) {
    if (list.length > 1) {
      duplicates.push({ normPhone, list });
    }
  }

  if (duplicates.length > 0) {
    console.log(`[WARNING] Found ${duplicates.length} duplicate phone group(s) in existing historical records:`);
    duplicates.forEach(d => {
      console.log(`  - Normalized Phone: ${d.normPhone} (${d.list.length} accounts):`);
      d.list.forEach(acc => {
        console.log(`      ID: ${acc.id} | Name: "${acc.name}" | Email: "${acc.email}" | Raw Phone: "${acc.phone}"`);
      });
    });
    console.log('[INFO] Existing historical duplicate data is preserved untouched without automatic deletion or merging.');
    console.log('[INFO] Backend and application validation will strictly prevent ANY NEW duplicate accounts from being registered.');
  } else {
    console.log('[SUCCESS] No duplicate phone numbers found in Users table.');
    // Check if unique index already exists
    const [indexes] = await sequelize.query("SHOW INDEX FROM Users WHERE Column_name = 'phone' AND Non_unique = 0");
    if (indexes.length === 0) {
      console.log('Adding UNIQUE index on Users(phone)...');
      await queryInterface.addIndex('Users', ['phone'], {
        unique: true,
        name: 'users_phone_unique'
      });
      console.log('✅ Unique index users_phone_unique added successfully.');
    } else {
      console.log('Unique index on Users(phone) already exists.');
    }
  }
};

export const down = async () => {
  const queryInterface = sequelize.getQueryInterface();
  try {
    await queryInterface.removeIndex('Users', 'users_phone_unique');
    console.log('Removed unique index users_phone_unique.');
  } catch (error) {
    console.log('Index was not removed or did not exist.');
  }
};
