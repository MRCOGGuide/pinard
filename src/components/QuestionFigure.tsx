import { Cystometrogram } from "./Cystometrogram";
import { figureFor } from "@/lib/figure";

/**
 * The figure that belongs at this point in the card, if there is one.
 *
 * One component at every site that shows a question, so a new kind of
 * figure is added in one place rather than five.
 */
export function QuestionFigure({
  figure,
  placement,
}: {
  figure: unknown;
  placement: "stem" | "explanation";
}) {
  const found = figureFor(figure, placement);
  if (!found) return null;
  return <Cystometrogram trace={found.trace} />;
}
