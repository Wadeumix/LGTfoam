const { google } = require('googleapis');
const {
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY,
  SPREADSHEET_ID,
  SHEET_NAMES,
} = require('./config');

let sheetsClient = null;

function getClient() {
  if (sheetsClient) return sheetsClient;

  const auth = new google.auth.JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

/**
 * 1ページ目「LGTタイムアタックエントリー名簿」に1行追加する。
 * 列: レーサーID / 名前 / 電話番号 / 所属チーム（アカデミック含む） / 登録日時
 */
async function appendEntryRow({ racerId, name, phone, team }) {
  const sheets = getClient();
  const timestamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAMES.ENTRY_LIST}!A:E`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[racerId, name, phone, team, timestamp]],
    },
  });
}

/**
 * 指定プレフィックス（企業チーム所属者=A / アカデミー所属者=B）の
 * 次のレーサーIDを発番する。「LGTタイムアタックエントリー名簿」A列を走査し、
 * 同じプレフィックスの最大連番+1を4桁ゼロ埋めで返す（例: A0001, B0032）。
 */
async function getNextRacerId(prefix) {
  const sheets = getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAMES.ENTRY_LIST}!A2:A`,
  });
  const rows = res.data.values || [];

  let maxNumber = 0;
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  for (const [cell] of rows) {
    if (!cell) continue;
    const match = pattern.exec(String(cell).trim());
    if (match) {
      maxNumber = Math.max(maxNumber, parseInt(match[1], 10));
    }
  }

  const nextNumber = String(maxNumber + 1).padStart(4, '0');
  return `${prefix}${nextNumber}`;
}

/**
 * 指定アカデミーシートのA列（名前）を取得し、既存メンバー一覧を返す。
 */
async function getAcademyMembers(sheetName) {
  const sheets = getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A2:A`,
  });
  const rows = res.data.values || [];
  return rows.map((r) => r[0]).filter(Boolean);
}

module.exports = {
  getClient,
  appendEntryRow,
  getAcademyMembers,
  getNextRacerId,
};
