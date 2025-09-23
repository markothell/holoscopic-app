'use client';

import Image from 'next/image';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="bg-gradient-to-b from-[#3d5577] to-[#2a3b55] min-h-screen flex items-center justify-center px-8">
      <div className="max-w-5xl">
        {/* Logo and Title */}
        <div className="flex items-center gap-4 mb-3 bg-[#5a6f8a]/40 rounded-full px-8 py-4 inline-flex">
          <Image
            src="/holoLogo_dark.svg"
            alt="Holoscopic Logo"
            width={65}
            height={65}
            className="invert"
          />
          <h1 className="text-white text-5xl font-medium">Holoscopic</h1>
        </div>

        {/* Main Content - First indented section */}
        <div className="flex items-center ml-20 mb-2">
          {/* Arrow mark 1 */}
          <Image
            src="/rArrow.svg"
            alt=""
            width={60}
            height={60}
            className="opacity-30 mr-4 -ml-16 brightness-0 invert"
          />
          <h2 className="text-white font-light" style={{ fontSize: '50px', lineHeight: '1.1' }}>
            Group conversations<br/>
            that produce knowledge
          </h2>
        </div>

        {/* Second indented section */}
        <div className="flex items-center ml-40 mb-12">
          {/* Arrow mark 2 */}
          <Image
            src="/rArrow.svg"
            alt=""
            width={60}
            height={60}
            className="opacity-30 mr-4 -ml-16 brightness-0 invert"
          />
          <p className="text-white/90 text-2xl font-normal">
            about how to have group conversations<br/>
            that advance our collective culture
          </p>
        </div>

        {/* Navigation Links - In dark container */}
        <div className="w-full bg-[#2a3b55] rounded-2xl py-6 px-8">
          <div className="flex gap-8 justify-center">
          <Link
            href="/admin"
            className="text-white hover:text-gray-200 text-xl font-light underline underline-offset-4"
          >
            Create a map
          </Link>
          <Link
            href="/community"
            className="text-white hover:text-gray-200 text-xl font-light underline underline-offset-4"
          >
            View Maps
          </Link>
          <a
            href="http://wiki.holoscopic.io"
            className="text-white hover:text-gray-200 text-xl font-light underline underline-offset-4"
          >
            Wiki
          </a>
          </div>
        </div>
      </div>
    </div>
  );
}