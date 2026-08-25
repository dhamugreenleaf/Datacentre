import React, { useState, useEffect } from 'react';
import Pagination from '../../components/common/Pagination';
import DateFilter, { applyDateFilter } from '../../components/common/DateFilter';
import { Link } from 'react-router-dom';
import { getAdminKycVerifications, bulkDeleteVerifications } from '../../services/adminApi';

const AdminVerificationsPage = () => {
  const [verifications, setVerifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [dateFilter, setDateFilter] = useState({ type: 'all', value: '' });
  const [selectedIds, setSelectedIds] = useState([]);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);

  useEffect(() => {
    fetchVerifications();
  }, []);

  const fetchVerifications = async () => {
    try {
      const res = await getAdminKycVerifications();
      setVerifications(res.data || []);
    } catch (error) {
      console.error('Failed to fetch verifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredVerifications = verifications.filter(ver => applyDateFilter(ver.created_at, dateFilter));

  const totalPages = Math.ceil(filteredVerifications.length / itemsPerPage);
  const currentItems = filteredVerifications.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(currentItems.map(ver => ver.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} verification(s)? This action cannot be undone.`)) {
      return;
    }
    
    setIsDeletingBulk(true);
    try {
      const res = await bulkDeleteVerifications(selectedIds);
      if (res.success) {
        setSelectedIds([]);
        fetchVerifications();
      } else {
        alert('Failed to delete verifications');
      }
    } catch (error) {
      console.error('Bulk delete error:', error);
      alert('An error occurred during bulk delete');
    } finally {
      setIsDeletingBulk(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-white">Identity Verifications</h1>
        <div className="flex items-center gap-4">
          <DateFilter 
            filter={dateFilter} 
            setFilter={setDateFilter} 
            onFilterChange={() => setCurrentPage(1)} 
          />
          {selectedIds.length > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={isDeletingBulk}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {isDeletingBulk ? 'Deleting...' : `Delete (${selectedIds.length})`}
            </button>
          )}
        </div>
      </div>

      <div className="bg-[#0a1128] border border-gray-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto md:overflow-visible">
          {loading ? (
            <div className="flex justify-center p-8">
              <div className="w-8 h-8 border-4 border-secondary/20 border-t-secondary rounded-full animate-spin"></div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse block md:table min-w-full md:min-w-[900px]">
              <thead className="hidden md:table-header-group">
                <tr className="bg-[#020817]/50 border-b border-gray-800">
                  <th className="py-4 px-6 w-12">
                    <input 
                      type="checkbox" 
                      className="rounded border-gray-600 bg-gray-700 text-secondary focus:ring-secondary/50"
                      onChange={handleSelectAll}
                      checked={currentItems.length > 0 && selectedIds.length === currentItems.length}
                    />
                  </th>
                  <th className="py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">Customer</th>
                  <th className="py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">Quote ID</th>
                  <th className="py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">Submitted Date</th>
                  <th className="py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">ID Proof Type</th>
                  <th className="py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">ID Proof Status</th>
                  <th className="py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">Overall Status</th>
                  <th className="py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="block md:table-row-group divide-y md:divide-y divide-gray-800/50">
                {verifications.length === 0 ? (
                  <tr className="block md:table-row">
                    <td colSpan="8" className="block md:table-cell py-8 text-center text-gray-500">No verifications found.</td>
                  </tr>
                ) : (
                  currentItems.map(ver => (
                    <tr key={ver.id} className="block md:table-row bg-[#020817] md:bg-transparent border border-gray-800 md:border-b md:border-t-0 md:border-x-0 rounded-xl md:rounded-none mb-4 md:mb-0 p-4 md:p-0 hover:bg-gray-800/20 transition-colors relative">
                      <td className="block md:table-cell px-2 md:px-6 py-2 md:py-4">
                        <div className="flex items-center md:block">
                          <span className="md:hidden text-xs text-gray-500 uppercase font-semibold mr-3">Select</span>
                          <input 
                            type="checkbox" 
                            className="rounded border-gray-600 bg-gray-700 text-secondary focus:ring-secondary/50"
                            checked={selectedIds.includes(ver.id)}
                            onChange={() => handleSelectOne(ver.id)}
                          />
                        </div>
                      </td>
                      <td className="block md:table-cell px-2 md:px-6 py-2 md:py-4">
                        <span className="md:hidden text-xs text-gray-500 uppercase font-semibold block mb-1">Customer</span>
                        <div className="font-medium text-white">{ver.user?.name}</div>
                        <div className="text-sm text-gray-500">{ver.user?.email}</div>
                      </td>
                      <td className="block md:table-cell px-2 md:px-6 py-2 md:py-4">
                        <span className="md:hidden text-xs text-gray-500 uppercase font-semibold block mb-1">Quote ID</span>
                        <div className="font-medium text-gray-300">{ver.quote?.quote_number}</div>
                        <div className="text-xs text-gray-500">{ver.quote?.service_type}</div>
                      </td>
                      <td className="block md:table-cell px-2 md:px-6 py-2 md:py-4">
                        <span className="md:hidden text-xs text-gray-500 uppercase font-semibold block mb-1">Submitted Date</span>
                        <span className="text-sm text-gray-300">{new Date(ver.created_at).toLocaleDateString()}</span>
                      </td>
                      <td className="block md:table-cell px-2 md:px-6 py-2 md:py-4">
                        <span className="md:hidden text-xs text-gray-500 uppercase font-semibold block mb-1">ID Proof Type</span>
                        <span className="text-sm font-medium text-gray-300">{(ver.id_proof_type || 'AADHAAR').replace('_', ' ')}</span>
                      </td>
                      <td className="block md:table-cell px-2 md:px-6 py-2 md:py-4">
                        <span className="md:hidden text-xs text-gray-500 uppercase font-semibold block mb-1">ID Proof Status</span>
                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-bold border inline-block ${
                          ver.aadhaar_status === 'verified' || ver.overall_status === 'verified' ? 'bg-secondary/10 text-secondary border-secondary/20' :
                          ver.aadhaar_status === 'failed' || ver.overall_status === 'failed' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                          'bg-gray-500/10 text-gray-400 border-gray-500/20'
                        }`}>
                          {(ver.aadhaar_status || 'verified').toUpperCase()}
                        </span>
                      </td>
                      <td className="block md:table-cell px-2 md:px-6 py-2 md:py-4">
                        <span className="md:hidden text-xs text-gray-500 uppercase font-semibold block mb-1">Overall Status</span>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border inline-block ${
                          ver.overall_status === 'verified' ? 'bg-secondary/10 text-secondary border-secondary/30' :
                          ver.overall_status === 'partially_verified' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' :
                          ver.overall_status === 'failed' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                          'bg-gray-800 text-gray-300 border-gray-600'
                        }`}>
                          {ver.overall_status.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="block md:table-cell px-2 md:px-6 py-3 md:py-4 md:text-right border-t border-gray-800 md:border-none mt-3 md:mt-0">
                        <Link to={`/admin/verifications/${ver.id}`} className="inline-block px-4 py-2 bg-secondary/10 hover:bg-secondary/20 text-secondary md:bg-transparent md:hover:bg-transparent md:p-0 border border-secondary/20 md:border-none rounded-lg font-medium text-sm transition-colors w-full text-center md:w-auto">
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
        <Pagination 
          currentPage={currentPage} 
          totalPages={totalPages} 
          onPageChange={setCurrentPage} 
        />
      </div>
    </div>
  );
};

export default AdminVerificationsPage;
