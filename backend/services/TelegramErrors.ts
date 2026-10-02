/**
 * TelegramErrors.ts
 * Kamus kode error Telegram ke penjelasan ramah dalam Bahasa Indonesia
 * untuk tampilan log & diagnostik di dashboard.
 */

export interface DetailedErrorLog {
  id: string;
  timestamp: string;
  timeWIB: string;
  accountId: string;
  target?: string;
  keyword?: string;
  messagePreview?: string;
  errorCode: string;
  reason: string;
  technical: string;
}

export const TELEGRAM_ERROR_GUIDE: Record<string, string> = {
  FLOOD_WAIT:
    "Akun ini kena rate-limit Telegram karena kirim pesan terlalu cepat/sering. Bot otomatis menunggu sebelum mencoba kirim lagi.",
  USER_BANNED_IN_CHANNEL:
    "Akun ini sudah di-banned/dikeluarkan dari grup atau channel tersebut, jadi tidak bisa kirim pesan di sana sampai di-invite ulang.",
  CHAT_ADMIN_REQUIRED:
    "Akun butuh hak admin untuk mengirim pesan di grup ini (grup di-setting agar hanya admin yang bisa kirim).",
  CHAT_WRITE_FORBIDDEN:
    "Akun tidak punya izin menulis di grup/channel ini — kemungkinan grup di-lock read-only oleh admin.",
  CHAT_RESTRICTED:
    "Grup ini diberi batasan oleh Telegram/admin sehingga akun tidak bisa mengirim pesan.",
  USER_DEACTIVATED_BAN:
    "Akun Telegram ini sudah di-banned permanen oleh Telegram (terdeteksi sebagai spam bot).",
  USER_DEACTIVATED: "Akun Telegram ini sudah dihapus/dinonaktifkan pemiliknya.",
  CHANNEL_PRIVATE:
    "Grup/channel tidak bisa diakses lagi — kemungkinan akun dikeluarkan, link invite kadaluarsa, atau grupnya sudah dihapus/di-private-kan.",
  CHANNEL_INVALID:
    "Referensi channel/grup sudah tidak valid lagi di sisi Telegram (grup mungkin sudah dihapus).",
  PEER_ID_INVALID:
    "ID target (grup/topic) tidak valid lagi. Biasanya karena grup dihapus, atau ID-nya berubah setelah grup di-upgrade.",
  SLOWMODE_WAIT:
    "Grup tujuan mengaktifkan Slow Mode, jadi akun harus menunggu beberapa detik dulu sebelum bisa kirim pesan lagi.",
  MSG_ID_INVALID:
    "Pesan yang ingin di-reply sudah tidak ada lagi (kemungkinan terhapus duluan sebelum bot sempat membalas).",
  MESSAGE_TOO_LONG:
    "Isi balasan terlalu panjang, melebihi batas maksimal karakter pesan Telegram.",
  MESSAGE_EMPTY: "Isi balasan kosong sehingga tidak bisa dikirim.",
  TOPIC_CLOSED:
    "Topic/thread diskusi pada grup ini sudah ditutup oleh admin, tidak bisa membalas di sana lagi.",
  USER_IS_BLOCKED: "Akun ini sudah diblokir oleh penerima pesan/grup.",
  USER_PRIVACY_RESTRICTED:
    "Penerima mengaktifkan privasi yang mencegah akun ini mengirim pesan ke mereka.",
  AUTH_KEY_UNREGISTERED:
    "Sesi login akun ini sudah tidak valid/expired di sisi Telegram, akun perlu login ulang (connect & verifikasi OTP lagi).",
  AUTH_KEY_DUPLICATED:
    "Session string akun ini dipakai di lebih dari satu tempat secara bersamaan sehingga Telegram menolaknya. Login ulang untuk dapat session baru.",
  SESSION_REVOKED:
    "Sesi login akun ini di-revoke (misal dari menu 'Active Sessions' di app Telegram resmi). Perlu login ulang.",
  PHONE_NUMBER_INVALID: "Format nomor HP yang diinput tidak valid.",
  PHONE_CODE_INVALID: "Kode OTP yang dimasukkan salah.",
  PHONE_CODE_EXPIRED: "Kode OTP sudah kadaluarsa, minta kirim ulang OTP.",
  PHONE_CODE_EMPTY: "Kode OTP belum diisi.",
  API_ID_INVALID:
    "API ID / API Hash yang diinput salah atau tidak cocok dengan nomor HP ini.",
  SESSION_PASSWORD_NEEDED:
    "Akun ini mengaktifkan verifikasi 2 langkah (2FA), password cloud-nya wajib diisi saat verifikasi.",
  PASSWORD_HASH_INVALID:
    "Password 2FA (Two-Step Verification) yang diinput salah.",
  TIMEOUT:
    "Telegram tidak merespons dalam waktu yang wajar (API Timeout). Biasanya karena koneksi server lambat/putus sesaat, bukan masalah di konfigurasi bot.",
};

/**
 * Mendeskripsikan error Telegram mentah menjadi format yang mudah dipahami
 */
export function describeSendError(
  err: any,
): { code: string; reason: string; technical: string } {
  const technical = String(err?.message || err || "Unknown error");
  const match = technical.match(/[A-Z][A-Z0-9_]{3,}/);
  let code = match ? match[0] : "UNKNOWN";
  // Buang suffix angka di belakang (FLOOD_WAIT_45 -> FLOOD_WAIT) biar ketemu di kamus
  const baseCode = code.replace(/_\d+$/, "");
  if (TELEGRAM_ERROR_GUIDE[baseCode]) code = baseCode;
  if (technical.includes("API Timeout")) code = "TIMEOUT";
  const reason =
    TELEGRAM_ERROR_GUIDE[code] ||
    "Error ini belum dikenali di kamus internal — baca kolom 'technical' di bawah untuk detail asli dari Telegram, lalu bisa kita tambahkan penjelasannya ke kamus.";
  return { code, reason, technical };
}
