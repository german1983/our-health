import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { NutritionalFacts, RecipeDetailResponse } from '@personal-budget/shared';

type LabelMode = 'perServing' | 'per100g';

interface Row {
  label: string;
  value: number | undefined;
  unit: string;
  bold?: boolean;
  indent?: boolean;
}

function fmt(v: number | undefined, unit: string): string {
  if (v === undefined || v === null) return '—';
  // Trim trailing .0 so "5.0 g" reads "5 g"
  const rounded = Math.round(v * 10) / 10;
  const text = rounded % 1 === 0 ? String(Math.round(rounded)) : String(rounded);
  return `${text} ${unit}`;
}

function buildRows(nf: NutritionalFacts | null): { major: Row[]; vits: Row[] } {
  const v = nf ?? {};
  return {
    major: [
      { label: 'Total Fat', value: v.fat, unit: 'g', bold: true },
      { label: 'Saturated Fat', value: v.saturatedFat, unit: 'g', indent: true },
      { label: 'Trans Fat', value: v.transFat, unit: 'g', indent: true },
      { label: 'Cholesterol', value: v.cholesterol, unit: 'mg', bold: true },
      { label: 'Sodium', value: v.sodium, unit: 'mg', bold: true },
      { label: 'Total Carbohydrate', value: v.carbs, unit: 'g', bold: true },
      { label: 'Dietary Fiber', value: v.fiber, unit: 'g', indent: true },
      { label: 'Total Sugars', value: v.sugars, unit: 'g', indent: true },
      { label: 'Protein', value: v.protein, unit: 'g', bold: true },
    ],
    vits: [
      { label: 'Vitamin A', value: v.vitaminA, unit: 'µg' },
      { label: 'Vitamin D', value: v.vitaminD, unit: 'µg' },
      { label: 'Calcium', value: v.calcium, unit: 'mg' },
      { label: 'Iron', value: v.iron, unit: 'mg' },
      { label: 'Potassium', value: v.potassium, unit: 'mg' },
    ],
  };
}

interface Props {
  recipe: RecipeDetailResponse;
  mode: LabelMode;
}

const W = 360;
const FONT = 'Helvetica, Arial, sans-serif';

export function NutritionLabel({ recipe, mode }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const effectiveMode: LabelMode =
    mode === 'per100g' && !recipe.per100gNutrition ? 'perServing' : mode;

  const nf =
    effectiveMode === 'perServing' ? recipe.perServingNutrition : recipe.per100gNutrition;

  const subtitle =
    effectiveMode === 'perServing'
      ? `Serving size 1 ${recipe.servingUnit ?? 'serving'}${
          recipe.servingWeightGrams != null ? ` (${recipe.servingWeightGrams} g)` : ''
        }`
      : 'Per 100 g';

  const servingsLine =
    effectiveMode === 'perServing'
      ? `Servings per recipe: ${recipe.servings}`
      : recipe.totalWeightGrams != null
        ? `Total weight ${recipe.totalWeightGrams} g`
        : null;

  const { major, vits } = buildRows(nf);

  // ---- Layout: walk top-down assigning Y coordinates. ----
  let y = 0;
  const lines: { y: number; render: () => React.ReactNode }[] = [];

  // Title
  y += 32;
  const titleY = y;
  y += 6;

  // Subtitle
  const subtitleY = y + 14;
  y += 20;

  // Servings sub-line
  let servingsY: number | null = null;
  if (servingsLine) {
    servingsY = y + 14;
    y += 20;
  }

  // Thick divider
  y += 6;
  const thick1Y = y;
  y += 10;

  // Calories
  const caloriesY = y + 22;
  y += 32;

  // Medium divider
  const med1Y = y;
  y += 8;

  // Major rows
  const rowH = 20;
  const majorStartY = y;
  for (let i = 0; i < major.length; i++) {
    const rowY = majorStartY + (i + 1) * rowH - 6;
    lines.push({ y: rowY, render: () => renderRow(major[i], rowY) });
  }
  y = majorStartY + major.length * rowH + 4;

  // Thin divider before vitamins
  const med2Y = y;
  y += 8;

  // Vitamins
  const vitsStartY = y;
  for (let i = 0; i < vits.length; i++) {
    const rowY = vitsStartY + (i + 1) * rowH - 6;
    lines.push({ y: rowY, render: () => renderRow(vits[i], rowY) });
  }
  y = vitsStartY + vits.length * rowH + 4;

  // Bottom thick divider
  const thick2Y = y;
  y += 16;

  const H = y;

  function renderRow(row: Row, rowY: number) {
    const x = row.indent ? 32 : 16;
    return (
      <g>
        <text
          x={x}
          y={rowY}
          fontFamily={FONT}
          fontSize="13"
          fontWeight={row.bold ? 'bold' : 'normal'}
          fill="#000"
        >
          {row.label}
        </text>
        <text
          x={W - 16}
          y={rowY}
          fontFamily={FONT}
          fontSize="13"
          fontWeight={row.bold ? 'bold' : 'normal'}
          fill="#000"
          textAnchor="end"
        >
          {fmt(row.value, row.unit)}
        </text>
      </g>
    );
  }

  function handleDownload() {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = W * scale;
      canvas.height = H * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        if (!b) return;
        const dlUrl = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = dlUrl;
        a.download = `${slugify(recipe.name)}-nutrition.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(dlUrl);
        URL.revokeObjectURL(url);
      }, 'image/png');
    };
    img.src = url;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <svg
          ref={svgRef}
          xmlns="http://www.w3.org/2000/svg"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={{ background: '#fff' }}
        >
          {/* Outer frame */}
          <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="#fff" stroke="#000" />

          {/* Title */}
          <text
            x={16}
            y={titleY}
            fontFamily={FONT}
            fontSize="26"
            fontWeight="900"
            fill="#000"
          >
            Nutrition Facts
          </text>

          {/* Subtitle */}
          <text x={16} y={subtitleY} fontFamily={FONT} fontSize="12" fill="#000">
            {subtitle}
          </text>

          {/* Servings sub-line */}
          {servingsY != null && (
            <text x={16} y={servingsY} fontFamily={FONT} fontSize="12" fill="#000">
              {servingsLine}
            </text>
          )}

          {/* Thick divider */}
          <line x1={0} x2={W} y1={thick1Y} y2={thick1Y} stroke="#000" strokeWidth={7} />

          {/* Calories */}
          <text x={16} y={caloriesY} fontFamily={FONT} fontSize="22" fontWeight="900" fill="#000">
            Calories
          </text>
          <text
            x={W - 16}
            y={caloriesY}
            fontFamily={FONT}
            fontSize="22"
            fontWeight="900"
            fill="#000"
            textAnchor="end"
          >
            {nf?.calories != null ? Math.round(nf.calories) : '—'}
          </text>

          {/* Medium divider before majors */}
          <line x1={0} x2={W} y1={med1Y} y2={med1Y} stroke="#000" strokeWidth={3} />

          {lines.map((l, i) => (
            <g key={i}>{l.render()}</g>
          ))}

          {/* Thin divider before vitamins */}
          <line x1={0} x2={W} y1={med2Y} y2={med2Y} stroke="#000" strokeWidth={1} />

          {/* Bottom thick divider */}
          <line x1={0} x2={W} y1={thick2Y} y2={thick2Y} stroke="#000" strokeWidth={7} />
        </svg>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={handleDownload}>
          Download PNG
        </Button>
      </div>
    </div>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'recipe';
}
