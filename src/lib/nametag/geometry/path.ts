/**
 * Parses the compact outline strings emitted by scripts/build-font-data.mjs and
 * flattens them into closed polygons. Only the command set that script produces is
 * supported: absolute M, L, Q, C and Z.
 */

export type Point = [number, number];
export type Ring = Point[];

interface Cursor {
    i: number;
}

function readNumber(d: string, cur: Cursor): number {
    while (cur.i < d.length && (d[cur.i] === ' ' || d[cur.i] === ',')) cur.i++;
    const start = cur.i;
    if (d[cur.i] === '-' || d[cur.i] === '+') cur.i++;
    while (cur.i < d.length && ((d[cur.i] >= '0' && d[cur.i] <= '9') || d[cur.i] === '.')) cur.i++;
    const value = Number(d.slice(start, cur.i));
    if (Number.isNaN(value)) throw new Error(`Data laluan rosak pada indeks ${start}`);
    return value;
}

function quadraticSteps(p0: Point, p1: Point, p2: Point, tolerance: number): number {
    const control = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    return Math.min(48, Math.max(2, Math.ceil(control / tolerance)));
}

function cubicSteps(p0: Point, p1: Point, p2: Point, p3: Point, tolerance: number): number {
    const control =
        Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
    return Math.min(64, Math.max(2, Math.ceil(control / tolerance)));
}

/**
 * @param d          path data in font units
 * @param tolerance  approximate maximum chord length for curve flattening, in font units
 */
export function flattenPath(d: string, tolerance: number): Ring[] {
    const rings: Ring[] = [];
    let ring: Ring = [];
    let cx = 0;
    let cy = 0;
    let startX = 0;
    let startY = 0;
    const cur: Cursor = { i: 0 };

    const closeRing = () => {
        if (ring.length > 2) rings.push(ring);
        ring = [];
    };

    while (cur.i < d.length) {
        const cmd = d[cur.i];
        cur.i++;
        switch (cmd) {
            case 'M': {
                closeRing();
                cx = startX = readNumber(d, cur);
                cy = startY = readNumber(d, cur);
                ring = [[cx, cy]];
                break;
            }
            case 'L': {
                cx = readNumber(d, cur);
                cy = readNumber(d, cur);
                ring.push([cx, cy]);
                break;
            }
            case 'Q': {
                const x1 = readNumber(d, cur);
                const y1 = readNumber(d, cur);
                const x = readNumber(d, cur);
                const y = readNumber(d, cur);
                const steps = quadraticSteps([cx, cy], [x1, y1], [x, y], tolerance);
                for (let s = 1; s <= steps; s++) {
                    const t = s / steps;
                    const u = 1 - t;
                    ring.push([u * u * cx + 2 * u * t * x1 + t * t * x, u * u * cy + 2 * u * t * y1 + t * t * y]);
                }
                cx = x;
                cy = y;
                break;
            }
            case 'C': {
                const x1 = readNumber(d, cur);
                const y1 = readNumber(d, cur);
                const x2 = readNumber(d, cur);
                const y2 = readNumber(d, cur);
                const x = readNumber(d, cur);
                const y = readNumber(d, cur);
                const steps = cubicSteps([cx, cy], [x1, y1], [x2, y2], [x, y], tolerance);
                for (let s = 1; s <= steps; s++) {
                    const t = s / steps;
                    const u = 1 - t;
                    ring.push([
                        u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
                        u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y
                    ]);
                }
                cx = x;
                cy = y;
                break;
            }
            case 'Z': {
                closeRing();
                cx = startX;
                cy = startY;
                break;
            }
            case ' ':
            case ',':
                break;
            default:
                throw new Error(`Arahan laluan tidak disokong: ${cmd}`);
        }
    }
    closeRing();

    return rings.map(dedupe).filter((r) => r.length > 2);
}

/** Drops consecutive duplicate points, including a closing point equal to the first. */
function dedupe(ring: Ring): Ring {
    const out: Ring = [];
    for (const p of ring) {
        const last = out[out.length - 1];
        if (last && Math.abs(last[0] - p[0]) < 1e-9 && Math.abs(last[1] - p[1]) < 1e-9) continue;
        out.push(p);
    }
    while (out.length > 1) {
        const first = out[0];
        const last = out[out.length - 1];
        if (Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) out.pop();
        else break;
    }
    return out;
}
