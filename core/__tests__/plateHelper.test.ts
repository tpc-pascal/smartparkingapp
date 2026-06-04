import { isValidVietnamPlate } from '../src/utils/plateHelper';

describe('isValidVietnamPlate', () => {
  it('returns true for valid 7-char plate (old format)', () => {
    expect(isValidVietnamPlate('59A12345')).toBe(true);
  });

  it('returns true for valid 8-char plate (new format)', () => {
    expect(isValidVietnamPlate('51F12345')).toBe(true);
  });

  it('returns true for valid 9-char plate', () => {
    expect(isValidVietnamPlate('30A12345')).toBe(true);
  });

  it('returns true for valid 10-char plate with letter suffix', () => {
    expect(isValidVietnamPlate('51F12345')).toBe(true);
  });

  it('returns true ignoring case', () => {
    expect(isValidVietnamPlate('59a12345')).toBe(true);
  });

  it('returns true trimming whitespace', () => {
    expect(isValidVietnamPlate(' 59A12345 ')).toBe(true);
  });

  it('returns false for plate shorter than 7 chars', () => {
    expect(isValidVietnamPlate('59A12')).toBe(false);
  });

  it('returns false for plate longer than 10 chars', () => {
    expect(isValidVietnamPlate('59A123456789')).toBe(false);
  });

  it('returns false for plate not starting with 2 digits', () => {
    expect(isValidVietnamPlate('A912345')).toBe(false);
  });

  it('returns false for plate not ending with 4 digits', () => {
    expect(isValidVietnamPlate('59A1234A')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidVietnamPlate('')).toBe(false);
  });

  it('returns false for plate with special characters', () => {
    expect(isValidVietnamPlate('59A12@45')).toBe(false);
  });
});
