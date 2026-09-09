import type { RecipientAccountType } from "@/features/accounts/account.types";

const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijkmnopqrstuvwxyz";
const NUMBERS = "23456789";
const SYMBOLS = "!@#$%*-_+";
const ALL_CHARACTERS = `${UPPERCASE}${LOWERCASE}${NUMBERS}${SYMBOLS}`;

export function generateTemporaryPassword(length = 16): string {
  const safeLength = Math.max(12, Math.min(64, Math.floor(length)));
  const required = [
    randomCharacter(UPPERCASE),
    randomCharacter(LOWERCASE),
    randomCharacter(NUMBERS),
    randomCharacter(SYMBOLS),
  ];
  while (required.length < safeLength) {
    required.push(randomCharacter(ALL_CHARACTERS));
  }
  for (let index = required.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [required[index], required[swapIndex]] = [
      required[swapIndex],
      required[index],
    ];
  }
  return required.join("");
}

export function isStrongAccountPassword(password: string): boolean {
  return (
    password.length >= 12 &&
    password.length <= 128 &&
    /[A-Z]/u.test(password) &&
    /[a-z]/u.test(password) &&
    /[0-9]/u.test(password) &&
    /[^A-Za-z0-9]/u.test(password)
  );
}

export function buildAccountCredentialMessage(options: {
  name: string;
  email: string;
  temporaryPassword: string;
  accountType: RecipientAccountType;
  loginUrl: string;
}): string {
  const typeLabel =
    options.accountType === "candidate" ? "Candidate" : "Employee";
  return [
    `Hello ${options.name},`,
    "",
    `Your PDF Builder ${typeLabel.toLowerCase()} account is ready.`,
    `Login: ${options.loginUrl}`,
    `Email: ${options.email}`,
    `Temporary password: ${options.temporaryPassword}`,
    "",
    "You will be asked to create a new password after your first sign in.",
  ].join("\n");
}

export function buildTelegramShareUrl(options: {
  loginUrl: string;
  message: string;
}): string {
  const parameters = new URLSearchParams({
    url: options.loginUrl,
    text: options.message,
  });
  return `https://t.me/share/url?${parameters.toString()}`;
}

function randomCharacter(characters: string): string {
  return characters[randomIndex(characters.length)];
}

function randomIndex(upperBound: number): number {
  if (upperBound <= 0) return 0;
  const rejectionLimit = Math.floor(256 / upperBound) * upperBound;
  const bytes = new Uint8Array(1);
  do {
    crypto.getRandomValues(bytes);
  } while (bytes[0] >= rejectionLimit);
  return bytes[0] % upperBound;
}
