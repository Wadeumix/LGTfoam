// 進行中のエントリーフォームの状態をチャンネルIDごとに保持するインメモリストア。
// 小規模イベント運営を想定し、DB無しのシンプルな実装とする。

const sessions = new Map();

function get(channelId) {
  return sessions.get(channelId);
}

function create(channelId, userId) {
  const session = {
    userId,
    name: null,
    phone: null,
    hasCompanyTeam: null, // Q3
    companyTeam: null, // Q3=はい の場合に選択
    academyId: null, // Q5 で選択中のアカデミーID
    finalTeam: null, // 最終的に「所属」欄に書き込む値
    racerId: null, // 発番されたレーサーID（企業チーム=A.../アカデミー=B...）
  };
  sessions.set(channelId, session);
  return session;
}

function update(channelId, patch) {
  const session = sessions.get(channelId);
  if (!session) return null;
  Object.assign(session, patch);
  return session;
}

function remove(channelId) {
  sessions.delete(channelId);
}

module.exports = { get, create, update, remove };
