const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = require('./config');

const commands = [
  new SlashCommandBuilder()
    .setName('entry')
    .setDescription('LGTタイムアタック レーサーエントリー用チケットを作成します'),
  new SlashCommandBuilder()
    .setName('setup-panel')
    .setDescription('エントリー受付パネルをこのチャンネルに設置します（運営用）'),
].map((c) => c.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    const route = DISCORD_GUILD_ID
      ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID)
      : Routes.applicationCommands(DISCORD_CLIENT_ID);

    await rest.put(route, { body: commands });
    console.log('スラッシュコマンドの登録が完了しました。');
  } catch (err) {
    console.error('スラッシュコマンド登録エラー:', err);
    process.exit(1);
  }
})();
