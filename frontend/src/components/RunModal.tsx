'use client';

import { useEffect, useRef, useState } from 'react';
import EffortField from '@/components/EffortField';
import RouteStep, { type RoutePlanFailure } from '@/components/RouteStep';
import TextArea from '@/components/TextArea';
import TextField from '@/components/TextField';
import { mutationErrorMessage } from '@/lib/session';
import useFocusTrap from '@/lib/useFocusTrap';
import {
  addRun,
  emptyRunForm,
  enteredDistanceKm,
  runToForm,
  toRunDraft,
  updateRun,
  validateRunForm,
  type Run,
  type RouteWaypoint,
  type RunFormErrors,
  type RunFormField,
  type RunFormValues,
  type RunRoute,
} from '@/lib/runs';

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export const RUN_MODAL_TITLE_ID = 'run-modal-title';

// Field ids double as the anchor for "focus the first thing that failed", so
// they live in one place and in the order the form reads.
const FIELD_IDS: Record<RunFormField, string> = {
  routeName: 'run-route-name',
  distance: 'run-distance',
  duration: 'run-duration',
  date: 'run-date',
};
const FIELD_ORDER: RunFormField[] = ['routeName', 'distance', 'duration', 'date'];

// Mirrors ROUTE_NAME_MAX_LENGTH and NOTE_MAX_LENGTH in the backend's
// create-run.dto.ts, which is the source of truth for both. Hand-mirrored
// because the frontend cannot import across the app boundary - the same wart
// CLAUDE.md documents for HelloResponse, and the same shape RUN-62 used for
// the search bound in PeopleView. Without them a runner can type 3000
// characters and learn about the limit from a rejected save (RUN-79 AC1).
const ROUTE_NAME_MAX_LENGTH = 120;
const NOTE_MAX_LENGTH = 2000;

// maxLength refuses further typing silently, which is invisible and fine for
// a 2000 character note nobody reaches. The route name is different: 120
// characters is reachable by pasting, and a name that arrives truncated with
// no explanation looks like the app ate it. One line, and only once the
// bound is actually reached - not a character counter ticking from the
// first keystroke.
const ROUTE_NAME_LIMIT_HINT = `Route names stop at ${ROUTE_NAME_MAX_LENGTH} characters.`;

// Two steps since RUN-54 (Figma "STEP 1 OF 2" / "STEP 2 OF 2"): the run's
// details, then the optional route. The order is what AC1 asks for - the map
// only opens on a valid form - and it is also the only order that lets the
// mismatch hint exist, since it needs a distance to compare against.
const STEPS = ['details', 'route'] as const;
type Step = (typeof STEPS)[number];

interface RunModalProps {
  // Without a run this is "Add run" (design node 67:345, RUN-23); with one it
  // is the same form titled "Edit run" (node 69:88, RUN-28 EDT-1), prefilled
  // with that run's values and saving over it instead of creating a new one.
  run?: Run;
  onClose: () => void;
}

// The Add/Edit run modal. Rendered only while open, so every opening is a
// fresh mount: adding starts from today's date and Medium effort without
// anything having to reset them (RUN-23 AC1), editing from the run's stored
// values (RUN-28 AC1).
//
// Dismissal mirrors the shell's navigation drawer (Escape, scrim click) so the
// two overlays behave the same. Below `sm` the card is a bottom sheet, which
// keeps it reachable one-handed instead of floating mid-screen, and the form
// scrolls inside a capped card so the buttons stay on screen on a short phone.
export default function RunModal({ run, onClose }: RunModalProps) {
  const [step, setStep] = useState<Step>('details');
  const [values, setValues] = useState<RunFormValues>(() =>
    run ? runToForm(run) : emptyRunForm(),
  );
  const [errors, setErrors] = useState<RunFormErrors>({});
  // The route lives here, not inside the Route step, for one reason: a trip
  // back to step 1 unmounts that step, and placed points must survive it.
  // Seeded from the stored route when editing, which is the whole of AC5 -
  // the picker restores its markers because they were kept alongside the
  // polyline (docs/data-model.md).
  const [points, setPoints] = useState<RouteWaypoint[]>(() => run?.route?.waypoints ?? []);
  const [route, setRoute] = useState<RunRoute | null>(() => run?.route ?? null);
  // Also here rather than inside the Route step, and for two separate reasons:
  // the step is unmounted by "Back", so a failure the user has not read yet
  // would be forgotten; and the Save button below has to know a plan is still
  // running, or it saves route: null and silently discards the line arriving a
  // moment later.
  const [planningRoute, setPlanningRoute] = useState(false);
  const [planError, setPlanError] = useState<RoutePlanFailure | null>(null);
  // The save round-trips to the API since RUN-48: `saving` disables the
  // buttons against a double submit, `saveError` is the inline line the
  // app-wide error pattern prescribes (modal stays open, nothing saved).
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const routeNameRef = useRef<HTMLInputElement>(null);
  const routeStepRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // aria-modal="true" is a promise that Tab cannot leave the dialog; before
  // RUN-75 it was only a claim, and Tab walked onto the page behind the scrim.
  useFocusTrap(dialogRef, true);

  const setValue = <Field extends keyof RunFormValues>(field: Field, value: RunFormValues[Field]) =>
    setValues((current) => ({ ...current, [field]: value }));

  // Dismissal is refused while a save is in flight (RUN-68 review fix,
  // back-ported here: the two modals share the pattern): closing mid-save
  // would unmount the modal, a late failure's inline error would land on an
  // unmounted component, and the user would walk away believing a run is
  // saved that never was. Escape here, the scrim, Cancel and the X below
  // all share the gate.
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, saving]);

  useEffect(() => {
    // Land on the first field: the point of the modal is logging a run in
    // seconds, and it keeps keyboard and screen-reader users out from behind
    // the scrim.
    routeNameRef.current?.focus();

    // Stop the page behind the dialog from scrolling under the user's finger.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Focus follows the step, so the map is not something a keyboard user has to
  // find behind the fields they just left. Skipped on the first render, where
  // the effect above already put focus on the first field.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (step === 'route') routeStepRef.current?.focus();
    else routeNameRef.current?.focus();
  }, [step]);

  // Saving is refused while a route plan is in flight (RUN-54): the answer is
  // seconds away and saving now would store route: null, then discard the line
  // the moment it lands - a route the user watched being drawn and never got.
  // Bounded either way, because the plan request carries the app-wide timeout.
  const submitBlocked = saving || (step === 'route' && planningRoute);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitBlocked) return;

    // Editing applies the same rules as adding (EDT-3: ADD-5 to ADD-8).
    const nextErrors = validateRunForm(values);
    setErrors(nextErrors);

    const firstInvalid = FIELD_ORDER.find((field) => nextErrors[field]);
    if (firstInvalid) {
      // Nothing is saved and the modal stays open (AC4); moving focus means the
      // error is announced and reachable without hunting for it.
      document.getElementById(FIELD_IDS[firstInvalid])?.focus();
      return;
    }

    // The route step only opens on a valid form (AC1), which is also why the
    // validation above runs on BOTH steps: the details are still editable
    // after a trip back, so the last word on them is here, at the save.
    if (step === 'details') {
      setStep('route');
      return;
    }

    // Pace is derived from what was entered, never asked for (ADD-4). Saving
    // goes through the API (RUN-48) and updates the cache, so list, detail,
    // dashboard and records all refresh (EDT-2). An edit of a run deleted
    // elsewhere resolves null: the run is gone either way, so the modal
    // closes and the screens refresh from the cache.
    setSaving(true);
    setSaveError(null);
    try {
      // The route rides along explicitly, null included: null is how the API
      // is told there is no route (AC3), and on an edit it is what makes a
      // cleared map survive the save instead of silently keeping the old line.
      if (run) {
        await updateRun(run.id, toRunDraft(values, route));
      } else {
        await addRun(toRunDraft(values, route));
      }
      onClose();
    } catch (error) {
      // The failure keeps the modal open with everything typed intact:
      // closing would silently discard a run the user believes is saved.
      setSaving(false);
      setSaveError(mutationErrorMessage(error));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        aria-hidden="true"
        data-testid="run-modal-backdrop"
        onClick={saving ? undefined : onClose}
        className="fixed inset-0 bg-ink/60"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={RUN_MODAL_TITLE_ID}
        className="relative z-10 flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[20px] bg-white shadow-[0_24px_60px_0_rgba(0,0,0,0.22)] sm:max-h-[calc(100dvh-48px)] sm:rounded-[20px]"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-5 sm:pt-[24px] sm:pr-[24px] sm:pb-[24px] sm:pl-[28px]">
          <h2
            id={RUN_MODAL_TITLE_ID}
            className="font-display text-[20px] font-bold tracking-[-0.4px] text-text-primary"
          >
            {run ? 'Edit run' : 'Add run'}
          </h2>
          <div className="flex shrink-0 items-center gap-4">
            {/* The step counter (design node 217:759). Text, not dots: with two
                steps it is the only "where am I" cue and it has to be readable
                by a screen reader as well as glanceable. */}
            <p className="text-[11px] font-semibold tracking-[1.1px] text-tertiary uppercase">
              Step {STEPS.indexOf(step) + 1} of {STEPS.length}
            </p>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              aria-label="Close"
              // 34x34 drawn, 44x44 tapped (RUN-75 AC3, the RUN-64 pattern), on
              // touch only: ungated it would enlarge :hover on a mouse as well.
              className="relative flex size-[34px] shrink-0 items-center justify-center rounded-[10px] text-secondary pointer-coarse:before:absolute pointer-coarse:before:-inset-[5px] pointer-coarse:before:content-[''] hover:bg-muted hover:text-ink disabled:cursor-default disabled:opacity-60"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <form noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          {/* Both steps live in one <form>, and the details step is hidden with
              display:none rather than unmounted: its inputs ARE the run, and
              unmounting them would throw away everything typed the moment the
              map opens. Hiding it this way also takes it out of the tab order
              and the accessibility tree, so the two steps never overlap for a
              screen reader either. Toggling the `flex`/`hidden` utility (not
              the `hidden` attribute) is deliberate - the attribute's UA rule
              loses to any display class next to it. */}
          <div
            className={`${
              step === 'details' ? 'flex' : 'hidden'
            } min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto overscroll-contain border-y border-muted px-5 pt-5 pb-[26px] sm:px-[28px] sm:pt-[24px]`}
          >
            <TextField
              ref={routeNameRef}
              id={FIELD_IDS.routeName}
              label="Route name"
              placeholder="e.g. Evening tempo"
              value={values.routeName}
              onChange={(value) => setValue('routeName', value)}
              maxLength={ROUTE_NAME_MAX_LENGTH}
              hint={
                values.routeName.length >= ROUTE_NAME_MAX_LENGTH ? ROUTE_NAME_LIMIT_HINT : undefined
              }
              error={errors.routeName}
            />

            {/* Two up in the design; stacked on a phone, where a shared row
                leaves neither field wide enough to read its own value. */}
            <div className="flex flex-col gap-[18px] sm:flex-row sm:gap-4">
              <TextField
                id={FIELD_IDS.distance}
                label="Distance (km)"
                placeholder="0.0"
                inputMode="decimal"
                value={values.distance}
                onChange={(value) => setValue('distance', value)}
                error={errors.distance}
              />
              <TextField
                id={FIELD_IDS.duration}
                label="Duration"
                placeholder="00:00"
                inputMode="numeric"
                value={values.duration}
                onChange={(value) => setValue('duration', value)}
                error={errors.duration}
              />
            </div>

            {/* A native date input in place of the designed calendar glyph: it
                brings its own picker, and on a phone that is the OS wheel
                rather than a control we would have to build. */}
            <TextField
              id={FIELD_IDS.date}
              type="date"
              label="Date"
              value={values.date}
              onChange={(value) => setValue('date', value)}
              error={errors.date}
            />

            <EffortField value={values.effort} onChange={(effort) => setValue('effort', effort)} />

            <TextArea
              id="run-note"
              label="Note (optional)"
              placeholder="How did it feel? Terrain, weather, splits…"
              value={values.note}
              onChange={(value) => setValue('note', value)}
              maxLength={NOTE_MAX_LENGTH}
            />
          </div>

          {/* The route step, mounted only while it is the current step: unlike
              the fields above it holds no typed input (the points and the
              planned route live in this component's state), so unmounting
              costs nothing and keeps the map - and its tile requests - out of
              existence until someone asks for it. */}
          {step === 'route' && (
            <div
              ref={routeStepRef}
              tabIndex={-1}
              className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain border-y border-muted px-5 pt-5 pb-[26px] outline-none sm:px-[28px] sm:pt-[24px]"
            >
              <RouteStep
                points={points}
                onPointsChange={setPoints}
                route={route}
                onRouteChange={setRoute}
                enteredDistanceKm={enteredDistanceKm(values)}
                planning={planningRoute}
                onPlanningChange={setPlanningRoute}
                planError={planError}
                onPlanErrorChange={setPlanError}
              />
            </div>
          )}

          {/* Full-width and stacked on a phone, which puts the primary action
              closest to the thumb without reordering it away from the design. */}
          <div className="flex shrink-0 flex-col gap-3 px-5 py-4 sm:px-[28px] sm:py-[18px]">
            {/* The API-failure line (RUN-48). role=alert so the failure is
                announced from behind the modal's focus; rendered only with
                content so an empty live region never mounts. */}
            {saveError && (
              <p role="alert" className="text-[13px] leading-[1.5] text-accent-pressed">
                {saveError}
              </p>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end sm:gap-[12px]">
              {/* DEVIATION from the Figma frame, which labels this "Cancel" on
                  both steps: on step 2 it is "Back". Without it the only way
                  out of the route step is cancelling the whole run, and the
                  mismatch hint explicitly invites reconsidering the distance
                  that was typed on step 1. Cancelling is still one click away -
                  the X in the header, which never changes meaning. */}
              <button
                type="button"
                onClick={step === 'route' ? () => setStep('details') : onClose}
                disabled={saving}
                className="flex w-full items-center justify-center rounded-[14px] border border-line-strong bg-white px-[28px] py-[16px] text-[16px] font-semibold text-text-primary hover:bg-muted disabled:cursor-default disabled:opacity-60 sm:w-auto"
              >
                {step === 'route' ? 'Back' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={submitBlocked}
                className="flex w-full items-center justify-center gap-[9px] rounded-[14px] bg-accent px-[28px] py-[16px] text-[16px] font-semibold text-white hover:bg-accent-pressed disabled:cursor-default disabled:opacity-60 sm:w-auto"
              >
                {saving
                  ? 'Saving…'
                  : // "Next" rather than "Save" on step 1, because the route
                    // step is where the save happens (design node 214:1156).
                    // The step never blocks anything: arriving there and
                    // pressing Save with an empty map stores the run exactly as
                    // it did before RUN-54 (AC3).
                    step === 'details'
                    ? 'Next'
                    : run
                      ? 'Save changes'
                      : 'Save run'}
                <span aria-hidden="true" className="text-[17px]">
                  →
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
