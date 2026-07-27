const {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const { TICKET_CATEGORY_ID, STAFF_ROLE_ID } = require('./config');
const session = require('./session');

function sanitizeName(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, '')
    .slice(0, 20) || 'racer';
}

async function createEntryTicket(interaction) {
  const guild = interaction.guild;
  const user = interaction.user;

  const existing = guild.channels.cache.find(
    (c) => c.topic === `lgt-entry:${user.id}` && c.type === ChannelType.GuildText,
  );
  if (existing) {
    await interaction.reply({
      content: `既にエントリー用チケットが開いています。 ${existing} をご確認ください。`,
      ephemeral: true,
    });
    return;
  }

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ],
    },
  ];

  if (STAFF_ROLE_ID) {
    overwrites.push({
      id: STAFF_ROLE_ID,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  const channel = await guild.channels.create({
    name: `entry-${sanitizeName(user.username)}`,
    type: ChannelType.GuildText,
    parent: TICKET_CATEGORY_ID || undefined,
    topic: `lgt-entry:${user.id}`,
    permissionOverwrites: overwrites,
  });

  session.create(channel.id, user.id);

  const embed = new EmbedBuilder()
    .setTitle('🏁 LGTタイムアタック レーサーエントリー')
    .setDescription(
      [
        `${user} 様、エントリーチケットへようこそ！`,
        '下のボタンからエントリーフォームを開始してください。',
      ].join('\n'),
    )
    .setColor(0x2ecc71);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('entry_start')
      .setLabel('エントリーを開始する')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('entry_close_ticket')
      .setLabel('🗑 チケットを閉じる')
      .setStyle(ButtonStyle.Secondary),
  );

  await channel.send({ content: `${user}`, embeds: [embed], components: [row] });

  await interaction.reply({
    content: `エントリー用チケットを作成しました： ${channel}`,
    ephemeral: true,
  });
}

module.exports = { createEntryTicket };
