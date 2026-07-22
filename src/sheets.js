const { google } = require('googleapis');
const {
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY,
  SPREADSHEET_ID,
  SHEET_NAMES,
  ACADEMIES,
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
 * 列: レーサーID / 名前 / 街の電話番号 / 所属チーム（アカデミック含む） / 登録日時
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

const sheetIdCache = new Map();

/**
 * シート名からsheetId（gid）を取得する。行削除などバッチ操作に必要。
 */
async function getSheetIdByName(sheetName) {
  if (sheetIdCache.has(sheetName)) return sheetIdCache.get(sheetName);

  const sheets = getClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  for (const sheet of res.data.sheets || []) {
    const title = sheet.properties.title;
    const id = sheet.properties.sheetId;
    sheetIdCache.set(title, id);
  }

  if (!sheetIdCache.has(sheetName)) {
    throw new Error(`シートが見つかりません: ${sheetName}`);
  }
  return sheetIdCache.get(sheetName);
}

/**
 * 「LGTタイムアタックエントリー名簿」の全行を取得する。
 * 戻り値の rowIndex はスプレッドシート上の実際の行番号（1始まり、ヘッダーは1行目）。
 */
async function getAllEntryRows() {
  const sheets = getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAMES.ENTRY_LIST}!A2:E`,
  });
  const rows = res.data.values || [];
  return rows.map((r, i) => ({
    rowIndex: i + 2,
    racerId: r[0] || '',
    name: r[1] || '',
    phone: r[2] || '',
    team: r[3] || '',
    registeredAt: r[4] || '',
  }));
}

/**
 * 名前またはレーサーIDの部分一致で名簿を検索する。
 */
async function searchEntries(query) {
  const rows = await getAllEntryRows();
  const lower = query.trim().toLowerCase();
  return rows.filter(
    (r) => r.racerId.toLowerCase().includes(lower) || r.name.toLowerCase().includes(lower),
  );
}

/**
 * 指定シートの指定列（1始まりのインデックス）が完全一致する最初の行を削除する。
 * 戻り値: 削除できた場合はtrue、対象が見つからなければfalse。
 */
async function deleteRowByColumnValue(sheetName, columnIndex, value) {
  const sheets = getClient();
  const columnLetter = String.fromCharCode('A'.charCodeAt(0) + columnIndex - 1);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!${columnLetter}2:${columnLetter}`,
  });
  const rows = res.data.values || [];
  const idx = rows.findIndex((r) => (r[0] || '') === value);
  if (idx === -1) return false;

  const rowIndex = idx + 2;
  const sheetId = await getSheetIdByName(sheetName);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex,
            },
          },
        },
      ],
    },
  });
  return true;
}

/**
 * レーサーIDに完全一致する行を、関係する全シートから削除する。
 * 1. LGTタイムアタックエントリー名簿
 * 2. 全レーサー名簿
 * 3. 各レーサー情報
 * 4. アカデミー所属者のみ: LGTアカデミー or 3NO1（名前で一致させる）
 * 戻り値: エントリー名簿から削除できた場合はtrue、対象が見つからなければfalse。
 */
async function deleteEntryByRacerId(racerId) {
  const rows = await getAllEntryRows();
  const target = rows.find((r) => r.racerId === racerId);
  if (!target) return false;

  await deleteRowByColumnValue(SHEET_NAMES.ENTRY_LIST, 1, racerId);
  await deleteRowByColumnValue(SHEET_NAMES.ALL_RACERS, 1, racerId).catch(() => false);
  await deleteRowByColumnValue(SHEET_NAMES.RACER_INFO, 1, racerId).catch(() => false);

  const academy = ACADEMIES.find((a) => a.label === target.team);
  if (academy) {
    await deleteRowByColumnValue(academy.sheetName, 1, target.name).catch(() => false);
  }

  return true;
}

/**
 * 「LGTタイムアタックエントリー名簿」の全体件数・所属プレフィックス別の内訳を返す。
 */
async function getEntryStats() {
  const rows = await getAllEntryRows();
  const total = rows.length;
  let companyCount = 0;
  let academyCount = 0;
  const teamCounts = {};

  for (const r of rows) {
    if (r.racerId.startsWith('A')) companyCount += 1;
    else if (r.racerId.startsWith('B')) academyCount += 1;
    teamCounts[r.team] = (teamCounts[r.team] || 0) + 1;
  }

  return { total, companyCount, academyCount, teamCounts };
}

/**
 * 「各レーサー情報」シートからレーサーIDに一致する行を検索する。
 */
async function findRacerInfoRow(racerId) {
  const sheets = getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAMES.RACER_INFO}!A2:I`,
  });
  const rows = res.data.values || [];
  const idx = rows.findIndex((r) => (r[0] || '') === racerId);
  if (idx === -1) return null;
  return { rowIndex: idx + 2, row: rows[idx] };
}

/**
 * 「各レーサー情報」シートに、レーサーの行が無ければ新規作成する（あれば何もしない）。
 * 列: レーサーID/名前/街の電話番号/所属チーム/参加レースログ/優勝タイトル/ステータス/備考/レーシングタブレット名
 */
async function ensureRacerInfoRow({ racerId, name, phone, team, racingName }) {
  const existing = await findRacerInfoRow(racerId);
  if (existing) return { created: false };

  const sheets = getClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAMES.RACER_INFO}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[racerId, name, phone, team, '', '', 'アクティブ', '', racingName || '']],
    },
  });
  return { created: true };
}

/**
 * 「各レーサー情報」シートに参加レースログを1件追記する。
 * 対象レーサーの行がなければ、エントリー名簿から基本情報を引いて新規作成する。
 */
async function appendRaceLog(racerId, logText) {
  const sheets = getClient();
  const timestamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const logLine = `[${timestamp}] ${logText}`;

  const existing = await findRacerInfoRow(racerId);

  if (existing) {
    const prevLog = existing.row[4] || '';
    const newLog = prevLog ? `${prevLog}\n${logLine}` : logLine;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAMES.RACER_INFO}!E${existing.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[newLog]] },
    });
    return { created: false };
  }

  const entryRows = await getAllEntryRows();
  const entry = entryRows.find((r) => r.racerId === racerId);
  if (!entry) {
    throw new Error(`レーサーIDが名簿に見つかりません: ${racerId}`);
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAMES.RACER_INFO}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[racerId, entry.name, entry.phone, entry.team, logLine, '', 'アクティブ', '', '']],
    },
  });
  return { created: true };
}

/**
 * アカデミーシート（LGTアカデミー / 3NO1）に1行追加する。
 * 列: 名前 / 街の電話番号 / 予備1 / 予備2 / 備考
 */
async function appendAcademyMember(sheetName, { name, phone }) {
  const sheets = getClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A:E`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[name, phone, '', '', '']],
    },
  });
}

/**
 * 「全レーサー名簿」に1行追加する。
 * 列: レーサーID / 名前 / レーサー情報（「各レーサー情報」シート参照の案内テキスト）
 */
async function appendAllRacersRow({ racerId, name }) {
  const sheets = getClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAMES.ALL_RACERS}!A:C`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[racerId, name, '各レーサー情報シート参照']],
    },
  });
}

/**
 * エントリー確定時に、関係する全シートへまとめて反映する。
 * 1. LGTタイムアタックエントリー名簿（既存）
 * 2. アカデミー所属者のみ: LGTアカデミー or 3NO1
 * 3. 全レーサー名簿
 * 4. 各レーサー情報（基本情報のみ作成、レースログは空で開始）
 */
async function registerFullRoster({ racerId, name, phone, team, racingName, academySheetName }) {
  await appendEntryRow({ racerId, name, phone, team });

  if (academySheetName) {
    await appendAcademyMember(academySheetName, { name, phone });
  }

  await appendAllRacersRow({ racerId, name });
  await ensureRacerInfoRow({ racerId, name, phone, team, racingName });
}

module.exports = {
  getClient,
  appendEntryRow,
  getAcademyMembers,
  getNextRacerId,
  getAllEntryRows,
  searchEntries,
  deleteEntryByRacerId,
  getEntryStats,
  appendRaceLog,
  registerFullRoster,
};
