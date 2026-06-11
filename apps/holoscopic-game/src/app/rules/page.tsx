'use client';

import Link from 'next/link';
import { useInstance } from '@/contexts/InstanceContext';
import UserMenu from '@/components/UserMenu';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '3rem' }}>
      <h2 style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function EconomyRow({ event, type, dir, note }: { event: string; type: string; dir: '+' | '−'; note?: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.75rem', alignItems: 'start', padding: '0.6rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>{event}</div>
        {note && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.2rem', lineHeight: 1.4 }}>{note}</div>}
      </div>
      <div style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)', paddingTop: '0.2rem' }}>{type}</div>
      <div style={{ fontSize: '0.82rem', fontFamily: 'var(--font-dm-mono), monospace', fontWeight: 600, color: dir === '+' ? 'var(--accent-emerald)' : 'var(--accent)', paddingTop: '0.15rem' }}>{dir}</div>
    </div>
  );
}

export default function RulesPage() {
  const { config } = useInstance();
  const h = config?.holons;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ maxWidth: '100%', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <Link href="/" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>
              Holo<span style={{ color: 'var(--accent)' }}>scopic</span>
            </Link>
            <nav style={{ display: 'flex', gap: '1.25rem' }}>
              {[{ label: 'Play', href: '/play' }, { label: 'Topics', href: '/topics' }, { label: 'Rules', href: '/rules' }].map(item => (
                <Link key={item.href} href={item.href} style={{ fontSize: '0.68rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', color: item.href === '/rules' ? 'var(--accent)' : 'var(--text-muted)', textDecoration: 'none', textTransform: 'uppercase' }}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <UserMenu />
        </div>
      </header>

      <main style={{ maxWidth: 680, margin: '0 auto', padding: '4rem 1.5rem' }}>

        {/* Intro */}
        <div style={{ marginBottom: '3.5rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 1.5rem 0', lineHeight: 1.2, fontFamily: 'var(--font-cormorant), serif' }}>
            The Rules
          </h1>
          <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', lineHeight: 1.75, margin: 0 }}>
            The purpose of the game is to generate structured, repeatable conversations that help collectives
            see, think, and act as whole units. To do this we've created a simple one-shot group idea map
            that can be connected into sequences — and an economic unit called the{' '}
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Holon</span>.
          </p>
        </div>

        {/* What are Holons */}
        <Section title="What are Holons?">
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.7, margin: '0 0 0.75rem 0' }}>
            A Holon is a unit of contribution and influence. You start with{' '}
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-mono), monospace' }}>
              ◈ {h?.startingStake ?? 100}
            </span>{' '}
            on joining. You earn them by participating and contributing meaningfully. You spend them to signal conviction — nominating topics, wagering on community questions, publishing patterns.
          </p>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.7, margin: 0 }}>
            Holons cannot be bought. They can only be earned by showing up.
          </p>
        </Section>

        {/* The Map */}
        <Section title="The Map">
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.7, margin: '0 0 1.25rem 0' }}>
            Each activity is a mapping exercise: you place yourself (or an idea) on a two-dimensional grid defined by a{' '}
            <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Frame of Reference</strong> — a pair of named axes
            that define the conceptual space. You also leave a comment, and others can vote on yours.
          </p>

          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 0.75rem 0' }}>
              The Stake — Attribution Economy
            </h3>
            <ol style={{ margin: 0, padding: '0 0 0 1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[
                `When you join an activity, ◈ ${h?.activityStakeAmount ?? 5} Holons are escrowed into the activity pool.`,
                'As you vote on others\' comments, you direct your escrowed Holons toward those contributors.',
                'When the activity closes, voted Holons flow to the recipients. Unattributed Holons return to you.',
              ].map((step, i) => (
                <li key={i} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{step}</li>
              ))}
            </ol>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.75rem 0 0', lineHeight: 1.5, borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
              Net effect: Holons enter the activity from participants and exit to contributors proportional to votes.
              The activity is a zero-sum redistribution of attention and value — nothing is created or destroyed.
            </p>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.7, margin: 0 }}>
            Votes are bidirectional — you can cast and retract freely while the activity is open. Only the final state at close is settled.
          </p>
        </Section>

        {/* Earn */}
        <Section title="How you earn Holons">
          <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <EconomyRow event="Join this instance" type="join_bonus" dir="+" note={`One-time starting stake of ◈ ${h?.startingStake ?? 100}`} />
            <EconomyRow event="Activity closes — voted portion of stake received" type="comment_attribution" dir="+" note="Others directed their stake to your comments" />
            <EconomyRow event="Activity closes — unattributed stake returned" type="activity_stake_return" dir="+" note="You voted on fewer comments than your full stake" />
            <EconomyRow event="Your map entry inspires a follow-up activity" type="entry_seed_reward" dir="+" note="A facilitator builds the next question from your position" />
            <EconomyRow event="Someone creates an activity using your Frame" type="frame_use_reward" dir="+" note={`◈ ${h?.frameUseReward ?? 5} per adoption — your axis pair reshaped someone's exploration`} />
            <EconomyRow event="New activity added to a Pattern you own" type="pattern_activity_reward" dir="+" note={`◈ ${h?.patternActivityReward ?? 3} per addition`} />
            <EconomyRow event="Pattern session runs (quorum met)" type="session_host_reward" dir="+" note={`◈ ${h?.sessionHostReward ?? 30} for the Pattern proposer`} />
            <EconomyRow event="Join a Pattern" type="session_participant_reward" dir="+" note={`◈ ${h?.sessionParticipantReward ?? 15} on first enrollment`} />
            <EconomyRow event="Topic reaches quorum" type="session_host_reward" dir="+" note={`◈ ${h?.topicQuorumReward ?? 25} to the nominator`} />
            <EconomyRow event="Topic expires without quorum" type="nomination_return" dir="+" note="Full nomination cost returned" />
            <EconomyRow event="Withdraw support before topic expires" type="support_return" dir="+" note="Your wager returned in full" />
            <EconomyRow event="Fork of your Pattern published" type="algorithm_royalty" dir="+" note={`${h?.algorithmRoyaltyPercent ?? 10}% of fork's publish cost, propagates up the fork chain`} />
          </div>
        </Section>

        {/* Spend */}
        <Section title="How you spend Holons">
          <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <EconomyRow event="Join an activity" type="activity_stake" dir="−" note={`◈ ${h?.activityStakeAmount ?? 5} escrowed — returned or attributed at close`} />
            <EconomyRow event="Nominate a topic" type="nomination_cost" dir="−" note={`◈ ${h?.nominationCost ?? 10} — refunded if the topic reaches quorum`} />
            <EconomyRow event="Support a topic (wager)" type="support_cost" dir="−" note={`◈ ${h?.supportCost ?? 5} minimum — signals conviction, adds to the community pool`} />
            <EconomyRow event="Publish a Pattern" type="algorithm_publish_cost" dir="−" note={`◈ ${h?.algorithmPublishCost ?? 150} — creates a reusable conversation template for others to run`} />
            <EconomyRow event="Sign up for a Pattern proposal" type="algorithm_proposal" dir="−" note="Small deposit, returned when the session runs" />
          </div>
        </Section>

        {/* Topics */}
        <Section title="Topics & Community Signaling">
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.7, margin: '0 0 0.75rem 0' }}>
            Anyone can nominate a topic. Nominations cost{' '}
            <span style={{ fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-primary)' }}>◈ {h?.nominationCost ?? 10}</span>{' '}
            and expire after the nomination window closes. If{' '}
            <span style={{ fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-primary)' }}>{config?.quorum?.topicSupportThreshold ?? 5} people</span>{' '}
            support it within{' '}
            <span style={{ fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-primary)' }}>{config?.quorum?.topicWindowHours ?? 24} hours</span>,
            the topic is confirmed and the nominator earns a host reward.
          </p>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.7, margin: 0 }}>
            Supporters wager Holons as a signal of belief. If the topic expires without reaching quorum, all wagers are returned.
          </p>
        </Section>

        {/* Frames */}
        <Section title="Frames of Reference">
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.7, margin: '0 0 0.75rem 0' }}>
            A Frame of Reference is a pair of named axes — the conceptual space in which a map lives.
            Frames are standalone: the same frame can be applied to different topics, in different activities, by different people.
          </p>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.7, margin: 0 }}>
            When you create a Frame that others find useful, you earn{' '}
            <span style={{ fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-primary)' }}>◈ {h?.frameUseReward ?? 5}</span>{' '}
            each time a new activity is built on it. Good framing compounds over time.
          </p>
        </Section>

        {/* Patterns */}
        <Section title="Patterns">
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.7, margin: '0 0 0.75rem 0' }}>
            A Pattern is a curated sequence of activities — a repeatable conversation structure. Anyone can propose running a Pattern.
            When enough people sign up, the session launches and the proposer earns a host reward.
          </p>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.7, margin: '0 0 0.75rem 0' }}>
            Publishing a Pattern costs{' '}
            <span style={{ fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-primary)' }}>◈ {h?.algorithmPublishCost ?? 150}</span>.
            If others fork your Pattern and publish their version, you earn{' '}
            <span style={{ fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-primary)' }}>{h?.algorithmRoyaltyPercent ?? 10}%</span>{' '}
            of their publish cost — and the chain propagates up to{' '}
            <span style={{ fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-primary)' }}>{h?.forkDepthCap ?? 3}</span>{' '}
            levels deep.
          </p>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.7, margin: 0 }}>
            Members enrolled in a Pattern share a single cohort — joining the Pattern enrolls you in all its activities.
          </p>
        </Section>

        {/* Footer CTA */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '2rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link href="/interview" style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.55rem 1.4rem', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', textDecoration: 'none' }}>
            Start playing →
          </Link>
          <Link href="/topics" style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.55rem 1.4rem', borderRadius: 999, border: '1px solid var(--border-default)', color: 'var(--text-muted)', textDecoration: 'none' }}>
            Browse topics
          </Link>
        </div>
      </main>
    </div>
  );
}
