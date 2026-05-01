import React, { useEffect, useState } from 'react';
import { 
  HiOutlineUsers, 
  HiOutlinePhotograph, 
  HiOutlineExclamation, 
  HiOutlineTrendingUp 
} from 'react-icons/hi';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { adminAPI } from '../services/adminService';
import { formatDistanceToNow } from 'date-fns';

const StatsCard = ({ title, value, icon, trend, color, loading }) => (
  <div className="glass p-6 flex flex-col gap-4 animate-fade-in transition-all hover:scale-[1.02] cursor-default">
    <div className="flex justify-between items-start">
      <div className={`p-3 rounded-2xl bg-${color}-500/20 text-${color}-400 text-2xl shadow-lg shadow-${color}-500/10`}>
        {icon}
      </div>
      {!loading && (
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${trend?.startsWith('+') ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
          {trend || '0%'}
        </span>
      )}
    </div>
    <div>
      <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">{title}</p>
      {loading ? (
        <div className="h-9 w-24 bg-white/5 animate-pulse rounded-lg mt-1" />
      ) : (
        <h3 className="text-3xl font-extrabold mt-1 tracking-tight">{value}</h3>
      )}
    </div>
  </div>
);

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, activityRes] = await Promise.all([
          adminAPI.getDashboardAnalytics(),
          adminAPI.getRecentActivity()
        ]);
        
        if (statsRes.success) setStats(statsRes.data);
        if (activityRes.success) setActivity(activityRes.data);
      } catch (err) {
        console.error('Failed to fetch dashboard data', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="space-y-10 pb-10">
      <header className="flex flex-col gap-2">
        <h2 className="text-4xl font-black tracking-tighter text-white">Dashboard</h2>
        <p className="text-slate-400 font-medium">Real-time performance of your Travel Social ecosystem.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard 
          title="Total Users" 
          value={stats?.totalUsers?.toLocaleString()} 
          icon={<HiOutlineUsers />} 
          trend="+12.4%" 
          color="indigo"
          loading={loading}
        />
        <StatsCard 
          title="Daily Posts" 
          value={stats?.totalPosts?.toLocaleString()} 
          icon={<HiOutlinePhotograph />} 
          trend="+5.1%" 
          color="emerald"
          loading={loading}
        />
        <StatsCard 
          title="Active Reports" 
          value={stats?.activeReports} 
          icon={<HiOutlineExclamation />} 
          trend="-15%" 
          color="orange"
          loading={loading}
        />
        <StatsCard 
          title="Retention Rate" 
          value="94.2%" 
          icon={<HiOutlineTrendingUp />} 
          trend="+2.1%" 
          color="blue"
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 glass p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
             <HiOutlineTrendingUp className="text-9xl text-indigo-500" />
          </div>
          <div className="flex justify-between items-center mb-10">
            <div>
              <h3 className="text-2xl font-bold tracking-tight">Growth Analytics</h3>
              <p className="text-slate-400 text-sm">New users joined over the last 7 days</p>
            </div>
            <div className="flex gap-2">
              <span className="w-3 h-3 rounded-full bg-indigo-500 mt-1" />
              <span className="text-sm font-bold text-slate-300">New Users</span>
            </div>
          </div>
          
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.growthData || []}>
                <defs>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#64748b" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false}
                  dy={10}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false}
                  dx={-10}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#0f172a', 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    borderRadius: '16px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                  }}
                  itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="users" 
                  stroke="#6366f1" 
                  fillOpacity={1} 
                  fill="url(#colorUsers)" 
                  strokeWidth={4} 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass p-8 flex flex-col">
          <h3 className="text-2xl font-bold tracking-tight mb-8">Admin Feed</h3>
          <div className="space-y-6 flex-1 overflow-y-auto max-h-[450px] pr-2 custom-scrollbar">
            {activity.length > 0 ? activity.map((log) => (
              <div key={log._id} className="flex items-start gap-4 p-3 rounded-2xl hover:bg-white/5 transition-colors group">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 p-[2px] shadow-lg">
                  <div className="w-full h-full rounded-[14px] bg-slate-900 overflow-hidden">
                    <img 
                      src={log.adminId?.avatar || `https://ui-avatars.com/api/?name=${log.adminId?.displayName || 'A'}`} 
                      alt="admin" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors">
                    {log.adminId?.displayName || 'System'}
                  </p>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    {log.action.replace(/_/g, ' ').toLowerCase()}
                  </p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mt-2 tracking-widest">
                    {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            )) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
                <div className="p-4 rounded-full bg-white/5 text-3xl">📭</div>
                <p className="text-sm font-medium">No recent activity found</p>
              </div>
            )}
          </div>
          <button className="mt-8 w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-500/20 active:scale-95">
            View All Logs
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
