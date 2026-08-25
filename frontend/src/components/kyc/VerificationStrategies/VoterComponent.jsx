import React, { useState } from 'react';
import { startVoterIdVerification } from '../../../services/api';
import FileUpload from '../FileUpload';

const VoterComponent = ({ quoteId, formData, onVerified, isCompany, voterIdNumber, onVoterIdNumberChange, isVerified, setIsVerified }) => {
  const [isVerifying, setIsVerifying] = useState(false);
  const [voterError, setVoterError] = useState('');
  const [voterFile, setVoterFile] = useState(null);

  const handleVerify = async () => {
    try {
      setIsVerifying(true);
      setVoterError('');
      
      const res = await startVoterIdVerification(quoteId, voterIdNumber, formData, isCompany ? 'company' : 'individual');
      if (res.success) {
        setIsVerified(true);
        onVerified('VOTER_ID', voterIdNumber, voterFile);
      }
    } catch (err) {
      setVoterError(err.response?.data?.message || 'Failed to verify Voter ID.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleFileChange = (name, file) => {
    setVoterFile(file);
    if (isVerified) {
      onVerified('VOTER_ID', voterIdNumber, file);
    }
  };

  return (
    <div className="md:col-span-2 border border-gray-800 p-4 rounded-xl bg-[#020817]">
      <h4 className="text-lg font-bold text-white mb-4">Voter ID Verification</h4>
      
      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-2">Voter ID (EPIC) Number *</label>
        <input 
          type="text" 
          value={voterIdNumber} 
          onChange={onVoterIdNumberChange} 
          disabled={isVerified}
          className="w-full bg-[#0a1128] border border-gray-800 rounded-lg px-4 py-3 text-white focus:border-secondary disabled:opacity-50" 
          placeholder="e.g. ABC1234567"
          required 
        />
      </div>
      
      {voterError && <p className="text-red-500 text-sm mt-2 mb-4">{voterError}</p>}
      
      <div className="mt-4">
        {isVerified ? (
          <div className="flex items-center text-green-500 font-bold mb-4">
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Voter ID Verified
          </div>
        ) : (
          <button type="button" onClick={handleVerify} disabled={isVerifying || !voterIdNumber} className="px-4 py-2 bg-secondary text-[#020817] font-bold rounded-lg disabled:opacity-50 mb-4">
            {isVerifying ? 'Verifying...' : 'Verify Voter ID'}
          </button>
        )}
      </div>

      {isVerified && (
        <div className="mt-4 border-t border-gray-800 pt-4">
          <FileUpload
            label="Upload Voter ID Copy"
            description="Accepted formats: PDF, JPG, PNG (Max 5MB)"
            name="id_proof_document"
            accept=".jpg,.jpeg,.png,.pdf"
            isRequired={true}
            onChange={handleFileChange}
            currentFile={voterFile}
          />
        </div>
      )}
    </div>
  );
};

export default VoterComponent;
