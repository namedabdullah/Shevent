import { isFixtureResponse } from '@shevent/core/fixtures';
import { SAMPLE_DATA_LABEL } from '@shevent/core/labels';
import { Notice } from '@/components/ui/notice';

/** Shown whenever an AI answer came from fixtures, so sample numbers never pass as estimates. */
export function SampleDataNotice({ response }: { response: { model_version: string } | null | undefined }) {
  if (!response || !isFixtureResponse(response)) return null;
  return (
    <Notice tone="warning" role="note">
      {SAMPLE_DATA_LABEL}
    </Notice>
  );
}
