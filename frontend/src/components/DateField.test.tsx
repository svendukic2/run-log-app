import { render, screen, fireEvent } from '@testing-library/react';
import DateField from './DateField';

// jsdom does not implement showPicker, so the tests pin the contract instead:
// a click anywhere on the field asks the browser for the picker (RUN-10 bug
// fix: previously only the far right edge of the field opened it).
describe('DateField', () => {
  const showPicker = jest.fn();

  beforeAll(() => {
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
      configurable: true,
      value: showPicker,
    });
  });

  beforeEach(() => showPicker.mockClear());

  function renderField(overrides: Partial<React.ComponentProps<typeof DateField>> = {}) {
    return render(
      <DateField
        id="start-date"
        label="Start date"
        value="2026-07-14"
        onChange={jest.fn()}
        {...overrides}
      />,
    );
  }

  it('opens the native picker from a click anywhere on the field', () => {
    renderField();
    fireEvent.click(screen.getByLabelText('Start date'));
    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it('survives a browser that refuses showPicker', () => {
    showPicker.mockImplementation(() => {
      throw new DOMException('needs a user gesture');
    });
    renderField();
    expect(() => fireEvent.click(screen.getByLabelText('Start date'))).not.toThrow();
  });

  it('shows the formatted date when a value exists and the empty text when not', () => {
    renderField();
    expect(screen.getByText('Tue, 14 Jul 2026')).toBeInTheDocument();

    renderField({
      id: 'end-date',
      label: 'End date (optional)',
      value: '',
      emptyText: 'No end date',
    });
    expect(screen.getByText('No end date')).toBeInTheDocument();
  });
});
