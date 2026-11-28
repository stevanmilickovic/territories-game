import { useRef, useState, type KeyboardEvent } from "react";
import { flagSize, type FactionFlag } from "../../shared/src/factions";

export function FlagEditor({ flag, onPaint }: { flag: FactionFlag; onPaint: (index: number, color: string) => void }) {
  const [brush, setBrush] = useState("#ffffff");
  const [focused, setFocused] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const row = Math.floor(index / flagSize);
    const column = index % flagSize;
    let next = index;
    switch (event.key) {
      case "ArrowLeft": if (column > 0) next--; break;
      case "ArrowRight": if (column < flagSize - 1) next++; break;
      case "ArrowUp": if (row > 0) next -= flagSize; break;
      case "ArrowDown": if (row < flagSize - 1) next += flagSize; break;
      default: return;
    }
    event.preventDefault();
    buttons.current[next]?.focus();
  }

  return (
    <div className="flag-editor">
      <label>
        Flag paint color
        <input type="color" value={brush} onChange={event => setBrush(event.target.value)} />
      </label>
      <div className="flag-editor-grid" role="group" aria-label="Six by six flag pixels"
        style={{ gridTemplateColumns: `repeat(${flagSize}, minmax(0, 1fr))` }}>
        {flag.map((color, index) => (
          <button key={index} type="button" style={{ backgroundColor: color }}
            ref={button => { buttons.current[index] = button; }}
            tabIndex={index === focused ? 0 : -1}
            aria-label={`Row ${Math.floor(index / flagSize) + 1}, column ${index % flagSize + 1}, ${color}`}
            onFocus={() => setFocused(index)} onKeyDown={event => moveFocus(event, index)}
            onClick={() => onPaint(index, brush)} />
        ))}
      </div>
    </div>
  );
}
