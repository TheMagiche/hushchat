'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  Laptop,
  Smartphone,
  Globe,
  Monitor,
  ExternalLink,
  Shield,
  Terminal,
  Sparkles,
} from 'lucide-react';

const RELEASES_URL = 'https://github.com/TheMagiche/hushchat/releases';
const LATEST_RELEASE = 'https://github.com/TheMagiche/hushchat/releases/latest';

interface DesktopPlatform {
  id: string;
  name: string;
  icon: React.ReactNode;
  tag: string;
  description: string;
  formats: { label: string; url: string; note?: string }[];
}

interface MobileWebPlatform {
  id: string;
  name: string;
  icon: React.ReactNode;
  tag: string;
  instructions: string;
  actionLabel: string;
  actionUrl: string;
}

export default function DownloadPage() {
  const [detectedPlatform, setDetectedPlatform] = useState<string>('macos');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = window.navigator.userAgent.toLowerCase();
    if (ua.includes('mac') && !ua.includes('iphone') && !ua.includes('ipad')) setDetectedPlatform('macos');
    else if (ua.includes('win')) setDetectedPlatform('windows');
    else if (ua.includes('android')) setDetectedPlatform('android');
    else if (ua.includes('iphone') || ua.includes('ipad')) setDetectedPlatform('ios');
    else if (ua.includes('linux')) setDetectedPlatform('linux');
  }, []);

  const desktopPlatforms: DesktopPlatform[] = [
    {
      id: 'macos',
      name: 'macOS',
      icon: <Laptop className="w-5 h-5 text-primary" />,
      tag: 'Apple Silicon & Intel',
      description: 'Native macOS application bundled with Tauri v2 and high-performance Rust core.',
      formats: [
        { label: 'Download .dmg (Universal Binary)', url: `${LATEST_RELEASE}` },
        { label: 'Homebrew (Coming Soon)', url: RELEASES_URL, note: 'brew install peerchat' },
      ],
    },
    // {
    //   id: 'windows',
    //   name: 'Windows',
    //   icon: <Monitor className="w-5 h-5 text-blue-400" />,
    //   tag: 'Windows 10 / 11 (64-bit)',
    //   description: 'Lightweight native Windows executable powered by Tauri v2 with background tray support.',
    //   formats: [
    //     { label: 'Download .msi Installer (64-bit)', url: `${LATEST_RELEASE}` },
    //     { label: 'Download Portable .exe', url: `${LATEST_RELEASE}` },
    //   ],
    // },
    {
      id: 'linux',
      name: 'Linux',
      icon: <Terminal className="w-5 h-5 text-amber-400" />,
      tag: 'x86_64 / ARM64',
      description: 'Universal AppImage and Debian package for Ubuntu, Fedora, Arch, and all major distributions.',
      formats: [
        { label: 'Download .AppImage', url: `${LATEST_RELEASE}` },
        { label: 'Download .deb Package', url: `${LATEST_RELEASE}` },
      ],
    },
  ];

  const mobileAndWebPlatforms: MobileWebPlatform[] = [
    {
      id: 'android',
      name: 'Android',
      icon: <Smartphone className="w-5 h-5 text-emerald-400" />,
      tag: 'Web App / PWA',
      instructions: 'Install via Web App (PWA) in Chrome, Firefox, or Edge. Tap the browser menu (⋮) and select "Add to Home screen" or "Install app".',
      actionLabel: 'Launch Web App on Android',
      actionUrl: '/',
    },
    {
      id: 'ios',
      name: 'iOS / iPadOS',
      icon: <Smartphone className="w-5 h-5 text-indigo-400" />,
      tag: 'Safari PWA',
      instructions: 'Open HushChat in Safari, tap the Share button (square with arrow), then select "Add to Home Screen" for a full-screen standalone app.',
      actionLabel: 'Launch Web App on iOS',
      actionUrl: '/',
    },
    {
      id: 'web',
      name: 'Web Browser',
      icon: <Globe className="w-5 h-5 text-purple-400" />,
      tag: 'All Modern Browsers',
      instructions: 'Runs client-side in Chrome, Firefox, Safari, Edge, and Brave with full WebRTC and WASM cryptography.',
      actionLabel: 'Open Web App',
      actionUrl: '/',
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-background p-4 md:p-8">
      <div className="max-w-4xl w-full mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <Link
            href="/"
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Download HushChat</h1>
            <p className="text-xs text-muted-foreground">
              Native desktop builds via Tauri v2 and mobile access via Progressive Web Apps.
            </p>
          </div>
        </div>

        {/* Hero banner */}
        <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-3 relative overflow-hidden">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 text-primary flex items-center justify-center mx-auto">
            <Download className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Zero-Server Communication on Every Device</h2>
          <p className="text-xs text-muted-foreground max-w-xl mx-auto leading-relaxed">
            All desktop builds bundle the exact same Rust WASM cryptographic engine and local IndexedDB store.
            No accounts, no phone numbers, and no central servers.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
            >
              View all GitHub Releases <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Section 1: Desktop Tauri Builds */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Laptop className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold tracking-tight">Desktop Applications (Tauri Builds)</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {desktopPlatforms.map((p) => {
              const isDetected = p.id === detectedPlatform;
              return (
                <div
                  key={p.id}
                  className={`bg-card border rounded-2xl p-5 flex flex-col justify-between space-y-4 transition-all ${
                    isDetected ? 'border-primary ring-1 ring-primary/30 shadow-lg shadow-primary/5' : 'border-border'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-secondary">{p.icon}</div>
                      <div>
                        <h3 className="font-semibold text-sm flex items-center gap-1.5">
                          {p.name}
                          {isDetected && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                              Detected OS
                            </span>
                          )}
                        </h3>
                        <p className="text-[10px] text-muted-foreground">{p.tag}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border/60">
                    {p.formats.map((fmt, idx) => (
                      <a
                        key={idx}
                        href={fmt.url}
                        target={fmt.url.startsWith('http') ? '_blank' : undefined}
                        rel={fmt.url.startsWith('http') ? 'noopener noreferrer' : undefined}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium border border-border transition-colors"
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <Download className="w-3.5 h-3.5 text-muted-foreground" />
                          {fmt.label}
                        </span>
                        {fmt.url.startsWith('http') && <ExternalLink className="w-3 h-3 text-muted-foreground" />}
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 2: Mobile & Web App (PWA) */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold tracking-tight">Mobile & Web (PWA / Web Infrastructure)</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {mobileAndWebPlatforms.map((p) => {
              const isDetected = p.id === detectedPlatform;
              return (
                <div
                  key={p.id}
                  className={`bg-card border rounded-2xl p-5 flex flex-col justify-between space-y-4 transition-all ${
                    isDetected ? 'border-primary ring-1 ring-primary/30 shadow-lg shadow-primary/5' : 'border-border'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-secondary">{p.icon}</div>
                      <div>
                        <h3 className="font-semibold text-sm flex items-center gap-1.5">
                          {p.name}
                          {isDetected && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                              Detected Device
                            </span>
                          )}
                        </h3>
                        <p className="text-[10px] text-muted-foreground">{p.tag}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{p.instructions}</p>
                  </div>

                  <div className="pt-2 border-t border-border/60">
                    <Link
                      href={p.actionUrl}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium border border-border transition-colors"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                        {p.actionLabel}
                      </span>
                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Security & Verification Note */}
        <div className="p-4 rounded-2xl bg-secondary/30 border border-border text-xs text-muted-foreground flex items-start gap-3">
          <Shield className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">Verified & Open Source</p>
            <p>
              All application binaries are built from open source source code with reproducible builds. SHA-256 checksums
              and GPG signatures are published alongside every release on GitHub.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
