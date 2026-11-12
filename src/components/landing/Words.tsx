/**
 * A passage that lightens in word by word as a 0 to 1 value in CSS
 * (`over`, set on an ancestor) rises. Every word is in place from the
 * start and only its opacity changes, so nothing around it moves.
 */
export function Words({ text, over }: { text: string; over: string }) {
  const words = text.split(" ");
  return (
    <span className="pl-words" style={{ ["--n" as string]: words.length, ["--v" as string]: `var(${over})` }}>
      {words.map((w, i) => (
        <span key={i} style={{ ["--i" as string]: i }}>
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}
