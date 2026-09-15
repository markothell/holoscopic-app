import { Page, Action, Muted } from '@/components/Shell';

// Unmatched routes. Without this file Next rendered its own unstyled 404 inside
// an app that otherwise always wears the Toono chrome. A circle link that
// travels by mail can arrive truncated, so this is a plausible first contact.
export default function NotFound() {
  return (
    <Page>
      <div className="mt-16 max-w-md">
        <h1 className="text-4xl leading-tight">Nothing here</h1>
        <div className="mt-4 text-[17px] leading-relaxed">
          <Muted>
            That address doesn&rsquo;t lead to anything you can open. If someone
            sent you a circle link, ask them to send it again.
          </Muted>
        </div>
        <div className="mt-8">
          <Action href="/">Start over</Action>
        </div>
      </div>
    </Page>
  );
}
