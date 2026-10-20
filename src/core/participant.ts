import { isCountryCode } from './countries';

export interface ParticipantInfo {
  fullName: string;
  /** ISO date, YYYY-MM-DD. */
  dob: string;
  email: string;
  /** Stored in E.164-ish normalized form (leading + kept, separators removed). */
  phone: string;
  country: string;
  countryOfBirth: string;
  postalCode: string;
  submittedAt: number;
}

export type ParticipantField =
  | 'fullName'
  | 'dob'
  | 'email'
  | 'phone'
  | 'country'
  | 'countryOfBirth'
  | 'postalCode';

export type ParticipantDraft = Record<ParticipantField, string>;

export interface ValidationResult {
  ok: boolean;
  values: ParticipantInfo;
  errors: Partial<Record<ParticipantField, string>>;
}

/** Returns whole years from an ISO date of birth, or null if unparseable/in the future. */
export function ageFromDob(dob: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const birth = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  if (birth > now) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age--;
  return age;
}

// Addresses that accept mail but exist only to bypass "real email" checks.
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', '10minutemail.com', '10minutemail.net',
  'tempmail.com', 'temp-mail.org', 'tempmailo.com', 'throwawaymail.com', 'yopmail.com', 'getnada.com',
  'nada.email', 'sharklasers.com', 'trashmail.com', 'trashmail.de', 'dispostable.com', 'fakeinbox.com',
  'maildrop.cc', 'mintemail.com', 'mohmal.com', 'mailnesia.com', 'spam4.me', 'tempinbox.com',
  'burnermail.io', 'emailondeck.com', 'mytemp.email', 'mailcatch.com', 'inboxbear.com', 'tmail.ws',
]);

// Reserved/placeholder domains (RFC 2606 and obvious stand-ins) that are never real mailboxes.
const FAKE_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'example.edu', 'test.com', 'test.org', 'test.net',
  'test.test', 'email.com', 'fake.com', 'fake.net', 'none.com', 'noemail.com', 'nomail.com',
  'invalid.com', 'domain.com', 'mail.com', 'xxx.com', 'asdf.com', 'abc.com', 'sample.com', 'localhost',
]);

// Likely finger-slips on big providers → suggest the fix instead of accepting a dead address.
const DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com', 'gmail.con': 'gmail.com', 'gnail.com': 'gmail.com', 'gmaill.com': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmal.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'outlok.com': 'outlook.com',
  'outlook.co': 'outlook.com', 'outlook.con': 'outlook.com', 'iclod.com': 'icloud.com', 'icloud.co': 'icloud.com',
};

export function validateEmail(input: string): { ok: boolean; value: string; error?: string } {
  const value = input.trim();
  if (!value) return { ok: false, value, error: 'Enter your email address.' };
  if (/\s/.test(value)) return { ok: false, value, error: 'Email addresses cannot contain spaces.' };
  // One @, a dotted domain, a 2+ letter TLD, no consecutive or edge dots.
  if (!/^[^\s@"']+@[^\s@]+\.[A-Za-z]{2,}$/.test(value)) {
    return { ok: false, value, error: 'Enter a valid email address, e.g. name@example.com.' };
  }
  const [local, domain] = value.split('@');
  const lowerDomain = domain.toLowerCase();
  if (/\.\./.test(value) || local.startsWith('.') || local.endsWith('.') || domain.startsWith('.') || domain.startsWith('-')) {
    return { ok: false, value, error: 'Enter a valid email address.' };
  }
  if (DOMAIN_TYPOS[lowerDomain]) {
    return { ok: false, value, error: `Did you mean ${local}@${DOMAIN_TYPOS[lowerDomain]}?` };
  }
  if (DISPOSABLE_DOMAINS.has(lowerDomain)) {
    return { ok: false, value, error: 'Please use a permanent email address, not a temporary one.' };
  }
  if (FAKE_DOMAINS.has(lowerDomain)) {
    return { ok: false, value, error: 'This looks like a placeholder address. Enter your real email.' };
  }
  // Repeated single-character locals like aaaa@… are almost always filler.
  if (/^(.)\1{2,}$/.test(local) && /^(.)\1*$/.test(lowerDomain.split('.')[0])) {
    return { ok: false, value, error: 'Enter your real email address.' };
  }
  return { ok: true, value };
}

function isRepeated(digits: string): boolean {
  return new Set(digits).size <= 1;
}

function isSequential(digits: string): boolean {
  if (digits.length < 6) return false;
  let asc = true;
  let desc = true;
  for (let i = 1; i < digits.length; i++) {
    // Wrap mod 10 so 1234567890 and 0987654321 are also caught.
    const step = (digits.charCodeAt(i) - digits.charCodeAt(i - 1) + 10) % 10;
    if (step !== 1) asc = false;
    if (step !== 9) desc = false;
  }
  return asc || desc;
}

export function validatePhone(input: string): { ok: boolean; value: string; error?: string } {
  const raw = input.trim();
  if (!raw) return { ok: false, value: raw, error: 'Enter your phone number.' };
  if (!/^\+?[\d\s().-]+$/.test(raw)) {
    return { ok: false, value: raw, error: 'Use only digits, spaces and + ( ) - .' };
  }
  const hasPlus = raw.trimStart().startsWith('+');
  const digits = raw.replace(/\D/g, '');
  const value = hasPlus ? `+${digits}` : digits;
  // E.164 allows up to 15 digits; a real subscriber number is at least ~8 with country/area code.
  if (digits.length < 8) return { ok: false, value, error: 'Phone number is too short. Include your country and area code.' };
  if (digits.length > 15) return { ok: false, value, error: 'Phone number is too long.' };
  if (isRepeated(digits)) return { ok: false, value, error: 'Enter your real phone number.' };
  if (isSequential(digits)) return { ok: false, value, error: 'Enter your real phone number.' };
  return { ok: true, value };
}

function validateName(input: string): { ok: boolean; value: string; error?: string } {
  const value = input.trim().replace(/\s+/g, ' ');
  if (!value) return { ok: false, value, error: 'Enter your name.' };
  if (value.length < 2) return { ok: false, value, error: 'Enter your full name.' };
  if (!/[\p{L}]/u.test(value)) return { ok: false, value, error: 'Enter your name using letters.' };
  if (/\d/.test(value)) return { ok: false, value, error: 'Names should not contain numbers.' };
  return { ok: true, value };
}

function validateDob(input: string): { ok: boolean; value: string; error?: string; age?: number } {
  const value = input.trim();
  if (!value) return { ok: false, value, error: 'Enter your date of birth.' };
  const age = ageFromDob(value);
  if (age === null) return { ok: false, value, error: 'Enter a valid date of birth.' };
  if (age < 5) return { ok: false, value, error: 'This test is designed for ages 16 and over.' };
  if (age > 120) return { ok: false, value, error: 'Enter a valid date of birth.' };
  return { ok: true, value, age };
}

function validatePostal(input: string): { ok: boolean; value: string; error?: string } {
  const value = input.trim().toUpperCase();
  if (!value) return { ok: false, value, error: 'Enter your postal or ZIP code.' };
  // Postal formats vary worldwide; accept 2–12 letters/digits with spaces or hyphens.
  if (!/^[A-Z0-9][A-Z0-9 -]{0,10}[A-Z0-9]$/.test(value)) {
    return { ok: false, value, error: 'Enter a valid postal or ZIP code.' };
  }
  return { ok: true, value };
}

function validateCountry(input: string, label: string): { ok: boolean; value: string; error?: string } {
  const value = input.trim();
  if (!value) return { ok: false, value, error: `Select your ${label}.` };
  if (!isCountryCode(value)) return { ok: false, value, error: `Select your ${label}.` };
  return { ok: true, value };
}

export function validateParticipant(draft: ParticipantDraft): ValidationResult {
  const name = validateName(draft.fullName);
  const dob = validateDob(draft.dob);
  const email = validateEmail(draft.email);
  const phone = validatePhone(draft.phone);
  const country = validateCountry(draft.country, 'country of residence');
  const countryOfBirth = validateCountry(draft.countryOfBirth, 'country of birth');
  const postalCode = validatePostal(draft.postalCode);

  const errors: Partial<Record<ParticipantField, string>> = {};
  if (!name.ok) errors.fullName = name.error;
  if (!dob.ok) errors.dob = dob.error;
  if (!email.ok) errors.email = email.error;
  if (!phone.ok) errors.phone = phone.error;
  if (!country.ok) errors.country = country.error;
  if (!countryOfBirth.ok) errors.countryOfBirth = countryOfBirth.error;
  if (!postalCode.ok) errors.postalCode = postalCode.error;

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    values: {
      fullName: name.value,
      dob: dob.value,
      email: email.value,
      phone: phone.value,
      country: country.value,
      countryOfBirth: countryOfBirth.value,
      postalCode: postalCode.value,
      submittedAt: Date.now(),
    },
  };
}
