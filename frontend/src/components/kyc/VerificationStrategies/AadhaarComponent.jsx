import React, { useState } from 'react';
import { startAadhaarVerification } from '../../../services/api';
import FileUpload from '../FileUpload';

const AadhaarComponent = ({ quoteId, formData, onVerified, isCompany, aadhaarNumber, onAadhaarNumberChange, aadhaarErrorProp, aadhaarMessageProp, isVerified, setIsVerified }) => {
  const [aadhaarReferenceId, setAadhaarReferenceId] = useState(null);
  const [otp, setOtp] = useState('');
  const [verifyingAadhaar, setVerifyingAadhaar] = useState(false);
  const [aadhaarError, setAadhaarError] = useState(aadhaarErrorProp || '');
  const [aadhaarMessage, setAadhaarMessage] = useState(aadhaarMessageProp || '');
  const [aadhaarFile, setAadhaarFile] = useState(null);

  const handleGenerateOtp = async () => {
    try {
      setVerifyingAadhaar(true);
      setAadhaarError('');
      setAadhaarMessage('');
      
      if (!aadhaarNumber || aadhaarNumber.length !== 12) {
        setAadhaarError('Please enter a valid 12-digit Aadhaar number.');
        setVerifyingAadhaar(false);
        return;
      }
      
      const res = await startAadhaarVerification(quoteId, true, null, aadhaarNumber, formData, isCompany ? 'company' : 'individual');
      if (res.data?.aadhaar_reference_id) {
         setAadhaarReferenceId(res.data.aadhaar_reference_id);
         setAadhaarMessage('OTP has been sent to your Aadhaar linked mobile number.');
      }
    } catch (err) {
      setAadhaarError(err.response?.data?.message || 'Failed to generate OTP.');
    } finally {
      setVerifyingAadhaar(false);
    }
  };

  const handleVerifyOtp = async () => {
    try {
      setVerifyingAadhaar(true);
      setAadhaarError('');
      
      const res = await startAadhaarVerification(quoteId, true, otp);
      if (res.success) {
        setIsVerified(true);
        setAadhaarMessage('');
        onVerified('AADHAAR', aadhaarNumber, aadhaarFile); // Aadhaar doesn't force a front upload immediately in this step according to original flow, it happens later
      }
    } catch (err) {
      setAadhaarError(err.response?.data?.message || 'Failed to verify OTP.');
    } finally {
      setVerifyingAadhaar(false);
    }
  };

  const handleFileChange = (name, file) => {
    setAadhaarFile(file);
    if (isVerified) {
      onVerified('AADHAAR', aadhaarNumber, file);
    }
  };

  return (
    <div className="md:col-span-2 border border-gray-800 p-4 rounded-xl bg-[#020817]">
      <label className="block text-sm text-gray-400 mb-2">
        {isCompany ? 'Authorized Aadhaar Number *' : 'Aadhaar Number *'}
      </label>
      <input 
        type="text" 
        name={isCompany ? 'auth_aadhaar_number' : 'aadhaar_number'} 
        value={aadhaarNumber} 
        onChange={(e) => {
          const val = e.target.value.replace(/\D/g, '').slice(0, 12);
          e.target.value = val;
          onAadhaarNumberChange(e);
        }} 
        maxLength={12}
        pattern="[0-9]*"
        placeholder="Enter 12-digit Aadhaar Number"
        disabled={isVerified}
        className="w-full bg-[#0a1128] border border-gray-800 rounded-lg px-4 py-3 text-white focus:border-secondary disabled:opacity-50 tracking-wider font-mono" 
        required 
      />
      
      {aadhaarError && <p className="text-red-500 text-sm mt-2">{aadhaarError}</p>}
      {aadhaarMessage && <p className="text-secondary text-sm mt-2">{aadhaarMessage}</p>}
      
      <div className="mt-4">
        {isVerified ? (
          <div className="flex items-center text-green-500 font-bold">
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Aadhaar Verified
          </div>
        ) : (
          !aadhaarReferenceId ? (
            <button type="button" onClick={handleGenerateOtp} disabled={verifyingAadhaar} className="px-4 py-2 bg-secondary text-[#020817] font-bold rounded-lg disabled:opacity-50">
              {verifyingAadhaar ? 'Generating...' : 'Generate OTP'}
            </button>
          ) : (
            <div className="flex items-center gap-4">
              <input type="text" placeholder="6-digit OTP" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} className="bg-[#0a1128] border border-gray-800 rounded-lg px-4 py-2 text-white focus:border-secondary w-32 tracking-widest text-center" />
              <button type="button" onClick={handleVerifyOtp} disabled={verifyingAadhaar || otp.length !== 6} className="px-4 py-2 bg-secondary text-[#020817] font-bold rounded-lg disabled:opacity-50">
                {verifyingAadhaar ? 'Verifying...' : 'Verify OTP'}
              </button>
              {aadhaarError && <button type="button" onClick={handleGenerateOtp} className="text-xs text-blue-400 hover:underline">Resend</button>}
            </div>
          )
        )}
      </div>

      {isVerified && (
        <div className="mt-4 border-t border-gray-800 pt-4">
          <FileUpload
            label="Upload Aadhaar Copy"
            description="Accepted formats: PDF, JPG, PNG (Max 5MB)"
            name="id_proof_document"
            accept=".jpg,.jpeg,.png,.pdf"
            isRequired={true}
            onChange={handleFileChange}
            currentFile={aadhaarFile}
          />
        </div>
      )}
    </div>
  );
};

export default AadhaarComponent;
