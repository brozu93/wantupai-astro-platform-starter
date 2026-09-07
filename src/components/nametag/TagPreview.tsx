import { mountingLayout } from '../../lib/nametag/mounting';
import type { NametagSpec, TagLayout } from '../../lib/nametag/types';

interface Props {
    spec: NametagSpec;
    layout: TagLayout | null;
    view: 'front' | 'back';
}

const PAD = 6;

/**
 * Draws the tag from the same layout the STL builder uses, so the preview is the design rather
 * than an impression of it. Model coordinates are millimetres with Y pointing up and the origin
 * at the centre of the plate; the outer group flips Y into SVG's downward axis.
 */
export default function TagPreview({ spec, layout, view }: Props) {
    const width = spec.width + PAD * 2;
    const height = spec.height + PAD * 2;
    const embossed = spec.relief === 'emboss';
    const mounting = mountingLayout(spec);

    const plateFill = 'url(#plate-face)';
    const reliefFill = embossed ? '#F4F6F9' : '#0B0F14';
    // A shadow under raised text, a highlight under cut text: the cheapest honest depth cue.
    const shadowFill = embossed ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.16)';
    const shadowOffset = embossed ? 0.22 : -0.18;

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto w-full"
            role="img"
            aria-label={`Pratonton ${view === 'front' ? 'hadapan' : 'belakang'} tag ${spec.width} kali ${spec.height} milimeter`}
        >
            <defs>
                <linearGradient id="plate-face" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#39424F" />
                    <stop offset="55%" stopColor="#232A34" />
                    <stop offset="100%" stopColor="#1A2029" />
                </linearGradient>
                <linearGradient id="plate-back" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2A313C" />
                    <stop offset="100%" stopColor="#161B22" />
                </linearGradient>
            </defs>

            {/* Model space: centre the origin and flip Y so it points up. */}
            <g transform={`translate(${width / 2} ${height / 2}) scale(1 -1)`}>
                <rect
                    x={-spec.width / 2}
                    y={-spec.height / 2}
                    width={spec.width}
                    height={spec.height}
                    rx={spec.cornerRadius}
                    fill={view === 'front' ? plateFill : 'url(#plate-back)'}
                    stroke="rgba(255,255,255,0.16)"
                    strokeWidth={0.25}
                />

                {view === 'front' ? (
                    <>
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
                                <g opacity={0.85}>
                                    {line.glyphs.map((glyph, i) => (
                                        <path
                                            key={i}
                                            d={glyph.path}
                                            fill={shadowFill}
                                            transform={`translate(${glyph.x} ${glyph.y - shadowOffset}) scale(${glyph.scale})`}
                                        />
                                    ))}
                                </g>
                                {line.glyphs.map((glyph, i) => (
                                    <path key={i} d={glyph.path} fill={reliefFill} transform={`translate(${glyph.x} ${glyph.y}) scale(${glyph.scale})`} />
                                ))}
                            </g>
                        ))}

                        {mounting.lanyard && (
                            <rect
                                x={mounting.lanyard.cx - mounting.lanyard.length / 2}
                                y={mounting.lanyard.cy - mounting.lanyard.width / 2}
                                width={mounting.lanyard.length}
                                height={mounting.lanyard.width}
                                rx={mounting.lanyard.width / 2}
                                fill="#0A0D11"
                                stroke="rgba(255,255,255,0.2)"
                                strokeWidth={0.2}
                            />
                        )}
                    </>
                ) : (
                    <>
                        {/* Mirrored, because this is the face you see when the tag is turned over. */}
                        <g transform="scale(-1 1)">
                            {mounting.magnets.map((magnet, i) => (
                                <g key={i}>
                                    <circle cx={magnet.cx} cy={magnet.cy} r={magnet.radius} fill="#0A0D11" stroke="rgba(255,255,255,0.22)" strokeWidth={0.25} />
                                    <circle cx={magnet.cx} cy={magnet.cy} r={Math.max(0.4, magnet.radius - 0.6)} fill="none" stroke="rgba(245,165,36,0.45)" strokeWidth={0.2} />
                                </g>
                            ))}

                            {mounting.pin && (
                                <rect
                                    x={-mounting.pin.length / 2}
                                    y={-mounting.pin.width / 2}
                                    width={mounting.pin.length}
                                    height={mounting.pin.width}
                                    rx={mounting.pin.corner}
                                    fill="#0A0D11"
                                    stroke="rgba(255,255,255,0.22)"
                                    strokeWidth={0.25}
                                />
                            )}

                            {mounting.lanyard && (
                                <rect
                                    x={mounting.lanyard.cx - mounting.lanyard.length / 2}
                                    y={mounting.lanyard.cy - mounting.lanyard.width / 2}
                                    width={mounting.lanyard.length}
                                    height={mounting.lanyard.width}
                                    rx={mounting.lanyard.width / 2}
                                    fill="#0A0D11"
                                    stroke="rgba(255,255,255,0.2)"
                                    strokeWidth={0.2}
                                />
                            )}
                        </g>

                        {mounting.magnets.length === 0 && !mounting.pin && !mounting.lanyard && (
                            <text x="0" y="0" transform="scale(1 -1)" textAnchor="middle" fill="rgba(230,233,238,0.45)" fontSize="3">
                                Belakang rata
                            </text>
                        )}
                    </>
                )}
            </g>
        </svg>
    );
}
