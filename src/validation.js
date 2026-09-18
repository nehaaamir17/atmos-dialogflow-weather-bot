import { AppError } from './errors.js';

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function validateCity(value, { required = true } = {}) {
  const city = typeof value === 'string' ? value.trim().normalize('NFC') : '';
  if (!city) {
    if (!required) return '';
    throw new AppError('The city query parameter is required.', {
      code: 'CITY_REQUIRED',
      status: 400,
      expose: true,
    });
  }
  if (city.length > 120) {
    throw new AppError('City must be 120 characters or fewer.', {
      code: 'CITY_TOO_LONG',
      status: 400,
      expose: true,
    });
  }
  if (CONTROL_CHARACTERS.test(city)) {
    throw new AppError('City contains unsupported control characters.', {
      code: 'INVALID_CITY',
      status: 400,
      expose: true,
    });
  }
  return city;
}

