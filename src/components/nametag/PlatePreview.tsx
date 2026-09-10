import type { Lang } from '../../i18n';
import { DEFAULT_LANG } from '../../i18n';
import { useTranslations } from '../../i18n/ui';
import type { Arrangement } from '../../lib/nametag/plate';
import type { NametagSpec, TagLayout } from '../../lib/nametag/types';

interface Props {
    lang?: Lang;
    spec: NametagSpec;
    arrangement: Arrangement;
    /** One layout per slot index; a missing entry draws an empty plate. */
    layouts: Array<TagLayout | null>;
    bedWidth: number;
    bedHeight: number;
    /** Draws the bed outline behind the tags, so it is obvious how much room is left. */
    showBed: boolean;
}

const PAD = 8;

/**
 * The whole list as it will sit on the bed.
 *
 * Every tag is drawn from the same layout the STL builder consumes, so this is the print, not a
 * mock-up of it: if a name is going to run into the plate edge, it does so here first. Depth
 * cues are dropped at this zoom - sixty drop shadows cost a thousand extra nodes and read as
 * mud - so the plate view is deliberately flat, and the single-tag view keeps the shading.
 */
export default function PlatePreview({ spec, arrangement, layouts, bedWidth, bedHeight, showBed, lang = DEFAULT_LANG }: Props) {
    const t = useTranslations(lang);
    const contentWidth = showBed ? Math.max(bedWidth, arrangement.width) : arrangement.width;
    const contentHeight = showBed ? Math.max(bedHeight, arrangement.height) : arrangement.height;
    const width = contentWidth + PAD * 2;
    const height = contentHeight + PAD * 2;
    const reliefFill = spec.relief === 'emboss' ? '#F4F6F9' : '#0B0F14';

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto w-full"
            role="img"
            aria-label={t('studio.preview.plateAria', {
                count: arrangement.placed,
                columns: arrangement.columns,
                rows: arrangement.rows
            })}
        >
            <defs>
                <linearGradient id="plate-grid-face" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#39424F" />
                    <stop offset="55%" stopColor="#232A34" />
                    <stop offset="100%" stopColor="#1A2029" />
                </linearGradient>
            </defs>

            {/* Model space: centre the origin and flip Y so it points up, as in the tag view. */}
            <g transform={`translate(${width / 2} ${height / 2}) scale(1 -1)`}>
                {showBed && (
                    <rect
                        x={-bedWidth / 2}
                        y={-bedHeight / 2}
                        width={bedWidth}
                        height={bedHeight}
                        fill="rgba(255,255,255,0.03)"
                        stroke="rgba(245,165,36,0.35)"
                        strokeWidth={Math.max(0.4, contentWidth / 400)}
                        strokeDasharray={`${contentWidth / 60} ${contentWidth / 90}`}
                    />
                )}

                {arrangement.slots.map((slot) => {
                    const layout = layouts[slot.index] ?? null;
                    return (
                        <g key={slot.index} transform={`translate(${slot.cx} ${slot.cy})`}>
                            <rect
                                x={-spec.width / 2}
                                y={-spec.height / 2}
                                width={spec.width}
                                height={spec.height}
                                rx={spec.cornerRadius}
                                fill="url(#plate-grid-face)"
                                stroke="rgba(255,255,255,0.16)"
                                strokeWidth={0.25}
                            />

                            {spec.frame.enabled && (
                                <rect
                                    x={-spec.width / 2 + spec.frame.inset + spec.frame.width / 2}
                                    y={-spec.height / 2 + spec.frame.inset + spec.frame.width / 2}
                                    width={Math.max(0, spec.width - (spec.frame.inset + spec.frame.width / 2) * 2)}
                                    height={Math.max(0, spec.height - (spec.frame.inset + spec.frame.width / 2) * 2)}
                                    rx={Math.max(0, spec.cornerRadius - spec.frame.inset)}
                                    fill="none"
                                    stroke={reliefFill}
                                    strokeWidth={spec.frame.width}
                                />
                            )}

                            {layout?.lines.map((line, lineIndex) => (
                                <g key={lineIndex}>
                                    {line.glyphs.map((glyph, i) => (
                                        <path
                                            key={i}
                                            d={glyph.path}
                                            fill={reliefFill}
                                            transform={`translate(${glyph.x} ${glyph.y}) scale(${glyph.scale})`}
                                        />
                                    ))}
                                </g>
                            ))}
                        </g>
                    );
                })}
            </g>
        </svg>
    );
}
