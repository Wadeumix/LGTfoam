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
 * 列: 名前 / 電話番号 / 所属チーム（アカデミック含む） / 登録日時
 */
async function appendEntryRow({ name, phone, team }) {
  const sheets = getClient();
  const timestamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAMES.ENTRY_LIST}!A:D`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[name, phone, team, timestamp]],
    },
  });
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
};
