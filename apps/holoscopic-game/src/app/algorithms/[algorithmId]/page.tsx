import { redirect } from 'next/navigation';

export default function AlgorithmDetailRedirect({ params }: { params: { algorithmId: string } }) {
  redirect(`/patterns/${params.algorithmId}`);
}
