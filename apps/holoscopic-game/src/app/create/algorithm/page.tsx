import { redirect } from 'next/navigation';

export default async function CreateAlgorithmRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = new URLSearchParams(await searchParams).toString();
  redirect(`/create/pattern${params ? `?${params}` : ''}`);
}
