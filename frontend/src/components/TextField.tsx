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
  // The API's own bound on this field, mirrored so typing stops where the
  // request would have been rejected (RUN-79). Whoever passes it owns the
  // comment naming the backend constant it mirrors.
  maxLength?: number;
  // A non-error note under the field, for something true about the value
  // that is not wrong with it - a bound the browser has just enforced, say.
  // Distinct from `error` on purpose: it leaves aria-invalid alone, because
  // a value the form will happily save is not invalid. Ignored while an
  // error is showing, which is the one thing the user needs to read first.
  hint?: string;
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
  maxLength,
  hint,
  error,
  ref,
}: TextFieldProps) {
  const shownHint = error ? undefined : hint;
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
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : shownHint ? `${id}-hint` : undefined}
        // The designed 15px only applies from `sm` up: iOS zooms into any field
        // it renders below 16px, which would throw the layout on a phone.
        className="w-full rounded-[12px] border border-line-strong bg-white px-[15px] py-[13px] text-[16px] leading-[1.55] text-ink placeholder:text-tertiary sm:text-[15px]"
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-accent-pressed">
          {error}
        </p>
      ) : maxLength !== undefined ? (
        // role="status", not "alert": this is polite information, and an
        // assertive announcement on every keystroke past the bound would talk
        // over the user.
        //
        // Mounted from the start and EMPTY until there is something to say,
        // unlike the error line above (review fix): a live region inserted
        // into the DOM already holding its text is frequently not announced
        // at all, which would leave the hint visible to sighted users only -
        // and a silently truncated paste is precisely the case a sighted user
        // catches and a screen reader user does not. `sr-only` takes the
        // empty one out of the flow, so it cannot add the column gap an
        // empty <p> otherwise would.
        <p
          id={`${id}-hint`}
          role="status"
          className={shownHint ? 'text-[13px] text-tertiary' : 'sr-only'}
        >
          {shownHint ?? ''}
        </p>
      ) : null}
    </div>
  );
}
