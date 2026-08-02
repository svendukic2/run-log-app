// Input / Field from the design library: label above a bordered box, with an
// optional inline validation message below.
interface TextFieldProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  error?: string;
}

export default function TextField({
  id,
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
  error,
}: TextFieldProps) {
  return (
    <div className="flex flex-1 flex-col gap-2">
      <label htmlFor={id} className="text-[13px] font-medium text-secondary">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="w-full rounded-[12px] border border-line-strong bg-white px-[15px] py-[13px] text-[15px] leading-[1.55] text-ink placeholder:text-tertiary"
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-accent-pressed">
          {error}
        </p>
      ) : null}
    </div>
  );
}
