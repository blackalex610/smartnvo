import React, { useEffect, useMemo, useState } from 'react';
import { generateDiagram, type DiagramData } from '../services/ai';

type DiagramRendererProps = {
  problemText: string;
  enabled?: boolean;
};

const WIDTH = 220;
const HEIGHT = 180;

type DiagramPoint = {
  label: string;
  x: number;
  y: number;
};

type ParallelLine = {
  label: string;
  y: number;
};

type Transversal = {
  from: { x: number; y: number };
  to: { x: number; y: number };
};

const normalizeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const normalizePoint = (label: string, value: unknown): DiagramPoint | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const directX = normalizeNumber(candidate.x);
  const directY = normalizeNumber(candidate.y);

  if (directX !== null && directY !== null) {
    return {
      label,
      x: directX,
      y: directY,
    };
  }

  if (Array.isArray(value) && value.length >= 2) {
    const arrayX = normalizeNumber(value[0]);
    const arrayY = normalizeNumber(value[1]);
    if (arrayX !== null && arrayY !== null) {
      return {
        label,
        x: arrayX,
        y: arrayY,
      };
    }
  }

  return null;
};

const normalizePoints = (raw: unknown): DiagramPoint[] => {
  if (Array.isArray(raw)) {
    return raw
      .map((value, index) => {
        const label = typeof value?.label === 'string' && value.label.trim() ? value.label : `P${index + 1}`;
        return normalizePoint(label, value);
      })
      .filter((point): point is DiagramPoint => point !== null);
  }

  if (raw && typeof raw === 'object') {
    return Object.entries(raw)
      .map(([label, value]) => normalizePoint(label, value))
      .filter((point): point is DiagramPoint => point !== null);
  }

  return [];
};

const getPoint = (points: DiagramPoint[], label: string) => points.find((p) => p.label === label);

const normalizeParallelLines = (raw: unknown): ParallelLine[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((line, index) => {
      if (!line || typeof line !== 'object') {
        return null;
      }

      const y = normalizeNumber((line as Record<string, unknown>).y);
      if (y === null) {
        return null;
      }

      const rawLabel = (line as Record<string, unknown>).label;
      return {
        y,
        label: typeof rawLabel === 'string' && rawLabel.trim() ? rawLabel : `l${index + 1}`,
      };
    })
    .filter((line): line is ParallelLine => line !== null);
};

const normalizeTransversal = (raw: unknown): Transversal | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const from = normalizePoint('from', candidate.from);
  const to = normalizePoint('to', candidate.to);

  if (!from || !to) {
    return null;
  }

  return {
    from: { x: from.x, y: from.y },
    to: { x: to.x, y: to.y },
  };
};

const DiagramRenderer: React.FC<DiagramRendererProps> = ({ problemText, enabled = true }) => {
  const [diagram, setDiagram] = useState<DiagramData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !problemText.trim()) {
      setDiagram(null);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await generateDiagram(problemText);
        if (!cancelled) setDiagram(data);
      } catch {
        if (!cancelled) setError('Неуспешно генериране на диаграма');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [problemText, enabled]);

  const content = useMemo(() => {
    if (!diagram) return null;

    if (diagram.type === 'triangle') {
      const points = normalizePoints(diagram.elements.points);
      const sides = ((diagram.elements.sides ?? []) as [string, string][]).length > 0
        ? ((diagram.elements.sides ?? []) as [string, string][])
        : points.length >= 3
          ? [[points[0].label, points[1].label], [points[1].label, points[2].label], [points[2].label, points[0].label]]
          : [];
      return (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-full">
          {sides.map(([a, b], idx) => {
            const pa = getPoint(points, a);
            const pb = getPoint(points, b);
            if (!pa || !pb) return null;
            return <line key={idx} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="#1f2937" strokeWidth="2" />;
          })}
          {points.map((p, idx) => (
            <g key={idx}>
              <circle cx={p.x} cy={p.y} r="3" fill="#2563eb" />
              <text x={p.x + 6} y={p.y - 6} fontSize="12" fill="#111827">{p.label}</text>
            </g>
          ))}
        </svg>
      );
    }

    if (diagram.type === 'parallel_lines') {
      const lines = normalizeParallelLines(diagram.elements.lines);
      const transversal = normalizeTransversal(diagram.elements.transversal);
      if (lines.length === 0 && !transversal) return null;
      return (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-full">
          {lines.map((line, idx) => (
            <g key={idx}>
              <line x1={20} y1={line.y} x2={200} y2={line.y} stroke="#1f2937" strokeWidth="2" />
              <text x={205} y={line.y + 4} fontSize="12" fill="#111827">{line.label}</text>
            </g>
          ))}
          {transversal && (
            <line
              x1={transversal.from.x}
              y1={transversal.from.y}
              x2={transversal.to.x}
              y2={transversal.to.y}
              stroke="#dc2626"
              strokeWidth="2"
            />
          )}
        </svg>
      );
    }

    if (diagram.type === 'rectangle') {
      const points = normalizePoints(diagram.elements.points);
      const ordered = ['A', 'B', 'C', 'D'].map((l) => getPoint(points, l)).filter((point): point is DiagramPoint => point !== undefined);
      if (ordered.length < 4) return null;
      return (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-full">
          <polygon
            points={ordered.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="#eff6ff"
            stroke="#1f2937"
            strokeWidth="2"
          />
          {ordered.map((p, idx) => (
            <text key={idx} x={p.x + 5} y={p.y - 6} fontSize="12" fill="#111827">{p.label}</text>
          ))}
        </svg>
      );
    }

    if (diagram.type === 'coordinate_plane') {
      const points = normalizePoints(diagram.elements.points);
      if (points.length === 0) return null;
      const toCanvas = (x: number, y: number) => ({ x: WIDTH / 2 + x * 20, y: HEIGHT / 2 - y * 20 });
      return (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-full">
          <line x1={10} y1={HEIGHT / 2} x2={WIDTH - 10} y2={HEIGHT / 2} stroke="#6b7280" strokeWidth="1.5" />
          <line x1={WIDTH / 2} y1={10} x2={WIDTH / 2} y2={HEIGHT - 10} stroke="#6b7280" strokeWidth="1.5" />
          {points.map((p, idx) => {
            const c = toCanvas(p.x, p.y);
            return (
              <g key={idx}>
                <circle cx={c.x} cy={c.y} r="3" fill="#2563eb" />
                <text x={c.x + 5} y={c.y - 5} fontSize="12" fill="#111827">{p.label}</text>
              </g>
            );
          })}
        </svg>
      );
    }

    if (diagram.type === 'cube') {
      const front = normalizePoints(diagram.elements.front_face);
      const back = normalizePoints(diagram.elements.back_face);
      if (front.length === 0 || back.length === 0) return null;
      return (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-full">
          <polygon points={front.map((p) => `${p.x},${p.y}`).join(' ')} fill="#f3f4f6" stroke="#1f2937" strokeWidth="2" />
          <polygon points={back.map((p) => `${p.x},${p.y}`).join(' ')} fill="#e5e7eb" stroke="#1f2937" strokeWidth="2" />
          {front.map((p, idx) => (
            <line key={idx} x1={p.x} y1={p.y} x2={back[idx]?.x ?? p.x} y2={back[idx]?.y ?? p.y} stroke="#1f2937" strokeWidth="2" />
          ))}
        </svg>
      );
    }

    return null;
  }, [diagram]);

  if (!enabled) return null;

  return (
    <div className="mb-6 h-44 rounded-xl border border-slate-300 bg-slate-50 p-2">
      {loading && <div className="h-full flex items-center justify-center text-sm text-slate-500">Генериране на диаграма...</div>}
      {!loading && error && <div className="h-full flex items-center justify-center text-sm text-red-500">{error}</div>}
      {!loading && !error && content}
      {!loading && !error && !content && <div className="h-full flex items-center justify-center text-sm text-slate-500">Няма налична диаграма</div>}
    </div>
  );
};

export default DiagramRenderer;
