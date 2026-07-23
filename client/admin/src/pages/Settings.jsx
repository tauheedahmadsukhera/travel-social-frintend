import React from 'react';
import { HiOutlineCog, HiOutlineShieldCheck } from 'react-icons/hi';

/**
 * Settings page — honest about unimplemented controls.
 * Do not show fake toggles that imply 2FA/session policies exist.
 */
const Settings = () => {
  return (
    <div className="space-y-8 animate-fade-in">
      <header>
        <h2 className="text-3xl font-black text-white">Platform Settings</h2>
        <p className="text-slate-400">Security policy controls for the admin console.</p>
      </header>

      <div className="glass p-8 space-y-6 max-w-2xl">
        <div className="flex items-center gap-4 border-b border-white/5 pb-4">
          <HiOutlineShieldCheck className="text-indigo-500 text-2xl" />
          <h3 className="text-xl font-bold">Security & Access</h3>
        </div>

        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
          <p className="font-bold text-amber-200">Not configured yet</p>
          <p className="text-sm text-slate-300">
            Two-factor authentication, session timeout policies, and cache purge
            are not implemented. Do not assume these controls are active.
          </p>
          <ul className="text-sm text-slate-400 list-disc pl-5 space-y-1">
            <li>Admin JWTs should be short-lived (server-enforced).</li>
            <li>Privilege changes require confirmation in User Management.</li>
            <li>Sensitive actions are audited via Admin Logs when available.</li>
          </ul>
        </div>
      </div>

      <div className="glass p-12 text-center space-y-4">
        <HiOutlineCog className="text-6xl text-slate-700 mx-auto" />
        <p className="text-slate-500 max-w-md mx-auto">
          Advanced configuration modules will appear here once backend support ships.
        </p>
      </div>
    </div>
  );
};

export default Settings;
