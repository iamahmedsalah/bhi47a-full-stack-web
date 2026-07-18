import { getRegistrationSelectionLimits } from './registration-selection.util';

describe('registration selection limits', () => {
  it('allows four to six courses in a regular semester with an 18-hour cap', () => {
    expect(getRegistrationSelectionLimits('first')).toEqual({
      minCreditHours: 12,
      maxCreditHours: 18,
      minCourses: 4,
      maxCourses: 6,
    });
  });

  it('allows two summer courses by default', () => {
    expect(getRegistrationSelectionLimits('summer')).toMatchObject({
      minCourses: 2,
      maxCourses: 2,
    });
  });

  it('allows up to three summer courses when policy permits it', () => {
    expect(getRegistrationSelectionLimits('summer', 3)).toMatchObject({
      minCourses: 2,
      maxCourses: 3,
    });
  });

  it('never permits more than three summer courses', () => {
    expect(getRegistrationSelectionLimits('summer', 8).maxCourses).toBe(3);
  });
});
