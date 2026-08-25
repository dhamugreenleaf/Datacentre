import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

const NotificationsTab = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const getApiConfig = () => {
    const token = localStorage.getItem('token');
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications?limit=20', getApiConfig());
      if (res.data?.success) {
        setNotifications(res.data.data);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const getNotificationTargetUrl = (notif) => {
    if (!notif) return '/dashboard/profile';

    const rawUrl = notif.action_url || notif.actionUrl;
    if (rawUrl) {
      if (rawUrl.startsWith('/admin')) {
        if (rawUrl.includes('/enquiries')) return '/dashboard/enquiries';
        if (rawUrl.includes('/quotes')) return '/dashboard/quotes';
        if (rawUrl.includes('/users')) return '/dashboard/profile';
        if (rawUrl.includes('/payments')) return '/dashboard/payments';
        if (rawUrl.includes('/services')) return '/dashboard/services';
        if (rawUrl.includes('/verifications')) return '/dashboard/verification';
        return '/dashboard/profile';
      }
      return rawUrl;
    }

    const moduleName = (notif.related_module || notif.relatedModule || '').toLowerCase();
    const cat = (notif.category || '').toLowerCase();
    const title = (notif.title || '').toLowerCase();

    if (moduleName === 'enquiry' || cat === 'sales requests' || cat === 'enquiry' || title.includes('enquiry') || title.includes('response') || title.includes('message')) {
      return '/dashboard/enquiries';
    }
    if (moduleName === 'quote' || cat === 'quotes' || title.includes('quote')) {
      return '/dashboard/quotes';
    }
    if (moduleName === 'user' || cat === 'account' || cat === 'system' || cat === 'security' || title.includes('profile') || title.includes('welcome') || title.includes('account')) {
      return '/dashboard/profile';
    }
    if (moduleName === 'verification' || cat === 'verification' || cat === 'kyc' || title.includes('verification') || title.includes('kyc')) {
      return '/dashboard/verification';
    }
    if (moduleName === 'payment' || cat === 'payments' || title.includes('payment')) {
      return '/dashboard/payments';
    }
    if (moduleName === 'service' || cat === 'services' || title.includes('service')) {
      return '/dashboard/services';
    }
    return '/dashboard/profile';
  };

  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      const res = await api.put(`/notifications/${id}/read`, {}, getApiConfig());
      if (res.data?.success) {
        setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
      }
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const res = await api.put('/notifications/read-all', {}, getApiConfig());
      if (res.data?.success) {
        setNotifications(notifications.map(n => ({ ...n, is_read: true })));
      }
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to clear all notifications?')) {
      try {
        const res = await api.delete('/notifications/clear-all', getApiConfig());
        if (res.data?.success) {
          setNotifications([]);
        }
      } catch (err) {
        console.error('Error clearing notifications:', err);
      }
    }
  };

  const handleNotificationClick = (notif) => {
    if (!notif.is_read) {
      handleMarkAsRead(notif.id);
    }
    const target = getNotificationTargetUrl(notif);
    if (target) {
      navigate(target);
    }
  };

  if (loading) return <div className="text-slate-400">Loading notifications...</div>;

  if (notifications.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
        <h3 className="text-xl font-bold text-white mb-2">No Notifications</h3>
        <p className="text-slate-400">You are all caught up.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
        <h3 className="text-xl font-bold text-white">Notifications</h3>
        {notifications.length > 0 && (
          <div className="flex gap-3">
            <button 
              onClick={handleMarkAllAsRead}
              className="text-sm text-secondary hover:text-white transition-colors"
            >
              Mark all as read
            </button>
            <button 
              onClick={handleClearAll}
              className="text-sm text-red-400 hover:text-red-300 transition-colors"
            >
              Clear all
            </button>
          </div>
        )}
      </div>
      <div className="space-y-4">
        {notifications.map((notif) => (
          <div 
            key={notif.id} 
            onClick={() => handleNotificationClick(notif)}
            className={`p-4 rounded-xl border cursor-pointer transition-all hover:border-slate-700 ${notif.is_read ? 'bg-slate-950 border-slate-800' : 'bg-slate-900 border-secondary/30 shadow-[0_0_15px_rgba(34,197,94,0.1)]'}`}
          >
            <div className="flex justify-between items-start">
              <h4 className={`font-bold ${notif.is_read ? 'text-slate-300' : 'text-white'}`}>{notif.title}</h4>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">{new Date(notif.created_at).toLocaleDateString()}</span>
                {!notif.is_read && (
                  <button 
                    onClick={(e) => handleMarkAsRead(notif.id, e)}
                    className="w-2 h-2 rounded-full bg-secondary"
                    title="Mark as read"
                  ></button>
                )}
              </div>
            </div>
            <p className={`text-sm mt-1 ${notif.is_read ? 'text-slate-500' : 'text-slate-300'}`}>{notif.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NotificationsTab;
