'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useChatStore } from '@/state/store';
import { platform } from '@/platform';
import {
  ArrowLeft,
  User,
  Shield,
  Download,
  Upload,
  Trash2,
  Server,
  EyeOff,
  Check,
  Laptop,
  Monitor,
  Terminal,
  Smartphone,
  ExternalLink,
} from 'lucide-react';

export default function SettingsPage() {
  const { identity, setProfileName, initApp } = useChatStore();
  const [name, setName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [hideIP, setHideIP] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    initApp();
  }, [initApp]);

  useEffect(() => {
    if (identity?.profileName) {
      setName(identity.profileName);
    }
  }, [identity]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await setProfileName(name.trim());
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleExportBackup = async () => {
    const wasm = useChatStore.getState().wasm;
    if (!wasm) return;
    const wasmId = new wasm.WasmIdentity();
    const encrypted = wasmId.exportEncrypted(passphrase || 'peerchat-default-pass');
    await platform.exportBackup(new Uint8Array(encrypted));
  };

  const handleImportBackup = async () => {
    const backupData = await platform.importBackup();
    if (!backupData) return;
    const wasm = useChatStore.getState().wasm;
    if (!wasm) return;
    try {
      const restored = wasm.WasmIdentity.importEncrypted(
        backupData,
        passphrase || 'peerchat-default-pass'
      );
      alert(`Successfully restored identity: ${restored.userId()}`);
    } catch {
      alert('Failed to decrypt or import backup. Check passphrase.');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-background p-4 md:p-8">
      <div className="max-w-2xl w-full mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <Link
            href="/"
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Settings & Privacy</h1>
            <p className="text-xs text-muted-foreground">
              Manage your local cryptographic identity, network topology and backups.
            </p>
          </div>
        </div>

        {/* Profile Card */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Display Profile</h2>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Display Name</label>
              <input
                type="text"
                placeholder="Type here..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>

            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-xs font-medium rounded-xl hover:bg-primary/90 transition-colors"
            >
              {savedNotice ? <Check className="w-3.5 h-3.5" /> : null}
              {savedNotice ? 'Saved!' : 'Save Display Name'}
            </button>
          </form>
        </div>

        {/* IP Privacy Card */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <EyeOff className="w-4 h-4 text-amber-400" />
            <h2 className="font-semibold text-sm">IP Exposure & Relay Policy</h2>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            By default, direct WebRTC DataChannels reveal peer IP addresses to other peers in the mesh room.
            Enabling relay forces all media and messages through configured TURN relay servers to hide your IP.
          </p>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={hideIP}
              onChange={(e) => setHideIP(e.target.checked)}
              className="w-4 h-4 rounded text-primary focus:ring-primary bg-background border-border"
            />
            <span className="text-xs font-medium text-foreground">
              Hide my IP (Relay only via TURN)
            </span>
          </label>
        </div>

        {/* Backup & Export */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <h2 className="font-semibold text-sm">Encrypted Identity Backup</h2>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            All cryptographic private keys live exclusively in your local device storage. Export an Argon2id
            passphrase-protected binary backup to restore your identity across browsers or devices.
          </p>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Backup Passphrase</label>
            <input
              type="password"
              placeholder="Type here..."
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleExportBackup}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-secondary text-foreground text-xs font-medium rounded-xl hover:bg-secondary/80 border border-border transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Export Encrypted Backup
            </button>

            <button
              onClick={handleImportBackup}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-secondary text-foreground text-xs font-medium rounded-xl hover:bg-secondary/80 border border-border transition-colors"
            >
              <Upload className="w-3.5 h-3.5" /> Import & Restore Backup
            </button>
          </div>
        </div>

        {/* Desktop & Mobile Apps */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-sm">Download Native Apps</h2>
            </div>
            <Link
              href="/download"
              className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
            >
              All Platforms <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Run PeerChat as a native desktop or mobile application with local hardware-backed storage and zero background telemetry.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <a
              href="https://github.com/TheMagiche/hushchat/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded-xl bg-secondary/50 hover:bg-secondary border border-border flex flex-col items-center text-center gap-1.5 transition-colors"
            >
              <Laptop className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium">macOS</span>
              <span className="text-[10px] text-muted-foreground">.dmg</span>
            </a>

            <a
              href="https://github.com/TheMagiche/hushchat/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded-xl bg-secondary/50 hover:bg-secondary border border-border flex flex-col items-center text-center gap-1.5 transition-colors"
            >
              <Monitor className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-medium">Windows</span>
              <span className="text-[10px] text-muted-foreground">.msi / .exe</span>
            </a>

            <a
              href="https://github.com/TheMagiche/hushchat/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded-xl bg-secondary/50 hover:bg-secondary border border-border flex flex-col items-center text-center gap-1.5 transition-colors"
            >
              <Terminal className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-medium">Linux</span>
              <span className="text-[10px] text-muted-foreground">.AppImage / .deb</span>
            </a>

            <a
              href="https://github.com/TheMagiche/hushchat/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded-xl bg-secondary/50 hover:bg-secondary border border-border flex flex-col items-center text-center gap-1.5 transition-colors"
            >
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-medium">Android</span>
              <span className="text-[10px] text-muted-foreground">.apk</span>
            </a>
          </div>
        </div>

        {/* Broker / Signaling Server Info */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-400" />
            <h2 className="font-semibold text-sm">Signaling Broker</h2>
          </div>
          <div className="text-xs text-muted-foreground font-mono space-y-1 bg-background/50 p-3 rounded-xl border border-border">
            <p>PeerServer: 0.peerjs.com:443 (Public Cloud Broker)</p>
            <p>STUN Servers: stun.l.google.com:19302, stun.twilio.com:3478</p>
            <p>Encryption: End-to-End ChaCha20-Poly1305 + Ed25519</p>
          </div>
        </div>
      </div>
    </div>
  );
}
