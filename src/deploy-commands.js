const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, HQ_GUILD_ID } = require('./config');

const entryCommands = [
  new SlashCommandBuilder()
    .setName('entry')
    .setDescription('LGTタイムアタック レーサーエントリー用チケットを作成します'),
  new SlashCommandBuilder()
    .setName('setup-panel')
    .setDescription('エントリー受付パネルをこのチャンネルに設置します（運営用）'),
].map((c) => c.toJSON());

const hqCommands = [
  new SlashCommandBuilder()
    .setName('admin-panel')
    .setDescription('LGTレース管理パネル（名簿検索・削除・TA記録・統計）をこのチャンネルに設置します（スタッフ専用）'),
].map((c) => c.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    if (DISCORD_GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), {
        body: entryCommands,
      });
      console.log(`エントリー鯖（${DISCORD_GUILD_ID}）に /entry, /setup-panel を登録しました。`);
    } else {
      console.warn('DISCORD_GUILD_ID が未設定のため、エントリー用コマンドの登録をスキップしました。');
    }

    if (HQ_GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, HQ_GUILD_ID), {
        body: hqCommands,
      });
      console.log(`本部鯖（${HQ_GUILD_ID}）に /admin-panel を登録しました。`);
    } else {
      console.warn('HQ_GUILD_ID が未設定のため、管理用コマンドの登録をスキップしました。');
    }

    console.log('スラッシュコマンドの登録が完了しました。');
  } catch (err) {
    console.error('スラッシュコマンド登録エラー:', err);
    process.exit(1);
  }
})();
