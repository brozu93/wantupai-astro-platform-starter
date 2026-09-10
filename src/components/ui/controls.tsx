import type { ReactNode } from 'react';

/** Small form primitives shared by the studio panels. */

interface FieldProps {
    label: string;
    hint?: string;
    children: ReactNode;
}

export function Field({ label, hint, children }: FieldProps) {
    return (
        <label className="block">
            <span className="field-label">{label}</span>
            {children}
            {hint && <span className="mt-1 block text-xs text-graphite-400">{hint}</span>}
        </label>
    );
}

interface TextFieldProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    maxLength?: number;
    hint?: string;
}

export function TextField({ label, value, onChange, placeholder, maxLength, hint }: TextFieldProps) {
    return (
        <Field label={label} hint={hint}>
            <input
                type="text"
                className="input input-bordered w-full bg-graphite-900/70"
                value={value}
                placeholder={placeholder}
                maxLength={maxLength}
                onChange={(event) => onChange(event.target.value)}
            />
        </Field>
    );
}

interface NumberFieldProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    onChange: (value: number) => void;
    hint?: string;
}

/**
 * A slider paired with a numeric readout. Every dimension in the studio is a real millimetre
 * measurement, so the exact number always stays visible next to the slider.
 */
export function NumberField({ label, value, min, max, step = 0.1, unit = 'mm', onChange, hint }: NumberFieldProps) {
    return (
        <div>
            <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="field-label mb-0">{label}</span>
                <span className="tabular text-sm font-semibold text-brass-300">
                    {Number(value.toFixed(2))} {unit}
                </span>
            </div>
            <div className="flex items-center gap-3">
                <input
                    type="range"
                    className="range range-xs range-primary grow"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(event) => onChange(Number(event.target.value))}
                    aria-label={label}
                />
                <input
                    type="number"
                    className="input input-bordered input-sm tabular w-20 bg-graphite-900/70"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(event) => {
                        const next = Number(event.target.value);
                        if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
                    }}
                    aria-label={`${label} (nilai tepat)`}
                />
            </div>
            {hint && <span className="mt-1 block text-xs text-graphite-400">{hint}</span>}
        </div>
    );
}

interface SelectFieldProps<T extends string> {
    label: string;
    value: T;
    options: Array<{ value: T; label: string }>;
    onChange: (value: T) => void;
    hint?: string;
}

export function SelectField<T extends string>({ label, value, options, onChange, hint }: SelectFieldProps<T>) {
    return (
        <Field label={label} hint={hint}>
            <select className="select select-bordered w-full bg-graphite-900/70" value={value} onChange={(event) => onChange(event.target.value as T)}>
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </Field>
    );
}

interface SegmentedProps<T extends string> {
    label: string;
    value: T;
    options: Array<{ value: T; label: string }>;
    onChange: (value: T) => void;
}

export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
    return (
        <div>
            <span className="field-label">{label}</span>
            <div className="join w-full" role="group" aria-label={label}>
                {options.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={value === option.value}
                        onClick={() => onChange(option.value)}
                        className={`btn btn-sm join-item grow ${value === option.value ? 'btn-primary' : 'btn-outline border-white/15 text-graphite-200'}`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

interface ToggleProps {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    hint?: string;
}

export function Toggle({ label, checked, onChange, hint }: ToggleProps) {
    return (
        <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="toggle toggle-primary toggle-sm mt-0.5" checked={checked} onChange={(event) => onChange(event.target.checked)} />
            <span>
                <span className="block text-sm font-medium">{label}</span>
                {hint && <span className="block text-xs text-graphite-400">{hint}</span>}
            </span>
        </label>
    );
}

interface SectionProps {
    title: string;
    summary?: string;
    open?: boolean;
    children: ReactNode;
}

export function Section({ title, summary, open = false, children }: SectionProps) {
    return (
        <details className="panel group" open={open}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <span>
                    <span className="block text-sm font-semibold">{title}</span>
                    {summary && <span className="block text-xs text-graphite-400">{summary}</span>}
                </span>
                <svg className="h-4 w-4 shrink-0 transition group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.75" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </summary>
            <div className="space-y-4 border-t border-white/10 px-4 py-4">{children}</div>
        </details>
    );
}
