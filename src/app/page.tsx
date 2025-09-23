'use client';

import Image from 'next/image';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="bg-gradient-to-b from-[#3d5577] to-[#2a3b55] min-h-screen flex items-center justify-center px-4 py-8 lg:py-0">
      <div className="w-[650px] max-[700px]:w-[95%] flex flex-col">
        {/* Logo and Title */}
        <div className="flex items-center gap-4 max-[450px]:gap-2 mb-8 max-[450px]:mb-6 bg-[#5a6f8a]/40 rounded-full px-8 max-[450px]:px-4 py-4 max-[450px]:py-3 self-start">
          <Image
            src="/holoLogo_dark.svg"
            alt="Holoscopic Logo"
            width={65}
            height={65}
            className="invert max-[450px]:w-[40px] max-[450px]:h-[40px]"
          />
          <h1 className="text-white text-5xl max-[450px]:text-3xl font-medium">Holoscopic</h1>
        </div>

        {/* Main Content - In dark blue box */}
        <div className="bg-[#2a3b55] rounded-2xl py-4 md:py-8 lg:py-10 px-8 lg:px-12 mb-6 md:mb-8 lg:mb-10 max-[700px]:w-full">
          <h2 className="text-white font-light text-xl max-[450px]:text-lg min-[451px]:max-[700px]:text-2xl min-[701px]:text-[50px] leading-tight min-[701px]:leading-[1.1] mb-3 min-[701px]:mb-6">
            Group conversations<br/>
            that produce knowledge
          </h2>
          <p className="text-white/90 text-sm max-[450px]:text-xs min-[451px]:max-[700px]:text-lg min-[701px]:text-2xl font-normal">
            about how to have group conversations<br/>
            that advance our collective culture
          </p>
        </div>

        {/* Navigation Links - Outside the box */}
        <div className="flex flex-col max-[700px]:flex-col min-[701px]:flex-row gap-3 max-[700px]:gap-3 min-[701px]:gap-8 justify-center items-center w-full">
          <Link
            href="/admin"
            className="text-white hover:text-gray-200 text-lg max-[700px]:text-base min-[701px]:text-xl font-light underline underline-offset-4 text-center"
          >
            Create a map
          </Link>
          <Link
            href="/community"
            className="text-white hover:text-gray-200 text-lg max-[700px]:text-base min-[701px]:text-xl font-light underline underline-offset-4 text-center"
          >
            View Maps
          </Link>
          <a
            href="http://wiki.holoscopic.io"
            className="text-white hover:text-gray-200 text-lg max-[700px]:text-base min-[701px]:text-xl font-light underline underline-offset-4 text-center"
          >
            Wiki
          </a>
        </div>
      </div>
    </div>
  );
}