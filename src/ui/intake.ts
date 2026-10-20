import { COUNTRIES } from '../core/countries';
import type { Session } from '../core/engine';
import {
  ageFromDob,
  validateParticipant,
  type ParticipantDraft,
  type ParticipantField,
  type ParticipantInfo,
} from '../core/participant';
import { brandBar } from './home';
import { escapeHtml } from './dom';

export interface IntakeHandlers {
  /** Resolves to an error message, or null after the submission has been saved. */
  onSubmit(info: ParticipantInfo): Promise<string | null>;
}

const FIELDS: { name: ParticipantField; label: string; type: 'text' | 'email' | 'tel' | 'date' | 'country'; hint?: string; autocomplete: string }[] = [
  { name: 'fullName', label: 'Full name', type: 'text', autocomplete: 'name' },
  { name: 'dob', label: 'Date of birth', type: 'date', hint: 'Used to score you against your age group.', autocomplete: 'bday' },
  { name: 'email', label: 'Email address', type: 'email', autocomplete: 'email' },
  { name: 'phone', label: 'Phone number', type: 'tel', hint: 'Include your country code, e.g. +1 555 123 4567.', autocomplete: 'tel' },
  { name: 'country', label: 'Country of residence', type: 'country', autocomplete: 'country' },
  { name: 'countryOfBirth', label: 'Country of birth', type: 'country', autocomplete: 'off' },
  { name: 'postalCode', label: 'Postal / ZIP code', type: 'text', autocomplete: 'postal-code' },
];

export function renderIntake(root: HTMLElement, _session: Session, handlers: IntakeHandlers): () => void {
  const today = new Date().toISOString().slice(0, 10);
  const draft: ParticipantDraft = {
    fullName: '',
    dob: '',
    email: '',
    phone: '',
    country: '',
    countryOfBirth: '',
    postalCode: '',
  };

  const countryOptions = ['<option value="" disabled selected>Select a country…</option>', ...COUNTRIES.map((c) => `<option value="${c.code}">${escapeHtml(c.name)}</option>`)].join('');

  root.innerHTML = `
    ${brandBar()}
    <main class="page page--narrow">
      <p class="eyebrow">Almost done</p>
      <h1>Just a few details before your results</h1>
      <p class="lede">Your date of birth lets us score you against others your age, the way professional tests do. Please answer accurately — rough or fake answers make the result less meaningful.</p>
      <form class="card intake" id="intake" novalidate>
        <div class="intake-grid">
          ${FIELDS.map((f) => fieldMarkup(f, today, countryOptions)).join('')}
        </div>
        <p class="intake-privacy">By submitting, I consent to give my data. Your details, score, and score breakdown are saved. Individual questions and answers are not.</p>
        <div class="start-row">
          <p class="muted small" id="intake-summary"></p>
          <button type="submit" class="btn btn--primary btn--lg" id="intake-submit">See my results</button>
        </div>
      </form>
    </main>`;

  const form = root.querySelector<HTMLFormElement>('#intake')!;
  const summary = root.querySelector<HTMLElement>('#intake-summary')!;
  const inputs = new Map<ParticipantField, HTMLInputElement | HTMLSelectElement>();
  for (const f of FIELDS) inputs.set(f.name, form.querySelector(`[name="${f.name}"]`)!);

  const showErrors = (errors: Partial<Record<ParticipantField, string>>) => {
    for (const f of FIELDS) {
      const field = form.querySelector<HTMLElement>(`[data-field="${f.name}"]`)!;
      const errorEl = field.querySelector<HTMLElement>('.field-error')!;
      const error = errors[f.name];
      field.classList.toggle('is-invalid', Boolean(error));
      inputs.get(f.name)!.setAttribute('aria-invalid', error ? 'true' : 'false');
      errorEl.textContent = error ?? '';
    }
  };

  const readDraft = (): ParticipantDraft => {
    for (const f of FIELDS) draft[f.name] = inputs.get(f.name)!.value;
    return draft;
  };

  const updateAge = () => {
    const age = ageFromDob(inputs.get('dob')!.value);
    summary.classList.remove('intake-error');
    summary.textContent = age !== null && age >= 0 && age <= 120 ? `You are ${age} years old. Your results will be scored for this age.` : '';
  };

  inputs.get('dob')!.addEventListener('change', updateAge);
  // Re-validate a field once it has been touched, so errors clear as they're fixed.
  for (const f of FIELDS) {
    const input = inputs.get(f.name)!;
    input.addEventListener('blur', () => {
      if (form.dataset.submitted) showErrors(validateParticipant(readDraft()).errors);
    });
  }

  const submit = form.querySelector<HTMLButtonElement>('#intake-submit')!;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.dataset.submitted = 'true';
    const result = validateParticipant(readDraft());
    showErrors(result.errors);
    if (!result.ok) {
      const firstInvalid = FIELDS.find((f) => result.errors[f.name]);
      if (firstInvalid) inputs.get(firstInvalid.name)!.focus();
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Saving…';
    summary.classList.remove('intake-error');
    const error = await handlers.onSubmit(result.values);
    if (!error) return;
    summary.textContent = error;
    summary.classList.add('intake-error');
    submit.disabled = false;
    submit.textContent = 'See my results';
  });

  return () => form.replaceWith(form.cloneNode(true));
}

function fieldMarkup(
  f: { name: ParticipantField; label: string; type: string; hint?: string; autocomplete: string },
  today: string,
  countryOptions: string,
): string {
  const id = `f-${f.name}`;
  const control =
    f.type === 'country'
      ? `<select id="${id}" name="${f.name}" class="field-input" autocomplete="${f.autocomplete}" aria-describedby="${id}-err">${countryOptions}</select>`
      : `<input id="${id}" name="${f.name}" type="${f.type}" class="field-input" autocomplete="${f.autocomplete}" ${f.type === 'date' ? `max="${today}"` : ''} ${f.type === 'text' ? '' : ''} aria-describedby="${id}-err" />`;
  const wide = f.name === 'fullName' || f.name === 'email' ? ' field--wide' : '';
  return `
    <div class="field${wide}" data-field="${f.name}">
      <label for="${id}">${f.label}</label>
      ${control}
      ${f.hint ? `<span class="field-hint">${f.hint}</span>` : ''}
      <span class="field-error" id="${id}-err" role="alert"></span>
    </div>`;
}
