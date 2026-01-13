'use client';

import Image from 'next/image';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="bg-gradient-to-b from-[#3d5577] to-[#2a3b55] min-h-screen px-4 py-12">
      <div className="max-w-4xl mx-auto">
        {/* Logo and Title */}
        <div className="flex items-center gap-4 mb-12">
          <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center">
            <Image
              src="/holoLogo_dark.svg"
              alt="Holoscopic Logo"
              width={40}
              height={40}
              className="invert"
            />
          </div>
          <h1 className="text-white text-4xl font-semibold">Holoscopic</h1>
        </div>

        {/* Hero Section */}
        <div className="mb-16">
          <h2 className="text-white text-5xl md:text-6xl font-normal leading-tight mb-6">
            Map your community&apos;s collective mind
          </h2>
          <p className="text-white/80 text-xl md:text-2xl leading-relaxed mb-8">
            Turn group conversations into interactive visualizations that reveal shared values, tensions, and pathways forward.
          </p>

          <div className="flex flex-wrap gap-4 mb-8">
            <Link
              href="/activities"
              className="bg-white text-[#2a3b55] px-8 py-4 rounded-lg font-semibold text-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
            >
              Try a Live Map
            </Link>
            <Link
              href="/login"
              className="bg-white/10 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-white/20 transition-all"
            >
              Create Account
            </Link>
          </div>
        </div>

        {/* Example Visual */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-8 mb-16 text-center">
          <svg width="100%" height="200" viewBox="0 0 300 200" className="max-w-md mx-auto">
            <line x1="40" y1="160" x2="260" y2="160" stroke="rgba(255,255,255,0.3)" strokeWidth="2"/>
            <line x1="40" y1="160" x2="40" y2="40" stroke="rgba(255,255,255,0.3)" strokeWidth="2"/>

            <circle cx="80" cy="140" r="6" fill="#6BCF7F" opacity="0.8"/>
            <circle cx="120" cy="110" r="6" fill="#6BCF7F" opacity="0.8"/>
            <circle cx="150" cy="90" r="6" fill="#F4A460" opacity="0.8"/>
            <circle cx="180" cy="120" r="6" fill="#F4A460" opacity="0.8"/>
            <circle cx="210" cy="80" r="6" fill="#ED6A5A" opacity="0.8"/>
            <circle cx="100" cy="130" r="6" fill="#6BCF7F" opacity="0.8"/>
            <circle cx="190" cy="100" r="6" fill="#F4A460" opacity="0.8"/>
            <circle cx="230" cy="70" r="6" fill="#ED6A5A" opacity="0.8"/>

            <text x="150" y="185" fill="rgba(255,255,255,0.5)" fontSize="12" textAnchor="middle">Individual → Collective</text>
            <text x="20" y="100" fill="rgba(255,255,255,0.5)" fontSize="12" textAnchor="middle" transform="rotate(-90 20 100)">Material → Spiritual</text>
          </svg>
          <p className="mt-4 text-sm text-white/60">Example: &quot;What is prosperity?&quot; mapping activity</p>
        </div>

        {/* Feature Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <div className="bg-white/5 p-6 rounded-xl border border-white/10">
            <div className="text-3xl mb-3">📊</div>
            <h3 className="text-white text-xl font-semibold mb-3">Active Maps</h3>
            <p className="text-white/70 text-base leading-relaxed">
              Join ongoing conversations about prosperity, social media, parenting, and more. See where others stand and add your perspective.
            </p>
          </div>
          <div className="bg-white/5 p-6 rounded-xl border border-white/10">
            <div className="text-3xl mb-3">🎯</div>
            <h3 className="text-white text-xl font-semibold mb-3">Your Communities</h3>
            <p className="text-white/70 text-base leading-relaxed">
              Create private mapping activities for your team, organization, or friend group. Track how perspectives evolve over time.
            </p>
          </div>
          <div className="bg-white/5 p-6 rounded-xl border border-white/10">
            <div className="text-3xl mb-3">🔧</div>
            <h3 className="text-white text-xl font-semibold mb-3">Design Your Own</h3>
            <p className="text-white/70 text-base leading-relaxed">
              Build custom mapping activities with your own questions and frameworks. Export insights as reusable templates.
            </p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex justify-around mb-16 bg-white/5 rounded-xl p-8 border border-white/10">
          <div className="text-center">
            <div className="text-4xl font-bold text-white mb-2">50+</div>
            <div className="text-sm text-white/60">Active Maps</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-white mb-2">500+</div>
            <div className="text-sm text-white/60">Participants</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-white mb-2">10+</div>
            <div className="text-sm text-white/60">Communities</div>
          </div>
        </div>

        {/* Cross-link to Wiki */}
        <div className="bg-white/8 p-6 rounded-xl border-l-4 border-white/30">
          <h4 className="text-white text-lg font-semibold mb-2">🧠 Want to understand the methodology?</h4>
          <p className="text-white/70 mb-4 leading-relaxed">
            Learn how social mapping works, explore the theory behind collective intelligence, and contribute to the design of new activities.
          </p>
          <a
            href="http://wiki.holoscopic.io"
            className="text-white hover:text-gray-200 font-medium underline underline-offset-4"
          >
            Visit the Holoscopic Wiki →
          </a>
        </div>

        {/* Footer Navigation */}
        <div className="mt-12 pt-8 border-t border-white/10 flex flex-wrap gap-6 justify-center text-sm">
          <Link href="/activities" className="text-white/70 hover:text-white transition-colors">
            Browse Activities
          </Link>
          <Link href="/dashboard" className="text-white/70 hover:text-white transition-colors">
            Dashboard
          </Link>
          <a href="http://wiki.holoscopic.io/index.php?title=Special:Contact" className="text-white/70 hover:text-white transition-colors">
            Contact
          </a>
          <a href="http://wiki.holoscopic.io" className="text-white/70 hover:text-white transition-colors">
            Documentation
          </a>
        </div>
      </div>
    </div>
  );
}