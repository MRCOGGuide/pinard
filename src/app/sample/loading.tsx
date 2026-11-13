import { QuestionSkeleton } from "@/components/Skeletons";
import { COLUMN, WideFrame } from "@/components/WideFrame";

/** In the page's own frame and with its title, so nothing moves when the
 *  questions arrive. */
export default function Loading() {
  return (
    <WideFrame>
      <QuestionSkeleton title="Try the questions" compact="phone" column={COLUMN} />
    </WideFrame>
  );
}
