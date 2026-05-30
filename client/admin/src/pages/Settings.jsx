import React from 'react';
import { HiOutlineCog, HiOutlineDatabase, HiOutlineShieldCheck } from 'react-icons/hi';

const Settings = () => {
  return (
    <div className="space-y-8 animate-fade-in">
      <header>
        <h2 className="text-3xl font-black text-white">Platform Settings</h2>
        <p className="text-slate-400">Configure global platform behavior and security policies.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Security Settings */}
        <div className="glass p-8 space-y-6">
          <div className="flex items-center gap-4 border-b border-white/5 pb-4">
            <HiOutlineShieldCheck className="text-indigo-500 text-2xl" />
            <h3 className="text-xl font-bold">Security & Access</h3>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-white/5 rounded-xl">
              <div>
                <p className="font-bold text-white">Two-Factor Auth</p>
                <p className="text-xs text-slate-500">Require 2FA for all admin accounts.</p>
              </div>
              <div className="w-12 h-6 bg-slate-800 rounded-full relative">
                <div className="absolute left-1 top-1 w-4 h-4 bg-slate-600 rounded-full" />
              </div>
            </div>
            <div className="flex justify-between items-center p-4 bg-white/5 rounded-xl">
              <div>
                <p className="font-bold text-white">Session Timeout</p>
                <p className="text-xs text-slate-500">Auto logout after 30 minutes of inactivity.</p>
              </div>
              <select className="bg-slate-800 border-none rounded-lg text-xs p-2 text-white">
                <option>30 Min</option>
                <option>1 Hour</option>
                <option>Never</option>
              </select>
            </div>
          </div>
        </div>

        {/* Database Settings */}
        <div className="glass p-8 space-y-6">
          <div className="flex items-center gap-4 border-b border-white/5 pb-4">
            <HiOutlineDatabase className="text-emerald-500 text-2xl" />
            <h3 className="text-xl font-bold">Data & Performance</h3>
          </div>
          <div className="space-y-4">
            <div className="p-4 bg-white/5 rounded-xl">
              <p className="font-bold text-white mb-1">Cache Level</p>
              <input type="range" className="w-full accent-indigo-500" />
              <div className="flex justify-between text-[10px] text-slate-500 uppercase font-black tracking-widest mt-2">
                <span>Direct DB</span>
                <span>Balanced</span>
                <span>Max Cache</span>
              </div>
            </div>
            <button className="w-full py-3 border border-red-500/50 text-red-500 rounded-xl font-bold hover:bg-red-500/10 transition-all">
              Purge All Redis Cache
            </button>
          </div>
        </div>
      </div>

      <div className="glass p-12 text-center space-y-4">
        <HiOutlineCog className="text-6xl text-slate-700 mx-auto animate-spin-slow" />
        <p className="text-slate-500 italic max-w-md mx-auto">
          Advanced configuration modules are currently being synchronized with the production cluster.
        </p>
      </div>
    </div>
  );
};

export default Settings;
