'use client';

import Image from 'next/image';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
      <div className="text-center">
        <Image
          src="/holoLogo_dark.svg"
          alt="Holoscopic Logo"
          width={80}
          height={80}
          className="mx-auto mb-6"
        />
        <h1 className="text-4xl font-bold text-white mb-4">Holoscopic</h1>
        <p className="text-gray-400 mb-8">Interactive Mapping Platform</p>
        <a
          href="http://holoscopic.io"
          className="inline-block px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
        >
          Visit Holoscopic Wiki →
        </a>
      </div>
    </div>
  );
}