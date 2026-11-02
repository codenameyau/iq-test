import { validateContact } from '../core/participant';
import { brandBar } from './home';

export interface ContactDetails {
  fullName: string;
  email: string;
  phone: string;
}

export function renderIntake(root: HTMLElement, onSubmit: (contact: ContactDetails) => Promise<void>): void {
  root.innerHTML = `
    ${brandBar()}
    <main class="page page--narrow">
      <p class="eyebrow">Before your results</p>
      <h1>See your score</h1>
      <p class="lede">Enter your details. Your result is on the next screen.</p>
      <form class="card intake" id="intake" novalidate>
        <div class="field field--wide">
          <label for="f-name">Full name</label>
          <input class="field-input" id="f-name" name="fullName" autocomplete="name" aria-describedby="e-name" required />
          <p class="field-error" id="e-name"></p>
        </div>
        <div class="field field--wide">
          <label for="f-email">Email</label>
          <input class="field-input" id="f-email" name="email" type="email" autocomplete="email" inputmode="email" aria-describedby="e-email" required />
          <p class="field-error" id="e-email"></p>
        </div>
        <div class="field field--wide">
          <label for="f-phone">Phone number</label>
          <input class="field-input" id="f-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" aria-describedby="e-phone" required />
          <p class="field-error" id="e-phone"></p>
        </div>
        <p class="intake-privacy">Your name, email and phone are sent with your score, test length, time taken and IP address.</p>
        <p class="intake-error" id="intake-status" role="alert" hidden></p>
        <button class="btn btn--primary btn--lg" type="submit" id="see-results">See my results</button>
      </form>
    </main>`;

  const form = root.querySelector<HTMLFormElement>('#intake')!;
  const status = root.querySelector<HTMLElement>('#intake-status')!;
  const button = root.querySelector<HTMLButtonElement>('#see-results')!;
  const fields = {
    fullName: root.querySelector<HTMLInputElement>('#f-name')!,
    email: root.querySelector<HTMLInputElement>('#f-email')!,
    phone: root.querySelector<HTMLInputElement>('#f-phone')!,
  };

  const showErrors = (errors: Partial<Record<keyof typeof fields, string>>) => {
    for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
      const input = fields[key];
      const message = errors[key] ?? '';
      const wrap = input.closest('.field')!;
      wrap.classList.toggle('is-invalid', Boolean(message));
      input.setAttribute('aria-invalid', String(Boolean(message)));
      wrap.querySelector('.field-error')!.textContent = message;
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = validateContact({
      fullName: fields.fullName.value,
      email: fields.email.value,
      phone: fields.phone.value,
    });
    showErrors(result.errors);
    status.hidden = true;
    if (!result.ok) {
      const first = (Object.keys(result.errors) as (keyof typeof fields)[])[0];
      if (first) fields[first].focus();
      return;
    }
    button.disabled = true;
    button.textContent = 'Sending…';
    void onSubmit(result.values).catch(() => {
      button.disabled = false;
      button.textContent = 'See my results';
      status.hidden = false;
      status.textContent = "Couldn't send your details. Check your connection and try again.";
    });
  });

  fields.fullName.focus();
}
