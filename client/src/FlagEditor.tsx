import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { flagSize, type FactionFlag } from "../../shared/src/factions";

export function FlagEditor({ flag, onPaint }: { flag: FactionFlag; onPaint: (index: number, color: string) => void }) {
  const [brush, setBrush] = useState("#ffffff");
  const [focused, setFocused] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const stroke = useRef<{ pointerId: number; x: number; y: number; painted: Set<number> } | null>(null);

  function paintStroke(event: PointerEvent<HTMLDivElement>) {
    const active = stroke.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    const samples = Math.max(1, Math.ceil(2 * flagSize * Math.max(Math.abs(dx) / width, Math.abs(dy) / height)));
    for (let sample = 0; sample <= samples; sample++) {
      const column = Math.floor((active.x + dx * sample / samples - left) * flagSize / width);
      const row = Math.floor((active.y + dy * sample / samples - top) * flagSize / height);
      if (row < 0 || row >= flagSize || column < 0 || column >= flagSize) continue;
      const index = row * flagSize + column;
      if (active.painted.has(index)) continue;
      active.painted.add(index);
      onPaint(index, brush);
    }
    active.x = event.clientX;
    active.y = event.clientY;
  }

  function startStroke(event: PointerEvent<HTMLDivElement>) {
    if (stroke.current || event.button !== 0 || !(event.target instanceof HTMLButtonElement)
      || event.target.matches(":disabled")) return;
    stroke.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, painted: new Set() };
    event.currentTarget.setPointerCapture(event.pointerId);
    paintStroke(event);
  }

  function stopStroke(event: PointerEvent<HTMLDivElement>) {
    if (stroke.current?.pointerId === event.pointerId) stroke.current = null;
  }

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
        onPointerDown={startStroke} onPointerMove={paintStroke}
        onPointerUp={event => { paintStroke(event); stopStroke(event); }}
        onPointerCancel={stopStroke} onLostPointerCapture={stopStroke}
        style={{ gridTemplateColumns: `repeat(${flagSize}, minmax(0, 1fr))` }}>
        {flag.map((color, index) => (
          <button key={index} type="button" style={{ backgroundColor: color }}
            ref={button => { buttons.current[index] = button; }}
            tabIndex={index === focused ? 0 : -1}
            aria-label={`Row ${Math.floor(index / flagSize) + 1}, column ${index % flagSize + 1}, ${color}`}
            onFocus={() => setFocused(index)} onKeyDown={event => moveFocus(event, index)}
            onClick={event => { if (event.detail === 0) onPaint(index, brush); }} />
        ))}
      </div>
    </div>
  );
}
