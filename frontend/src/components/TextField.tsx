// Input / Field from the design library: label above a bordered box, with an
// optional inline validation message below.
interface TextFieldProps {
  id: string;
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  // Which on-screen keyboard a phone should offer (RUN-23: a decimal pad for
  // distance, a numeric one for duration).
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  error?: string;
  // React 19 passes `ref` like any other prop; forwarded so a form can put the
  // caret in its first field.
  ref?: React.Ref<HTMLInputElement>;
}

export default function TextField({
  id,
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
  inputMode,
  error,
  ref,
}: TextFieldProps) {
  return (
    <div className="flex flex-1 flex-col gap-2">
      <label htmlFor={id} className="text-[13px] font-medium text-secondary">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        name={id}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        // The designed 15px only applies from `sm` up: iOS zooms into any field
        // it renders below 16px, which would throw the layout on a phone.
        className="w-full rounded-[12px] border border-line-strong bg-white px-[15px] py-[13px] text-[16px] leading-[1.55] text-ink placeholder:text-tertiary sm:text-[15px]"
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-accent-pressed">
          {error}
        </p>
      ) : null}
    </div>
  );
}
