import React, { useState } from 'react';
import { startDrivingLicenceVerification } from '../../../services/api';
import FileUpload from '../FileUpload';

const DrivingLicenceComponent = ({ quoteId, formData, onVerified, isCompany, dlNumber, dob, onDlNumberChange, onDobChange, isVerified, setIsVerified }) => {
  const [isVerifying, setIsVerifying] = useState(false);
  const [dlError, setDlError] = useState('');
  const [dlFile, setDlFile] = useState(null);

  const handleVerify = async () => {
    try {
      setIsVerifying(true);
      setDlError('');
      
      const res = await startDrivingLicenceVerification(quoteId, dlNumber, dob, formData, isCompany ? 'company' : 'individual');
      if (res.success) {
        setIsVerified(true);
        // We pass up the verified status and file to the parent Wizard if needed, 
        // or just let KycWizard submit the file later.
        onVerified('DRIVING_LICENCE', dlNumber, dlFile);
      }
    } catch (err) {
      setDlError(err.response?.data?.message || 'Failed to verify Driving Licence.');
    } finally {
      setIsVerifying(false);
    }
  };

  // When file is uploaded
  const handleFileChange = (name, file) => {
    setDlFile(file);
    if (isVerified) {
      onVerified('DRIVING_LICENCE', dlNumber, file);
    }
  };

  return (
    <div className="md:col-span-2 border border-gray-800 p-4 rounded-xl bg-[#020817]">
      <h4 className="text-lg font-bold text-white mb-4">Driving Licence Verification</h4>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm text-gray-400 mb-2">Driving Licence Number *</label>
          <input 
            type="text" 
            value={dlNumber} 
            onChange={onDlNumberChange} 
            disabled={isVerified}
            className="w-full bg-[#0a1128] border border-gray-800 rounded-lg px-4 py-3 text-white focus:border-secondary disabled:opacity-50" 
            placeholder="e.g. MH1420110062821"
            required 
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-2">Date of Birth * (DD-MM-YYYY)</label>
          <input 
            type="text" 
            value={dob} 
            onChange={onDobChange} 
            disabled={isVerified}
            className="w-full bg-[#0a1128] border border-gray-800 rounded-lg px-4 py-3 text-white focus:border-secondary disabled:opacity-50" 
            placeholder="DD-MM-YYYY"
            required 
          />
        </div>
      </div>
      
      {dlError && <p className="text-red-500 text-sm mt-2 mb-4">{dlError}</p>}
      
      <div className="mt-4">
        {isVerified ? (
          <div className="flex items-center text-green-500 font-bold mb-4">
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Driving Licence Verified
          </div>
        ) : (
          <button type="button" onClick={handleVerify} disabled={isVerifying || !dlNumber || !dob} className="px-4 py-2 bg-secondary text-[#020817] font-bold rounded-lg disabled:opacity-50 mb-4">
            {isVerifying ? 'Verifying...' : 'Verify Driving Licence'}
          </button>
        )}
      </div>

      {isVerified && (
        <div className="mt-4 border-t border-gray-800 pt-4">
          <FileUpload
            label="Upload Driving Licence Copy"
            description="Accepted formats: PDF, JPG, PNG (Max 5MB)"
            name="id_proof_document"
            accept=".jpg,.jpeg,.png,.pdf"
            isRequired={true}
            onChange={handleFileChange}
            currentFile={dlFile}
          />
        </div>
      )}
    </div>
  );
};

export default DrivingLicenceComponent;
