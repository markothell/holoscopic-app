import { redirect } from 'next/navigation';

export default function InquiryTopicRedirect({ params }: { params: { topicId: string } }) {
  redirect(`/topics/${params.topicId}`);
}
