import { validateProfileForm } from './profileValidation';

const VALID = { firstName: 'Marko', lastName: 'Kovač', email: 'marko@email.com' };

describe('validateProfileForm (WEL-5 rules, shared by Welcome and Settings)', () => {
  it('passes a complete profile', () => {
    expect(validateProfileForm(VALID)).toEqual({});
  });

  it('requires both names, ignoring whitespace-only values', () => {
    expect(validateProfileForm({ ...VALID, firstName: '  ' })).toEqual({
      firstName: 'First name is required',
    });
    expect(validateProfileForm({ ...VALID, lastName: '' })).toEqual({
      lastName: 'Last name is required',
    });
  });

  it('requires an email and rejects an implausible one', () => {
    expect(validateProfileForm({ ...VALID, email: '' })).toEqual({
      email: 'Email is required',
    });
    expect(validateProfileForm({ ...VALID, email: 'not-an-email' })).toEqual({
      email: 'Enter a valid email address',
    });
    expect(validateProfileForm({ ...VALID, email: 'a b@email.com' })).toEqual({
      email: 'Enter a valid email address',
    });
  });

  it('accepts an email with surrounding whitespace, like the Welcome form does', () => {
    expect(validateProfileForm({ ...VALID, email: ' marko@email.com ' })).toEqual({});
  });

  it('reports every invalid field at once', () => {
    expect(validateProfileForm({ firstName: '', lastName: '', email: '' })).toEqual({
      firstName: 'First name is required',
      lastName: 'Last name is required',
      email: 'Email is required',
    });
  });
});
