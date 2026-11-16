'use client';

import { useState } from 'react';
import { api } from '../lib/api';

/** Edit name/username/email and change password. Used by sellers and customers. */
export default function ProfileForm({ user, onSaved, cardClass = 'card', inputClass = 'dash-input', buttonClass = 'dash-btn' }) {
  const [profile, setProfile] = useState({ name: user.name ?? '', username: user.username ?? '', email: user.email ?? '' });
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });
  const [profileMsg, setProfileMsg] = useState(null);
  const [pwMsg, setPwMsg] = useState(null);
  const [busy, setBusy] = useState('');

  const saveProfile = async (e) => {
    e.preventDefault();
    setBusy('profile');
    const result = await api('update_profile', profile);
    setBusy('');
    setProfileMsg(result.success ? { ok: true, text: 'Profile saved.' } : { ok: false, text: result.message });
    if (result.success) onSaved?.();
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (pw.new_password !== pw.confirm) {
      setPwMsg({ ok: false, text: 'The new passwords do not match.' });
      return;
    }
    setBusy('password');
    const result = await api('change_password', { current_password: pw.current_password, new_password: pw.new_password });
    setBusy('');
    setPwMsg(result.success ? { ok: true, text: 'Password changed.' } : { ok: false, text: result.message });
    if (result.success) setPw({ current_password: '', new_password: '', confirm: '' });
  };

  const field = (state, setState, key, label, props = {}) => (
    <label>
      {label}
      <input
        className={inputClass}
        value={state[key]}
        onChange={(e) => setState((s) => ({ ...s, [key]: e.target.value }))}
        {...props}
      />
    </label>
  );

  return (
    <div className="profile-grid">
      <form className={`${cardClass} settings-form`} onSubmit={saveProfile}>
        <h3>Profile</h3>
        {field(profile, setProfile, 'name', 'Full name', { maxLength: 120, autoComplete: 'name' })}
        {field(profile, setProfile, 'username', 'Username', { maxLength: 30, autoComplete: 'username' })}
        {field(profile, setProfile, 'email', 'Email', { type: 'email', autoComplete: 'email' })}
        <div>
          <button className={buttonClass} type="submit" disabled={busy === 'profile'}>
            {busy === 'profile' ? 'Saving…' : 'Save profile'}
          </button>
          {profileMsg && <span className={profileMsg.ok ? 'form-ok' : 'form-err'}>{profileMsg.text}</span>}
        </div>
      </form>

      <form className={`${cardClass} settings-form`} onSubmit={savePassword}>
        <h3>Change password</h3>
        {field(pw, setPw, 'current_password', 'Current password', { type: 'password', autoComplete: 'current-password' })}
        {field(pw, setPw, 'new_password', 'New password', { type: 'password', autoComplete: 'new-password', minLength: 6 })}
        {field(pw, setPw, 'confirm', 'Repeat new password', { type: 'password', autoComplete: 'new-password' })}
        <div>
          <button className={buttonClass} type="submit" disabled={busy === 'password'}>
            {busy === 'password' ? 'Saving…' : 'Change password'}
          </button>
          {pwMsg && <span className={pwMsg.ok ? 'form-ok' : 'form-err'}>{pwMsg.text}</span>}
        </div>
      </form>
    </div>
  );
}
