// Profile form validation (WEL-5 rules): names non-empty, email in a plausible
// shape. One module shared by the Welcome form and the Settings Profile card
// (RUN-37, assumption A25) so the two screens cannot drift apart.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ProfileFormValues {
  firstName: string;
  lastName: string;
  email: string;
}

export interface ProfileFormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
}

// Returns one inline message per invalid field; an empty object means the
// values are safe to persist.
export function validateProfileForm(values: ProfileFormValues): ProfileFormErrors {
  const errors: ProfileFormErrors = {};
  if (!values.firstName.trim()) errors.firstName = 'First name is required';
  if (!values.lastName.trim()) errors.lastName = 'Last name is required';
  if (!values.email.trim()) {
    errors.email = 'Email is required';
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'Enter a valid email address';
  }
  return errors;
}
