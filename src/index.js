const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const { DISCORD_TOKEN } = require('./config');
const { createEntryTicket } = require('./ticket');
const { handleInteraction } = require('./flow');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', () => {
  console.log(`ログインしました: ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'entry') {
        await createEntryTicket(interaction);
        return;
      }

      if (interaction.commandName === 'setup-panel') {
        const embed = new EmbedBuilder()
          .setTitle('🏁 LGTタイムアタック レーサーエントリー受付')
          .setDescription('下のボタンを押すと、あなた専用のエントリーチケットが作成されます。')
          .setColor(0x2ecc71);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('open_entry_ticket')
            .setLabel('エントリーチケットを開く')
            .setStyle(ButtonStyle.Success),
        );
        await interaction.reply({ embeds: [embed], components: [row] });
        return;
      }
    }

    if (interaction.isButton() && interaction.customId === 'open_entry_ticket') {
      await createEntryTicket(interaction);
      return;
    }

    // チケットチャンネル内でのフォーム進行（ボタン／セレクト／モーダル）
    if (
      interaction.isButton() ||
      interaction.isStringSelectMenu() ||
      interaction.isModalSubmit()
    ) {
      await handleInteraction(interaction);
    }
  } catch (err) {
    console.error('インタラクション処理エラー:', err);
    const errorMessage = { content: 'エラーが発生しました。もう一度お試しください。', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(errorMessage).catch(() => {});
    } else {
      await interaction.reply(errorMessage).catch(() => {});
    }
  }
});

client.login(DISCORD_TOKEN);
