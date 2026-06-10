import { redirect } from 'next/navigation';

export default function InquirySetupRedirect({ params }: { params: { topicId: string } }) {
  redirect(`/topics/${params.topicId}`);
}
