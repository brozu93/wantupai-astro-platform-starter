import type { NametagSpec } from './types';

export interface Preset {
    id: string;
    label: string;
    description: string;
    spec: NametagSpec;
}

function base(overrides: Partial<NametagSpec> & { preset: string }): NametagSpec {
    return {
        width: 76,
        height: 25,
        thickness: 3,
        cornerRadius: 2,
        relief: 'emboss',
        reliefDepth: 0.8,
        align: 'center',
        marginX: 4,
        marginY: 3,
        lineGap: 1.6,
        frame: { enabled: false, inset: 2, width: 1 },
        mounting: 'magnet',
        magnet: { diameter: 8, thickness: 2, count: 2 },
        lines: [],
        ...overrides
    };
}

export const PRESETS: Preset[] = [
    {
        id: 'guru',
        label: 'Guru & Staf Sekolah',
        description: '76 × 25 mm — nama dan jawatan. Saiz paling lazim untuk tag nama guru.',
        spec: base({
            preset: 'guru',
            lines: [
                { text: 'MOHAMAD ZAID BIN ALI', font: 'sans-bold', size: 4, tracking: 0.1, transform: 'upper' },
                { text: 'Guru Reka Bentuk & Teknologi', font: 'sans-regular', size: 2.9, tracking: 0, transform: 'none' }
            ]
        })
    },
    {
        id: 'penjawat-awam',
        label: 'Penjawat Awam',
        description: '80 × 25 mm — nama, jawatan dan jabatan pada tiga baris.',
        spec: base({
            preset: 'penjawat-awam',
            width: 80,
            marginY: 2.5,
            lineGap: 1.2,
            lines: [
                { text: 'NURUL AIN BINTI HASSAN', font: 'sans-bold', size: 3.9, tracking: 0.1, transform: 'upper' },
                { text: 'Penolong Pegawai Tadbir', font: 'sans-regular', size: 2.8, tracking: 0, transform: 'none' },
                { text: 'Jabatan Pendidikan Negeri', font: 'narrow-regular', size: 2.4, tracking: 0, transform: 'none' }
            ]
        })
    },
    {
        id: 'korporat',
        label: 'Baju Korporat / Kedai',
        description: '75 × 22 mm dengan bingkai timbul — sesuai untuk staf kedai dan bisnes.',
        spec: base({
            preset: 'korporat',
            width: 75,
            height: 22,
            thickness: 2.6,
            cornerRadius: 3,
            marginY: 2.5,
            frame: { enabled: true, inset: 1.5, width: 0.9 },
            lines: [
                { text: 'Aisyah', font: 'sans-bold', size: 5, tracking: 0.2, transform: 'none' },
                { text: 'Penyelia Jualan', font: 'sans-regular', size: 2.8, tracking: 0, transform: 'none' }
            ]
        })
    },
    {
        id: 'pelajar',
        label: 'Pelajar Sekolah',
        description: '70 × 20 mm — nama dan kelas, ditebuk untuk tali leher.',
        spec: base({
            preset: 'pelajar',
            width: 70,
            height: 20,
            thickness: 2.4,
            marginY: 2.5,
            lineGap: 1.2,
            mounting: 'lanyard',
            lines: [
                { text: 'AHMAD DANIAL', font: 'sans-bold', size: 4.4, tracking: 0.1, transform: 'upper' },
                { text: '4 Amanah', font: 'sans-regular', size: 2.8, tracking: 0, transform: 'none' }
            ]
        })
    },
    {
        id: 'tersuai',
        label: 'Tersuai',
        description: 'Mula dari plat kosong dan tetapkan sendiri setiap ukuran.',
        spec: base({
            preset: 'tersuai',
            mounting: 'none',
            lines: [{ text: 'NAMA ANDA', font: 'sans-bold', size: 5, tracking: 0.1, transform: 'upper' }]
        })
    }
];

export const DEFAULT_PRESET = PRESETS[0];

export function findPreset(id: string): Preset | undefined {
    return PRESETS.find((preset) => preset.id === id);
}

/** Hard limits enforced on both the client and the server. */
export const LIMITS = {
    width: { min: 30, max: 160 },
    height: { min: 12, max: 90 },
    thickness: { min: 1.2, max: 8 },
    cornerRadius: { min: 0, max: 20 },
    reliefDepth: { min: 0.2, max: 2.5 },
    marginX: { min: 1, max: 25 },
    marginY: { min: 0.5, max: 25 },
    lineGap: { min: 0, max: 15 },
    lineSize: { min: 1.8, max: 30 },
    tracking: { min: -1, max: 4 },
    frameInset: { min: 0.4, max: 12 },
    frameWidth: { min: 0.4, max: 6 },
    magnetDiameter: { min: 3, max: 25 },
    magnetThickness: { min: 0.6, max: 6 },
    maxLines: 4,
    maxCharsPerLine: 64,
    maxBatchRows: 60
} as const;
