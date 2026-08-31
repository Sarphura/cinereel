export const MAX_DRIVE_FILE_PATH_LENGTH = 1024

export function isDriveFilePath(value: string): boolean {
  if (
    value.length < 2 ||
    value.length > MAX_DRIVE_FILE_PATH_LENGTH ||
    !value.startsWith('/') ||
    value.endsWith('/') ||
    value.includes('\\') ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    return false
  }

  return value
    .slice(1)
    .split('/')
    .every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
}
