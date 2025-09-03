'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ActivityService } from '@/services/activityService';
import { WeAllExplainActivity } from '@/models/Activity';
import MappingGrid from '@/components/MappingGrid';
import CommentSection from '@/components/CommentSection';

export default function HomePage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [whatIsManActivity, setWhatIsManActivity] = useState<WeAllExplainActivity | null>(null);

  // Fetch the "What is a man?" activity data
  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const activity = await ActivityService.getActivityByUrlName('what-is-a-man');
        if (activity) {
          setWhatIsManActivity(activity);
        }
      } catch (error) {
        console.error('Error fetching What is a man activity:', error);
      }
    };
    
    fetchActivity();
  }, []);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitMessage('');
    
    try {
      // TODO: Implement email collection endpoint
      console.log('Email submitted:', email);
      setSubmitMessage('Thank you for your interest! We\'ll be in touch soon.');
      setEmail('');
    } catch (error) {
      setSubmitMessage('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Hero Section - Full Screen Centered */}
      <div className="min-h-screen flex items-center justify-center px-8">
        <div className="flex flex-col items-center">
          {/* Logo */}
          <Image
            src="/whorl_white.svg"
            alt="Whorl Logo"
            width={70}
            height={70}
            className="mb-1"
          />
          
          {/* Content wrapper - left aligned internally */}
          <div className="max-w-3xl">
            {/* Title */}
            <h1 className="text-8xl font-bold text-white mb-3" style={{ fontFamily: 'var(--font-fredoka)', letterSpacing: '-0.03em' }}>
              whorl
            </h1>

            {/* Main Content from Whorl.md */}
            <div className="text-white leading-tight text-left">
              <p className="text-xl font-light">
                make{' '}
                <Link href="#maps-of-culture" className="text-purple-400 hover:text-purple-300 transition-colors">
                  maps of culture
                </Link>
              </p>
              <p className="text-xl font-light">
                study{' '}
                <Link href="#collective-identity" className="text-purple-400 hover:text-purple-300 transition-colors">
                  collective identity
                </Link>
              </p>
              <p className="text-xl font-light">
                build{' '}
                <Link href="#open-source-social-systems" className="text-purple-400 hover:text-purple-300 transition-colors">
                  open source systems
                </Link>
              </p>
              <p className="text-xl font-light">
                for a{' '}
                <Link href="#thriving-humanity" className="text-purple-400 hover:text-purple-300 transition-colors">
                  thriving humanity
                </Link>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content Sections */}
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="space-y-24">
          {/* Maps of Culture Section */}
          <section id="maps-of-culture" className="scroll-mt-20">
            <h2 className="text-3xl font-bold text-white mb-6">Maps of Culture</h2>
            <div className="space-y-6 text-gray-300">
              <p className="text-lg">
                This looks like a graph but in fact it is a map of ideas. Each color represents a different perspective in the collaborative space.
              </p>
              {whatIsManActivity ? (
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="mb-4">
                    <h3 className="text-xl font-semibold text-white mb-2">{whatIsManActivity.title}</h3>
                  </div>
                  <MappingGrid 
                    activity={whatIsManActivity}
                    showAllRatings={true}
                    onRatingSubmit={() => {}}
                    onDotClick={() => {}}
                  />
                </div>
              ) : (
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="flex items-center justify-center h-64">
                    <div className="text-gray-400">Loading mapping data...</div>
                  </div>
                </div>
              )}
              <p className="text-lg">Each data point on the map contains a personal story.</p>
              {whatIsManActivity ? (
                <div className="bg-slate-800 rounded-lg p-4 overflow-hidden w-full md:w-1/2 mx-auto" style={{ height: 'min(500px, 90vw)' }}>
                  <CommentSection 
                    activity={whatIsManActivity}
                    onCommentSubmit={() => {}}
                    onCommentVote={() => {}}
                    userComment={undefined}
                    readOnly={true}
                    showAllComments={true}
                  />
                </div>
              ) : (
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="flex items-center justify-center h-64">
                    <div className="text-gray-400">Loading comments...</div>
                  </div>
                </div>
              )}
              <p className="text-lg">
                It&apos;s not just a survey, it&apos;s a collaborative activity. Participants name their own perspectives,
                share their positions, and vote on contributions that resonate.
              </p>
              <p className="text-lg font-semibold">
                Map with enlarged points based on community votes
              </p>
              <p className="text-lg italic">
                a snapshot of a group&apos;s relationship with an idea.
              </p>
            </div>
          </section>

          {/* Collective Identity Section */}
          <section id="collective-identity" className="scroll-mt-20">
            <h2 className="text-3xl font-bold text-white mb-6">Collective Identity</h2>
            <div className="space-y-6 text-gray-300">
              <p className="text-lg">
                Belief informs perception. Perception informs action. Action reinforces belief...or so says the social media 
                filter-bubble feedback loop we&apos;ve been practicing.
              </p>
              <p className="text-lg">
                From a state of presence and openness we may have hypotheses but they are followed by observation, tests, 
                frameworks that provide structure while allowing for evolution. Science is not a powerful tool because it 
                knows THE TRUTH but because it is a resilient <strong>learning container</strong>.
              </p>
              <p className="text-lg">
                Here&apos;s how we might create a learning container for the collective self.
              </p>
              <p className="text-lg">Start with a Map of Culture:</p>
              <div className="bg-slate-800 rounded-lg p-4">
                <Image
                  src="/Screenshot 2025-08-02 at 11.23.55 AM.png"
                  alt="Map of Culture"
                  width={800}
                  height={600}
                  className="w-full h-auto rounded"
                />
              </div>
              <div className="bg-slate-800 rounded-lg p-6">
                <p className="text-lg mb-3">
                  Do an activity together (preferably using your map to define areas of rich potential).
                </p>
                <p className="text-gray-400 italic mb-2">
                  &quot;User XYZ invites XYZcollective to the following activity:&quot;
                </p>
                <ul className="list-disc list-inside space-y-1 text-gray-400">
                  <li>Length: 3 days</li>
                  <li>Inputs: [defined by activity]</li>
                  <li>Outputs: daily reflection, Map of [topic]</li>
                </ul>
              </div>
              <p className="text-lg">
                Maps within maps within maps. Things get interesting when the crowd begins to identify the systems that 
                yield connection, unification, etc.
              </p>
            </div>
          </section>

          {/* Open Source Social Systems Section */}
          <section id="open-source-social-systems" className="scroll-mt-20">
            <h2 className="text-3xl font-bold text-white mb-6">Open Source Social Systems</h2>
            <div className="space-y-6 text-gray-300">
              <p className="text-lg">
                <a href="https://en.wikipedia.org/wiki/Open-source_software" className="text-purple-400 hover:text-purple-300 underline" target="_blank" rel="noopener noreferrer">
                  Open source software
                </a>{' '}
                means everybody can see the source code. It is a resource worth trillions. It is a tech-age elevator to{' '}
                <a href="https://en.wikipedia.org/wiki/Standing_on_the_shoulders_of_giants" className="text-purple-400 hover:text-purple-300 underline" target="_blank" rel="noopener noreferrer">
                  the giant&apos;s shoulder
                </a>.
              </p>
              <p className="text-lg">
                It is not just the source code that is open. Everyone can see the process of creation. The discussions, 
                the wrong turns, the experiments that have not yet solidified. Anyone can find bugs, submit changes and 
                improve the shared resource or copy the code and form parallel variations.
              </p>
              <p className="text-lg">
                Wikipedia (also open source) exploded after it switched from a peer-reviewed publishing process to a 
                draft-and-iterate open one.
              </p>
              <p className="text-lg">
                Polis allows 10s of thousands to deliberate and visualize consensus at the frontiers of democratic process.
              </p>
              <p className="text-lg">
                These are examples of{' '}
                <a href="https://en.wikipedia.org/wiki/Peer_production" className="text-purple-400 hover:text-purple-300 underline" target="_blank" rel="noopener noreferrer">
                  peer production
                </a>.
              </p>
              <p className="text-lg">
                Whorl is asking: can we use these same principles to create systems for social process?
              </p>
              <div className="bg-slate-800 rounded-lg p-6">
                <p className="text-lg mb-3">Example: mastermind groups.</p>
                <p className="text-gray-400">
                  Here is a map of prominent mastermind formats: [MAP]
                </p>
                <p className="text-lg mt-4">
                  Imagine each is described briefly as an automated sequence of interactions. Collectives can try, 
                  produce feedback about them (connected to maps) and then fork structures and repeat. The platform 
                  then becomes an open source learning mechanism for how humans grow together.
                </p>
              </div>
            </div>
          </section>

          {/* Thriving Humanity Section */}
          <section id="thriving-humanity" className="scroll-mt-20">
            <h2 className="text-3xl font-bold text-white mb-6">Thriving Humanity</h2>
            <div className="space-y-6 text-gray-300">
              <p className="text-lg">
                Like many topics within the human cultural sphere, success and prosperity are very personal, contextual, 
                often polarizing and vary across the population. Instead of defining what it means to have a thriving 
                human race, find sample Whorls on related topics. If you add your piece we can find out what they mean to US.
              </p>
              <div className="bg-slate-800 rounded-lg p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Sample Topics:</h3>
                <div className="space-y-3">
                  <div className="border-l-4 border-purple-500 pl-4">
                    <h4 className="text-lg font-medium text-white">Prosperity</h4>
                    <ul className="list-disc list-inside text-gray-400 mt-1">
                      <li>What is prosperity?</li>
                      <li>How do we generate prosperity?</li>
                    </ul>
                  </div>
                  <div className="border-l-4 border-purple-500 pl-4">
                    <h4 className="text-lg font-medium text-white">Sustainability</h4>
                  </div>
                  <div className="border-l-4 border-purple-500 pl-4">
                    <h4 className="text-lg font-medium text-white">Wealth</h4>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Sample Activities Section */}
        <section className="mt-24">
          <h2 className="text-3xl font-bold text-white mb-8 text-center">Try a Sample Activity</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Link href="/admin" className="bg-slate-800 rounded-lg p-6 hover:bg-slate-700 transition-colors cursor-pointer block">
              <h3 className="text-xl font-semibold text-white mb-3">Map Your Values</h3>
              <p className="text-gray-300 mb-4">
                Explore how your personal values intersect with collective ideals through collaborative mapping.
              </p>
              <span className="text-purple-400 hover:text-purple-300">Start mapping →</span>
            </Link>
            <Link href="/admin" className="bg-slate-800 rounded-lg p-6 hover:bg-slate-700 transition-colors cursor-pointer block">
              <h3 className="text-xl font-semibold text-white mb-3">Community Vision</h3>
              <p className="text-gray-300 mb-4">
                Co-create a vision for your community by mapping shared aspirations and priorities.
              </p>
              <span className="text-purple-400 hover:text-purple-300">Start mapping →</span>
            </Link>
            <Link href="/admin" className="bg-slate-800 rounded-lg p-6 hover:bg-slate-700 transition-colors cursor-pointer block">
              <h3 className="text-xl font-semibold text-white mb-3">Innovation Ecosystems</h3>
              <p className="text-gray-300 mb-4">
                Map the connections between ideas, resources, and collaborators in your innovation space.
              </p>
              <span className="text-purple-400 hover:text-purple-300">Start mapping →</span>
            </Link>
            <Link href="/admin" className="bg-slate-800 rounded-lg p-6 hover:bg-slate-700 transition-colors cursor-pointer block">
              <h3 className="text-xl font-semibold text-white mb-3">Cultural Bridges</h3>
              <p className="text-gray-300 mb-4">
                Discover unexpected connections between different cultural perspectives and practices.
              </p>
              <span className="text-purple-400 hover:text-purple-300">Start mapping →</span>
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-24 pt-12 border-t border-gray-700">
          <div className="text-center text-gray-400">
            <p className="mb-4">© 2025 Whorl - Building open source social systems</p>
            <div className="flex justify-center space-x-6">
              <Link href="/admin" className="hover:text-purple-400 transition-colors">Create Activity</Link>
              <a href="#" className="hover:text-purple-400 transition-colors">Contact</a>
              <a href="#" className="hover:text-purple-400 transition-colors">GitHub</a>
              <a href="#" className="hover:text-purple-400 transition-colors">Documentation</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}