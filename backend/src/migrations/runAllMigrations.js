import 'dotenv/config';
import { up as migratePayments } from './migratePayments.js';
import { up as migrateRazorpayPayments } from './migrateRazorpayPayments.js';
import { up as migrateServiceId } from './migrateServiceId.js';
import { up as migrateKyc } from './migrateKyc.js';
import { up as migrateMultipleIdProof } from './migrateMultipleIdProof.js';
import { up as createUserIdentityDocuments } from './createUserIdentityDocuments.js';
import { up as migrateKycDocumentStatus } from './migrateKycDocumentStatus.js';
import { up as migrateCustomerAgreements } from './migrateCustomerAgreements.js';
import { up as migrateUserPhoneUnique } from './migrateUserPhoneUnique.js';
import { up as migratePasswordResetTokens } from './migratePasswordResetTokens.js';

const runAll = async () => {
  console.log('=== Starting Database Migrations ===');
  try {
    console.log('\n[1/10] Running migratePayments...');
    await migratePayments();

    console.log('\n[2/10] Running migrateRazorpayPayments...');
    await migrateRazorpayPayments();

    console.log('\n[3/10] Running migrateServiceId...');
    await migrateServiceId();

    console.log('\n[4/10] Running migrateKyc...');
    await migrateKyc();

    console.log('\n[5/10] Running migrateMultipleIdProof...');
    await migrateMultipleIdProof();

    console.log('\n[6/10] Running createUserIdentityDocuments...');
    await createUserIdentityDocuments();

    console.log('\n[7/10] Running migrateKycDocumentStatus...');
    await migrateKycDocumentStatus();

    console.log('\n[8/10] Running migrateCustomerAgreements...');
    await migrateCustomerAgreements();

    console.log('\n[9/10] Running migrateUserPhoneUnique...');
    await migrateUserPhoneUnique();

    console.log('\n[10/10] Running migratePasswordResetTokens...');
    await migratePasswordResetTokens();

    console.log('\n✅ All migrations executed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
};

runAll();
