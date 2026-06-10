import { redirect } from 'next/navigation';

export default function CreateAlgorithmRedirect({ searchParams }: { searchParams: Record<string, string> }) {
  const params = new URLSearchParams(searchParams).toString();
  redirect(`/create/pattern${params ? `?${params}` : ''}`);
}
