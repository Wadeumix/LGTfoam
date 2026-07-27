require('dotenv').config();

const COMPANY_TEAMS = [
  '和菓子屋', 'パール', '猫カフェ', 'ケーキ屋', 'ヴィンテージ', 'パン屋',
  'BVL', 'FUSION', 'AQUA', '温泉KOI', 'バーガーショット', 'ラーメン屋',
  'アイス屋', 'PDS', 'PDN', '竜の髭', 'LUXXX', 'ROC', 'STO', 'ロスカス',
  'BRR', 'FAST', '救急', 'PD（地域課）', 'タクシー', 'ミスティック',
];

const ACADEMIES = [
  { id: 'lgt_official', label: 'LGT公式アカデミー', sheetName: 'LGTアカデミー' },
  { id: '3no1', label: '3NO1アカデミー', sheetName: '3NO1' },
];

const ACADEMY_TERMS = '随時記載します';

const SHEET_NAMES = {
  ENTRY_LIST: 'LGTタイムアタックエントリー名簿',
  LGT_ACADEMY: 'LGTアカデミー',
  ACADEMY_3NO1: '3NO1',
  ALL_RACERS: '全レーサー名簿',
  RACER_INFO: '各レーサー情報',
};

module.exports = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID,
  HQ_GUILD_ID: process.env.HQ_GUILD_ID,
  TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID,
  STAFF_ROLE_ID: process.env.STAFF_ROLE_ID,
  HQ_INVITE_URL: process.env.HQ_INVITE_URL || 'https://discord.gg/jkbrJkFfp7',
  ENTRY_PANEL_CHANNEL_ID: process.env.ENTRY_PANEL_CHANNEL_ID,
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
  SPREADSHEET_ID: process.env.SPREADSHEET_ID,
  COMPANY_TEAMS,
  ACADEMIES,
  ACADEMY_TERMS,
  SHEET_NAMES,
};
