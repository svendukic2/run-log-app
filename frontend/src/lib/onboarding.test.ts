import {
  getProfile,
  profileInitials,
  profileShortName,
  saveProfile,
  type Profile,
} from './onboarding';

function profile(firstName: string, lastName: string): Profile {
  return { firstName, lastName, email: 'test@email.com' };
}

describe('profileInitials (RUN-14)', () => {
  it('takes the first letters of first and last name, uppercased', () => {
    expect(profileInitials(profile('Marko', 'Kovačić'))).toBe('MK');
    expect(profileInitials(profile('ana', 'barić'))).toBe('AB');
  });

  it('survives surrounding whitespace', () => {
    expect(profileInitials(profile('  Marko ', ' Kovačić '))).toBe('MK');
  });

  it('keeps non-ASCII first letters intact', () => {
    expect(profileInitials(profile('Đurđa', 'Šarić'))).toBe('ĐŠ');
  });

  it('degrades to a single letter when one name is empty', () => {
    expect(profileInitials(profile('Marko', ''))).toBe('M');
  });
});

describe('saveProfile (RUN-37)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('stores the profile and announces the change in the same tab', () => {
    // The browser's own 'storage' event never fires in the tab that wrote, so
    // saveProfile dispatches this one; useProfile listens for it (AC4).
    const onChange = jest.fn();
    window.addEventListener('runlog:profile-changed', onChange);
    saveProfile(profile('Marko', 'Kovač'));
    window.removeEventListener('runlog:profile-changed', onChange);

    expect(getProfile()).toEqual(profile('Marko', 'Kovač'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('profileShortName (RUN-14)', () => {
  it('renders "{First name} {L}." from the profile', () => {
    expect(profileShortName(profile('Marko', 'Kovačić'))).toBe('Marko K.');
  });

  it('uppercases the last-name initial but leaves the first name as typed', () => {
    expect(profileShortName(profile('ana', 'barić'))).toBe('ana B.');
  });

  it('falls back to the first name alone when the last name is empty', () => {
    expect(profileShortName(profile('Marko', ''))).toBe('Marko');
  });
});
