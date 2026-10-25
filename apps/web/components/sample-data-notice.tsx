import { isFixtureResponse } from '@shevent/core/fixtures';
import { SAMPLE_DATA_LABEL } from '@shevent/core/labels';

/** Shown whenever an AI answer came from fixtures, so sample numbers never pass as estimates. */
export function SampleDataNotice({ response }: { response: { model_version: string } | null | undefined }) {
  if (!response || !isFixtureResponse(response)) return null;
  return (
    <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950">
      <span aria-hidden>ⓘ </span>
      {SAMPLE_DATA_LABEL}
    </p>
  );
}
