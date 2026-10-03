import { AgentStatus } from './AgentStatus';

export default function Page() {
  return (
    <main>
      <h1>@stellaragent/react SSR example</h1>
      <p>
        This page is rendered through the Next.js App Router. The client
        provider is safe during the server pass, then initializes the agent
        after hydration.
      </p>
      <AgentStatus />
    </main>
  );
}
