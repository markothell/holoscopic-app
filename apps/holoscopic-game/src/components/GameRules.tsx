'use client';

import Link from 'next/link';
import { useInstance } from '@/contexts/InstanceContext';
import GameNav from '@/components/GameNav';
import { STR, HOLON_SYMBOL, gamePath } from '@/lib/strings';
import { btn, mono } from '@/lib/ui';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '3rem' }}>
      <h2 style={{ fontSize: 'var(--text-2xs)', fontFamily: mono, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
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
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', lineHeight: 1.4 }}>{event}</div>
        {note && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '0.2rem', lineHeight: 1.4 }}>{note}</div>}
      </div>
      <div style={{ fontSize: 'var(--text-2xs)', fontFamily: mono, color: 'var(--text-muted)', paddingTop: '0.2rem' }}>{type}</div>
      <div style={{ fontSize: 'var(--text-sm)', fontFamily: mono, fontWeight: 600, color: dir === '+' ? 'var(--accent-emerald)' : 'var(--accent)', paddingTop: '0.15rem' }}>{dir}</div>
    </div>
  );
}

const body: React.CSSProperties = { fontSize: 'var(--text-base)', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 0.75rem 0' };
const monoVal: React.CSSProperties = { fontFamily: mono, color: 'var(--text-primary)' };

export default function GameRules() {
  const { instance, config } = useInstance();
  const h = config?.holons;
  const g = instance?.gameNumber ?? 1;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <GameNav active="rules" />

      <main style={{ maxWidth: 680, margin: '0 auto', padding: '3.5rem 1.5rem' }}>

        {/* Intro */}
        <div style={{ marginBottom: '3.5rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 1.5rem 0', lineHeight: 1.2, fontFamily: 'var(--font-cormorant), serif' }}>
            {STR.rules}
          </h1>
          <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', lineHeight: 1.75, margin: 0 }}>
            The purpose of the game is to generate structured, repeatable conversations that help collectives
            see, think, and act as whole units. To do this we&apos;ve created a simple one-shot group idea map
            that can be connected into {STR.patterns.toLowerCase()} — and an economic unit called the{' '}
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{STR.holon}</span>.
          </p>
        </div>

        {/* What are Holons */}
        <Section title={`What are ${STR.holons}?`}>
          <p style={body}>
            A {STR.holon} is a unit of contribution and influence. You start with{' '}
            <span style={monoVal}>{HOLON_SYMBOL} {h?.startingStake ?? 100}</span>{' '}
            on joining. You earn them by participating and contributing meaningfully. You spend them to signal conviction — nominating topics, wagering on community questions, publishing {STR.patterns.toLowerCase()}.
          </p>
          <p style={{ ...body, margin: 0 }}>
            {STR.holons} cannot be bought. They can only be earned by showing up.
          </p>
        </Section>

        {/* The Map */}
        <Section title={`The ${STR.map}`}>
          <p style={{ ...body, marginBottom: '1.25rem' }}>
            Each {STR.map.toLowerCase()} is a mapping exercise: you place yourself (or an idea) on a two-dimensional grid defined by a{' '}
            <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{STR.frameLong}</strong> — a pair of named axes
            that define the conceptual space. You also leave a comment, and others can vote on yours.
          </p>

          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: 'var(--text-2xs)', fontFamily: mono, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 0.75rem 0' }}>
              The Stake — Attribution Economy
            </h3>
            <ol style={{ margin: 0, padding: '0 0 0 1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[
                `When you join a ${STR.map.toLowerCase()}, ${HOLON_SYMBOL} ${h?.activityStakeAmount ?? 5} ${STR.holons} are escrowed into the pool.`,
                'As you vote on others\' comments, you direct your escrowed Holons toward those contributors.',
                `When the ${STR.map.toLowerCase()} closes, voted ${STR.holons} flow to the recipients. Unattributed ${STR.holons} return to you.`,
              ].map((step, i) => (
                <li key={i} style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{step}</li>
              ))}
            </ol>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '0.75rem 0 0', lineHeight: 1.5, borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
              Net effect: {STR.holons} enter from participants and exit to contributors proportional to votes.
              The {STR.map.toLowerCase()} is a zero-sum redistribution of attention and value — nothing is created or destroyed.
            </p>
          </div>

          <p style={{ ...body, margin: 0 }}>
            Votes are bidirectional — you can cast and retract freely while the {STR.map.toLowerCase()} is open. Only the final state at close is settled.
          </p>
        </Section>

        {/* Earn */}
        <Section title={`How you earn ${STR.holons}`}>
          <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <EconomyRow event="Join this edition" type="join_bonus" dir="+" note={`One-time starting stake of ${HOLON_SYMBOL} ${h?.startingStake ?? 100}`} />
            <EconomyRow event={`${STR.map} closes — voted portion of stake received`} type="comment_attribution" dir="+" note="Others directed their stake to your comments" />
            <EconomyRow event={`${STR.map} closes — unattributed stake returned`} type="activity_stake_return" dir="+" note="You voted on fewer comments than your full stake" />
            <EconomyRow event={`Your ${STR.map.toLowerCase()} entry inspires a follow-up`} type="entry_seed_reward" dir="+" note="A facilitator builds the next question from your position" />
            <EconomyRow event={`Someone creates a ${STR.map.toLowerCase()} using your ${STR.frame}`} type="frame_use_reward" dir="+" note={`${HOLON_SYMBOL} ${h?.frameUseReward ?? 5} per adoption — your axis pair reshaped someone's exploration`} />
            <EconomyRow event={`New ${STR.map.toLowerCase()} added to a ${STR.pattern} you own`} type="pattern_activity_reward" dir="+" note={`${HOLON_SYMBOL} ${h?.patternActivityReward ?? 3} per addition`} />
            <EconomyRow event={`${STR.pattern} session runs (quorum met)`} type="session_host_reward" dir="+" note={`${HOLON_SYMBOL} ${h?.sessionHostReward ?? 30} for the ${STR.pattern} proposer`} />
            <EconomyRow event={`Join a ${STR.pattern}`} type="session_participant_reward" dir="+" note={`${HOLON_SYMBOL} ${h?.sessionParticipantReward ?? 15} on first enrollment`} />
            <EconomyRow event="Topic reaches quorum" type="session_host_reward" dir="+" note={`${HOLON_SYMBOL} ${h?.topicQuorumReward ?? 25} to the nominator`} />
            <EconomyRow event="Topic expires without quorum" type="nomination_return" dir="+" note="Full nomination cost returned" />
            <EconomyRow event="Withdraw support before topic expires" type="support_return" dir="+" note="Your wager returned in full" />
            <EconomyRow event={`Fork of your ${STR.pattern} published`} type="pattern_royalty" dir="+" note={`${h?.algorithmRoyaltyPercent ?? 10}% of fork's publish cost, propagates up the fork chain`} />
          </div>
        </Section>

        {/* Spend */}
        <Section title={`How you spend ${STR.holons}`}>
          <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <EconomyRow event={`Join a ${STR.map.toLowerCase()}`} type="activity_stake" dir="−" note={`${HOLON_SYMBOL} ${h?.activityStakeAmount ?? 5} escrowed — returned or attributed at close`} />
            <EconomyRow event="Nominate a topic" type="nomination_cost" dir="−" note={`${HOLON_SYMBOL} ${h?.nominationCost ?? 10} — refunded if the topic reaches quorum`} />
            <EconomyRow event="Support a topic (wager)" type="support_cost" dir="−" note={`${HOLON_SYMBOL} ${h?.supportCost ?? 5} minimum — signals conviction, adds to the community pool`} />
            <EconomyRow event={`Publish a ${STR.pattern}`} type="pattern_publish_cost" dir="−" note={`${HOLON_SYMBOL} ${h?.algorithmPublishCost ?? 150} — creates a reusable conversation template for others to run`} />
            <EconomyRow event={`Sign up for a ${STR.pattern} proposal`} type="pattern_proposal" dir="−" note="Small deposit, returned when the session runs" />
          </div>
        </Section>

        {/* Topics */}
        <Section title="Topics & Community Signaling">
          <p style={body}>
            Anyone can nominate a topic. Nominations cost{' '}
            <span style={monoVal}>{HOLON_SYMBOL} {h?.nominationCost ?? 10}</span>{' '}
            and expire after the nomination window closes. If{' '}
            <span style={monoVal}>{config?.quorum?.topicSupportThreshold ?? 5} people</span>{' '}
            support it within{' '}
            <span style={monoVal}>{config?.quorum?.topicWindowHours ?? 24} hours</span>,
            the topic is confirmed and the nominator earns a host reward.
          </p>
          <p style={{ ...body, margin: 0 }}>
            Supporters wager {STR.holons} as a signal of belief. If the topic expires without reaching quorum, all wagers are returned.
          </p>
        </Section>

        {/* Frames */}
        <Section title={`${STR.frames} of Reference`}>
          <p style={body}>
            A {STR.frameLong} is a pair of named axes — the conceptual space in which a {STR.map.toLowerCase()} lives.
            {STR.frames} are standalone: the same frame can be applied to different topics, in different {STR.maps.toLowerCase()}, by different people.
          </p>
          <p style={{ ...body, margin: 0 }}>
            When you create a {STR.frame} that others find useful, you earn{' '}
            <span style={monoVal}>{HOLON_SYMBOL} {h?.frameUseReward ?? 5}</span>{' '}
            each time a new {STR.map.toLowerCase()} is built on it. Good framing compounds over time.
          </p>
        </Section>

        {/* Patterns */}
        <Section title={STR.patterns}>
          <p style={body}>
            A {STR.pattern} is a curated sequence of {STR.maps.toLowerCase()} — a repeatable conversation structure. Anyone can propose running one.
            When enough people sign up, the session launches and the proposer earns a host reward.
          </p>
          <p style={body}>
            Publishing a {STR.pattern} costs{' '}
            <span style={monoVal}>{HOLON_SYMBOL} {h?.algorithmPublishCost ?? 150}</span>.
            If others fork your {STR.pattern} and publish their version, you earn{' '}
            <span style={monoVal}>{h?.algorithmRoyaltyPercent ?? 10}%</span>{' '}
            of their publish cost — and the chain propagates up to{' '}
            <span style={monoVal}>{h?.forkDepthCap ?? 3}</span>{' '}
            levels deep.
          </p>
          <p style={{ ...body, margin: 0 }}>
            Members enrolled in a {STR.pattern} share a single cohort — joining it enrolls you in all its {STR.maps.toLowerCase()}.
          </p>
        </Section>

        {/* Footer CTA */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '2rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link href={gamePath(g, 'topics')} style={{ ...btn('fill'), textDecoration: 'none', padding: '0.55rem 1.4rem' }}>
            Start playing →
          </Link>
          <Link href="/interview" style={{ ...btn('outline'), textDecoration: 'none', padding: '0.55rem 1.4rem' }}>
            {`Back to ${'interView'}`}
          </Link>
        </div>
      </main>
    </div>
  );
}
