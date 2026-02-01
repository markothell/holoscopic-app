'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';

// Animated constellation dot component
function ConstellationDot({
  x, y, delay, size = 6, color = '#7dd3fc'
}: {
  x: number; y: number; delay: number; size?: number; color?: string
}) {
  return (
    <circle
      cx={x}
      cy={y}
      r={size}
      fill={color}
      className="animate-pulse"
      style={{
        animationDelay: `${delay}ms`,
        animationDuration: '3s',
        filter: `drop-shadow(0 0 ${size}px ${color})`
      }}
    />
  );
}

// Interactive particle field background
function ParticleField() {
  const [particles, setParticles] = useState<Array<{id: number; x: number; y: number; vx: number; vy: number; size: number; opacity: number}>>([]);
  const animationRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Initialize particles
    const initialParticles = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      vx: (Math.random() - 0.5) * 0.02,
      vy: (Math.random() - 0.5) * 0.02,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.5 + 0.2
    }));
    setParticles(initialParticles);

    const animate = () => {
      setParticles(prev => prev.map(p => ({
        ...p,
        x: ((p.x + p.vx) + 100) % 100,
        y: ((p.y + p.vy) + 100) % 100
      })));
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full bg-sky-400"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            boxShadow: `0 0 ${p.size * 2}px rgba(125, 211, 252, 0.5)`
          }}
        />
      ))}
    </div>
  );
}

// Animated connection lines between nodes
function ConnectionLines() {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
      <defs>
        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(125, 211, 252, 0.3)" />
          <stop offset="50%" stopColor="rgba(167, 139, 250, 0.2)" />
          <stop offset="100%" stopColor="rgba(251, 146, 60, 0.3)" />
        </linearGradient>
      </defs>
      {/* Animated curved paths suggesting network connections */}
      <path
        d="M0,30 Q25,50 50,35 T100,45"
        stroke="url(#lineGradient)"
        strokeWidth="1"
        fill="none"
        className="animate-pulse"
        style={{ animationDuration: '4s' }}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M0,60 Q30,40 60,55 T100,50"
        stroke="url(#lineGradient)"
        strokeWidth="1"
        fill="none"
        className="animate-pulse"
        style={{ animationDuration: '5s', animationDelay: '1s' }}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M0,80 Q40,70 70,85 T100,75"
        stroke="url(#lineGradient)"
        strokeWidth="1"
        fill="none"
        className="animate-pulse"
        style={{ animationDuration: '6s', animationDelay: '2s' }}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// Hero visualization - an interactive idea map
function HeroVisualization() {
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);

  const nodes = [
    { id: 1, x: 120, y: 80, label: 'Community', color: '#7dd3fc', size: 14 },
    { id: 2, x: 280, y: 120, label: 'Innovation', color: '#a78bfa', size: 12 },
    { id: 3, x: 200, y: 200, label: 'Learning', color: '#fb923c', size: 16 },
    { id: 4, x: 80, y: 180, label: 'Values', color: '#4ade80', size: 10 },
    { id: 5, x: 320, y: 220, label: 'Change', color: '#f472b6', size: 11 },
    { id: 6, x: 180, y: 60, label: 'Ideas', color: '#facc15', size: 9 },
    { id: 7, x: 350, y: 80, label: 'Systems', color: '#22d3d1', size: 13 },
  ];

  const connections = [
    [1, 3], [1, 4], [2, 3], [2, 5], [3, 4], [3, 5], [1, 6], [2, 7], [6, 7], [6, 2]
  ];

  return (
    <div className="relative w-full max-w-lg mx-auto">
      <svg viewBox="0 0 420 280" className="w-full h-auto">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="white" stopOpacity="0.8"/>
            <stop offset="100%" stopColor="white" stopOpacity="0"/>
          </radialGradient>
        </defs>

        {/* Connection lines */}
        {connections.map(([from, to], i) => {
          const fromNode = nodes.find(n => n.id === from)!;
          const toNode = nodes.find(n => n.id === to)!;
          const isHighlighted = hoveredNode === from || hoveredNode === to;
          return (
            <line
              key={i}
              x1={fromNode.x}
              y1={fromNode.y}
              x2={toNode.x}
              y2={toNode.y}
              stroke={isHighlighted ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.15)'}
              strokeWidth={isHighlighted ? 2 : 1}
              className="transition-all duration-300"
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node, i) => (
          <g
            key={node.id}
            className="cursor-pointer transition-transform duration-300"
            style={{
              transform: hoveredNode === node.id ? 'scale(1.2)' : 'scale(1)',
              transformOrigin: `${node.x}px ${node.y}px`
            }}
            onMouseEnter={() => setHoveredNode(node.id)}
            onMouseLeave={() => setHoveredNode(null)}
          >
            <circle
              cx={node.x}
              cy={node.y}
              r={node.size + 8}
              fill={node.color}
              opacity={0.15}
              className="animate-pulse"
              style={{ animationDelay: `${i * 200}ms`, animationDuration: '3s' }}
            />
            <circle
              cx={node.x}
              cy={node.y}
              r={node.size}
              fill={node.color}
              filter="url(#glow)"
              className="transition-all duration-300"
            />
            {hoveredNode === node.id && (
              <text
                x={node.x}
                y={node.y - node.size - 8}
                fill="white"
                fontSize="11"
                textAnchor="middle"
                className="font-medium"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
              >
                {node.label}
              </text>
            )}
          </g>
        ))}
      </svg>

      {/* Axis labels */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs text-white/40 tracking-widest uppercase">
        Individual → Collective
      </div>
      <div className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 origin-center text-xs text-white/40 tracking-widest uppercase whitespace-nowrap">
        Abstract → Concrete
      </div>
    </div>
  );
}

// Feature card component
function FeatureCard({
  icon, title, description, delay
}: {
  icon: React.ReactNode; title: string; description: string; delay: number
}) {
  return (
    <div
      className="group relative bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/[0.06] hover:border-white/20 transition-all duration-500 hover:-translate-y-1"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-sky-500/5 via-transparent to-violet-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500/20 to-violet-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
          {icon}
        </div>
        <h3 className="text-white text-lg font-semibold mb-2 tracking-tight">{title}</h3>
        <p className="text-white/60 text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// Workflow step component
function WorkflowStep({
  number, title, description
}: {
  number: string; title: string; description: string
}) {
  return (
    <div className="flex gap-4 items-start">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-violet-500 flex items-center justify-center text-white font-bold text-sm">
        {number}
      </div>
      <div>
        <h4 className="text-white font-medium mb-1">{title}</h4>
        <p className="text-white/50 text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white overflow-hidden">
      {/* Gradient overlays */}
      <div className="fixed inset-0 bg-gradient-to-br from-[#0f172a] via-[#0a0f1a] to-[#1a0f1f] pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(56,189,248,0.08)_0%,_transparent_50%)] pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(167,139,250,0.08)_0%,_transparent_50%)] pointer-events-none" />

      {/* Animated particles */}
      {mounted && <ParticleField />}

      {/* Grid pattern overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px'
        }}
      />

      <div className="relative z-10">
        {/* Navigation */}
        <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0f1a]/80 backdrop-blur-xl border-b border-white/5">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-lg overflow-hidden group-hover:scale-105 transition-transform">
                <Image
                  src="/holoLogo_dark.svg"
                  alt="Holoscopic"
                  width={36}
                  height={36}
                />
              </div>
              <span className="text-lg font-semibold tracking-tight">Holoscopic</span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              <Link href="/activities" className="text-sm text-white/60 hover:text-white transition-colors">
                Explore
              </Link>
              <a href="https://wiki.holoscopic.io" className="text-sm text-white/60 hover:text-white transition-colors">
                Docs
              </a>
              <Link href="/dashboard" className="text-sm text-white/60 hover:text-white transition-colors">
                Dashboard
              </Link>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="text-sm text-white/70 hover:text-white transition-colors px-4 py-2"
              >
                Sign in
              </Link>
              <Link
                href="/activities"
                className="text-sm bg-white text-[#0a0f1a] px-4 py-2 rounded-lg font-medium hover:bg-white/90 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="pt-32 pb-20 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              {/* Left: Copy */}
              <div className={`transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-medium mb-6">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                  Open Source Social Infrastructure
                </div>

                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight mb-6">
                  <span className="bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent">
                    Version control for
                  </span>
                  <br />
                  <span className="bg-gradient-to-r from-sky-400 via-violet-400 to-orange-400 bg-clip-text text-transparent">
                    collective thinking
                  </span>
                </h1>

                <p className="text-lg text-white/60 leading-relaxed mb-8 max-w-lg">
                  Map ideas together. See where your community stands. Track how perspectives evolve. Like GitHub, but for social innovation and collective intelligence.
                </p>

                <div className="flex flex-wrap gap-4">
                  <Link
                    href="/activities"
                    className="group inline-flex items-center gap-2 bg-gradient-to-r from-sky-500 to-violet-500 text-white px-6 py-3 rounded-xl font-medium hover:shadow-lg hover:shadow-sky-500/25 transition-all hover:-translate-y-0.5"
                  >
                    Explore Maps
                    <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </Link>
                  <a
                    href="https://wiki.holoscopic.io"
                    className="inline-flex items-center gap-2 bg-white/5 border border-white/10 text-white px-6 py-3 rounded-xl font-medium hover:bg-white/10 transition-all"
                  >
                    Learn More
                  </a>
                </div>
              </div>

              {/* Right: Interactive Visualization */}
              <div className={`relative transition-all duration-1000 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <div className="absolute inset-0 bg-gradient-to-r from-sky-500/20 via-violet-500/20 to-orange-500/20 rounded-3xl blur-3xl opacity-30" />
                <div className="relative bg-white/[0.02] border border-white/10 rounded-3xl p-8 backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-3 h-3 rounded-full bg-red-500/60" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                    <div className="w-3 h-3 rounded-full bg-green-500/60" />
                    <span className="ml-4 text-xs text-white/30 font-mono">prosperity-mapping.holo</span>
                  </div>
                  <HeroVisualization />
                  <p className="text-center text-xs text-white/40 mt-4">
                    Interactive map: &quot;What does prosperity mean to you?&quot;
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 px-6 border-t border-white/5">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">How it works</h2>
              <p className="text-white/50 max-w-2xl mx-auto">
                Create shared understanding through structured dialogue and visual mapping
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="relative">
                <WorkflowStep
                  number="1"
                  title="Ask a Question"
                  description="Pose a question that matters to your community. Define the dimensions of exploration."
                />
                <div className="hidden md:block absolute top-5 left-full w-full h-px bg-gradient-to-r from-white/20 to-transparent" />
              </div>
              <div className="relative">
                <WorkflowStep
                  number="2"
                  title="Gather Perspectives"
                  description="Invite participants to position their ideas on a shared map. Each dot is a viewpoint."
                />
                <div className="hidden md:block absolute top-5 left-full w-full h-px bg-gradient-to-r from-white/20 to-transparent" />
              </div>
              <div>
                <WorkflowStep
                  number="3"
                  title="See the Whole"
                  description="Watch patterns emerge. Identify clusters, outliers, and the shape of collective thought."
                />
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-20 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">Built for communities</h2>
              <p className="text-white/50 max-w-2xl mx-auto">
                Tools for organizations, educators, and groups exploring complex questions together
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <FeatureCard
                icon={
                  <svg className="w-6 h-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                }
                title="Idea Mapping"
                description="Position perspectives on 2D grids. See where agreement and tension live in your community."
                delay={0}
              />
              <FeatureCard
                icon={
                  <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                }
                title="Learning Sequences"
                description="Guide cohorts through structured explorations. Track progress and evolution over time."
                delay={100}
              />
              <FeatureCard
                icon={
                  <svg className="w-6 h-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                  </svg>
                }
                title="Live Analytics"
                description="Real-time visualization of collective input. Watch the map evolve as people participate."
                delay={200}
              />
              <FeatureCard
                icon={
                  <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                }
                title="Open Source"
                description="Transparent methodology. Fork, extend, and contribute to the collective intelligence toolkit."
                delay={300}
              />
              <FeatureCard
                icon={
                  <svg className="w-6 h-6 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                }
                title="Private Spaces"
                description="Create invite-only activities for your team, classroom, or organization."
                delay={400}
              />
              <FeatureCard
                icon={
                  <svg className="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                }
                title="Iterate Together"
                description="Revisit questions over time. See how collective understanding shifts and deepens."
                delay={500}
              />
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500/10 via-violet-500/10 to-orange-500/10 border border-white/10 p-12 text-center">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(56,189,248,0.1)_0%,_transparent_70%)]" />
              <ConnectionLines />

              <div className="relative z-10">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  Ready to map your community&apos;s mind?
                </h2>
                <p className="text-white/60 mb-8 max-w-xl mx-auto">
                  Join organizations and communities using Holoscopic to surface shared understanding and navigate complexity together.
                </p>
                <div className="flex flex-wrap gap-4 justify-center">
                  <Link
                    href="/activities"
                    className="inline-flex items-center gap-2 bg-white text-[#0a0f1a] px-8 py-4 rounded-xl font-semibold hover:shadow-lg hover:shadow-white/10 transition-all hover:-translate-y-0.5"
                  >
                    Start Exploring
                  </Link>
                  <a
                    href="https://wiki.holoscopic.io"
                    className="inline-flex items-center gap-2 bg-white/5 border border-white/20 px-8 py-4 rounded-xl font-semibold hover:bg-white/10 transition-all"
                  >
                    Read the Wiki
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/5 py-12 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-center gap-8">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg overflow-hidden">
                  <Image
                    src="/holoLogo_dark.svg"
                    alt="Holoscopic"
                    width={32}
                    height={32}
                  />
                </div>
                <span className="font-medium">Holoscopic</span>
                <span className="text-white/30 text-sm">· Open source social infrastructure</span>
              </div>

              <div className="flex items-center gap-8 text-sm">
                <Link href="/activities" className="text-white/50 hover:text-white transition-colors">
                  Activities
                </Link>
                <Link href="/dashboard" className="text-white/50 hover:text-white transition-colors">
                  Dashboard
                </Link>
                <a href="https://wiki.holoscopic.io" className="text-white/50 hover:text-white transition-colors">
                  Documentation
                </a>
                <a href="https://wiki.holoscopic.io/index.php?title=Special:Contact" className="text-white/50 hover:text-white transition-colors">
                  Contact
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
